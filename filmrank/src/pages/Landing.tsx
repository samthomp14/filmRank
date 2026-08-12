import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { supabase } from '../lib/supabaseClient'
import {
  CheckCircleIcon,
  PlusIcon,
  ArrowsRightLeftIcon,
  SparklesIcon,
  FilmIcon,
  ArrowRightIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline'
import AnimatedLeaderboard from '../components/AnimatedLeaderboard'
import ComparisonAnimation from '../components/ComparisonAnimation'

export default function Landing() {
  const navigate = useNavigate()
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  const [picksMade, setPicksMade] = useState(0)

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      setIsLoggedIn(!!data.session)
    }
    checkSession()
  }, [])

  const handleStartRanking = () => {
    navigate(isLoggedIn ? '/compare' : '/signup')
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Hero Section */}
      <section className="relative w-full overflow-hidden pt-16 pb-20 sm:pt-20 sm:pb-28 px-4">
        {/* Ambient color washes */}
        <div className="pointer-events-none absolute -top-24 right-0 w-[34rem] h-[34rem] bg-primary/20 rounded-full blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute top-1/3 -left-32 w-[26rem] h-[26rem] bg-accent/20 rounded-full blur-3xl" aria-hidden="true" />

        <div className="relative container max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          {/* Left: Text Content */}
          <div className="text-left">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1 mb-6">
              <FilmIcon className="w-4 h-4" />
              A calmer way to rank
            </span>
            <h1 className="font-display text-5xl sm:text-6xl font-semibold leading-[1.05] text-foreground mb-6 tracking-tight">
              Stop rating your movies.
              <br />
              Start <span className="text-primary">comparing</span> them.
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-xl mb-8">
              No stars. No five-point scales. No staring at a blank review box. Just pick which
              film you liked more — FilmRank quietly turns every choice into your own evolving
              Top 100.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={handleStartRanking}
                className="group inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3.5 rounded-full font-semibold text-base shadow-lg shadow-primary/20 transition-colors"
              >
                Create your free account
                <ArrowRightIcon className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground font-medium text-sm transition-colors"
              >
                See how it works
                <ChevronDownIcon className="w-4 h-4" />
              </a>
            </div>
            <p className="mt-5 text-xs text-muted-foreground">Free forever. No credit card. Takes about 30 seconds.</p>
          </div>

          {/* Right: Interactive comparison demo */}
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <span className="text-base">👆</span> Try it — click the one you'd pick
            </p>
            <ComparisonAnimation onPick={() => setPicksMade((p) => p + 1)} />
            <AnimatePresence>
              {picksMade > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                  className="w-full max-w-md bg-card border border-primary/20 rounded-xl shadow-lg shadow-primary/10 px-5 py-4 flex items-center justify-between gap-4"
                >
                  <p className="text-sm text-foreground">
                    {picksMade === 1
                      ? "That's the whole idea. Sign up and every pick starts building your real list."
                      : 'Keep going and this becomes your actual Top 100.'}
                  </p>
                  <button
                    onClick={() => navigate('/signup')}
                    className="flex-shrink-0 inline-flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold px-4 py-2 rounded-full transition-colors"
                  >
                    Sign up
                    <ArrowRightIcon className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* Why FilmRank? & AnimatedLeaderboard */}
      <section className="relative w-full border-t border-border bg-card py-20 px-4">
        <div className="container max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div>
            <h3 className="font-display text-2xl sm:text-3xl font-semibold text-foreground mb-6">Why FilmRank?</h3>
            <ul className="space-y-4 text-lg text-muted-foreground">
              <li className="flex items-start gap-3">
                <CheckCircleIcon className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                <span>No reviews to write. No guilt. No wrong answers.</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircleIcon className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                <span>Your list updates every time you compare — gently, naturally.</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircleIcon className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                <span>It's not about "best films." It's about <strong className="text-foreground">your</strong> films.</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircleIcon className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                <span>Low-pressure, friendly, and made for movie lovers.</span>
              </li>
            </ul>
          </div>
          <div className="h-full w-full flex items-center justify-center">
            <AnimatedLeaderboard />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="relative w-full border-t border-border bg-background py-20 px-4 scroll-mt-16">
        <div className="container max-w-5xl mx-auto">
          <h3 className="font-display text-2xl sm:text-3xl font-semibold text-foreground mb-14 text-center">How It Works</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-12 sm:gap-8 relative">
            {/* connecting line, desktop only */}
            <div className="hidden sm:block absolute top-8 left-[16.5%] right-[16.5%] h-px bg-border" aria-hidden="true" />
            {/* Add */}
            <div className="relative flex flex-col items-center text-center">
              <div className="relative z-10 bg-card border border-primary/10 p-4 rounded-full shadow-sm">
                <PlusIcon className="w-7 h-7 text-primary" />
              </div>
              <span className="mt-5 font-display font-semibold text-foreground text-lg">Add</span>
              <p className="mt-2 text-muted-foreground leading-relaxed">Add movies you've seen or want to rank.</p>
            </div>
            {/* Compare */}
            <div className="relative flex flex-col items-center text-center">
              <div className="relative z-10 bg-card border border-primary/10 p-4 rounded-full shadow-sm">
                <ArrowsRightLeftIcon className="w-7 h-7 text-primary" />
              </div>
              <span className="mt-5 font-display font-semibold text-foreground text-lg">Compare</span>
              <p className="mt-2 text-muted-foreground leading-relaxed">Pick which movie you prefer in each matchup.</p>
            </div>
            {/* Rank */}
            <div className="relative flex flex-col items-center text-center">
              <div className="relative z-10 bg-card border border-primary/10 p-4 rounded-full shadow-sm">
                <SparklesIcon className="w-7 h-7 text-primary" />
              </div>
              <span className="mt-5 font-display font-semibold text-foreground text-lg">Rank</span>
              <p className="mt-2 text-muted-foreground leading-relaxed">Your list updates automatically as you compare.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative w-full overflow-hidden py-20 px-4 bg-primary">
        <div
          className="absolute top-0 left-0 right-0 h-2 opacity-40"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.9) 1.5px, transparent 1.5px)',
            backgroundSize: '18px 8px',
          }}
          aria-hidden="true"
        />
        <div className="container max-w-3xl mx-auto text-center">
          <h3 className="font-display text-3xl sm:text-4xl font-semibold text-primary-foreground mb-4">
            Your list is waiting to happen.
          </h3>
          <p className="text-primary-foreground/80 text-lg mb-8">
            Add a few films, make a few comparisons, and watch your Top 100 take shape.
          </p>
          <button
            onClick={handleStartRanking}
            className="group inline-flex items-center gap-2 bg-card hover:bg-secondary text-primary px-8 py-3.5 rounded-full font-semibold text-base shadow-lg shadow-black/10 transition-colors"
          >
            Create your free account
            <ArrowRightIcon className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </section>
    </div>
  )
}
