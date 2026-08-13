import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Link } from 'react-router-dom'
import type { Tables } from '../types/supabase'
import MarqueeFrame from '../components/MarqueeFrame'

type MovieRow = Tables<'movies'>

interface MovieWithJoin extends MovieRow {
  elo_score: number
  created_at: string
}

interface RawJoinRow {
  elo_score: number
  created_at: string
  movies: MovieRow | MovieRow[] | null
}

interface MoverStat {
  movie: MovieRow
  wins: number
  losses: number
  net: number
}

interface WinStreakStat {
  movie: MovieRow
  streak: number
}

const MOVER_WINDOW_DAYS = 14
const FALLBACK_IMAGE = '/no_poster_placeholder.png'

function unwrapMovie(m: RawJoinRow): MovieWithJoin {
  const movie = Array.isArray(m.movies) ? m.movies[0] : m.movies
  return {
    ...(movie || ({} as MovieRow)),
    elo_score: m.elo_score,
    created_at: m.created_at || '',
  } as MovieWithJoin
}

function daysAgo(dateStr: string) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

function Poster({ url, title, size }: { url: string | null; title: string; size: string }) {
  return (
    <img
      src={url || FALLBACK_IMAGE}
      alt={title}
      className={`${size} rounded-sm border border-accent/50 object-cover`}
      onError={(e) => {
        e.currentTarget.src = FALLBACK_IMAGE
      }}
    />
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalMovies: 0,
    totalComparisons: 0,
    topMovies: [] as MovieWithJoin[],
    recentMovies: [] as MovieWithJoin[],
  })
  const [movers, setMovers] = useState<MoverStat[]>([])
  const [winStreak, setWinStreak] = useState<WinStreakStat | null>(null)
  const [comparisonStreak, setComparisonStreak] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { count } = await supabase
        .from('user_movies')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      const { data: topMoviesRows, error: topMoviesError } = await supabase
        .from('user_movies')
        .select(`elo_score, created_at, movies:movies!user_movies_movie_id_fkey (id, title, year, url)`)
        .eq('user_id', user.id)
        .order('elo_score', { ascending: false })
        .limit(3)
      if (topMoviesError) console.error('Failed to fetch top movies:', topMoviesError)

      const { data: recentMoviesRows, error: recentMoviesError } = await supabase
        .from('user_movies')
        .select(`elo_score, created_at, movies:movies!user_movies_movie_id_fkey (id, title, year, url)`)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(6)
      if (recentMoviesError) console.error('Failed to fetch recent movies:', recentMoviesError)

      const { data: comparisons, error: comparisonsError } = await supabase
        .from('comparisons')
        .select('winner_movie_id, loser_movie_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
      if (comparisonsError) console.error('Failed to fetch comparisons:', comparisonsError)

      setStats({
        totalMovies: count || 0,
        totalComparisons: comparisons?.length || 0,
        topMovies: ((topMoviesRows || []) as unknown as RawJoinRow[]).map(unwrapMovie),
        recentMovies: ((recentMoviesRows || []) as unknown as RawJoinRow[]).map(unwrapMovie),
      })

      if (comparisons && comparisons.length > 0) {
        // Big movers: net wins minus losses within the trailing window — an
        // approximation of elo movement, since we don't store elo history.
        const cutoff = Date.now() - MOVER_WINDOW_DAYS * 24 * 60 * 60 * 1000
        const recordMap = new Map<string, { wins: number; losses: number }>()
        for (const c of comparisons) {
          if (new Date(c.created_at).getTime() < cutoff) continue
          const winnerRecord = recordMap.get(c.winner_movie_id) || { wins: 0, losses: 0 }
          winnerRecord.wins += 1
          recordMap.set(c.winner_movie_id, winnerRecord)
          const loserRecord = recordMap.get(c.loser_movie_id) || { wins: 0, losses: 0 }
          loserRecord.losses += 1
          recordMap.set(c.loser_movie_id, loserRecord)
        }
        const moverEntries = [...recordMap.entries()]
          .map(([id, { wins, losses }]) => ({ id, wins, losses, net: wins - losses }))
          .filter((e) => e.net > 0)
          .sort((a, b) => b.net - a.net)
          .slice(0, 3)

        // Win streak: for each movie, count consecutive wins trailing back
        // from its most recent comparison.
        const history = new Map<string, boolean[]>()
        for (const c of comparisons) {
          const wins = history.get(c.winner_movie_id) || []
          wins.push(true)
          history.set(c.winner_movie_id, wins)
          const losses = history.get(c.loser_movie_id) || []
          losses.push(false)
          history.set(c.loser_movie_id, losses)
        }
        let bestStreakId: string | null = null
        let bestStreak = 0
        for (const [id, results] of history) {
          let streak = 0
          for (let i = results.length - 1; i >= 0 && results[i]; i--) streak++
          if (streak > bestStreak) {
            bestStreak = streak
            bestStreakId = id
          }
        }

        // Comparison activity streak: consecutive calendar days with at
        // least one comparison, ending today (or yesterday, so a streak
        // isn't shown as broken until a full day has passed).
        const activeDays = new Set(comparisons.map((c) => new Date(c.created_at).toDateString()))
        const cursor = new Date()
        if (!activeDays.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1)
        let streakDays = 0
        while (activeDays.has(cursor.toDateString())) {
          streakDays++
          cursor.setDate(cursor.getDate() - 1)
        }
        setComparisonStreak(streakDays)

        const idsNeeded = [...new Set([...moverEntries.map((e) => e.id), bestStreakId].filter((id): id is string => !!id))]
        if (idsNeeded.length > 0) {
          const { data: movieDetails } = await supabase.from('movies').select('*').in('id', idsNeeded)
          const movieMap = new Map((movieDetails || []).map((m) => [m.id, m]))

          setMovers(
            moverEntries
              .map((e) => ({ movie: movieMap.get(e.id), wins: e.wins, losses: e.losses, net: e.net }))
              .filter((m): m is MoverStat => !!m.movie)
          )

          if (bestStreakId && bestStreak >= 2) {
            const movie = movieMap.get(bestStreakId)
            if (movie) setWinStreak({ movie, streak: bestStreak })
          }
        }
      }

      setLoading(false)
    }

    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground text-lg">Loading dashboard...</div>
      </div>
    )
  }

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mb-3 flex items-center justify-center gap-3">
            <span className="h-[5px] w-[5px] rounded-full bg-marquee-dot" />
            <span className="font-marquee text-[11px] font-medium uppercase tracking-[.24em] text-accent">Your Screening Room</span>
            <span className="h-[5px] w-[5px] rounded-full bg-marquee-dot" />
          </div>
          <h1 className="font-marquee text-4xl sm:text-5xl font-semibold uppercase tracking-[.015em] text-foreground">Welcome Back</h1>
          <p className="mt-3 text-muted-foreground">Here's what's happening in your library</p>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
          <Link
            to="/compare"
            className="rounded bg-primary px-8 py-3 font-marquee text-sm font-semibold uppercase tracking-[.06em] text-primary-foreground shadow-[0_0_0_1px_rgba(232,190,74,.5),0_8px_20px_-8px_rgba(201,82,47,.7)] transition hover:brightness-110"
          >
            Compare Movies
          </Link>
          <Link
            to="/add"
            className="rounded border border-primary px-8 py-3 font-marquee text-sm font-semibold uppercase tracking-[.06em] text-primary transition hover:bg-primary/10"
          >
            Add New Movie
          </Link>
        </div>

        {/* Stat strip */}
        <div className="mb-8 overflow-hidden rounded-xl border border-marquee-hairline bg-marquee-band">
          <div className="grid grid-cols-1 divide-y divide-marquee-hairline sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="p-6 text-center">
              <div className="font-marquee text-4xl font-bold text-primary">{stats.totalMovies}</div>
              <div className="mt-1 font-marquee text-[11px] uppercase tracking-[.2em] text-muted-foreground">Movies Ranked</div>
            </div>
            <div className="p-6 text-center">
              <div className="font-marquee text-4xl font-bold text-accent">
                {comparisonStreak > 0 ? `${comparisonStreak} 🔥` : '—'}
              </div>
              <div className="mt-1 font-marquee text-[11px] uppercase tracking-[.2em] text-muted-foreground">Day Streak</div>
            </div>
            <div className="p-6 text-center">
              <div className="font-marquee text-4xl font-bold text-primary">{stats.totalComparisons}</div>
              <div className="mt-1 font-marquee text-[11px] uppercase tracking-[.2em] text-muted-foreground">Total Comparisons</div>
            </div>
          </div>
        </div>

        {/* Top Ranked spotlight */}
        {stats.topMovies.length > 0 && (
          <MarqueeFrame className="mb-8" contentClassName="p-6">
            <div className="mb-4 font-marquee text-[11px] font-medium uppercase tracking-[.2em] text-accent">Top Ranked</div>
            <div className="grid grid-cols-3 gap-4 sm:gap-6">
              {stats.topMovies.map((movie, i) => (
                <Link key={movie.id} to={`/movie/${movie.id}`} className="group text-center">
                  <Poster
                    url={movie.url}
                    title={movie.title}
                    size={`w-full aspect-[2/3] transition-transform duration-200 group-hover:scale-105 ${i === 0 ? '' : 'opacity-90'}`}
                  />
                  <div className={`mt-3 font-marquee text-xs font-semibold ${i === 0 ? 'text-accent' : 'text-muted-foreground'}`}>
                    #{i + 1}
                  </div>
                  <div className="mt-1 truncate font-marquee text-sm font-semibold uppercase tracking-[.015em] text-foreground">
                    {movie.title}
                  </div>
                </Link>
              ))}
            </div>
          </MarqueeFrame>
        )}

        {/* Recent Additions */}
        <div className="mb-8">
          <h2 className="mb-4 font-marquee text-lg font-semibold uppercase tracking-[.06em] text-foreground">Recent Additions</h2>
          {stats.recentMovies.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {stats.recentMovies.map((movie) => (
                <Link key={movie.id} to={`/movie/${movie.id}`} className="group w-24 flex-shrink-0">
                  <Poster url={movie.url} title={movie.title} size="w-full aspect-[2/3] group-hover:scale-105 transition-transform duration-200" />
                  <div className="mt-2 truncate text-xs font-medium text-foreground">{movie.title}</div>
                  <div className="text-[11px] text-muted-foreground">{daysAgo(movie.created_at)}</div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No movies added yet</p>
          )}
        </div>

        {/* Big Movers */}
        <div className="mb-8">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-marquee text-lg font-semibold uppercase tracking-[.06em] text-foreground">Big Movers</h2>
            <span className="text-xs text-muted-foreground">Last {MOVER_WINDOW_DAYS} days</span>
          </div>
          {movers.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {movers.map((m) => (
                <Link key={m.movie.id} to={`/movie/${m.movie.id}`} className="group w-24 flex-shrink-0">
                  <div className="relative">
                    <Poster url={m.movie.url} title={m.movie.title} size="w-full aspect-[2/3] transition-transform duration-200 group-hover:scale-105" />
                    <span className="absolute -right-1 -top-1 rounded-full bg-success px-1.5 py-0.5 text-[10px] font-bold text-success-foreground shadow">
                      ▲{m.net}
                    </span>
                  </div>
                  <div className="mt-2 truncate text-xs font-medium text-foreground">{m.movie.title}</div>
                  <div className="text-[11px] text-muted-foreground">{m.wins}W – {m.losses}L</div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No movers yet — compare a few movies this week.</p>
          )}
        </div>

        {/* Win Streak */}
        {winStreak && (
          <div className="mb-10">
            <h2 className="mb-4 font-marquee text-lg font-semibold uppercase tracking-[.06em] text-foreground">On a Streak 🔥</h2>
            <div className="flex gap-4">
              <Link to={`/movie/${winStreak.movie.id}`} className="group w-24 flex-shrink-0">
                <div className="relative">
                  <Poster url={winStreak.movie.url} title={winStreak.movie.title} size="w-full aspect-[2/3] transition-transform duration-200 group-hover:scale-105" />
                  <span className="absolute -right-1 -top-1 rounded-full bg-success px-1.5 py-0.5 text-[10px] font-bold text-success-foreground shadow">
                    {winStreak.streak}🔥
                  </span>
                </div>
                <div className="mt-2 truncate text-xs font-medium text-foreground">{winStreak.movie.title}</div>
                <div className="text-[11px] text-success">{winStreak.streak} wins in a row</div>
              </Link>
            </div>
          </div>
        )}

        {/* View Rankings */}
        <div className="text-center">
          <Link
            to="/ranking"
            className="inline-block rounded bg-primary px-8 py-3 font-marquee text-sm font-semibold uppercase tracking-[.06em] text-primary-foreground shadow-[0_0_0_1px_rgba(232,190,74,.5),0_8px_20px_-8px_rgba(201,82,47,.7)] transition hover:brightness-110"
          >
            View Full Rankings
          </Link>
        </div>
      </div>
    </div>
  )
}
