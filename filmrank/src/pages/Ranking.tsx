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
        .from('movies')
        .select('*')
        .eq('user_id', user.id)
        .order('elo_score', { ascending: false })
        .limit(10)

      if (error) {
        console.error('Failed to fetch rankings:', error)
      } else {
        setMovies(data)
      }

      setLoading(false)
    }

    fetchRankings()
  }, [])

  if (loading) return <p className="p-6">Loading rankings...</p>
  if (movies.length === 0) return <p className="p-6">No movies ranked yet.</p>

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">🎥 My Top 10 Movies</h1>
      <ul className="space-y-4">
        {movies.map((movie, idx) => (
          <li key={movie.id} className="border rounded-lg p-4 shadow-md bg-white">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-lg">
                #{idx + 1}: {movie.title}
              </span>
              <span className="text-gray-600">Elo: {movie.elo_score.toFixed(0)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default Ranking
