import { createServerClient } from '@supabase/ssr'
import axios from 'axios'

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

  const { person_id: personId } = req.query

  if (!personId || typeof personId !== 'string') {
    return res.status(400).json({ error: 'person_id parameter is required' })
  }

  if (!process.env.TMDB_READ_ACCESS_TOKEN) {
    console.error('TMDB_READ_ACCESS_TOKEN is not set in environment variables')
    return res.status(500).json({ error: 'Server configuration error: TMDB access token not found' })
  }

  // TMDB data is fetched live and never persisted, per TMDB's API Terms of Use
  // (caching TMDB content is capped at 6 months) — we only ever store tmdb_id.
  try {
    const response = await axios.get(`https://api.themoviedb.org/3/person/${encodeURIComponent(personId)}`, {
      headers: {
        Authorization: `Bearer ${process.env.TMDB_READ_ACCESS_TOKEN}`,
        Accept: 'application/json',
      },
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
