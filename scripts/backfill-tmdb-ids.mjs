// One-off/rerunnable maintenance script: backfills movies.tmdb_id for rows that have
// an imdb_id but no tmdb_id yet (e.g. movies added via the OMDb CSV/add flow, which
// never set tmdb_id — see src/lib/movieUtils.ts). Looks each imdb_id up via TMDB's
// /find endpoint, the same pattern catalog-sync uses for people.
//
// Usage: node --env-file=.env.local scripts/backfill-tmdb-ids.mjs [--dry-run]

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY
const TMDB_READ_ACCESS_TOKEN = process.env.TMDB_READ_ACCESS_TOKEN
const DRY_RUN = process.argv.includes('--dry-run')

for (const [name, value] of Object.entries({ SUPABASE_URL, SUPABASE_SECRET_KEY, TMDB_READ_ACCESS_TOKEN })) {
  if (!value) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
}

const PAGE_SIZE = 500

async function fetchMoviesMissingTmdbId(offset) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/movies`)
  url.searchParams.set('select', 'id,imdb_id,title')
  url.searchParams.set('tmdb_id', 'is.null')
  url.searchParams.set('imdb_id', 'not.is.null')
  url.searchParams.set('order', 'id')
  url.searchParams.set('limit', String(PAGE_SIZE))
  url.searchParams.set('offset', String(offset))

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    },
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch movies (${res.status}): ${await res.text()}`)
  }
  return res.json()
}

async function findTmdbIdByImdbId(imdbId) {
  const res = await fetch(
    `https://api.themoviedb.org/3/find/${encodeURIComponent(imdbId)}?external_source=imdb_id`,
    {
      headers: {
        Authorization: `Bearer ${TMDB_READ_ACCESS_TOKEN}`,
        Accept: 'application/json',
      },
    }
  )
  if (!res.ok) {
    throw new Error(`TMDB find failed for ${imdbId} (${res.status}): ${await res.text()}`)
  }
  const body = await res.json()
  return body.movie_results?.[0]?.id ?? null
}

async function updateMovieTmdbId(id, tmdbId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/movies?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ tmdb_id: tmdbId }),
  })
  if (!res.ok) {
    throw new Error(`Failed to update movie ${id} (${res.status}): ${await res.text()}`)
  }
}

async function main() {
  let offset = 0
  let updated = 0
  let notFound = 0
  let failed = 0
  const notFoundTitles = []
  const failedTitles = []

  if (DRY_RUN) console.log('Running in --dry-run mode; no writes will be made.\n')

  while (true) {
    const movies = await fetchMoviesMissingTmdbId(offset)
    if (movies.length === 0) break

    for (const movie of movies) {
      try {
        const tmdbId = await findTmdbIdByImdbId(movie.imdb_id)
        if (tmdbId == null) {
          notFound++
          notFoundTitles.push(`${movie.title} (${movie.imdb_id})`)
          continue
        }
        if (!DRY_RUN) {
          await updateMovieTmdbId(movie.id, tmdbId)
        }
        updated++
        console.log(`${DRY_RUN ? '[dry-run] would set' : 'Set'} tmdb_id=${tmdbId} for "${movie.title}" (${movie.imdb_id})`)
      } catch (err) {
        failed++
        failedTitles.push(`${movie.title} (${movie.imdb_id}): ${err.message}`)
        console.error(`Error processing "${movie.title}" (${movie.imdb_id}):`, err.message)
      }
    }

    offset += PAGE_SIZE
  }

  console.log('\n--- Summary ---')
  console.log(`Updated: ${updated}`)
  console.log(`Not found on TMDB: ${notFound}`)
  console.log(`Failed: ${failed}`)
  if (notFoundTitles.length) console.log(`\nNot found:\n${notFoundTitles.join('\n')}`)
  if (failedTitles.length) console.log(`\nFailed:\n${failedTitles.join('\n')}`)
}

main().catch((err) => {
  console.error('Backfill run failed:', err)
  process.exit(1)
})
