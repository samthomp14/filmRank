// src/components/PlacementModal.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import MovieCard from './MovieCard'
import type { Tables } from '../types/supabase'

interface RankedMovie {
  movie_id: string
  title: string
  imdb_id: string | null
  url: string | null
  elo_score: number
  match_count: number
}

interface PlacementModalProps {
  newMovie: Tables<'movies'>
  userId: string
  onComplete: () => void
}

// Below this, there isn't enough of a ranked library to meaningfully binary
// search against — just leave the new movie at its default elo.
const MIN_LIBRARY_SIZE = 5
// Safety cap in case of pathological skip patterns; log2(a few hundred) is
// ~8-9, so this leaves generous headroom.
const MAX_COMPARISONS = 15

/**
 * Beli-style placement flow: binary-searches the user's existing elo-ranked
 * library against the newly added movie, running a real `compare_movies` RPC
 * call at each step. This reuses the existing Elo update (its K-factor is
 * already large at match_count=0) — the only change is picking comparison
 * opponents deliberately instead of waiting for random luck.
 */
export default function PlacementModal({ newMovie, userId, onComplete }: PlacementModalProps) {
  const [library, setLibrary] = useState<RankedMovie[] | null>(null)
  const [lo, setLo] = useState(0)
  const [hi, setHi] = useState(0)
  const [mid, setMid] = useState(0)
  const [skippedInRound, setSkippedInRound] = useState<Set<number>>(new Set())
  const [comparisons, setComparisons] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let isMounted = true
    const load = async () => {
      const { data, error } = await supabase
        .from('user_movies')
        .select(`movie_id, elo_score, match_count, movies:movies!user_movies_movie_id_fkey (title, imdb_id, url)`)
        .eq('user_id', userId)
        .neq('movie_id', newMovie.id)
        .order('elo_score', { ascending: true })

      if (!isMounted) return

      if (error || !data || data.length < MIN_LIBRARY_SIZE) {
        onComplete()
        return
      }

      interface JoinedRow {
        movie_id: string
        elo_score: number | null
        match_count: number | null
        movies: { title: string; imdb_id: string | null; url: string | null } | null
      }
      const ranked: RankedMovie[] = (data as unknown as JoinedRow[]).map(row => ({
        movie_id: row.movie_id,
        elo_score: row.elo_score ?? 1000,
        match_count: row.match_count ?? 0,
        title: row.movies?.title ?? 'Unknown',
        imdb_id: row.movies?.imdb_id ?? null,
        url: row.movies?.url ?? null,
      }))

      setLibrary(ranked)
      setLo(0)
      setHi(ranked.length - 1)
      setMid(Math.floor((ranked.length - 1) / 2))
    }
    load()
    return () => { isMounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newMovie.id, userId])

  // Picks the middle of the remaining [from, to] range, skipping any indices
  // already passed on this round. Returns null once the range is exhausted.
  const pickMid = (from: number, to: number, skip: Set<number>): number | null => {
    const candidates: number[] = []
    for (let i = from; i <= to; i++) if (!skip.has(i)) candidates.push(i)
    if (candidates.length === 0) return null
    return candidates[Math.floor(candidates.length / 2)]
  }

  const handleDecision = async (newMovieWon: boolean) => {
    if (!library || submitting) return
    setSubmitting(true)

    const opponent = library[mid]
    const winnerId = newMovieWon ? newMovie.id : opponent.movie_id
    const loserId = newMovieWon ? opponent.movie_id : newMovie.id

    const { error } = await supabase.rpc('compare_movies', {
      winner_id: winnerId,
      loser_id: loserId,
      p_user_id: userId,
    })
    if (error) console.error('compare_movies RPC error:', error)

    const nextComparisons = comparisons + 1
    const nextLo = newMovieWon ? mid + 1 : lo
    const nextHi = newMovieWon ? hi : mid - 1

    if (nextLo > nextHi || nextComparisons >= MAX_COMPARISONS) {
      setSubmitting(false)
      onComplete()
      return
    }

    const nextMid = pickMid(nextLo, nextHi, new Set())
    if (nextMid === null) {
      setSubmitting(false)
      onComplete()
      return
    }

    setComparisons(nextComparisons)
    setLo(nextLo)
    setHi(nextHi)
    setSkippedInRound(new Set())
    setMid(nextMid)
    setSubmitting(false)
  }

  const handleSkip = () => {
    if (!library || submitting) return
    const nextSkipped = new Set(skippedInRound)
    nextSkipped.add(mid)
    const nextMid = pickMid(lo, hi, nextSkipped)
    if (nextMid === null) {
      onComplete()
      return
    }
    setSkippedInRound(nextSkipped)
    setMid(nextMid)
  }

  if (!library) return null

  const opponent = library[mid]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="max-w-3xl w-full">
        <div className="text-center mb-8">
          <h2 className="font-marquee text-2xl font-semibold uppercase tracking-[.02em] text-foreground mb-2">
            Which do you prefer?
          </h2>
          <p className="text-muted-foreground text-sm">
            Placing "{newMovie.title}" in your rankings — {comparisons + 1} of up to {MAX_COMPARISONS} quick comparisons
          </p>
        </div>

        <div className="flex flex-row items-center justify-center gap-4 sm:gap-8">
          <MovieCard
            movie={{
              movie_id: newMovie.id,
              title: newMovie.title,
              imdb_id: newMovie.imdb_id,
              url: newMovie.url,
              elo_score: 1000,
              match_count: 0,
            }}
            onClick={() => handleDecision(true)}
            selected={false}
            className="flex-1 max-w-xs"
          />

          <div className="px-2 sm:px-6 py-2 rounded-full shadow-sm bg-card">
            <span className="text-2xl font-bold text-muted-foreground">VS</span>
          </div>

          <MovieCard
            movie={opponent}
            onClick={() => handleDecision(false)}
            selected={false}
            className="flex-1 max-w-xs"
          />
        </div>

        <div className="flex justify-center mt-8">
          <button
            onClick={handleSkip}
            disabled={submitting}
            className="text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-lg px-4 py-2"
          >
            Skip this pair
          </button>
        </div>
      </div>
    </div>
  )
}
