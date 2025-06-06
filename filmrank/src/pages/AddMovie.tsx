// src/pages/AddMovie.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import axios from 'axios'

interface MovieMatch {
  id: string
  title: string
  imdb_id: string | null
  poster_url?: string
}

interface OMDbResponse {
  Response: string
  Title: string
  imdbID: string
  Poster: string
  Error?: string
}

export default function AddMovie() {
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<null | 'success' | 'error'>(null)
  const [matches, setMatches] = useState<MovieMatch[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedMovie, setSelectedMovie] = useState<MovieMatch | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')

  useEffect(() => {
    const searchMovies = async () => {
      if (title.length < 2) {
        setMatches([])
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: movies, error } = await supabase
        .from('movies')
        .select('id, title, imdb_id')
        .ilike('title', `%${title}%`)
        .limit(5)

      if (error) {
        console.error('Error searching movies:', error)
        return
      }

      setMatches(movies || [])
    }

    const debounceTimer = setTimeout(searchMovies, 300)
    return () => clearTimeout(debounceTimer)
  }, [title])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setStatus(null)
    setErrorMessage('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setStatus('error')
      setErrorMessage('Please make sure you are logged in')
      setLoading(false)
      return
    }

    try {
      if (selectedMovie) {
        // Check if user already has this movie
        const { data: existingMovie, error: checkError } = await supabase
          .from('user_movies')
          .select('*')
          .eq('user_id', user.id)
          .eq('movie_id', selectedMovie.id)
          .single()

        if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
          console.error('Error checking existing movie:', checkError)
          throw checkError
        }

        if (existingMovie) {
          throw new Error('You have already added this movie to your list')
        }

        // Movie exists but user doesn't have it, create user_movies entry
        const { error: userMoviesError } = await supabase
          .from('user_movies')
          .insert({
            user_id: user.id,
            movie_id: selectedMovie.id,
            elo_score: 1000,
            match_count: 0
          })

        if (userMoviesError) {
          console.error('Error adding movie to user list:', userMoviesError)
          throw userMoviesError
        }
      } else {
        // Search OMDb for new movie
        const response = await axios.get<OMDbResponse>(`http://localhost:3001/api/omdb`, {
          params: { title }
        })
        const movieData = response.data

        if (movieData.Response === 'True') {
          // Check if movie already exists in database
          const { data: existingMovies, error: movieCheckError } = await supabase
            .from('movies')
            .select('id')
            .eq('imdb_id', movieData.imdbID)
            .limit(1)

          if (movieCheckError) {
            console.error('Error checking existing movie:', movieCheckError)
            throw movieCheckError
          }

          let movieId: string

          if (existingMovies && existingMovies.length > 0) {
            // Movie exists in database, check if user already has it
            const { data: userMovies, error: userCheckError } = await supabase
              .from('user_movies')
              .select('*')
              .eq('user_id', user.id)
              .eq('movie_id', existingMovies[0].id)
              .limit(1)

            if (userCheckError) {
              console.error('Error checking user movie:', userCheckError)
              throw userCheckError
            }

            if (userMovies && userMovies.length > 0) {
              throw new Error('You have already added this movie to your list')
            }

            movieId = existingMovies[0].id
          } else {
            // Insert new movie
            const { data: movie, error: moviesError } = await supabase
              .from('movies')
              .insert({
                title: movieData.Title,
                imdb_id: movieData.imdbID
              })
              .select()
              .single()

            if (moviesError) {
              console.error('Error creating new movie:', moviesError)
              throw moviesError
            }
            movieId = movie.id
          }

          // Create user_movies entry
          const { error: userMoviesError } = await supabase
            .from('user_movies')
            .insert({
              user_id: user.id,
              movie_id: movieId,
              elo_score: 1000,
              match_count: 0
            })

          if (userMoviesError) {
            console.error('Error adding movie to user list:', userMoviesError)
            throw userMoviesError
          }
        } else {
          throw new Error(movieData.Error || 'Movie not found in OMDb')
        }
      }

      setStatus('success')
      setTitle('')
      setSelectedMovie(null)
      setMatches([])
    } catch (error) {
      console.error('Full error:', error)
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'Error adding movie')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden">
        <div className="p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">Add a Movie</h1>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter movie title"
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out"
              />
            </div>
            
            {matches.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-gray-600">Existing matches:</p>
                {matches.map((match) => (
                  <div
                    key={match.id}
                    className={`p-3 rounded-lg border cursor-pointer hover:bg-gray-50 ${
                      selectedMovie?.id === match.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                    }`}
                    onClick={() => setSelectedMovie(match)}
                  >
                    <div className="flex items-center space-x-3">
                      {match.poster_url && (
                        <img
                          src={match.poster_url}
                          alt={match.title}
                          className="w-12 h-18 object-cover rounded"
                        />
                      )}
                      <span className="font-medium">{match.title}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-150 ease-in-out disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add Movie'}
            </button>
          </form>
          {status === 'success' && (
            <div className="mt-4 p-4 bg-green-50 rounded-lg">
              <p className="text-green-700 text-center">Movie added successfully!</p>
            </div>
          )}
          {status === 'error' && (
            <div className="mt-4 p-4 bg-red-50 rounded-lg">
              <p className="text-red-700 text-center">{errorMessage}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
