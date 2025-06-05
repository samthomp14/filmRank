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
  const [comparisonsToday, setComparisonsToday] = useState(0)
  const [selectedMovie, setSelectedMovie] = useState<string | null>(null)

  const fetchMovies = async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_two_random_movies')

    if (error) {
      console.error('Error fetching movies:', error)
    } else {
      setMovies(data)
      setSelectedMovie(null)
    }
    setLoading(false)
  }

  const fetchComparisonsToday = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { count } = await supabase
      .from('comparisons')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', today.toISOString())

    setComparisonsToday(count || 0)
  }

  const handleVote = async (winner: Movie, loser: Movie) => {
    setSelectedMovie(winner.id)
    
    // Elo calculation
    const k = 32
    const expectedA = 1 / (1 + Math.pow(10, (loser.elo_score - winner.elo_score) / 400))
    const expectedB = 1 - expectedA

    const newWinnerScore = Math.round(winner.elo_score + k * (1 - expectedA))
    const newLoserScore = Math.round(loser.elo_score + k * (0 - expectedB))

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const updates = await Promise.all([
      supabase.from('movies').update({ elo_score: newWinnerScore }).eq('id', winner.id),
      supabase.from('movies').update({ elo_score: newLoserScore }).eq('id', loser.id),
      supabase.from('comparisons').insert({
        user_id: user.id,
        winner_id: winner.id,
        loser_id: loser.id
      })
    ])

    if (updates.some(r => r.error)) {
      console.error('Error updating scores:', updates.map(r => r.error))
    }

    // Update comparisons count
    setComparisonsToday(prev => prev + 1)

    // Fetch new pair after a shorter delay
    setTimeout(fetchMovies, 200)
  }

  const handleSkip = () => {
    fetchMovies()
  }

  useEffect(() => {
    fetchMovies()
    fetchComparisonsToday()
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
        {/* Header Section */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Which movie do you prefer?</h1>
          <p className="text-gray-600">
            You've made {comparisonsToday} comparisons today
          </p>
        </div>

        {/* Comparison Section */}
        <div className="mb-12">
          <div className="flex flex-col md:flex-row items-center justify-center gap-8">
            {/* First Movie */}
            <div
              onClick={() => handleVote(movies[0], movies[1])}
              className={`w-full md:w-1/2 bg-white rounded-xl shadow-md overflow-hidden transition-all duration-150 ease-in-out cursor-pointer transform hover:-translate-y-1 ${
                selectedMovie === movies[0].id ? 'ring-4 ring-blue-500 scale-105' : 'hover:shadow-lg'
              }`}
            >
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-gray-900 text-center">{movies[0].title}</h2>
              </div>
            </div>

            {/* VS Text */}
            <div className="hidden md:block">
              <div className="bg-white px-6 py-2 rounded-full shadow-sm">
                <span className="text-2xl font-bold text-gray-400">VS</span>
              </div>
            </div>

            {/* Second Movie */}
            <div
              onClick={() => handleVote(movies[1], movies[0])}
              className={`w-full md:w-1/2 bg-white rounded-xl shadow-md overflow-hidden transition-all duration-150 ease-in-out cursor-pointer transform hover:-translate-y-1 ${
                selectedMovie === movies[1].id ? 'ring-4 ring-blue-500 scale-105' : 'hover:shadow-lg'
              }`}
            >
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-gray-900 text-center">{movies[1].title}</h2>
              </div>
            </div>
          </div>
        </div>

        {/* Controls Section */}
        <div className="flex flex-col items-center gap-6">
          <button
            onClick={handleSkip}
            className="text-gray-600 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 rounded-lg px-4 py-2"
          >
            Skip this pair
          </button>

          <div className="bg-blue-50 rounded-lg p-4 max-w-md">
            <p className="text-sm text-blue-800 text-center">
              Tip: Click on the movie you prefer. The more you compare, the more accurate your rankings will become!
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Compare

