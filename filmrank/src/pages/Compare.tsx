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

  if (loading) return <p className="p-6">Loading...</p>
  if (!movies || movies.length < 2) return <p className="p-6">Not enough movies to compare.</p>

  return (
    <div className="p-6 flex flex-col items-center gap-4">
      <h1 className="text-2xl font-bold">Which movie do you prefer?</h1>
      <div className="flex gap-6 mt-4">
        {movies.map((movie, idx) => (
          <div
            key={movie.id}
            onClick={() =>
              handleVote(movie, movies[1 - idx])
            }
            className="cursor-pointer border rounded-lg p-6 shadow-md hover:bg-gray-100 transition w-64 text-center"
          >
            <h2 className="text-xl font-semibold">{movie.title}</h2>
            <p className="text-sm text-gray-600">Elo: {movie.elo_score.toFixed(0)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Compare
