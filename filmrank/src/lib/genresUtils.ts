import { supabase } from './supabaseClient'

/**
 * Parses a newly inserted movie's OMDB Genre string into the genres/movie_genres
 * tables, via the sync_movie_genres DB function (also used by the one-time backfill).
 */
export async function syncMovieGenres(movieId: string, genre?: string | null) {
  const { error } = await supabase.rpc('sync_movie_genres', {
    p_movie_id: movieId,
    p_genre: genre ?? '',
  })
  if (error) console.error('Failed to sync movie genres:', error)
}
