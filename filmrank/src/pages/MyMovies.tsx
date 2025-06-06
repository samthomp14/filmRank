import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

interface MyMovie {
  movie_id: string;
  elo_score: number;
  match_count: number;
  created_at: string;
  movies: {
    title: string;
  };
}

export default function MyMovies() {
  const [movies, setMovies] = useState<MyMovie[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [movieToDelete, setMovieToDelete] = useState<MyMovie | null>(null)

  useEffect(() => {
    fetchMovies()
  }, [])

  const fetchMovies = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')
  
        const { data, error } = await supabase
        .from('user_movies')
        .select(`
          movie_id,
          elo_score,
          match_count,
          created_at,
          movies (
            title
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      
  
      if (error) throw error
      setMovies(
        (data as any[]).map((row) => ({
          ...row,
          movies: row.movies[0], // FIX: force movies from array to object
        })) as MyMovie[]
      )
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch movies')
    } finally {
      setLoading(false)
    }
  }
  
  const handleDelete = async (movie: MyMovie) => {
    try {

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')
        
      const { error } = await supabase
        .from('user_movies')
        .delete()
        .eq('user_id', user.id)
        .eq('movie_id', movie.movie_id)

      if (error) throw error

      setMovies(movies.filter(m => m.movie_id !== movie.movie_id))
      setMovieToDelete(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete movie')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600 text-lg">Loading movies...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-600 text-lg">{error}</div>
      </div>
    )
  }

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">My Movies</h1>
            
            {movies.length === 0 ? (
              <div className="text-center text-gray-600">
                <p className="mb-4">You haven't added any movies yet.</p>
                <a
                  href="/add"
                  className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Add Your First Movie
                </a>
              </div>
            ) : (
              <div className="space-y-4">
                {movies.map((movie) => (
                  <div
                    key={movie.movie_id}
                    className="bg-gray-50 rounded-lg p-6 hover:bg-gray-100 transition duration-150 ease-in-out"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <h2 className="text-xl font-semibold text-gray-900">{movie.movies.title}</h2>
                        <p className="text-sm text-gray-500">
                          Added on {new Date(movie.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                          Elo: {movie.elo_score.toFixed(0)}
                        </span>
                        <button
                          onClick={() => setMovieToDelete(movie)}
                          className="text-red-600 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 rounded-lg p-2"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {movieToDelete && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Delete Movie</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete "{movieToDelete.movies.title}"? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => setMovieToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(movieToDelete)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 