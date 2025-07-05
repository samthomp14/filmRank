// Utility functions for handling movie data from OMDB API

export interface OMDBResponse {
  Response: string;
  Title: string;
  Year: string;
  Rated: string;
  Released: string;
  Runtime: string;
  Genre: string;
  Director: string;
  Writer: string;
  Actors: string;
  Plot: string;
  Language: string;
  Country: string;
  Awards: string;
  Poster: string;
  Ratings: Array<{ Source: string; Value: string }>;
  Metascore: string;
  imdbRating: string;
  imdbVotes: string;
  imdbID: string;
  Type: string;
  DVD: string;
  BoxOffice: string;
  Production: string;
  Website: string;
  Error?: string;
}

export interface MovieInsertData {
  title: string;
  imdb_id: string;
  url: string;
  year: number | null;
  runtime: number | null;
  rating: string;
  genre: string;
  director: string;
  language: string;
  country: string;
  imdb_rating: number | null;
  metadata: OMDBResponse;
}

/**
 * Parse OMDB response and return structured data for database insertion
 */
export function parseOMDBResponse(movieData: OMDBResponse): MovieInsertData {
  // Parse runtime to get minutes
  const runtimeMatch = movieData.Runtime?.match(/(\d+)/);
  const runtime = runtimeMatch ? parseInt(runtimeMatch[1]) : null;

  // Parse year
  const year = movieData.Year ? parseInt(movieData.Year) : null;

  // Parse IMDB rating
  const imdbRating = movieData.imdbRating ? parseFloat(movieData.imdbRating) : null;

  return {
    title: movieData.Title,
    imdb_id: movieData.imdbID,
    url: movieData.Poster,
    year: year,
    runtime: runtime,
    rating: movieData.Rated,
    genre: movieData.Genre,
    director: movieData.Director,
    language: movieData.Language,
    country: movieData.Country,
    imdb_rating: imdbRating,
    metadata: movieData
  };
}

/**
 * Format runtime from minutes to human readable format
 */
export function formatRuntime(minutes: number | null): string {
  if (!minutes) return 'Unknown';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

/**
 * Format year range (e.g., "2014" or "2014-2015")
 */
export function formatYear(year: number | null): string {
  return year ? year.toString() : 'Unknown';
}

/**
 * Format IMDB rating with stars
 */
export function formatIMDBRating(rating: number | null): string {
  if (!rating) return 'No rating';
  return `${rating}/10`;
} 