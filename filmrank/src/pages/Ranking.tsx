// src/pages/MyRankings.tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

interface Movie {
  id: string
  title: string
  elo_score: number
  created_at: string
  poster_url?: string
}

// Add this type for the joined row
interface UserMovieRow {
  elo_score: number;
  created_at: string;
  movies: { id: string; title: string; url?: string } | { id: string; title: string; url?: string }[] | null;
}

function Ranking() {
  const navigate = useNavigate()
  const [movies, setMovies] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRankings = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setMovies([])
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('user_movies')
        .select(`
          elo_score,
          created_at,
          movies:movies!user_movies_movie_id_fkey (
            id,
            title,
            url
          )
        `)
        .eq('user_id', user.id)
        .order('elo_score', { ascending: false })
        .limit(10)
      if (error) {
        console.error('Failed to fetch rankings:', error)
      } else {
        setMovies((data as UserMovieRow[]).map(m => ({
          id: Array.isArray(m.movies) ? m.movies[0]?.id ?? '' : m.movies?.id ?? '',
          title: Array.isArray(m.movies) ? m.movies[0]?.title ?? '' : m.movies?.title ?? '',
          elo_score: m.elo_score,
          created_at: m.created_at || '',
          poster_url: Array.isArray(m.movies) ? m.movies[0]?.url ?? '' : m.movies?.url ?? ''
        })))
      }

      setLoading(false)
    }

    fetchRankings()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600 text-lg">Loading rankings...</div>
      </div>
    )
  }

  if (movies.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600 text-lg">No movies ranked yet.</div>
      </div>
    )
  }

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">My Top 10 Films</h1>
            <div className="space-y-4">
              {movies.map((movie, idx) => (
                <div
                  key={movie.id}
                  className="bg-gray-50 rounded-lg p-6 hover:bg-gray-100 transition duration-150 ease-in-out cursor-pointer"
                  onClick={() => navigate(`/movie/${movie.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-6">
                      <span className="text-3xl font-bold text-blue-600 min-w-[60px]">#{idx + 1}</span>
                      <div>
                        <h2 className="text-2xl font-semibold text-gray-900">{movie.title}</h2>
                      </div>
                    </div>
                    {movie.poster_url && (
                      <img
                        src={movie.poster_url}
                        alt={movie.title}
                        className="w-20 h-30 object-cover rounded-lg shadow-md"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Ranking
