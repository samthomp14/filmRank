// Runs on a schedule via pg_cron (see the `enable_pg_cron_catalog_sync` migration).
// Builds out the movie catalog automatically: TMDB's /discover endpoint supplies a
// ranked list of candidate titles (something OMDb has no equivalent for), each is
// resolved against OMDb by exact imdb_id, and inserted using the same shape the
// frontend's OMDb-add flow used to produce. OMDb's free tier caps at 1,000
// requests/day, shared with the CSV importer's live lookups, so this job tracks
// usage via `omdb_request_log` and stays under DAILY_OMDB_CAP rather than assuming
// the full quota is its own.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const DAILY_OMDB_CAP = 950
const MAX_PAGES_PER_RUN = 15
const TMDB_API_BASE = 'https://api.themoviedb.org/3'
const OMDB_API_BASE = 'http://www.omdbapi.com/'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TMDB_READ_ACCESS_TOKEN = Deno.env.get('TMDB_READ_ACCESS_TOKEN')!
const OMDB_API_KEY = Deno.env.get('OMDB_API_KEY')!

interface TmdbDiscoverResult {
  id: number
  title: string
}

interface TmdbMovieDetails {
  id: number
  imdb_id: string | null
}

interface TmdbCreditPerson {
  id: number
  name: string
  department?: string
  job?: string
}

interface OmdbResponse {
  Response: string
  Title: string
  Year: string
  Runtime: string
  Rated: string
  Genre: string
  Director: string
  Writer: string
  Actors: string
  Language: string
  Country: string
  Poster: string
  imdbRating: string
  imdbID: string
  [key: string]: unknown
}

async function tmdbFetch(path: string) {
  const res = await fetch(`${TMDB_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${TMDB_READ_ACCESS_TOKEN}`,
      Accept: 'application/json',
    },
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(`TMDB ${path} failed (${res.status}): ${JSON.stringify(body)}`)
  }
  return body
}

// Mirrors src/lib/movieUtils.ts's parseOMDBResponse mapping — kept in sync by hand
// since this Deno function can't import the frontend's TS module directly.
function parseOmdbResponse(omdb: OmdbResponse, tmdbId: number) {
  const runtimeMatch = omdb.Runtime?.match(/(\d+)/)
  return {
    title: omdb.Title,
    imdb_id: omdb.imdbID,
    tmdb_id: tmdbId,
    url: omdb.Poster && omdb.Poster !== 'N/A' ? omdb.Poster : null,
    year: omdb.Year ? parseInt(omdb.Year) : null,
    runtime: runtimeMatch ? parseInt(runtimeMatch[1]) : null,
    rating: omdb.Rated || null,
    genre: omdb.Genre || null,
    director: omdb.Director || null,
    language: omdb.Language || null,
    country: omdb.Country || null,
    imdb_rating: omdb.imdbRating ? parseFloat(omdb.imdbRating) : null,
    metadata: omdb,
  }
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'
  const { count: usedToday } = await supabase
    .from('omdb_request_log')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', todayStart)

  const initialRemaining = DAILY_OMDB_CAP - (usedToday ?? 0)
  let remaining = initialRemaining

  const { data: state } = await supabase
    .from('catalog_sync_state')
    .select('tmdb_page')
    .eq('id', 1)
    .single()

  let page = state?.tmdb_page ?? 1
  let pagesScanned = 0
  let moviesInserted = 0
  let notes: string | null = null

  if (remaining <= 0) {
    notes = 'Daily OMDb budget already exhausted; skipped.'
  } else {
    try {
    pageLoop: while (pagesScanned < MAX_PAGES_PER_RUN) {
      const discover = await tmdbFetch(`/discover/movie?sort_by=popularity.desc&include_adult=false&page=${page}`)
      const results = (discover.results ?? []) as TmdbDiscoverResult[]
      if (results.length === 0) {
        // Ran off the end of popularity-sorted results; wrap back to page 1.
        page = 1
        pagesScanned++
        continue
      }

      const tmdbIds = results.map((r) => r.id)
      const { data: existing } = await supabase
        .from('movies')
        .select('tmdb_id')
        .in('tmdb_id', tmdbIds)
      const existingIds = new Set((existing ?? []).map((m) => m.tmdb_id))
      const candidates = results.filter((r) => !existingIds.has(r.id))

      for (const candidate of candidates) {
        if (remaining <= 0) break pageLoop

        const details = (await tmdbFetch(`/movie/${candidate.id}`)) as TmdbMovieDetails
        if (!details.imdb_id) continue

        await supabase.from('omdb_request_log').insert({})
        remaining--

        const omdbRes = await fetch(
          `${OMDB_API_BASE}?i=${encodeURIComponent(details.imdb_id)}&apikey=${OMDB_API_KEY}`
        )
        const omdb = (await omdbRes.json()) as OmdbResponse
        if (omdb.Response !== 'True') continue

        const { data: inserted, error: insertError } = await supabase
          .from('movies')
          .insert(parseOmdbResponse(omdb, candidate.id))
          .select('id')
          .single()
        if (insertError || !inserted) {
          console.error('Failed to insert movie:', insertError)
          continue
        }

        await Promise.all([
          supabase.rpc('sync_movie_people', {
            p_movie_id: inserted.id,
            p_director: omdb.Director ?? '',
            p_writer: omdb.Writer ?? '',
            p_actors: omdb.Actors ?? '',
          }),
          supabase.rpc('sync_movie_genres', {
            p_movie_id: inserted.id,
            p_genre: omdb.Genre ?? '',
          }),
        ])
        moviesInserted++

        // Backfill tmdb_id on the people just synced for this movie, matching by name.
        try {
          const credits = await tmdbFetch(`/movie/${candidate.id}/credits`)
          const creditPeople: TmdbCreditPerson[] = [
            ...((credits.cast ?? []) as TmdbCreditPerson[]).slice(0, 15),
            ...((credits.crew ?? []) as TmdbCreditPerson[]).filter((c) =>
              ['Director', 'Writer'].includes(c.job ?? '')
            ),
          ]
          const namesToTmdbId = new Map(creditPeople.map((p) => [p.name.toLowerCase(), p.id]))
          if (namesToTmdbId.size > 0) {
            const { data: peopleRows } = await supabase
              .from('people')
              .select('id, name, tmdb_id')
              .in('name', [...new Set(creditPeople.map((p) => p.name))])
            for (const person of peopleRows ?? []) {
              if (person.tmdb_id) continue
              const matchedTmdbId = namesToTmdbId.get(person.name.toLowerCase())
              if (matchedTmdbId) {
                await supabase.from('people').update({ tmdb_id: matchedTmdbId }).eq('id', person.id)
              }
            }
          }
        } catch (creditsError) {
          console.error('Failed to backfill people tmdb_id:', creditsError)
        }
      }

      page++
      pagesScanned++
    }
    } catch (runError) {
      console.error('catalog-sync run failed:', runError)
      notes = runError instanceof Error ? runError.message : 'Unknown error'
    }
  }

  await Promise.all([
    supabase.from('catalog_sync_state').update({ tmdb_page: page, updated_at: new Date().toISOString() }).eq('id', 1),
    supabase.from('catalog_sync_log').insert({
      tmdb_pages_scanned: pagesScanned,
      movies_inserted: moviesInserted,
      omdb_calls_used: initialRemaining - remaining,
      notes,
    }),
  ])

  return new Response(
    JSON.stringify({ pagesScanned, moviesInserted, remainingBudget: remaining, nextPage: page, notes }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
