import { supabase } from './supabaseClient'

/**
 * Mirrors the users_handle_format CHECK constraint in
 * supabase/migrations/20260909040000_add_public_profiles.sql. Keep the two in
 * step: the DB is what actually enforces this, so a client-side rule that
 * drifts wider just turns a clear inline message into a raw Postgres error.
 */
export const HANDLE_PATTERN = /^[a-z0-9_]{3,24}$/
export const HANDLE_MIN_LENGTH = 3
export const HANDLE_MAX_LENGTH = 24

/** How many ranked films a public profile shows; also the server-side cap. */
export const PUBLIC_PROFILE_MOVIE_LIMIT = 500

export interface PublicProfile {
  handle: string
  displayName: string
  avatarFilename: string | null
  movieCount: number
  comparisonCount: number
  /** When the owner added their first film, or null for an empty library. */
  firstRankedAt: string | null
  /**
   * Elo mean/stddev over the owner's whole library, computed server-side.
   * The movie list is capped, so deriving these from the rows we received
   * would show visitors different stars than the owner sees themselves.
   */
  eloMean: number
  eloStddev: number
}

export interface PublicProfileMovie {
  position: number
  movieId: string
  title: string
  year: number | null
  posterUrl: string | null
  eloScore: number
}

/** Coerces free typing into the handle charset so the field can't hold something the DB will reject. */
export function normalizeHandle(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
}

/** Human-readable reason a handle is unusable, or null when it's fine. */
export function validateHandle(handle: string): string | null {
  if (handle.length < HANDLE_MIN_LENGTH) {
    return `Handles need at least ${HANDLE_MIN_LENGTH} characters.`
  }
  if (handle.length > HANDLE_MAX_LENGTH) {
    return `Handles can be at most ${HANDLE_MAX_LENGTH} characters.`
  }
  if (!HANDLE_PATTERN.test(handle)) {
    return 'Handles can use lowercase letters, numbers and underscores only.'
  }
  return null
}

export function publicProfilePath(handle: string): string {
  return `/u/${handle}`
}

export function publicProfileUrl(handle: string): string {
  return `${window.location.origin}${publicProfilePath(handle)}`
}

/** True when the handle is free for the current user to claim. */
export async function isHandleAvailable(handle: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('handle_available', { p_handle: handle })
  if (error) throw error
  return data === true
}

/**
 * Loads a public profile header. Returns null when the handle is unclaimed
 * OR its owner hasn't opted in — the RPC deliberately can't tell those apart,
 * so a private profile is not discoverable by probing for it.
 */
export async function fetchPublicProfile(handle: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase.rpc('get_public_profile', { p_handle: handle })
  if (error) throw error

  const row = data?.[0]
  if (!row) return null

  return {
    handle: row.handle,
    displayName: row.display_name,
    avatarFilename: row.avatar_filename,
    movieCount: row.movie_count,
    comparisonCount: row.comparison_count,
    firstRankedAt: row.first_ranked_at,
    eloMean: row.elo_mean,
    eloStddev: row.elo_stddev,
  }
}

/** Loads a public profile's ranked films, best first. */
export async function fetchPublicProfileMovies(handle: string): Promise<PublicProfileMovie[]> {
  const { data, error } = await supabase.rpc('get_public_profile_movies', {
    p_handle: handle,
    p_limit: PUBLIC_PROFILE_MOVIE_LIMIT,
  })
  if (error) throw error

  return (data ?? []).map((row) => ({
    position: Number(row.rank_position),
    movieId: row.movie_id,
    title: row.title,
    year: row.year,
    posterUrl: row.url,
    eloScore: row.elo_score,
  }))
}
