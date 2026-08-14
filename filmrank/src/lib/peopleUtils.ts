import { supabase } from './supabaseClient'

/**
 * Parses a newly inserted movie's OMDB Director/Writer/Actors strings into
 * the people/movie_people tables, via the sync_movie_people DB function
 * (also used by the one-time backfill migration).
 */
export async function syncMoviePeople(
  movieId: string,
  credits: { Director?: string | null; Writer?: string | null; Actors?: string | null }
) {
  const { error } = await supabase.rpc('sync_movie_people', {
    p_movie_id: movieId,
    p_director: credits.Director ?? '',
    p_writer: credits.Writer ?? '',
    p_actors: credits.Actors ?? '',
  })
  if (error) console.error('Failed to sync movie people:', error)
}
