import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'
import { supabase } from '../lib/supabaseClient'
import { computeEloStats, eloToStars } from '../lib/movieUtils'
import { getAvatarPublicUrl } from '../lib/avatarUtils'
import AnimatedLeaderboard from '../components/AnimatedLeaderboard'
import RatingDistribution from '../components/RatingDistribution'
import type { RankedRow } from '../lib/demoTypes'

interface UserProfile {
  email: string
  name: string | null
  created_at: string
  avatar_filename: string | null
}

interface RankedMovie {
  id: string
  title: string
  year: number | null
  elo_score: number
}

export default function Profile() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [rankedMovies, setRankedMovies] = useState<RankedMovie[]>([])
  const [totalComparisons, setTotalComparisons] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isEditingName, setIsEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('No user found')

      const { data: userRow } = await supabase
        .from('users')
        .select('name, avatar_filename')
        .eq('id', user.id)
        .single()

      setProfile({
        email: user.email || '',
        name: userRow?.name ?? null,
        created_at: new Date(user.created_at).toLocaleDateString(),
        avatar_filename: userRow?.avatar_filename ?? null,
      })
      setNameInput(userRow?.name ?? '')

      const { data: movieRows, error: moviesError } = await supabase
        .from('user_movies')
        .select(`elo_score, movies:movies!user_movies_movie_id_fkey (id, title, year)`)
        .eq('user_id', user.id)
      if (moviesError) throw moviesError

      const ranked: RankedMovie[] = (movieRows || [])
        .map((m: any) => {
          const movie = Array.isArray(m.movies) ? m.movies[0] : m.movies
          return movie
            ? { id: movie.id as string, title: movie.title as string, year: (movie.year as number | null) ?? null, elo_score: m.elo_score as number }
            : null
        })
        .filter((m): m is RankedMovie => m !== null)
      setRankedMovies(ranked)

      const { count: comparisonsCount } = await supabase
        .from('comparisons')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
      setTotalComparisons(comparisonsCount || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const eloStats = useMemo(() => computeEloStats(rankedMovies.map((m) => m.elo_score)), [rankedMovies])
  const starValues = useMemo(() => rankedMovies.map((m) => eloToStars(m.elo_score, eloStats)), [rankedMovies, eloStats])

  const topRows: RankedRow[] = useMemo(
    () =>
      [...rankedMovies]
        .sort((a, b) => b.elo_score - a.elo_score)
        .slice(0, 10)
        .map((m, idx) => ({ position: idx + 1, id: m.id, title: m.title, year: m.year, move: 0 })),
    [rankedMovies]
  )

  const handleNameSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSavingName(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      const trimmed = nameInput.trim()
      const { error } = await supabase.from('users').update({ name: trimmed || null }).eq('id', user.id)
      if (error) throw error

      setProfile((prev) => (prev ? { ...prev, name: trimmed || null } : prev))
      setIsEditingName(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update name')
    } finally {
      setSavingName(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground text-lg">Loading profile...</div>
      </div>
    )
  }

  if (error && !profile) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-destructive text-lg">{error}</div>
      </div>
    )
  }

  const displayName = profile?.name || profile?.email?.split('@')[0] || 'Filmgoer'
  const initial = displayName.trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Identity header */}
        <div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <Link
            to="/settings"
            aria-label="Settings"
            title="Settings"
            className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <Cog6ToothIcon className="h-5 w-5" />
          </Link>
          {profile?.avatar_filename ? (
            <img
              src={getAvatarPublicUrl(profile.avatar_filename)}
              alt={displayName}
              className="h-20 w-20 flex-shrink-0 rounded-full object-cover shadow-md"
            />
          ) : (
            <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent font-marquee text-3xl font-bold text-primary-foreground shadow-md">
              {initial}
            </div>
          )}
          <div className="flex-1">
            {isEditingName ? (
              <form onSubmit={handleNameSave} className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Your name"
                  autoFocus
                  className="px-3 py-1.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
                <button
                  type="submit"
                  disabled={savingName}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => { setIsEditingName(false); setNameInput(profile?.name ?? '') }}
                  className="px-3 py-1.5 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex items-center justify-center gap-2 sm:justify-start">
                <h1 className="font-marquee text-2xl font-semibold uppercase tracking-[.02em] text-foreground">
                  {displayName}
                </h1>
                <button
                  onClick={() => setIsEditingName(true)}
                  title="Edit name"
                  aria-label="Edit name"
                  className="text-muted-foreground hover:text-primary focus:outline-none"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>
            )}
            <p className="mt-1 text-sm text-muted-foreground">{profile?.email}</p>
            <p className="text-xs text-muted-foreground">Member since {profile?.created_at}</p>
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </div>
        </div>

        {/* Stat row */}
        <div className="flex items-center justify-center gap-10 border-y border-border py-5 sm:justify-start">
          <div className="text-center sm:text-left">
            <span className="font-marquee text-2xl font-bold text-primary">{rankedMovies.length}</span>
            <span className="ml-2 font-marquee text-[11px] uppercase tracking-[.2em] text-muted-foreground">Movies Ranked</span>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="text-center sm:text-left">
            <span className="font-marquee text-2xl font-bold text-accent">{totalComparisons}</span>
            <span className="ml-2 font-marquee text-[11px] uppercase tracking-[.2em] text-muted-foreground">Comparisons Made</span>
          </div>
        </div>

        {/* Rating distribution */}
        <div>
          <h2 className="mb-4 font-marquee text-lg font-semibold uppercase tracking-[.06em] text-foreground">Rating Distribution</h2>
          <RatingDistribution stars={starValues} />
        </div>

        {/* Top 10 marquee */}
        {topRows.length > 0 && (
          <div>
            <h2 className="mb-4 font-marquee text-lg font-semibold uppercase tracking-[.06em] text-foreground">My Top {topRows.length}</h2>
            <AnimatedLeaderboard
              rows={topRows}
              listLabel="My Rankings"
              onRowClick={(row) => navigate(`/movie/${row.id}`)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
