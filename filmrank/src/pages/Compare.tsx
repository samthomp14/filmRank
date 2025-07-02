// src/pages/Compare.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import MovieCard from '../components/MovieCard'

interface CompareMovie {
  movie_id: string;
  title: string;
  imdb_id: string | null;
  elo_score: number;
  match_count: number;
  url: string;
}

function Compare() {
  const [movies, setMovies] = useState<CompareMovie[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [comparisonsToday, setComparisonsToday] = useState(0)
  const [selectedMovie, setSelectedMovie] = useState<string | null>(null)

  const fetchMovies = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase.rpc('get_two_random_movies');
    console.log(data) //debug
    if (error) {
      console.error('Error fetching movies:', error);
    } else {
      setMovies(data as CompareMovie[]);
      setSelectedMovie(null);
    }
  
    setLoading(false);
  };

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

  const handleVote = async (winner: CompareMovie, loser: CompareMovie) => {
    setSelectedMovie(winner.movie_id)
  
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
  
    const { error } = await supabase.rpc('compare_movies', {
      winner_id: winner.movie_id,
      loser_id: loser.movie_id,
      p_user_id: user.id
    })
  
    if (error) {
      console.error('RPC error:', error)
    } else {
      setComparisonsToday(prev => prev + 1)
      setTimeout(fetchMovies, 200)
    }
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
            <MovieCard
              movie={movies[0]}
              onClick={() => handleVote(movies[0], movies[1])}
              selected={selectedMovie === movies[0].movie_id}
            />

            {/* VS Text */}
            <div className="hidden md:block">
              <div className="bg-white px-6 py-2 rounded-full shadow-sm">
                <span className="text-2xl font-bold text-gray-400">VS</span>
              </div>
            </div>

            {/* Second Movie */}
            <MovieCard
              movie={movies[1]}
              onClick={() => handleVote(movies[1], movies[0])}
              selected={selectedMovie === movies[1].movie_id}
            />
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

