import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { LinkIcon } from '@heroicons/react/24/outline'
import { supabase } from '../lib/supabaseClient'
import { getAvatarPublicUrl } from '../lib/avatarUtils'
import { computeEloStats, eloToStars } from '../lib/movieUtils'
import {
  fetchPublicProfile,
  fetchPublicProfileMovies,
  normalizeHandle,
  publicProfileUrl,
  type PublicProfile as PublicProfileData,
  type PublicProfileMovie,
} from '../lib/publicProfileUtils'
import AnimatedLeaderboard from '../components/AnimatedLeaderboard'
import RatingDistribution from '../components/RatingDistribution'
import type { RankedRow } from '../lib/demoTypes'

const FALLBACK_IMAGE = '/no_poster_placeholder.png'

/** Films shown before the "show all" expander. */
const COLLAPSED_LIST_LENGTH = 25

/**
 * Read-only view of someone's ranking, at /u/:handle. Unlike every other
 * route this one is reachable signed out, so it must not render anything the
 * owner hasn't opted into publishing and must not link anywhere a signed-out
 * visitor would bounce off (movie detail pages are behind auth, so the rows
 * here are deliberately not links).
 */
export default function PublicProfile() {
  const { handle: rawHandle } = useParams<{ handle: string }>()
  const handle = normalizeHandle(rawHandle ?? '')

  const [profile, setProfile] = useState<PublicProfileData | null>(null)
  const [movies, setMovies] = useState<PublicProfileMovie[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [copied, setCopied] = useState(false)
  const [signedIn, setSignedIn] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const profileData = await fetchPublicProfile(handle)
        if (cancelled) return

        if (!profileData) {
          setProfile(null)
          return
        }

        setProfile(profileData)
        const movieRows = await fetchPublicProfileMovies(handle)
        if (!cancelled) setMovies(movieRows)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load this profile')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (handle) load()
    return () => {
      cancelled = true
    }
  }, [handle])

  // Drives the sign-up call to action below: this is the one page a stranger
  // can land on, but pitching an account to someone who already has one isn't
  // useful — the navbar already gets them home.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user))
  }, [])

  useEffect(() => {
    if (!profile) return
    const previousTitle = document.title
    document.title = `${profile.displayName}'s rankings · FilmRank`
    return () => {
      document.title = previousTitle
    }
  }, [profile])

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicProfileUrl(handle))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be denied (insecure origin, permissions); the URL
      // is in the address bar either way, so this needs no error surface.
    }
  }

  // Stars come from the owner's whole-library distribution, not the rows on
  // screen, so a truncated list still reads the same as it does to the owner.
  const eloStats = useMemo(
    () => (profile ? { mean: profile.eloMean, stdDev: profile.eloStddev } : computeEloStats([])),
    [profile]
  )

  const topRows: RankedRow[] = useMemo(
    () =>
      movies.slice(0, 10).map((m) => ({
        position: m.position,
        id: m.movieId,
        title: m.title,
        year: m.year,
        move: 0,
      })),
    [movies]
  )

  // Only meaningful when nothing was truncated — a histogram of the top 500 of
  // a larger library would show a shape the owner never sees.
  const distributionStars = useMemo(
    () =>
      profile && movies.length === profile.movieCount
        ? movies.map((m) => eloToStars(m.eloScore, eloStats))
        : null,
    [movies, profile, eloStats]
  )

  if (!handle) return <Navigate to="/" replace />

  // A handle that only differs by case or stray punctuation still resolves —
  // send it to its canonical URL so shared links dedupe.
  if (rawHandle && rawHandle !== handle) {
    return <Navigate to={`/u/${handle}`} replace />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground text-lg">Loading profile...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-destructive text-lg">{error}</div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 px-4 text-center">
        <h1 className="font-marquee text-2xl font-semibold uppercase tracking-[.06em] text-foreground">
          Nothing showing
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          There's no public profile at <span className="font-medium text-foreground">/u/{handle}</span>. The
          handle may be unclaimed, or its owner keeps their ranking private.
        </p>
        <Link
          to="/"
          className="mt-2 rounded bg-primary px-5 py-[10px] font-marquee text-[13px] font-semibold uppercase tracking-[.06em] text-primary-foreground"
        >
          Go to FilmRank
        </Link>
      </div>
    )
  }

  const initial = profile.displayName.trim().charAt(0).toUpperCase() || '?'
  const visibleMovies = showAll ? movies : movies.slice(0, COLLAPSED_LIST_LENGTH)
  const rankingSince = profile.firstRankedAt
    ? new Date(profile.firstRankedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null
  const truncated = movies.length < profile.movieCount

  return (
    <div className="py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Identity header */}
        <div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <button
            type="button"
            onClick={handleCopyLink}
            title="Copy link to this profile"
            className="absolute right-0 top-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <LinkIcon className="h-4 w-4" />
            {copied ? 'Copied' : 'Copy link'}
          </button>
          {profile.avatarFilename ? (
            <img
              src={getAvatarPublicUrl(profile.avatarFilename)}
              alt={profile.displayName}
              className="h-20 w-20 flex-shrink-0 rounded-full object-cover shadow-md"
            />
          ) : (
            <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent font-marquee text-3xl font-bold text-primary-foreground shadow-md">
              {initial}
            </div>
          )}
          <div className="flex-1">
            <h1 className="font-marquee text-2xl font-semibold uppercase tracking-[.02em] text-foreground">
              {profile.displayName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">@{profile.handle}</p>
            {rankingSince && <p className="text-xs text-muted-foreground">Ranking since {rankingSince}</p>}
          </div>
        </div>

        {/* Stat row */}
        <div className="flex items-center justify-center gap-10 border-y border-border py-5 sm:justify-start">
          <div className="text-center sm:text-left">
            <span className="font-marquee text-2xl font-bold text-primary">{profile.movieCount}</span>
            <span className="ml-2 font-marquee text-[11px] uppercase tracking-[.2em] text-muted-foreground">
              Movies Ranked
            </span>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="text-center sm:text-left">
            <span className="font-marquee text-2xl font-bold text-accent">{profile.comparisonCount}</span>
            <span className="ml-2 font-marquee text-[11px] uppercase tracking-[.2em] text-muted-foreground">
              Comparisons Made
            </span>
          </div>
        </div>

        {movies.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {profile.displayName} hasn't ranked anything yet.
          </p>
        ) : (
          <>
            {/* Top 10 marquee */}
            <div>
              <h2 className="mb-4 font-marquee text-lg font-semibold uppercase tracking-[.06em] text-foreground">
                Top {topRows.length}
              </h2>
              <AnimatedLeaderboard rows={topRows} listLabel={`@${profile.handle}`} />
            </div>

            {/* Rating distribution */}
            {distributionStars && (
              <div>
                <h2 className="mb-4 font-marquee text-lg font-semibold uppercase tracking-[.06em] text-foreground">
                  Rating Distribution
                </h2>
                <RatingDistribution stars={distributionStars} />
              </div>
            )}

            {/* Full ranking */}
            <div>
              <h2 className="mb-4 font-marquee text-lg font-semibold uppercase tracking-[.06em] text-foreground">
                The Full Ranking
              </h2>
              <ul className="divide-y divide-border border-y border-border">
                {visibleMovies.map((movie) => (
                  <li key={movie.movieId} className="flex items-center gap-4 py-3">
                    <span className="w-8 shrink-0 text-right font-marquee text-[13px] font-medium text-primary">
                      {movie.position}
                    </span>
                    <img
                      src={movie.posterUrl && movie.posterUrl !== 'N/A' ? movie.posterUrl : FALLBACK_IMAGE}
                      alt=""
                      loading="lazy"
                      className="h-16 w-11 shrink-0 rounded object-cover bg-muted"
                      onError={(e) => (e.currentTarget.src = FALLBACK_IMAGE)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground" title={movie.title}>
                        {movie.title}
                      </p>
                      {movie.year && <p className="text-xs text-muted-foreground">{movie.year}</p>}
                    </div>
                    <span className="shrink-0 text-sm">
                      {eloToStars(movie.eloScore, eloStats).toFixed(1)}
                      <span className="ml-1 text-accent">★</span>
                    </span>
                  </li>
                ))}
              </ul>

              {movies.length > COLLAPSED_LIST_LENGTH && (
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => setShowAll((prev) => !prev)}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {showAll ? 'Show less' : `Show all ${movies.length}`}
                  </button>
                </div>
              )}

              {truncated && showAll && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Showing the top {movies.length} of {profile.movieCount} ranked films.
                </p>
              )}
            </div>
          </>
        )}

        {/* Growth CTA — this page is the app's only surface a stranger can land on. */}
        {!signedIn && (
        <div className="rounded-xl border border-border bg-card px-6 py-8 text-center">
          <p className="font-marquee text-lg font-semibold uppercase tracking-[.06em] text-foreground">
            Rank your own films
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            FilmRank builds a ranking like this one from head-to-head picks — no star ratings to agonise over.
          </p>
          <Link
            to="/signup"
            className="mt-5 inline-block rounded bg-primary px-6 py-[10px] font-marquee text-[13px] font-semibold uppercase tracking-[.06em] text-primary-foreground"
          >
            Get Started
          </Link>
        </div>
        )}
      </div>
    </div>
  )
}
