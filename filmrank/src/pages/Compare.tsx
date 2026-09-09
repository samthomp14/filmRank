// src/pages/Compare.tsx
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import MovieCard from '../components/MovieCard.tsx'
import type { Tables } from '../types/supabase';
import { useSwipeable } from 'react-swipeable'

interface CompareMovie extends Tables<'movies'> {
  movie_id: string;
  elo_score: number;
  match_count: number;
}

function Compare() {
  const location = useLocation()
  const navigate = useNavigate()
  const [movies, setMovies] = useState<CompareMovie[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [comparisonsToday, setComparisonsToday] = useState(0)
  const [selectedMovie, setSelectedMovie] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

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

  const handleInfoClick = (movie: CompareMovie) => {
    navigate(`/movie/${movie.movie_id}`, { state: { from: 'compare', pair: movies } })
  }

  // Handle keyboard events
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!movies || movies.length < 2) return
    
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault()
        handleVote(movies[0], movies[1])
        break
      case 'ArrowRight':
        event.preventDefault()
        handleVote(movies[1], movies[0])
        break
      case ' ':
        event.preventDefault()
        handleSkip()
        break
    }
  }

  useEffect(() => {
    const resumedPair = (location.state as { pair?: CompareMovie[] } | null)?.pair
    if (resumedPair && resumedPair.length === 2) {
      // Returning from a movie's detail page mid-comparison — resume the
      // same pair instead of fetching a fresh random one.
      setMovies(resumedPair)
      setSelectedMovie(null)
      setLoading(false)
      navigate('.', { replace: true, state: null })
    } else {
      fetchMovies()
    }
    fetchComparisonsToday()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Add keyboard event listener
    window.addEventListener('keydown', handleKeyDown)
    
    // Cleanup function to remove event listener
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [movies]) // Re-add listener when movies change

  const handlers = useSwipeable({
    onSwipedLeft: () => {
      if (movies && movies.length >= 2) handleVote(movies[0], movies[1])
    },
    onSwipedRight: () => {
      if (movies && movies.length >= 2) handleVote(movies[1], movies[0])
    },
    trackMouse: true // allows swipe with mouse for testing
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground text-lg">Loading movies...</div>
      </div>
    )
  }
  
  if (!movies || movies.length < 2) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground text-lg">Not enough movies to compare.</div>
      </div>
    )
  }

  return (
    <div {...handlers} className="flex flex-col justify-center items-center min-h-[80vh] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="max-w-4xl w-full">
        {/* Header Section */}
        <div className="text-center mb-16 relative">
          <h1 className="font-marquee text-3xl font-semibold uppercase tracking-[.02em] text-foreground mb-2">Which movie do you prefer?</h1>
          <p className="text-muted-foreground">
            You've made {comparisonsToday} comparisons today
          </p>
          {/* Information Icon */}
          <button
            onClick={() => setShowModal(true)}
            className="absolute top-0 right-0 p-2 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-full"
            aria-label="Show tips and controls"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>

        {/* Comparison Section */}
        <div className="mb-16">
          <div className="flex flex-row items-center justify-center gap-4 sm:gap-8 w-full">
            {/* First Movie */}
            <MovieCard
              movie={movies[0]}
              onClick={() => handleVote(movies[0], movies[1])}
              onInfoClick={() => handleInfoClick(movies[0])}
              selected={selectedMovie === movies[0].movie_id}
              className="flex-1 max-w-xs"
            />

            {/* VS Text */}
            <div className="px-2 sm:px-6 py-2 rounded-full shadow-sm bg-card">
              <span className="text-2xl font-bold text-muted-foreground">VS</span>
            </div>

            {/* Second Movie */}
            <MovieCard
              movie={movies[1]}
              onClick={() => handleVote(movies[1], movies[0])}
              onInfoClick={() => handleInfoClick(movies[1])}
              selected={selectedMovie === movies[1].movie_id}
              className="flex-1 max-w-xs"
            />
          </div>
        </div>

        {/* Skip Button */}
        <div className="flex justify-center">
          <button
            onClick={handleSkip}
            className="text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-lg px-4 py-2"
          >
            Skip this pair
          </button>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg max-w-md w-full p-6 relative">
            {/* Close Button */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-full"
              aria-label="Close modal"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Modal Content */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Tips & Controls</h3>
              
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium text-foreground mb-2">How to compare:</h4>
                  <p className="text-sm text-muted-foreground">
                    Click on the movie you prefer. The more you compare, the more accurate your rankings will become!
                  </p>
                </div>

                <div>
                  <h4 className="font-medium text-foreground mb-2">Keyboard shortcuts:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• <kbd className="px-2 py-1 bg-secondary rounded text-xs">←</kbd> Choose left movie</li>
                    <li>• <kbd className="px-2 py-1 bg-secondary rounded text-xs">→</kbd> Choose right movie</li>
                    <li>• <kbd className="px-2 py-1 bg-secondary rounded text-xs">Space</kbd> Skip this pair</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-medium text-foreground mb-2">Today's progress:</h4>
                  <p className="text-sm text-muted-foreground">
                    You've made <span className="font-semibold">{comparisonsToday}</span> comparisons today.
                  </p>
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={() => setShowModal(false)}
                  className="w-full bg-primary text-primary-foreground py-2 px-4 rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                >
                  Got it!
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Compare

