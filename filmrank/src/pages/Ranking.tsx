// src/pages/MyRankings.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

interface Movie {
  id: string
  title: string
  elo_score: number
}

function Ranking() {
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
          movies (
            id,
            title
          )
        `)
        .eq('user_id', user.id)
        .order('elo_score', { ascending: false })
        .limit(10)

      if (error) {
        console.error('Failed to fetch rankings:', error)
      } else {
        setMovies(data.map(m => ({
          id: m.movies.id,
          title: m.movies.title,
          elo_score: m.elo_score
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
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">🎥 My Top 10 Movies</h1>
            <div className="space-y-4">
              {movies.map((movie, idx) => (
                <div
                  key={movie.id}
                  className="bg-gray-50 rounded-lg p-6 hover:bg-gray-100 transition duration-150 ease-in-out"
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-4">
                      <span className="text-2xl font-bold text-blue-600">#{idx + 1}</span>
                      <h2 className="text-xl font-semibold text-gray-900">{movie.title}</h2>
                    </div>
                    <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                      Elo: {movie.elo_score.toFixed(0)}
                    </span>
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
