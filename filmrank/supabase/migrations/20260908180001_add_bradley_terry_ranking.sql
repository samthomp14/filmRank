-- Batch Bradley-Terry ranking, computed alongside (not instead of) the live
-- Elo score.
--
-- Elo's per-comparison update is a single-pass, order-dependent estimator:
-- each result nudges exactly two ratings and is then discarded, so indirect
-- evidence (A beat B, B beat C) only reaches A-vs-C's implied ranking slowly.
-- The `comparisons` table already has every result a user has ever recorded;
-- this migration adds a way to refit all of it at once via Bradley-Terry
-- maximum likelihood (the same win-probability model Elo already uses:
-- P(i beats j) = 1/(1+10^((r_j-r_i)/400))), instead of Elo's sequential
-- approximation of it.
--
-- bt_score/bt_computed_at store the result; recompute_bt_rankings() (re)runs
-- the fit for the calling user on demand.

alter table public.user_movies
  add column if not exists bt_score numeric,
  add column if not exists bt_computed_at timestamptz;

CREATE OR REPLACE FUNCTION public.recompute_bt_rankings()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  p_user_id uuid := auth.uid();
  anchor_id constant uuid := '00000000-0000-0000-0000-000000000000';
  iter integer := 0;
  max_delta numeric := 1;
begin
  if p_user_id is null then
    raise exception 'recompute_bt_rankings requires an authenticated user';
  end if;

  create temporary table bt_strength (
    movie_id uuid primary key,
    wins numeric not null default 0,
    strength numeric not null default 1
  ) on commit drop;

  create temporary table bt_pairs (
    movie_a uuid not null,
    movie_b uuid not null,
    games numeric not null
  ) on commit drop;

  -- One row per movie the user has, seeded at the Elo-neutral strength (1).
  insert into bt_strength (movie_id, wins, strength)
  select um.movie_id, 0, 1
  from user_movies um
  where um.user_id = p_user_id;

  if not found then
    return;
  end if;

  -- Regularizing prior: every movie plays 2 virtual games against a fixed
  -- anchor of strength 1 (one virtual win, one virtual loss each). Without
  -- this, a movie that has won 100% of a handful of real comparisons has no
  -- finite maximum-likelihood strength (Bradley-Terry diverges to infinity
  -- for a perfect record), and a movie with zero real comparisons has no
  -- data to estimate from at all. The anchor keeps both pinned near the
  -- neutral prior until real comparisons pull them away from it — the same
  -- job Elo's decaying K-factor does implicitly for undercalibrated movies.
  insert into bt_pairs (movie_a, movie_b, games)
  select movie_id, anchor_id, 2 from bt_strength;
  update bt_strength set wins = wins + 1;

  -- Real comparisons, as symmetric total-games-per-pair counts (recorded in
  -- both directions so each movie's denominator below sees every game it
  -- played against a given opponent, regardless of who won).
  insert into bt_pairs (movie_a, movie_b, games)
  select winner_movie_id, loser_movie_id, count(*)
  from comparisons
  where user_id = p_user_id
  group by winner_movie_id, loser_movie_id;

  insert into bt_pairs (movie_a, movie_b, games)
  select loser_movie_id, winner_movie_id, count(*)
  from comparisons
  where user_id = p_user_id
  group by winner_movie_id, loser_movie_id;

  update bt_strength s
  set wins = wins + w.win_count
  from (
    select winner_movie_id as movie_id, count(*) as win_count
    from comparisons
    where user_id = p_user_id
    group by winner_movie_id
  ) w
  where s.movie_id = w.movie_id;

  -- Zermelo/Hunter minorization-maximization iteration. At each step, movie
  -- i's strength becomes wins_i / sum_over_opponents(games_ij / (strength_i +
  -- strength_j)) — a fixed point of the Bradley-Terry likelihood. The anchor
  -- node (strength fixed at 1, never updated) pins the overall scale, so
  -- unlike a plain Bradley-Terry fit over a closed set of players, no
  -- separate renormalization step is needed.
  while iter < 100 and max_delta > 0.0001 loop
    iter := iter + 1;

    -- old_strength snapshots pre-iteration values so denom (and the delta
    -- check below) read this round's starting point, not values the UPDATE
    -- CTE is concurrently rewriting. A WITH-chain's CTEs all see the table
    -- as it stood before the statement, including before its own
    -- data-modifying CTE takes effect, so this stays a clean read of "last
    -- round's strengths" throughout.
    with old_strength as (
      select movie_id, strength from bt_strength
    ),
    denom as (
      select p.movie_a as movie_id,
             sum(p.games / (sa.strength + coalesce(sb.strength, 1))) as d
      from bt_pairs p
      join old_strength sa on sa.movie_id = p.movie_a
      left join old_strength sb on sb.movie_id = p.movie_b
      group by p.movie_a
    ),
    updated as (
      update bt_strength s
      set strength = greatest(s.wins / nullif(d.d, 0), 0.0001)
      from denom d
      where d.movie_id = s.movie_id
      returning s.movie_id, s.strength as new_strength
    )
    select coalesce(max(abs(u.new_strength - o.strength) / o.strength), 0)
      into max_delta
      from updated u
      join old_strength o on o.movie_id = u.movie_id;
  end loop;

  -- Convert back to the familiar 400*log10 Elo scale, centered so a
  -- strength equal to the anchor (no real signal either way) reads as 1000 —
  -- the same cold-start default Elo itself uses.
  update user_movies um
  set bt_score = 1000 + 400 * log(10, s.strength),
      bt_computed_at = now()
  from bt_strength s
  where um.user_id = p_user_id
    and um.movie_id = s.movie_id;
end;
$function$;

grant execute on function public.recompute_bt_rankings() to authenticated;
