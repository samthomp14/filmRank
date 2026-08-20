import { supabase } from './supabaseClient'

/** Curated "favorite genre" preference tags (stored in users.preferences.genres) — distinct from the movies.genres table. */
export const GENRE_OPTIONS = [
  'Action', 'Comedy', 'Drama', 'Sci-Fi', 'Horror',
  'Romance', 'Thriller', 'Fantasy', 'Animation', 'Documentary',
  'Adventure', 'Mystery', 'Crime', 'Family', 'Musical',
  'Western', 'War', 'Biography', 'History', 'Sport',
  'Superhero', 'Noir', 'Short', 'Experimental', 'Reality',
  'News', 'Film-Noir', 'Children',
  'Adult', 'Disaster', 'Epic', 'Political', 'Psychological',
  'Road', 'Satire', 'Slasher', 'Spy', 'Suspense'
]

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
