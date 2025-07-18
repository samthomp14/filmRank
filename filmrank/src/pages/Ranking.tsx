// src/pages/MyRankings.tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import type { Tables } from '../types/supabase';

type MovieRow = Tables<'movies'>;
interface MovieWithJoin extends MovieRow {
  elo_score: number;
  created_at: string;
  poster_url?: string;
}

function Ranking() {
  const navigate = useNavigate()
  const [movies, setMovies] = useState<MovieWithJoin[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRankings = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setMovies([])
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('user_movies')
        .select(`
          elo_score,
          created_at,
          movies:movies!user_movies_movie_id_fkey (
            id,
            title,
            url
          )
        `)
        .eq('user_id', user.id)
        .order('elo_score', { ascending: false })
        .limit(10)
      if (error) {
        console.error('Failed to fetch rankings:', error)
      } else {
        setMovies((data as { elo_score: number; created_at: string; movies: MovieRow | MovieRow[] | null }[]).map(m => {
          const movie = Array.isArray(m.movies) ? m.movies[0] : m.movies;
          return {
            ...(movie || {}),
            elo_score: m.elo_score,
            created_at: m.created_at || '',
            poster_url: movie?.url ?? '',
          } as MovieWithJoin;
        }))
      }

      setLoading(false)
    }

    fetchRankings()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600 text-lg">Loading rankings...</div>
      </div>
    )
  }

  if (movies.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600 text-lg">No movies ranked yet.</div>
      </div>
    )
  }

  return (
    <div className="py-12 px-2 max-w-6xl w-full mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">My Top 10 Films</h1>
      <div className="space-y-4">
        {movies.map((movie, idx) => (
          <div
            key={movie.id}
            className="w-full bg-white rounded-lg shadow p-3 sm:p-6 hover:bg-gray-50 transition duration-150 ease-in-out cursor-pointer"
            onClick={() => navigate(`/movie/${movie.id}`)}
          >
            <div className="flex flex-row items-center justify-between gap-3 sm:gap-6">
              <span className="text-xl sm:text-3xl font-bold text-blue-600 min-w-[36px] sm:min-w-[60px]">#{idx + 1}</span>
              <h2 className="flex-1 text-base sm:text-2xl font-semibold text-gray-900 whitespace-normal break-words px-2">{movie.title}</h2>
              {movie.poster_url && (
                <img
                  src={movie.poster_url}
                  alt={movie.title}
                  className="w-16 h-24 sm:w-24 sm:h-36 object-cover rounded-lg shadow-md flex-shrink-0"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Ranking
