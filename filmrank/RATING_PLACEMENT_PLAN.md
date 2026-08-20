# Smart Rating Placement — Implementation Plan

## Context

The rating distribution histogram clusters heavily around the middle (see profile
stats: 400 movies ranked, only 436 comparisons made total). Root cause, confirmed
against the live Supabase project (`rsdewjarkzhiqwfctuhu`):

- Every add path (`AddMovie.tsx`, `Onboarding.tsx` manual step, and bulk import via
  `movieImportUtils.ts`) inserts new `user_movies` rows at a flat
  `elo_score = 1000, match_count = 0`.
- `get_two_random_movies()` (Postgres RPC, `SECURITY` none, body only in the live
  DB — not tracked in `supabase/migrations/`) picks a uniformly random pair from the
  user's whole library every time. It has no bias toward low-`match_count` movies.
- `compare_movies(winner_id, loser_id, p_user_id)` (also live-only) does a standard
  Elo update with `k = 40 / (1 + max(winner_matches, loser_matches) / 10)`.

With hundreds of movies and a uniform-random opponent picker, any individual new
movie has a low chance of being selected often enough to move away from 1000, so
the whole distribution stays clumped near the middle. Two things fix this:

1. **New-movie placement** should actively seek out comparisons that place the
   movie, not wait for random luck (a Beli-style binary-insertion flow).
2. **Bulk import** should seed a good starting `elo_score` from data the user
   already gave us, since asking for O(n log n) comparisons across a
   several-hundred-movie import isn't viable.

A third, smaller change (weighted opponent selection) makes the existing organic
`Compare` flow itself converge new/under-compared movies faster, as a backstop for
both paths.

## Part A — Binary-insertion placement flow (single add)

Goal: when a user adds one movie (via `AddMovie.tsx` or Onboarding's manual-select
step), immediately run a short guided comparison loop that places it near its true
rank, instead of leaving it at flat 1000 to be found by chance later.

**Key simplification:** this needs no DB/RPC changes. `compare_movies`'s K-factor
is already large (40) at `match_count = 0` and shrinks as matches accumulate, so
running a handful of *real* `compare_movies` calls against opponents chosen via
binary search (instead of random) converges the new movie's elo close to its
correct neighborhood. We're only changing which opponent gets picked, not the
underlying math.

Design:
- New hook/component, e.g. `src/hooks/usePlacementFlow.ts` + a modal component
  (e.g. `src/components/PlacementModal.tsx`), reusing `MovieCard` for the
  side-by-side UI (same shape as `CompareMovie`: `movie_id, title, imdb_id,
  elo_score, match_count, url`).
- On mount: fetch the user's current library sorted by `elo_score`
  (`select movie_id, elo_score, match_count, movies(title, imdb_id, url) from
  user_movies where user_id = ... order by elo_score`). If the library has fewer
  than ~5 other movies, skip straight to inserting at 1000 (nothing meaningful to
  binary-search against yet).
- Binary search loop: `lo = 0, hi = sorted.length - 1`. Each step, show the new
  movie against `sorted[mid]`. On a decision, call the existing `compare_movies`
  RPC with the real winner/loser (this also logs a row in `comparisons`, so it
  counts toward the stats honestly). Narrow `lo`/`hi` based on the result; stop
  when `lo > hi` (~`log2(n)` steps — 8-9 comparisons for a few hundred movies).
- "Skip" during placement: re-pick a different movie from the same half rather
  than leaving a gap (bounded retries, then just continue with whatever the
  current bounds are).
- Hook this flow in after `handleAdd` in `AddMovie.tsx` (`src/pages/AddMovie.tsx:35-50`)
  and `ManualSelectStep.handleAdd` in `Onboarding.tsx` (`src/pages/Onboarding.tsx:249-263`) —
  both currently just insert-and-forget; they'd insert then launch the modal.

## Part B — Bulk import: seed elo from Letterboxd star ratings (not just watched list)

Goal: stop bulk imports from landing at a flat 1000. Letterboxd's full export ZIP
includes a `ratings.csv` (columns: `Date, Name, Year, Letterboxd URI, Rating`,
0.5–5 stars) alongside `watched.csv` — today `src/lib/movieImportUtils.ts:60-66`
only reads `watched.csv` and discards ratings entirely. Parsing the ratings file
too gives a real per-movie signal for seeding, for free (no extra comparisons).

Design (`src/lib/movieImportUtils.ts`):
- After extracting `watched.csv`, also look for `ratings.csv` in the same zip
  (`zip.file(/ratings\.csv$/i)`) — optional, since a bare CSV upload or a partial
  export won't have it. Parse into a `Map<"title|year" | "letterboxdUri", rating>`.
  Prefer keying by `Letterboxd URI` (unique) with a `title|year` fallback, mirroring
  the existing dedup key logic at lines 110-115.
- Add `starsToElo(stars: number, stats: EloStats): number` to `src/lib/movieUtils.ts`,
  the inverse of the existing `eloToStars`. Since `normalCDF` (line 92-99) is
  monotonic, invert it numerically via bisection on `z` (no need for a separate
  inverse-erf approximation — less surface area for a subtle math bug) rather than
  a closed-form probit. Clamp the target percentile away from the extremes (e.g.
  `[0.02, 0.98]`) so a 5-star or 0.5-star rating doesn't map to ±infinity.
- Before the batch insert, fetch `computeEloStats` over the user's *existing*
  `elo_score`s (movies already in their library, ideally filtered to
  `match_count > 0` so seeded-but-uncalibrated movies from a previous import don't
  skew the stats). If the user has fewer than ~5 existing rated movies (cold
  start / first import ever), fall back to a fixed default distribution
  (`mean: 1000, stdDev: 200` — wide enough to spread out an initial batch).
- When building `userMoviesToInsert` (lines 234-236, 268-272), set
  `elo_score: starsToElo(rating, stats)` for movies with a matched Letterboxd
  rating, else leave at the DB default (1000). Leave `match_count: 0` either way —
  it's still a provisional/uncalibrated placement, just a much better starting
  point than the population mean.
- Update the "watched.csv not found" error path so a plain `watched.csv`-only
  upload still works unchanged (ratings enrichment is additive, not required).

## Part C — Weighted opponent selection in `get_two_random_movies` (backstop)

Goal: make the ongoing organic `Compare` page prioritize under-compared movies
(new adds, seeded imports) instead of uniform-random selection, so the library
keeps calibrating even for movies that skip Part A/B or need more than one
comparison to settle.

This is a live Postgres RPC change and riskier than A/B (no migration history to
diff against — see below), so treat it as a distinct, separately-reviewable step:

- First, capture the *current* live definitions of `compare_movies` and
  `get_two_random_movies` into a baseline migration file under
  `supabase/migrations/` (they exist only in the live DB today — confirmed via
  `pg_get_functiondef`). This makes the actual change reviewable as a diff and
  fixes the untracked-schema gap.
- Change `get_two_random_movies` to weight rows by `1 / (match_count + 1)` using
  efficient weighted-sampling-without-replacement (`random() ^ (1.0 / weight)`,
  take the top-2 by that key) instead of `order by random() limit 2`. Movies with
  `match_count = 0` become several times more likely to be picked than a movie
  with 20+ matches, without fully excluding well-established movies (keeps some
  variety/re-comparison for accuracy drift).
- Apply via `mcp__claude_ai_Supabase__apply_migration` (or `supabase db push`)
  against project `rsdewjarkzhiqwfctuhu` once reviewed.

## Verification

- Part A: manually add a movie via `/add-movie` with a seeded local/dev library
  of ~20+ movies, confirm the modal runs a bounded (~5-6) number of comparisons
  and the new movie's `elo_score`/`match_count` land where expected relative to
  its chosen neighbors. Confirm skip-heavy runs still terminate.
- Part B: build a small fixture `watched.csv` + `ratings.csv` pair, run
  `importMoviesFromFile` against a test user, assert seeded `elo_score`s are
  monotonic with the input star ratings and fall within the user's existing
  elo range. Add a unit test for `starsToElo` round-tripping through `eloToStars`.
- Part C: after applying the migration, run `select movie_id, match_count from
  get_two_random_movies()` a few hundred times in SQL and confirm low-match_count
  movies are selected disproportionately more often than high-match_count ones.
- End to end: after A+B, re-check the rating distribution chart on `/profile`
  with a re-imported test library — it should spread out instead of spiking in
  the middle bucket.
