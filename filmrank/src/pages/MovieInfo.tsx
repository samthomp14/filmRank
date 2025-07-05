import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { formatRuntime, formatYear, formatIMDBRating } from '../lib/movieUtils'

interface Movie {
  id: string
  title: string
  url?: string
  year?: number
  runtime?: number
  rating?: string
  genre?: string
  director?: string
  language?: string
  country?: string
  imdb_rating?: number
  metadata?: any
}

function MovieInfo() {
  const { movieId } = useParams<{ movieId: string }>()
  const [movie, setMovie] = useState<Movie | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMovie = async () => {
      if (!movieId) return

      const { data, error } = await supabase
        .from('movies')
        .select('id, title, url, year, runtime, rating, genre, director, language, country, imdb_rating, metadata')
        .eq('id', movieId)
        .single()

      if (error) {
        console.error('Failed to fetch movie:', error)
      } else {
        setMovie(data)
      }

      setLoading(false)
    }

    fetchMovie()
  }, [movieId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600 text-lg">Loading movie information...</div>
      </div>
    )
  }

  if (!movie) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600 text-lg">Movie not found.</div>
      </div>
    )
  }

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="p-8">
            <div className="flex flex-col md:flex-row gap-8">
              {/* Movie Poster */}
              <div className="flex-shrink-0">
                {movie.url ? (
                  <img
                    src={movie.url}
                    alt={movie.title}
                    className="w-64 h-96 object-cover rounded-lg shadow-lg"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                ) : (
                  <div className="w-64 h-96 bg-gray-200 rounded-lg shadow-lg flex items-center justify-center">
                    <span className="text-gray-500">No poster available</span>
                  </div>
                )}
              </div>

              {/* Movie Information */}
              <div className="flex-1">
                <h1 className="text-4xl font-bold text-gray-900 mb-6">{movie.title}</h1>
                
                <div className="space-y-4">
                  {movie.year && (
                    <div className="flex items-center">
                      <span className="text-gray-600 font-medium w-24">Year:</span>
                      <span className="text-gray-900">{formatYear(movie.year)}</span>
                    </div>
                  )}
                  
                  {movie.runtime && (
                    <div className="flex items-center">
                      <span className="text-gray-600 font-medium w-24">Runtime:</span>
                      <span className="text-gray-900">{formatRuntime(movie.runtime)}</span>
                    </div>
                  )}
                  
                  {movie.rating && (
                    <div className="flex items-center">
                      <span className="text-gray-600 font-medium w-24">Rating:</span>
                      <span className="text-gray-900">{movie.rating}</span>
                    </div>
                  )}
                  
                  {movie.director && (
                    <div className="flex items-center">
                      <span className="text-gray-600 font-medium w-24">Director:</span>
                      <span className="text-gray-900">{movie.director}</span>
                    </div>
                  )}
                  
                  {movie.genre && (
                    <div className="flex items-center">
                      <span className="text-gray-600 font-medium w-24">Genre:</span>
                      <span className="text-gray-900">{movie.genre}</span>
                    </div>
                  )}
                  
                  {movie.language && (
                    <div className="flex items-center">
                      <span className="text-gray-600 font-medium w-24">Language:</span>
                      <span className="text-gray-900">{movie.language}</span>
                    </div>
                  )}
                  
                  {movie.country && (
                    <div className="flex items-center">
                      <span className="text-gray-600 font-medium w-24">Country:</span>
                      <span className="text-gray-900">{movie.country}</span>
                    </div>
                  )}
                  
                  {movie.imdb_rating && (
                    <div className="flex items-center">
                      <span className="text-gray-600 font-medium w-24">IMDB Rating:</span>
                      <span className="text-gray-900">{formatIMDBRating(movie.imdb_rating)}</span>
                    </div>
                  )}
                  
                  {movie.metadata?.Plot && (
                    <div className="flex items-start">
                      <span className="text-gray-600 font-medium w-24">Plot:</span>
                      <span className="text-gray-900">{movie.metadata.Plot}</span>
                    </div>
                  )}
                </div>

                <div className="mt-8">
                  <button
                    onClick={() => window.history.back()}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition duration-150 ease-in-out"
                  >
                    Back to Rankings
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MovieInfo 