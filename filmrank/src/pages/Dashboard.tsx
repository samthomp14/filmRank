import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Link } from 'react-router-dom'

interface Movie {
  id: string
  title: string
  elo_score: number
  created_at: string
}

interface UserMovieRow {
  elo_score: number;
  created_at: string;
  movies: { id: string; title: string } | { id: string; title: string }[] | null;
}

function getMovieId(movies: { id: string; title: string } | { id: string; title: string }[] | null): string {
  if (!movies) return '';
  if (Array.isArray(movies)) return movies[0]?.id ?? '';
  return movies.id ?? '';
}

function getMovieTitle(movies: { id: string; title: string } | { id: string; title: string }[] | null): string {
  if (!movies) return '';
  if (Array.isArray(movies)) return movies[0]?.title ?? '';
  return movies.title ?? '';
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalMovies: 0,
    topMovie: null as Movie | null,
    recentMovies: [] as Movie[]
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
          id: getMovieId((topMovie as UserMovieRow).movies),
          title: getMovieTitle((topMovie as UserMovieRow).movies),
          elo_score: (topMovie as UserMovieRow).elo_score,
          created_at: (topMovie as UserMovieRow).created_at || ''
        } : null,
        recentMovies: (recentMovies as UserMovieRow[] | undefined)?.map(m => ({
          id: getMovieId(m.movies),
          title: getMovieTitle(m.movies),
          elo_score: m.elo_score,
          created_at: m.created_at || ''
        })) || []
      })
      setLoading(false)
    }

    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600 text-lg">Loading dashboard...</div>
      </div>
    )
  }

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-gray-900">Welcome to FilmRank</h1>
          <p className="mt-4 text-lg text-gray-600">Your personal movie ranking system</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {/* Quick Actions */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
              <div className="space-y-4">
                <Link
                  to="/compare"
                  className="block w-full bg-blue-600 text-white text-center px-4 py-3 rounded-lg font-medium hover:bg-blue-700 transition duration-150 ease-in-out"
                >
                  Compare Movies
                </Link>
                <Link
                  to="/add"
                  className="block w-full bg-white text-blue-600 text-center px-4 py-3 rounded-lg font-medium border border-blue-600 hover:bg-blue-50 transition duration-150 ease-in-out"
                >
                  Add New Movie
                </Link>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Stats</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total Movies</span>
                  <span className="text-2xl font-bold text-blue-600">{stats.totalMovies}</span>
                </div>
                {stats.topMovie && (
                  <div className="pt-4 border-t">
                    <span className="text-gray-600 block mb-2">Top Rated Movie</span>
                    <span className="text-lg font-semibold text-gray-900">{stats.topMovie.title}</span>
                    <span className="block text-sm text-gray-500">Elo: {stats.topMovie.elo_score.toFixed(0)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recent Movies */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Movies</h2>
              {stats.recentMovies.length > 0 ? (
                <ul className="space-y-3">
                  {stats.recentMovies.map((movie) => (
                    <li key={movie.id} className="flex justify-between items-center">
                      <span className="text-gray-900">{movie.title}</span>
                      <span className="text-sm text-gray-500">Elo: {movie.elo_score.toFixed(0)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500">No movies added yet</p>
              )}
            </div>
          </div>
        </div>

        {/* View Rankings Button */}
        <div className="text-center">
          <Link
            to="/ranking"
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition duration-150 ease-in-out"
          >
            View Full Rankings
          </Link>
        </div>
      </div>
    </div>
  )
} 