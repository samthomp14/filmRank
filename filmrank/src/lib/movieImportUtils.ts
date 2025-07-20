import { supabase } from './supabaseClient'
import { parseOMDBResponse } from './movieUtils'
import type { OMDBResponse } from './movieUtils'
import type { TablesInsert } from '../types/supabase'
import JSZip from 'jszip'

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
    if (file.name.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file)
      const watchedFile = zip.file(/watched\.csv$/i)[0]
      if (!watchedFile) {
        throw new Error('watched.csv not found in ZIP. Please upload the Letterboxd export ZIP or the watched.csv file.')
      }
      csvText = await watchedFile.async('text')
    } else if (file.name.endsWith('.csv')) {
      csvText = await file.text()
    } else {
      throw new Error('Unsupported file type. Please upload a Letterboxd ZIP export or a watched.csv file.')
    }

    // Parse CSV data
    const rows = csvText.split('\n')
    const movieData = rows.slice(1).map(row => {
      const columns = row.split(',')
      const title = columns[1]?.trim()
      const year = columns[2]?.trim()
      return { title, year }
    }).filter(movie => movie.title && movie.title.length > 0)

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
    const uniqueMovies = Array.from(new Set(movieData.map(m => `${m.title}|${m.year || ''}`)))
      .map(key => {
        const [title, year] = key.split('|')
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
      .select('movie_id')
      .eq('user_id', userId)
    
    if (userMoviesError) throw userMoviesError
    
    const userMovieIds = new Set(userExistingMovies?.map(um => um.movie_id) || [])

    // OPTIMIZATION 3: Process movies in batches with progress updates
    const batches = []
    for (let i = 0; i < movieData.length; i += batchSize) {
      batches.push(movieData.slice(i, i + batchSize))
    }

    const moviesToInsert: TablesInsert<'movies'>[] = []
    const userMoviesToInsert: { movie_id: string }[] = []

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]
      const progress = Math.round((batchIndex / batches.length) * 100)
      updateProgress({ 
        status: 'loading', 
        message: `Processing batch ${batchIndex + 1}/${batches.length} (${progress}%)`,
        progress
      })

      // Process batch with rate limiting for OMDb API calls
      const batchPromises = batch.map(async ({ title, year }, index) => {
        // Add small delay between OMDb API calls to respect rate limits
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, apiDelay))
        }

        try {
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
            const response = await fetch(`/api/omdb?${params.toString()}`)
            const omdb: OMDBResponse = await response.json()
            
            if (omdb.Response === 'True') {
              // Parse OMDB response and prepare data for insertion
              const movieInsertData: TablesInsert<'movies'> = parseOMDBResponse(omdb)
              // Set alt_title to the Letterboxd title
              movieInsertData.alt_title = title
              moviesToInsert.push(movieInsertData)
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
            userMoviesToInsert.push({ movie_id: movieId })
            added++
            return { title, year, movieId, added: true }
          } else {
            failed++
            failedTitles.push(title)
            return { title, year, failed: true }
          }

        } catch (err) {
          failed++
          failedTitles.push(title)
          return { title, year, failed: true }
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
        .select('id, alt_title')
      
      if (insertError) throw insertError

      // Map inserted movies back to their titles
      const insertedMoviesMap = new Map<string, string>()
      insertedMovies?.forEach(movie => {
        if (movie.alt_title) {
          insertedMoviesMap.set(movie.alt_title, movie.id)
        }
      })

      // Add newly inserted movies to user_movies
      insertedMovies?.forEach(movie => {
        if (!userMovieIds.has(movie.id)) {
          userMoviesToInsert.push({ movie_id: movie.id })
        }
      })
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
  const { added, skipped, failed, failedTitles } = result
  const failedMessage = failedTitles.length > 0 
    ? ` (Failed: ${failedTitles.slice(0, 5).join(', ')}${failedTitles.length > 5 ? '...' : ''})` 
    : ''
  
  return `Added: ${added}, Skipped: ${skipped}, Failed: ${failed}${failedMessage}`
} 