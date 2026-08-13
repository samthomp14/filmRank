import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Link } from 'react-router-dom'
import type { Tables } from '../types/supabase'

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

function PosterThumb({ url, title }: { url: string | null; title: string }) {
  return (
    <img
      src={url || FALLBACK_IMAGE}
      alt={title}
      className="w-10 h-14 object-cover rounded bg-muted flex-shrink-0"
      onError={(e) => {
        e.currentTarget.src = FALLBACK_IMAGE
      }}
    />
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalMovies: 0,
    topMovie: null as MovieWithJoin | null,
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

      const { data: topMovieRow } = await supabase
        .from('user_movies')
        .select(`elo_score, created_at, movies (id, title, year, url)`)
        .eq('user_id', user.id)
        .order('elo_score', { ascending: false })
        .limit(1)
        .single()

      const { data: recentMoviesRows } = await supabase
        .from('user_movies')
        .select(`elo_score, created_at, movies (id, title, year, url)`)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5)

      const { data: comparisons } = await supabase
        .from('comparisons')
        .select('winner_movie_id, loser_movie_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

      setStats({
        totalMovies: count || 0,
        topMovie: topMovieRow ? unwrapMovie(topMovieRow as unknown as RawJoinRow) : null,
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
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="font-marquee text-3xl font-semibold uppercase tracking-[.02em] text-foreground">Welcome to FilmRank</h1>
          <p className="mt-4 text-lg text-muted-foreground">Your personal movie ranking system</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Quick Actions */}
          <div className="bg-card border border-border rounded-xl shadow-md overflow-hidden">
            <div className="p-6">
              <h2 className="text-xl font-semibold text-foreground mb-4">Quick Actions</h2>
              <div className="space-y-4">
                <Link
                  to="/compare"
                  className="block w-full bg-primary text-primary-foreground text-center px-4 py-3 rounded-lg font-medium hover:bg-primary/90 transition duration-150 ease-in-out"
                >
                  Compare Movies
                </Link>
                <Link
                  to="/add"
                  className="block w-full bg-background text-primary text-center px-4 py-3 rounded-lg font-medium border border-primary hover:bg-primary/10 transition duration-150 ease-in-out"
                >
                  Add New Movie
                </Link>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="bg-card border border-border rounded-xl shadow-md overflow-hidden">
            <div className="p-6">
              <h2 className="text-xl font-semibold text-foreground mb-4">Your Stats</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Movies</span>
                  <span className="text-2xl font-bold text-primary">{stats.totalMovies}</span>
                </div>
                {stats.topMovie && (
                  <div className="pt-4 border-t">
                    <span className="text-muted-foreground block mb-2">Top Rated Movie</span>
                    <span className="text-lg font-semibold text-foreground">{stats.topMovie.title}</span>
                    <span className="block text-sm text-muted-foreground">Elo: {stats.topMovie.elo_score.toFixed(0)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Streaks */}
          <div className="bg-card border border-border rounded-xl shadow-md overflow-hidden">
            <div className="p-6">
              <h2 className="text-xl font-semibold text-foreground mb-4">Streaks</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Comparison streak</span>
                  <span className="text-2xl font-bold text-primary">
                    {comparisonStreak > 0 ? `🔥 ${comparisonStreak}d` : '—'}
                  </span>
                </div>
                {winStreak ? (
                  <div className="pt-4 border-t flex items-center gap-3">
                    <PosterThumb url={winStreak.movie.url} title={winStreak.movie.title} />
                    <div>
                      <span className="text-muted-foreground block text-sm">On a win streak</span>
                      <span className="text-base font-semibold text-foreground">{winStreak.movie.title}</span>
                      <span className="block text-sm text-success">{winStreak.streak} wins in a row</span>
                    </div>
                  </div>
                ) : (
                  <p className="pt-4 border-t text-sm text-muted-foreground">No active win streaks yet — keep comparing.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Recent Additions */}
          <div className="bg-card border border-border rounded-xl shadow-md overflow-hidden">
            <div className="p-6">
              <h2 className="text-xl font-semibold text-foreground mb-4">Recent Additions</h2>
              {stats.recentMovies.length > 0 ? (
                <ul className="space-y-3">
                  {stats.recentMovies.map((movie) => (
                    <li key={movie.id} className="flex items-center gap-3">
                      <PosterThumb url={movie.url} title={movie.title} />
                      <div className="flex-1 min-w-0">
                        <span className="block text-foreground truncate">{movie.title}</span>
                        <span className="block text-sm text-muted-foreground">Added {daysAgo(movie.created_at)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No movies added yet</p>
              )}
            </div>
          </div>

          {/* Big Movers */}
          <div className="bg-card border border-border rounded-xl shadow-md overflow-hidden">
            <div className="p-6">
              <h2 className="text-xl font-semibold text-foreground mb-1">Big Movers</h2>
              <p className="text-xs text-muted-foreground mb-4">Best head-to-head record over the last {MOVER_WINDOW_DAYS} days</p>
              {movers.length > 0 ? (
                <ul className="space-y-3">
                  {movers.map((m) => (
                    <li key={m.movie.id} className="flex items-center gap-3">
                      <PosterThumb url={m.movie.url} title={m.movie.title} />
                      <div className="flex-1 min-w-0">
                        <span className="block text-foreground truncate">{m.movie.title}</span>
                        <span className="block text-sm text-muted-foreground">{m.wins}W – {m.losses}L</span>
                      </div>
                      <span className="text-success font-semibold flex-shrink-0">▲{m.net}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No movers yet — compare a few movies this week.</p>
              )}
            </div>
          </div>
        </div>

        {/* View Rankings Button */}
        <div className="text-center">
          <Link
            to="/ranking"
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 transition duration-150 ease-in-out"
          >
            View Full Rankings
          </Link>
        </div>
      </div>
    </div>
  )
}
