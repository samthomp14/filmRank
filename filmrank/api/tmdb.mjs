import { createServerClient } from '@supabase/ssr'
import axios from 'axios'

const DEFAULT_WATCH_REGION = 'US'

/** Keep only the fields the UI renders, ordered the way TMDB wants them shown. */
function shapeProviders(providers) {
  return [...(providers ?? [])]
    .sort((a, b) => a.display_priority - b.display_priority)
    .map(({ provider_id, provider_name, logo_path }) => ({ provider_id, provider_name, logo_path }))
}

/**
 * `/movie/{id}/watch/providers` — JustWatch availability, keyed by country.
 * We return one country's block plus the codes that have any data at all, so
 * the region switcher can offer only regions where this title actually exists.
 */
async function respondWithWatchProviders(res, movieId, region, tmdbHeaders) {
  const requestedRegion = /^[A-Za-z]{2}$/.test(region ?? '') ? region.toUpperCase() : DEFAULT_WATCH_REGION

  try {
    const response = await axios.get(
      `https://api.themoviedb.org/3/movie/${encodeURIComponent(movieId)}/watch/providers`,
      { headers: tmdbHeaders }
    )

    const results = response.data.results ?? {}
    const regional = results[requestedRegion] ?? {}

    // TMDB splits ad-free `free` from ad-supported `ads`; both mean "costs
    // nothing extra", so they collapse into a single Free row (deduped, since
    // a provider can appear in both).
    const freeById = new Map(
      shapeProviders([...(regional.free ?? []), ...(regional.ads ?? [])]).map((p) => [p.provider_id, p])
    )

    // Availability moves slowly, so let the browser reuse this for a few hours.
    // Deliberately `private`: the response is only served to an authenticated
    // caller, and a shared CDN copy would hand the proxy to anyone.
    res.setHeader('Cache-Control', 'private, max-age=21600, stale-while-revalidate=86400')

    res.json({
      region: requestedRegion,
      link: regional.link ?? null,
      flatrate: shapeProviders(regional.flatrate),
      free: [...freeById.values()],
      rent: shapeProviders(regional.rent),
      buy: shapeProviders(regional.buy),
      available_regions: Object.keys(results).sort(),
    })
  } catch (error) {
    console.error('TMDB watch providers error:', error)
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return res.status(404).json({ error: 'Movie not found on TMDB' })
    }
    res.status(500).json({
      error: 'Failed to fetch watch providers from TMDB',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function handler(req, res) {
  // Get access token from Authorization header
  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const supabase = createServerClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: accessToken ? `Bearer ${accessToken}` : undefined,
        },
      },
      cookies: {
        getAll: () => {
          const cookies = req.cookies ?? {}
          return Object.entries(cookies).map(([name, value]) => ({ name, value }))
        },
        setAll: (cookies) => {
          const serialized = cookies.map(({ name, value, options }) => {
            let cookie = `${name}=${value}; Path=/; HttpOnly`
            if (options?.maxAge) cookie += `; Max-Age=${options.maxAge}`
            if (options?.expires) cookie += `; Expires=${options.expires.toUTCString()}`
            if (options?.secure) cookie += `; Secure`
            if (options?.sameSite) cookie += `; SameSite=${options.sameSite}`
            return cookie
          })
          res.setHeader('Set-Cookie', serialized)
        }
      }
    }
  )

  const {
    data: { user },
    error
  } = await supabase.auth.getUser()

  if (error || !user) {
    console.log('Unauthorized access attempt to TMDB proxy:', { error, userId: user?.id })
    res.statusCode = 401
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Unauthorized access to TMDB proxy' }))
    return
  }

  const { person_id: personId, movie_id: movieId, region } = req.query

  if ((!personId || typeof personId !== 'string') && (!movieId || typeof movieId !== 'string')) {
    return res.status(400).json({ error: 'person_id or movie_id parameter is required' })
  }

  if (!process.env.TMDB_READ_ACCESS_TOKEN) {
    console.error('TMDB_READ_ACCESS_TOKEN is not set in environment variables')
    return res.status(500).json({ error: 'Server configuration error: TMDB access token not found' })
  }

  const tmdbHeaders = {
    Authorization: `Bearer ${process.env.TMDB_READ_ACCESS_TOKEN}`,
    Accept: 'application/json',
  }

  // TMDB data is fetched live and never persisted, per TMDB's API Terms of Use
  // (caching TMDB content is capped at 6 months) — we only ever store tmdb_id.
  if (movieId) {
    return respondWithWatchProviders(res, movieId, region, tmdbHeaders)
  }

  try {
    const response = await axios.get(`https://api.themoviedb.org/3/person/${encodeURIComponent(personId)}`, {
      headers: tmdbHeaders,
    })

    const {
      id,
      name,
      biography,
      profile_path,
      birthday,
      deathday,
      place_of_birth,
      also_known_as,
      known_for_department,
      imdb_id,
      homepage,
    } = response.data

    res.json({
      id,
      name,
      biography,
      profile_path,
      birthday,
      deathday,
      place_of_birth,
      also_known_as,
      known_for_department,
      imdb_id,
      homepage,
    })
  } catch (error) {
    console.error('TMDB API error:', error)
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return res.status(404).json({ error: 'Person not found on TMDB' })
    }
    res.status(500).json({
      error: 'Failed to fetch person data from TMDB',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
