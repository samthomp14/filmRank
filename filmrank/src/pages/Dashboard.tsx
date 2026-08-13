import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Link } from 'react-router-dom'
import type { Tables } from '../types/supabase';

type MovieRow = Tables<'movies'>;
interface MovieWithJoin extends MovieRow {
  elo_score: number;
  created_at: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalMovies: 0,
    topMovie: null as MovieWithJoin | null,
    recentMovies: [] as MovieWithJoin[]
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get total movies count
      const { count } = await supabase
        .from('user_movies')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      // Get top movie
      const { data: topMovie } = await supabase
        .from('user_movies')
        .select(`
          elo_score,
          created_at,
          movies (
            id,
            title
          )
        `)
        .eq('user_id', user.id)
        .order('elo_score', { ascending: false })
        .limit(1)
        .single()

      // Get recent movies
      const { data: recentMovies } = await supabase
        .from('user_movies')
        .select(`
          elo_score,
          created_at,
          movies (
            id,
            title
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5)

      setStats({
        totalMovies: count || 0,
        topMovie: topMovie ? {
          ...(Array.isArray((topMovie as any).movies) ? (topMovie as any).movies[0] : (topMovie as any).movies),
          elo_score: (topMovie as any).elo_score,
          created_at: (topMovie as any).created_at || ''
        } as MovieWithJoin : null,
        recentMovies: (recentMovies as { movies: MovieRow | MovieRow[] | null; elo_score: number; created_at: string }[] | undefined)?.map(m => {
          const movie = Array.isArray(m.movies) ? m.movies[0] : m.movies;
          return {
            ...(movie || {}),
            elo_score: m.elo_score,
            created_at: m.created_at || ''
          } as MovieWithJoin;
        }) || []
      })
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
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

          {/* Recent Movies */}
          <div className="bg-card border border-border rounded-xl shadow-md overflow-hidden">
            <div className="p-6">
              <h2 className="text-xl font-semibold text-foreground mb-4">Recent Movies</h2>
              {stats.recentMovies.length > 0 ? (
                <ul className="space-y-3">
                  {stats.recentMovies.map((movie) => (
                    <li key={movie.id} className="flex justify-between items-center">
                      <span className="text-foreground">{movie.title}</span>
                      <span className="text-sm text-muted-foreground">Elo: {movie.elo_score.toFixed(0)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No movies added yet</p>
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