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

interface PlacementResult {
  rankFromTop: number
  totalCount: number
  converged: boolean
  betterNeighbor: RankedMovie | null
  worseNeighbor: RankedMovie | null
}

interface PlacementModalProps {
  newMovie: Tables<'movies'>
  userId: string
  onComplete: () => void
}

const FALLBACK_IMAGE = '/no_poster_placeholder.png'

// Below this, there isn't enough of a ranked library to meaningfully binary
// search against — just leave the new movie at its default elo.
const MIN_LIBRARY_SIZE = 5
// Safety cap in case of pathological skip patterns; log2(a few hundred) is
// ~8-9, so this leaves generous headroom.
const MAX_COMPARISONS = 15
// Matches the pause Compare.tsx uses after a pick, so the selection ring
// registers before the pair changes.
const SELECTION_PAUSE_MS = 200

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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [result, setResult] = useState<PlacementResult | null>(null)

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

  const finishPlacement = (finalLo: number, finalHi: number) => {
    if (!library) {
      onComplete()
      return
    }
    const clampedLo = Math.max(0, Math.min(library.length, finalLo))
    setResult({
      rankFromTop: library.length + 1 - clampedLo,
      totalCount: library.length + 1,
      converged: finalLo > finalHi,
      betterNeighbor: clampedLo < library.length ? library[clampedLo] : null,
      worseNeighbor: clampedLo > 0 ? library[clampedLo - 1] : null,
    })
  }

  const handleDecision = async (newMovieWon: boolean) => {
    if (!library || submitting) return
    setSubmitting(true)

    const opponent = library[mid]
    const winnerId = newMovieWon ? newMovie.id : opponent.movie_id
    const loserId = newMovieWon ? opponent.movie_id : newMovie.id
    setSelectedId(winnerId)

    const { error } = await supabase.rpc('compare_movies', {
      winner_id: winnerId,
      loser_id: loserId,
      p_user_id: userId,
    })
    if (error) console.error('compare_movies RPC error:', error)

    await new Promise(resolve => setTimeout(resolve, SELECTION_PAUSE_MS))

    const nextComparisons = comparisons + 1
    const nextLo = newMovieWon ? mid + 1 : lo
    const nextHi = newMovieWon ? hi : mid - 1

    if (nextLo > nextHi || nextComparisons >= MAX_COMPARISONS) {
      finishPlacement(nextLo, nextHi)
      setSubmitting(false)
      return
    }

    const nextMid = pickMid(nextLo, nextHi, new Set())
    if (nextMid === null) {
      finishPlacement(nextLo, nextHi)
      setSubmitting(false)
      return
    }

    setComparisons(nextComparisons)
    setLo(nextLo)
    setHi(nextHi)
    setSkippedInRound(new Set())
    setMid(nextMid)
    setSelectedId(null)
    setSubmitting(false)
  }

  const handleSkip = () => {
    if (!library || submitting) return
    const nextSkipped = new Set(skippedInRound)
    nextSkipped.add(mid)
    const nextMid = pickMid(lo, hi, nextSkipped)
    if (nextMid === null) {
      finishPlacement(lo, hi)
      return
    }
    setSkippedInRound(nextSkipped)
    setMid(nextMid)
  }

  if (!library) return null

  if (result) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center animate-fade-in">
          <h2 className="font-marquee text-2xl font-semibold uppercase tracking-[.02em] text-foreground mb-6">
            Placed!
          </h2>
          <div className="mx-auto w-32 aspect-[2/3] rounded-lg overflow-hidden shadow-lg mb-4">
            <img
              src={!newMovie.url || newMovie.url === 'N/A' ? FALLBACK_IMAGE : newMovie.url}
              alt={newMovie.title}
              className="w-full h-full object-cover bg-muted"
              onError={e => { if (e.currentTarget.src !== window.location.origin + FALLBACK_IMAGE) e.currentTarget.src = FALLBACK_IMAGE }}
            />
          </div>
          <p className="text-lg font-semibold text-foreground mb-1">{newMovie.title}</p>
          <p className="text-muted-foreground mb-6">
            {result.converged ? 'Ranked' : 'Placed near'} #{result.rankFromTop} of {result.totalCount}
          </p>
          {(result.betterNeighbor || result.worseNeighbor) && (
            <div className="text-sm text-muted-foreground space-y-1 mb-6 border-t border-border pt-4">
              {result.betterNeighbor && (
                <p>Just below <span className="text-foreground font-medium">{result.betterNeighbor.title}</span></p>
              )}
              {result.worseNeighbor && (
                <p>Just above <span className="text-foreground font-medium">{result.worseNeighbor.title}</span></p>
              )}
            </div>
          )}
          <button
            onClick={onComplete}
            className="bg-primary text-primary-foreground px-6 py-2 rounded-lg font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  const opponent = library[mid]
  const progress = Math.min(1, comparisons / Math.max(1, Math.ceil(Math.log2(library.length + 1))))

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="max-w-3xl w-full">
        <div className="text-center mb-6">
          <h2 className="font-marquee text-2xl font-semibold uppercase tracking-[.02em] text-foreground mb-2">
            Which do you prefer?
          </h2>
          <p className="text-muted-foreground text-sm mb-3">
            Placing "{newMovie.title}" in your rankings
          </p>
          <div className="w-full max-w-xs mx-auto h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${Math.max(8, progress * 100)}%` }}
            />
          </div>
        </div>

        <div key={`${newMovie.id}-${opponent.movie_id}`} className="flex flex-row items-center justify-center gap-4 sm:gap-8 animate-fade-in">
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
            selected={selectedId === newMovie.id}
            className="flex-1 max-w-xs"
          />

          <div className="px-2 sm:px-6 py-2 rounded-full shadow-sm bg-card">
            <span className="text-2xl font-bold text-muted-foreground">VS</span>
          </div>

          <MovieCard
            movie={opponent}
            onClick={() => handleDecision(false)}
            selected={selectedId === opponent.movie_id}
            className="flex-1 max-w-xs"
          />
        </div>

        <div className="flex justify-center mt-8">
          <button
            onClick={handleSkip}
            disabled={submitting}
            className="text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-lg px-4 py-2 disabled:opacity-50"
          >
            Skip this pair
          </button>
        </div>
      </div>
    </div>
  )
}
