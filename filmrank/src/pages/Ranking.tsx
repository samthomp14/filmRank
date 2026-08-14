// src/pages/MyRankings.tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import type { Tables } from '../types/supabase';
import AnimatedLeaderboard from '../components/AnimatedLeaderboard'
import type { RankedRow } from '../lib/demoTypes'

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
            year,
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
        <div className="text-muted-foreground text-lg">Loading rankings...</div>
      </div>
    )
  }

  if (movies.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground text-lg">No movies ranked yet.</div>
      </div>
    )
  }

  const rows: RankedRow[] = movies.map((movie, idx) => ({
    position: idx + 1,
    id: movie.id,
    title: movie.title,
    year: movie.year,
    move: 0,
  }))

  return (
    <div className="py-12 px-2 max-w-3xl w-full mx-auto">
      <h1 className="font-marquee text-3xl font-semibold uppercase tracking-[.02em] text-foreground mb-8 text-center">My Top 10 Films</h1>
      <AnimatedLeaderboard
        rows={rows}
        listLabel="My Rankings"
        onRowClick={(row) => navigate(`/movie/${row.id}`)}
      />
    </div>
  )
}

export default Ranking
