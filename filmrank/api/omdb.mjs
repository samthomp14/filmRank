import { createServerClient } from '@supabase/ssr'
import axios from 'axios'

export default async function handler(req, res) {
  const supabase = createServerClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    {
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
    console.log('Unauthorized access attempt to OMDb proxy:', { error, userId: user?.id })
    res.statusCode = 401
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Unauthorized access to OMDb proxy' }))
    return
  }

  const { title, year } = req.query

  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'Title parameter is required' })
  }

  // Debug environment variables
  console.log('OMDb Route - Environment check:', {
    OMDB_API_KEY_EXISTS: !!process.env.OMDB_API_KEY,
    OMDB_API_KEY_LENGTH: process.env.OMDB_API_KEY?.length,
    TITLE: title,
    YEAR: year,
    USER_ID: user.id
  })

  if (!process.env.OMDB_API_KEY) {
    console.error('OMDB_API_KEY is not set in environment variables')
    return res.status(500).json({ error: 'Server configuration error: OMDb API key not found' })
  }

  try {
    const apiKey = process.env.OMDB_API_KEY
    console.log('Making OMDb API request:', {
      title,
      year,
      apiKeyPrefix: apiKey.substring(0, 4) + '...',
      apiKeyLength: apiKey.length,
      userId: user.id
    })

    const params = {
      t: title,
      apikey: apiKey
    }

    // Add year parameter if provided
    if (year && typeof year === 'string') {
      params.y = year
    }
    
    const response = await axios.get('http://www.omdbapi.com/', {
      params
    })

    if (response.data.Error) {
      console.log('OMDb API returned error:', response.data.Error)
      return res.status(404).json({ error: response.data.Error })
    }

    res.json(response.data)
  } catch (error) {
    console.error('OMDb API error:', error)
    if (axios.isAxiosError(error)) {
      console.error('Axios error details:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
        config: {
          url: error.config?.url,
          params: error.config?.params
        }
      })
    }
    res.status(500).json({
      error: 'Failed to fetch movie data from OMDb',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
} 