// Utility functions for handling movie data from OMDB API

import type { TablesInsert } from '../types/supabase';

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

/**
 * Parse OMDB response and return structured data for database insertion
 */
export function parseOMDBResponse(movieData: OMDBResponse): TablesInsert<'movies'> {
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
    url: movieData.Poster || null,
    year: year,
    runtime: runtime,
    rating: movieData.Rated || null,
    genre: movieData.Genre || null,
    director: movieData.Director || null,
    language: movieData.Language || null,
    country: movieData.Country || null,
    imdb_rating: imdbRating,
    metadata: movieData as any, // Json type
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

/**
 * Standard normal CDF, via the Abramowitz & Stegun erf approximation.
 */
function normalCDF(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const erf = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

export interface EloStats {
  mean: number;
  stdDev: number;
}

/**
 * Mean/stdDev of a set of Elo scores, for use with eloToStars below. Elo
 * ratings from repeated pairwise comparisons naturally settle into a bell
 * curve around the population mean, so a normal-distribution mapping is a
 * better fit than a min/max stretch (which is skewed by outliers).
 */
export function computeEloStats(eloScores: number[]): EloStats {
  if (eloScores.length === 0) return { mean: 1000, stdDev: 0 };
  const mean = eloScores.reduce((sum, e) => sum + e, 0) / eloScores.length;
  const variance = eloScores.reduce((sum, e) => sum + (e - mean) ** 2, 0) / eloScores.length;
  return { mean, stdDev: Math.sqrt(variance) };
}

/**
 * Maps an Elo score to a continuous 0-5 star rating based on where it falls
 * in the user's own Elo distribution (via the normal CDF), rather than a
 * fixed absolute scale.
 */
export function eloToStars(elo: number, stats: EloStats): number {
  if (stats.stdDev === 0) return 2.5;
  const z = (elo - stats.mean) / stats.stdDev;
  const percentile = normalCDF(z);
  return Math.min(5, Math.max(0, percentile * 5));
}

/**
 * Inverse of eloToStars: given a star rating, find the elo score that would
 * map back to it under the given distribution. normalCDF is monotonic, so we
 * bisect on z instead of needing a separate inverse-erf approximation.
 * Percentile is clamped away from 0/1 so a 5-star or 0.5-star rating doesn't
 * map to +/-infinity.
 */
export function starsToElo(stars: number, stats: EloStats): number {
  if (stats.stdDev === 0) return stats.mean;
  const targetPercentile = Math.min(0.98, Math.max(0.02, stars / 5));
  let lo = -4, hi = 4;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (normalCDF(mid) < targetPercentile) lo = mid; else hi = mid;
  }
  const z = (lo + hi) / 2;
  return stats.mean + z * stats.stdDev;
}
