// src/pages/Compare.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

interface Movie {
  id: string
  title: string
  elo_score: number
}

function Compare() {
  const [movies, setMovies] = useState<Movie[] | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMovies = async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_two_random_movies')

    if (error) {
      console.error('Error fetching movies:', error)
    } else {
      setMovies(data)
    }
    setLoading(false)
  }

  const handleVote = async (winner: Movie, loser: Movie) => {
    // Elo calculation
    const k = 32
    const expectedA = 1 / (1 + Math.pow(10, (loser.elo_score - winner.elo_score) / 400))
    const expectedB = 1 - expectedA

    const newWinnerScore = Math.round(winner.elo_score + k * (1 - expectedA))
    const newLoserScore = Math.round(loser.elo_score + k * (0 - expectedB))

    const updates = await Promise.all([
      supabase.from('movies').update({ elo_score: newWinnerScore }).eq('id', winner.id),
      supabase.from('movies').update({ elo_score: newLoserScore }).eq('id', loser.id)
    ])

    if (updates.some(r => r.error)) {
      console.error('Error updating scores:', updates.map(r => r.error))
    }

    // Fetch new pair
    fetchMovies()
  }

  useEffect(() => {
    fetchMovies()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600 text-lg">Loading movies...</div>
      </div>
    )
  }
  
  if (!movies || movies.length < 2) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600 text-lg">Not enough movies to compare.</div>
      </div>
    )
  }

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">Which movie do you prefer?</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {movies.map((movie, idx) => (
            <div
              key={movie.id}
              onClick={() => handleVote(movie, movies[1 - idx])}
              className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition duration-300 ease-in-out cursor-pointer transform hover:-translate-y-1"
            >
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4 text-center">{movie.title}</h2>
                <div className="flex justify-center">
                  <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                    Elo: {movie.elo_score.toFixed(0)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Compare
