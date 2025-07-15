import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  CheckCircleIcon,
  PlusIcon,
  ArrowsRightLeftIcon,
  SparklesIcon
} from '@heroicons/react/24/outline'

export default function Landing() {
  const navigate = useNavigate()
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  // Poster comparison animation state
  const [posters, setPosters] = useState<string[]>([])
  const [currentPair, setCurrentPair] = useState<[string, string]>(['', ''])
  const [winner, setWinner] = useState<number | null>(null)
  const [animationPhase, setAnimationPhase] = useState<'idle' | 'comparing' | 'winner' | 'transition'>('idle')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [nextPoster, setNextPoster] = useState<string>('')
  const [eliminatedPoster, setEliminatedPoster] = useState<number | null>(null)
  const [previousWinner, setPreviousWinner] = useState<string>('')

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      setIsLoggedIn(!!data.session)
    }
    checkSession()
  }, [])

  // Fetch all posters on mount
  useEffect(() => {
    const fetchPosters = async () => {
      const { data, error } = await supabase
        .from('movies')
        .select('id, url')
      if (!error && data) {
        // Filter out movies without URLs and shuffle to get 10 random ones
        const moviesWithUrls = data.filter(m => m.url)
        const shuffled = moviesWithUrls.sort(() => 0.5 - Math.random())
        const posterUrls = shuffled.slice(0, 10).map(m => m.url)
        setPosters(posterUrls)
        if (posterUrls.length >= 2) {
          setCurrentPair([posterUrls[0], posterUrls[1]])
          setAnimationPhase('comparing')
        }
      }
    }
    fetchPosters()
  }, [])

  // Animation cycle
  useEffect(() => {
    if (posters.length < 2 || animationPhase !== 'comparing') return

    const cycle = async () => {
      // Show comparison for 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Pick a random winner
      const winnerIndex = Math.random() > 0.5 ? 0 : 1
      const loserIndex = winnerIndex === 0 ? 1 : 0
      const winnerPoster = currentPair[winnerIndex]
      setWinner(winnerIndex)
      setEliminatedPoster(loserIndex)
      setAnimationPhase('winner')
      
      // Show winner for 1 second
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Prepare next poster - exclude the previous winner
      let nextIndex = (currentIndex + 2) % posters.length
      let newPoster = posters[nextIndex]
      
      // If the next poster would be the previous winner, find a different one
      if (newPoster === previousWinner && posters.length > 2) {
        // Find the next available poster that's not the previous winner
        for (let i = 1; i < posters.length; i++) {
          const candidateIndex = (currentIndex + 2 + i) % posters.length
          const candidatePoster = posters[candidateIndex]
          if (candidatePoster !== previousWinner && candidatePoster !== winnerPoster) {
            nextIndex = candidateIndex
            newPoster = candidatePoster
            break
          }
        }
      }
      
      setNextPoster(newPoster)
      
      // Transition phase - loser fades out and new poster fades in
      setAnimationPhase('transition')
      await new Promise(resolve => setTimeout(resolve, 800))
      
      // Keep the winner, replace the loser with next poster
      const newPair: [string, string] = winnerIndex === 0 
        ? [winnerPoster, newPoster] 
        : [newPoster, winnerPoster]
      
      setCurrentPair(newPair)
      setCurrentIndex(nextIndex)
      setWinner(null)
      setNextPoster('')
      setEliminatedPoster(null)
      setPreviousWinner(winnerPoster)
      setAnimationPhase('comparing')
    }

    cycle()
  }, [posters, currentPair, animationPhase, currentIndex])

  const handleStartRanking = () => {
    navigate(isLoggedIn ? '/compare' : '/login')
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Hero Section */}
      <section className="w-full relative overflow-hidden py-24 px-4 bg-gradient-to-br from-blue-100 via-white to-blue-50">
        <div className="container max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          {/* Left: Text Content */}
          <div className="text-left">
            <span className="text-base font-semibold text-blue-700 mb-2 tracking-wide uppercase">Welcome to</span>
            <h1 className="text-5xl sm:text-6xl font-extrabold mb-3 bg-gradient-to-r from-blue-700 via-blue-500 to-blue-400 bg-clip-text text-transparent drop-shadow-lg">FilmRank</h1>
            <h2 className="text-2xl font-semibold text-gray-700 mb-4">A calmer way to track what you love.</h2>
            <p className="text-lg text-gray-600 leading-relaxed max-w-xl mb-8">
              <span className="font-semibold text-blue-700">No stars. No pressure.</span> Just compare movies and let your personal list evolve naturally.
            </p>
            <button
              onClick={handleStartRanking}
              className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 rounded-full font-semibold text-lg shadow-md transition-colors"
            >
              Start Ranking
            </button>
          </div>
          {/* Right: Comparison Animation */}
          <div className="hidden md:flex justify-center items-center">
            <div className="relative w-[500px] h-96 flex items-center justify-center">
              {currentPair[0] && currentPair[1] && (
                <>
                  {/* Left Poster */}
                  <div className="relative">
                    <div 
                      className={`w-48 h-72 rounded-lg overflow-hidden shadow-lg transition-all duration-700 ${
                        animationPhase === 'winner' && winner === 0 
                          ? 'scale-110 ring-4 ring-blue-500 z-20' 
                          : animationPhase === 'winner' && winner === 1
                          ? 'scale-75 -translate-x-48 translate-y-32 opacity-0 rotate-12 z-10'
                          : animationPhase === 'transition' && eliminatedPoster === 0
                          ? 'opacity-0'
                          : 'scale-100 z-10'
                      }`}
                    >
                      <img
                        src={animationPhase === 'transition' && winner === 1 && nextPoster ? nextPoster : currentPair[0]}
                        alt="Movie Poster"
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    </div>
                  </div>
                  
                  {/* VS Text */}
                  <div className={`mx-8 z-30 transition-all duration-500 ${
                    animationPhase === 'winner' ? 'opacity-0 scale-75' : 'opacity-100 scale-100'
                  }`}>
                    <div className="bg-white px-4 py-2 rounded-full shadow-md">
                      <span className="text-xl font-bold text-gray-400">VS</span>
                    </div>
                  </div>
                  
                  {/* Right Poster */}
                  <div className="relative">
                    <div 
                      className={`w-48 h-72 rounded-lg overflow-hidden shadow-lg transition-all duration-700 ${
                        animationPhase === 'winner' && winner === 1 
                          ? 'scale-110 ring-4 ring-blue-500 z-20' 
                          : animationPhase === 'winner' && winner === 0
                          ? 'scale-75 translate-x-48 translate-y-32 opacity-0 -rotate-12 z-10'
                          : animationPhase === 'transition' && eliminatedPoster === 1
                          ? 'opacity-0'
                          : 'scale-100 z-10'
                      }`}
                    >
                      <img
                        src={animationPhase === 'transition' && winner === 0 && nextPoster ? nextPoster : currentPair[1]}
                        alt="Movie Poster"
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Why FilmRank? & Who It's For (2-col grid) */}
      <section className="w-full border-t border-gray-200 shadow-sm bg-white py-20 px-4">
        <div className="container max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div>
            <h3 className="text-2xl font-semibold text-gray-900 mb-6">Why FilmRank?</h3>
            <ul className="space-y-4 text-lg text-gray-700">
              <li className="flex items-start gap-2">
                <CheckCircleIcon className="w-5 h-5 text-blue-600 mt-1" />
                <span>No reviews to write. No guilt. No wrong answers.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircleIcon className="w-5 h-5 text-blue-600 mt-1" />
                <span>Your list updates every time you compare — gently, naturally.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircleIcon className="w-5 h-5 text-blue-600 mt-1" />
                <span>It's not about "best films." It's about <strong>your</strong> films.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircleIcon className="w-5 h-5 text-blue-600 mt-1" />
                <span>Low-pressure, friendly, and made for movie lovers.</span>
              </li>
            </ul>
          </div>
          <div className="hidden md:block h-full w-full flex items-center justify-center">
            {/* Placeholder for future illustration or accent */}
            <div className="w-full h-64 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-400 text-2xl font-bold opacity-40">
              {/* Illustration or SVG could go here */}
              [Your Art Here]
            </div>
          </div>
        </div>
      </section>

      <section className="w-full border-t border-gray-200 shadow-sm bg-gray-50 py-20 px-4">
        <div className="container max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div>
            <h3 className="text-2xl font-semibold text-gray-900 mb-4">Who It's For</h3>
            <p className="text-lg text-gray-700 leading-relaxed">
              FilmRank is for anyone who watches a lot of movies, doesn't love rating systems, and wants a low-pressure way to organize their favorites. If you care more about your personal taste than what's "best," you'll feel right at home.
            </p>
          </div>
          <div className="hidden md:block h-full w-full flex items-center justify-center">
            {/* Placeholder for future illustration or accent */}
            <div className="w-full h-64 bg-gray-200 rounded-2xl flex items-center justify-center text-gray-400 text-2xl font-bold opacity-40">
              [Your Art Here]
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="w-full border-t border-gray-200 shadow-sm bg-white py-20 px-4">
        <div className="container max-w-5xl mx-auto">
          <h3 className="text-2xl font-semibold text-gray-900 mb-10 text-center">How It Works</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-12">
            {/* Add */}
            <div className="flex flex-col items-center text-center">
              <div className="bg-blue-50 p-4 rounded-full">
                <PlusIcon className="w-8 h-8 text-blue-600" />
              </div>
              <span className="mt-4 font-semibold text-gray-900">Add</span>
              <p className="mt-2 text-gray-700 leading-relaxed">Add movies you've seen or want to rank.</p>
            </div>
            {/* Compare */}
            <div className="flex flex-col items-center text-center">
              <div className="bg-blue-50 p-4 rounded-full">
                <ArrowsRightLeftIcon className="w-8 h-8 text-blue-600" />
              </div>
              <span className="mt-4 font-semibold text-gray-900">Compare</span>
              <p className="mt-2 text-gray-700 leading-relaxed">Pick which movie you prefer in each matchup.</p>
            </div>
            {/* Rank */}
            <div className="flex flex-col items-center text-center">
              <div className="bg-blue-50 p-4 rounded-full">
                <SparklesIcon className="w-8 h-8 text-blue-600" />
              </div>
              <span className="mt-4 font-semibold text-gray-900">Rank</span>
              <p className="mt-2 text-gray-700 leading-relaxed">Your list updates automatically as you compare.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="w-full border-t border-gray-200 shadow-sm bg-gray-50 py-20 px-4">
        <div className="container max-w-4xl mx-auto text-center">
          <p className="italic text-lg text-gray-800 mb-2">"FilmRank made me love organizing my movies again. No pressure, just fun."</p>
          <p className="text-gray-600 mb-4">— Alex, early user</p>
          <p className="font-semibold text-blue-600">Over 1,000 movies ranked</p>
        </div>
      </section>

      {/* Closing Section */}
      <section className="w-full border-t border-gray-200 shadow-sm bg-white py-20 px-4">
        <div className="container max-w-4xl mx-auto text-center">
          <h3 className="text-2xl font-semibold text-gray-900 mb-4">No pressure. No stars. Just your vibe.</h3>
          <p className="text-lg text-gray-700 leading-relaxed">FilmRank is about celebrating your unique taste, not chasing perfection. Start ranking and rediscover what you love about movies.</p>
        </div>
      </section>
    </div>
  )
}
