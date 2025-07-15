import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  CheckCircleIcon,
  PlusIcon,
  ArrowsRightLeftIcon,
  SparklesIcon
} from '@heroicons/react/24/outline'
import AnimatedLeaderboard from '../components/AnimatedLeaderboard'
import ComparisonAnimation from '../components/ComparisonAnimation'

export default function Landing() {
  const navigate = useNavigate()
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      setIsLoggedIn(!!data.session)
    }
    checkSession()
  }, [])

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
            <ComparisonAnimation />
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
          <div className="h-full w-full flex items-center justify-center">
            <AnimatedLeaderboard />
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
