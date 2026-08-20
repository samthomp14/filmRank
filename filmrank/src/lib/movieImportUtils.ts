import { supabase } from './supabaseClient'
import { parseOMDBResponse, computeEloStats, starsToElo, type EloStats } from './movieUtils'
import type { OMDBResponse } from './movieUtils'
import type { TablesInsert } from '../types/supabase'
import { syncMoviePeople } from './peopleUtils'
import { syncMovieGenres } from './genresUtils'
import JSZip from 'jszip'
import Papa from 'papaparse'

export interface ImportStatus {
  status: 'idle' | 'loading' | 'success' | 'error'
  message: string
  progress?: number
}

export interface ImportResult {
  added: number
  skipped: number
  failed: number
  failedTitles: string[]
}

export interface ImportOptions {
  onProgress?: (status: ImportStatus) => void
  batchSize?: number
  apiDelay?: number
}

interface MovieRow {
  Date: string
  Name: string
  Year: string
  'Letterboxd URI': string
}

interface RatingRow {
  Date: string
  Name: string
  Year: string
  'Letterboxd URI': string
  Rating: string
}

// Cold-start prior for users who don't yet have enough calibrated comparisons
// to derive a meaningful elo distribution from their own library.
const DEFAULT_ELO_STATS: EloStats = { mean: 1000, stdDev: 200 }
const MIN_CALIBRATED_MOVIES_FOR_STATS = 5

/**
 * Optimized movie import function that processes movies in batches
 * with progress updates and rate limiting for OMDb API calls
 */
export async function importMoviesFromFile(
  file: File,
  userId: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const {
    onProgress,
    batchSize = 10,
    apiDelay = 100
  } = options

  const updateProgress = (status: Omit<ImportStatus, 'status'> & { status: ImportStatus['status'] }) => {
    onProgress?.(status as ImportStatus)
  }

  try {
    updateProgress({ status: 'loading', message: 'Processing your movies...' })

    // Parse file content
    let csvText = ''
    let ratingsCsvText = ''
    if (file.name.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file)
      const watchedFile = zip.file(/watched\.csv$/i)[0]
      if (!watchedFile) {
        throw new Error('watched.csv not found in ZIP. Please upload the Letterboxd export ZIP or the watched.csv file.')
      }
      csvText = await watchedFile.async('text')
      // ratings.csv is optional — only present in a full Letterboxd export.
      // When present, it lets us seed each movie's elo near where the user's
      // own star rating suggests it belongs, instead of a flat default.
      const ratingsFile = zip.file(/ratings\.csv$/i)[0]
      if (ratingsFile) {
        ratingsCsvText = await ratingsFile.async('text')
      }
    } else if (file.name.endsWith('.csv')) {
      csvText = await file.text()
    } else {
      throw new Error('Unsupported file type. Please upload a Letterboxd ZIP export or a watched.csv file.')
    }

    // Build a lookup of Letterboxd star ratings, keyed by URI (reliable) and
    // by title|year (fallback), for seeding elo_score below.
    const ratingsByUri = new Map<string, number>()
    const ratingsByTitleYear = new Map<string, number>()
    if (ratingsCsvText) {
      const ratingsResult = Papa.parse<RatingRow>(ratingsCsvText, {
        header: true,
        skipEmptyLines: true
      })
      for (const row of ratingsResult.data) {
        const rating = parseFloat(row.Rating)
        if (isNaN(rating)) continue
        if (row['Letterboxd URI']) ratingsByUri.set(row['Letterboxd URI'], rating)
        const key = `${row.Name}|${row.Year || ''}`
        ratingsByTitleYear.set(key, rating)
      }
    }

    const lookupRating = (uri: string | undefined, title: string, year: string | undefined): number | undefined => {
      if (uri && ratingsByUri.has(uri)) return ratingsByUri.get(uri)
      return ratingsByTitleYear.get(`${title}|${year || ''}`)
    }

    // Parse CSV data with PapaParse
    const result = Papa.parse<MovieRow>(csvText, {
      header: true,
      skipEmptyLines: true
    })

    if (result.errors.length > 0) {
      console.warn('CSV parsing warnings:', result.errors)
    }

    // Validate headers
    const expectedHeaders = ['Date', 'Name', 'Year', 'Letterboxd URI']
    const actualHeaders = result.meta.fields || []
    
    if (!expectedHeaders.every(header => actualHeaders.includes(header))) {
      throw new Error(`Invalid CSV format. Expected headers: ${expectedHeaders.join(', ')}. Found: ${actualHeaders.join(', ')}. Please upload a valid Letterboxd export file.`)
    }

    const movieData = result.data.map((row: MovieRow) => {
      const title = row.Name
      const year = row.Year
      const uri = row['Letterboxd URI']
      return { title, year, uri }
    }).filter((movie: { title?: string; year?: string; uri?: string }) => movie.title && movie.title.length > 0)

    if (movieData.length === 0) {
      throw new Error('No valid movies found in the file')
    }

    let added = 0
    let skipped = 0
    let failed = 0
    let failedTitles: string[] = []

    // OPTIMIZATION 1: Batch check for existing movies in database
    updateProgress({ status: 'loading', message: 'Checking existing movies in database...' })
    
    // Get all unique titles and years for batch lookup
    const uniqueMovies = Array.from(new Set(movieData.map((m: { title?: string; year?: string }) => `${m.title}|${m.year || ''}`)))
      .map((key: unknown) => {
        const keyStr = key as string
        const [title, year] = keyStr.split('|')
        return { title, year }
      })

    // Batch query for existing movies
    const existingMoviesQuery = uniqueMovies.map(movie => {
      let query = supabase
        .from('movies')
        .select('id, imdb_id, title, year, alt_title')
        .or(`title.ilike."${movie.title}",alt_title.ilike."${movie.title}"`)
        .limit(10)
      if (movie.year && !isNaN(Number(movie.year))) {
        query = query.eq('year', Number(movie.year))
      }
      return query
    })

    const existingMoviesResults = await Promise.all(existingMoviesQuery)
    
    // Create a map for quick lookup
    const existingMoviesMap = new Map<string, any>()
    existingMoviesResults.forEach((result, index) => {
      if (result.data && result.data.length > 0) {
        const movie = uniqueMovies[index]
        const key = `${movie.title}|${movie.year || ''}`
        // Prefer exact year match if available
        const match = result.data.find(m => (!movie.year || m.year === Number(movie.year)))
        existingMoviesMap.set(key, match || result.data[0])
      }
    })

    // OPTIMIZATION 2: Get user's existing movies in one query
    updateProgress({ status: 'loading', message: 'Checking your existing library...' })
    const { data: userExistingMovies, error: userMoviesError } = await supabase
      .from('user_movies')
      .select('movie_id, elo_score, match_count')
      .eq('user_id', userId)

    if (userMoviesError) throw userMoviesError

    const userMovieIds = new Set(userExistingMovies?.map(um => um.movie_id) || [])

    // Elo distribution to seed imported movies into. Only movies that have
    // actually been compared (match_count > 0) count, so a previous
    // uncalibrated import batch doesn't skew the prior for this one. Falls
    // back to a fixed cold-start distribution for new/mostly-empty libraries.
    const calibratedScores = (userExistingMovies || [])
      .filter(um => (um.match_count || 0) > 0 && um.elo_score !== null)
      .map(um => um.elo_score as number)
    const eloStats: EloStats = calibratedScores.length >= MIN_CALIBRATED_MOVIES_FOR_STATS
      ? computeEloStats(calibratedScores)
      : DEFAULT_ELO_STATS

    // OPTIMIZATION 3: Process movies in batches with progress updates
    const batches = []
    for (let i = 0; i < movieData.length; i += batchSize) {
      batches.push(movieData.slice(i, i + batchSize))
    }

    const moviesToInsert: TablesInsert<'movies'>[] = []
    // Parallel to moviesToInsert — carries the source row's title/year/uri so
    // we can look up its seeded rating once we know the inserted movie's id.
    const moviesToInsertMeta: { title: string; year?: string; uri?: string }[] = []
    const userMoviesToInsert: { movie_id: string; elo_score?: number }[] = []

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]
      const progress = Math.round((batchIndex / batches.length) * 100)
      updateProgress({ 
        status: 'loading', 
        message: `Processing batch ${batchIndex + 1}/${batches.length} (${progress}%)`,
        progress
      })

      // Process batch with rate limiting for OMDb API calls
      const batchPromises = batch.map(async (movie: { title?: string; year?: string; uri?: string }, index: number) => {
        // Add small delay between OMDb API calls to respect rate limits
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, apiDelay))
        }

        try {
          const { title, year, uri } = movie
          if (!title) {
            failed++
            return { title: '', year, failed: true }
          }

          const key = `${title}|${year || ''}`
          let movieId: string | null = null

          // Check if movie exists in our map
          const existingMovie = existingMoviesMap.get(key)
          if (existingMovie) {
            movieId = existingMovie.id
          } else {
            // Movie doesn't exist, need to fetch from OMDb
            const params = new URLSearchParams({ title })
            if (year && year.length > 0) {
              params.append('year', year)
            }
            // Get access token
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;
            let response;
            if (accessToken) {
              response = await fetch(`/api/omdb?${params.toString()}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
            } else {
              response = await fetch(`/api/omdb?${params.toString()}`);
            }
            const omdb: OMDBResponse = await response.json()

            if (omdb.Response === 'True') {
              // Parse OMDB response and prepare data for insertion
              const movieInsertData: TablesInsert<'movies'> = parseOMDBResponse(omdb)
              // Set alt_title to the Letterboxd title
              movieInsertData.alt_title = title
              moviesToInsert.push(movieInsertData)
              moviesToInsertMeta.push({ title, year, uri })
              // We'll get the ID after batch insert
              return { title, year, needsInsert: true, movieData: movieInsertData }
            } else {
              failed++
              failedTitles.push(title)
              return { title, year, failed: true }
            }
          }

          // Check if user already has this movie
          if (movieId && userMovieIds.has(movieId)) {
            skipped++
            return { title, year, skipped: true }
          }

          // Add to user_movies batch
          if (movieId) {
            const rating = lookupRating(uri, title, year)
            const elo_score = rating !== undefined ? Math.round(starsToElo(rating, eloStats)) : undefined
            userMoviesToInsert.push({ movie_id: movieId, ...(elo_score !== undefined ? { elo_score } : {}) })
            added++
            return { title, year, movieId, added: true }
          } else {
            failed++
            failedTitles.push(title)
            return { title, year, failed: true }
          }

        } catch (err) {
          failed++
          const movieTitle = movie.title || 'Unknown'
          failedTitles.push(movieTitle)
          return { title: movieTitle, year: movie.year, failed: true }
        }
      })

      // Wait for batch to complete
      await Promise.all(batchPromises)
    }

    // OPTIMIZATION 4: Batch insert new movies
    if (moviesToInsert.length > 0) {
      updateProgress({ status: 'loading', message: 'Adding new movies to database...' })
      const { data: insertedMovies, error: insertError } = await supabase
        .from('movies')
        .insert(moviesToInsert)
        .select('id, alt_title, director, genre, metadata')

      if (insertError) throw insertError

      // Add newly inserted movies to user_movies. Supabase preserves insert
      // order in the returned rows, so index into moviesToInsertMeta (pushed
      // in lockstep with moviesToInsert above) to recover each row's rating.
      insertedMovies?.forEach((movie, idx) => {
        if (!userMovieIds.has(movie.id)) {
          const meta = moviesToInsertMeta[idx]
          const rating = meta ? lookupRating(meta.uri, meta.title, meta.year) : undefined
          const elo_score = rating !== undefined ? Math.round(starsToElo(rating, eloStats)) : undefined
          userMoviesToInsert.push({ movie_id: movie.id, ...(elo_score !== undefined ? { elo_score } : {}) })
        }
      })

      // Parse director/writer/actors into the people tables, and genre into the genres table
      if (insertedMovies && insertedMovies.length > 0) {
        await Promise.all(insertedMovies.map(movie => {
          const metadata = movie.metadata as Record<string, unknown> | null
          return Promise.all([
            syncMoviePeople(movie.id, {
              Director: movie.director,
              Writer: typeof metadata?.Writer === 'string' ? metadata.Writer : null,
              Actors: typeof metadata?.Actors === 'string' ? metadata.Actors : null,
            }),
            syncMovieGenres(movie.id, movie.genre),
          ])
        }))
      }
    }

    // OPTIMIZATION 5: Batch insert user_movies
    if (userMoviesToInsert.length > 0) {
      updateProgress({ status: 'loading', message: 'Adding movies to your library...' })
      const { error: userMoviesInsertError } = await supabase
        .from('user_movies')
        .insert(userMoviesToInsert)
      
      if (userMoviesInsertError) throw userMoviesInsertError
    }

    return {
      added,
      skipped,
      failed,
      failedTitles
    }

  } catch (error) {
    throw error
  }
}

/**
 * Helper function to format import results into a user-friendly message
 */
export function formatImportResult(result: ImportResult): string {
  const { failed, failedTitles } = result
  if (failed > 0 && failedTitles.length > 0) {
    return `Failed to import: ${failedTitles.slice(0, 5).join(', ')}${failedTitles.length > 5 ? '...' : ''}`
  }
  return ''
} 