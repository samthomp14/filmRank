// One-off cleanup: merges duplicate `movies` rows that share the same imdb_id.
// These arose because a movie could get inserted both through the OMDb CSV/add
// flow (which sets alt_title) and independently through catalog-sync (which
// always sets tmdb_id) - see scripts/backfill-tmdb-ids.mjs's report. For every
// duplicate pair:
//   - the row with alt_title set wins (per user), falling back to the row with
//     tmdb_id set if neither/both have alt_title
//   - any column where the winner is null but the loser isn't gets copied over
//     (in practice this is almost always tmdb_id, since the alt_title row is
//     usually the one catalog-sync never touched)
//   - user_movies, movie_genres, movie_people rows pointing at the loser get
//     relinked to the winner (deduped against what the winner already has)
//   - the loser row is deleted
//
// Usage: node --env-file=.env.local scripts/dedupe-movies.mjs [--dry-run]

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY
const DRY_RUN = process.argv.includes('--dry-run')

for (const [name, value] of Object.entries({ SUPABASE_URL, SUPABASE_SECRET_KEY })) {
  if (!value) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
}

const headers = {
  apikey: SUPABASE_SECRET_KEY,
  Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
  'Content-Type': 'application/json',
}

async function rest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...options, headers: { ...headers, ...options.headers } })
  if (!res.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} failed (${res.status}): ${await res.text()}`)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

const MOVIE_COLUMNS = [
  'title', 'imdb_id', 'url', 'year', 'runtime', 'rating', 'genre', 'director',
  'language', 'country', 'imdb_rating', 'metadata', 'alt_title', 'tmdb_id',
]

function pickWinner(pair) {
  const withAlt = pair.filter((m) => m.alt_title)
  if (withAlt.length === 1) return [withAlt[0], pair.find((m) => m !== withAlt[0])]
  const withTmdb = pair.filter((m) => m.tmdb_id)
  if (withTmdb.length === 1) return [withTmdb[0], pair.find((m) => m !== withTmdb[0])]
  return null // ambiguous - leave for manual review
}

async function relinkJunction(table, keyColumn, winnerId, loserId) {
  const [winnerRows, loserRows] = await Promise.all([
    rest(`/${table}?movie_id=eq.${winnerId}&select=*`),
    rest(`/${table}?movie_id=eq.${loserId}&select=*`),
  ])
  const winnerKeys = new Set(winnerRows.map((r) => keyColumn(r)))
  const toInsert = loserRows
    .filter((r) => !winnerKeys.has(keyColumn(r)))
    .map((r) => ({ ...r, movie_id: winnerId }))

  if (toInsert.length > 0 && !DRY_RUN) {
    await rest(`/${table}`, { method: 'POST', body: JSON.stringify(toInsert), headers: { Prefer: 'return=minimal' } })
  }
  if (!DRY_RUN) {
    await rest(`/${table}?movie_id=eq.${loserId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  }
  return { relinked: loserRows.length, newlyInserted: toInsert.length }
}

async function fetchAllMovies() {
  const PAGE_SIZE = 1000
  const movies = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await rest(`/movies?select=${MOVIE_COLUMNS.join(',')},id&order=imdb_id&limit=${PAGE_SIZE}&offset=${offset}`)
    movies.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return movies
}

async function main() {
  const movies = await fetchAllMovies()
  const groups = new Map()
  for (const m of movies) {
    if (!groups.has(m.imdb_id)) groups.set(m.imdb_id, [])
    groups.get(m.imdb_id).push(m)
  }
  const dupeGroups = [...groups.entries()].filter(([, v]) => v.length > 1)

  console.log(DRY_RUN ? 'Running in --dry-run mode; no writes will be made.\n' : 'Applying changes.\n')
  console.log(`Found ${dupeGroups.length} duplicate imdb_id groups.\n`)

  let merged = 0
  let ambiguous = 0
  const ambiguousList = []

  for (const [imdbId, pair] of dupeGroups) {
    if (pair.length > 2) {
      ambiguous++
      ambiguousList.push(`${imdbId}: ${pair.length} rows (expected 2) - ${pair.map((m) => m.id).join(', ')}`)
      continue
    }

    const result = pickWinner(pair)
    if (!result) {
      ambiguous++
      ambiguousList.push(`${imdbId} (${pair[0].title}): can't pick a winner - ${pair.map((m) => m.id).join(', ')}`)
      continue
    }
    const [winner, loser] = result

    const coalesce = {}
    for (const col of MOVIE_COLUMNS) {
      if ((winner[col] === null || winner[col] === undefined) && loser[col] !== null && loser[col] !== undefined) {
        coalesce[col] = loser[col]
      }
    }

    console.log(`"${winner.title}" (${imdbId}): keep ${winner.id}, drop ${loser.id}`)
    if (Object.keys(coalesce).length > 0) {
      console.log(`  coalescing onto winner: ${JSON.stringify(coalesce)}`)
    }

    const userMovies = await relinkJunction('user_movies', (r) => r.user_id, winner.id, loser.id)
    const genres = await relinkJunction('movie_genres', (r) => r.genre_id, winner.id, loser.id)
    const people = await relinkJunction('movie_people', (r) => `${r.person_id}:${r.role}`, winner.id, loser.id)
    console.log(`  user_movies: ${userMovies.relinked} relinked (${userMovies.newlyInserted} new); movie_genres: ${genres.relinked} relinked (${genres.newlyInserted} new); movie_people: ${people.relinked} relinked (${people.newlyInserted} new)`)

    if (!DRY_RUN) {
      // Delete the loser first: it may hold a tmdb_id (or other unique value) the
      // winner is about to be coalesced onto, which would otherwise 409.
      await rest(`/movies?id=eq.${loser.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
      if (Object.keys(coalesce).length > 0) {
        await rest(`/movies?id=eq.${winner.id}`, { method: 'PATCH', body: JSON.stringify(coalesce), headers: { Prefer: 'return=minimal' } })
      }
    }
    merged++
  }

  console.log('\n--- Summary ---')
  console.log(`Merged: ${merged}`)
  console.log(`Ambiguous (skipped): ${ambiguous}`)
  if (ambiguousList.length) console.log(`\nAmbiguous groups:\n${ambiguousList.join('\n')}`)
}

main().catch((err) => {
  console.error('Dedupe run failed:', err)
  process.exit(1)
})
