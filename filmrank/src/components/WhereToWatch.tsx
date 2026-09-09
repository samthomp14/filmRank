import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  DEFAULT_WATCH_REGION,
  fetchWatchProviders,
  loadWatchRegion,
  regionLabel,
  saveWatchRegion,
  type WatchProvider,
  type WatchProviders,
} from '../lib/watchProvidersUtils'

// w92 is the smallest logo TMDB serves that still looks sharp at 32px on 2x screens.
const LOGO_BASE = 'https://image.tmdb.org/t/p/w92'

const GROUPS = [
  { key: 'flatrate', label: 'Stream' },
  { key: 'free', label: 'Free' },
  { key: 'rent', label: 'Rent' },
  { key: 'buy', label: 'Buy' },
] as const

function ProviderRow({ label, providers }: { label: string; providers: WatchProvider[] }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-2 w-14 shrink-0 font-marquee text-[10px] font-medium uppercase tracking-[.12em] text-muted-foreground">
        {label}
      </span>
      <ul className="flex flex-wrap items-center gap-1.5">
        {providers.map((provider) => (
          <li key={provider.provider_id} title={provider.provider_name}>
            {provider.logo_path ? (
              <img
                src={`${LOGO_BASE}${provider.logo_path}`}
                alt={provider.provider_name}
                loading="lazy"
                className="h-8 w-8 rounded-md border border-marquee-hairline object-cover"
              />
            ) : (
              <span className="flex h-8 items-center rounded-md border border-marquee-hairline px-2 text-xs text-muted-foreground">
                {provider.provider_name}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Availability for one title, from TMDB's JustWatch-backed watch/providers
 * endpoint. Self-contained on purpose: it resolves the viewer's saved region
 * itself so the movie page only has to drop it in.
 */
export default function WhereToWatch({ tmdbId }: { tmdbId: number | null }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [region, setRegion] = useState(DEFAULT_WATCH_REGION)
  const [providers, setProviders] = useState<WatchProviders | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  // Gates the fetch below so a non-US viewer doesn't get a throwaway US
  // request before their saved region lands.
  const [regionResolved, setRegionResolved] = useState(false)

  useEffect(() => {
    let cancelled = false
    const loadRegion = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) return
        setUserId(user.id)
        const saved = await loadWatchRegion(user.id)
        if (!cancelled) setRegion(saved)
      } finally {
        if (!cancelled) setRegionResolved(true)
      }
    }
    loadRegion()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!regionResolved) return
    if (!tmdbId) {
      setLoading(false)
      return
    }

    let cancelled = false
    const loadProviders = async () => {
      setLoading(true)
      setFailed(false)
      try {
        const data = await fetchWatchProviders(tmdbId, region)
        if (!cancelled) setProviders(data)
      } catch (error) {
        console.error('Failed to fetch watch providers:', error)
        if (!cancelled) setFailed(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadProviders()
    return () => { cancelled = true }
  }, [tmdbId, region, regionResolved])

  const handleRegionChange = async (next: string) => {
    setRegion(next)
    if (!userId) return
    try {
      await saveWatchRegion(userId, next)
    } catch (error) {
      console.error('Failed to save watch region:', error)
    }
  }

  const groups = providers
    ? GROUPS.map((group) => ({ ...group, providers: providers[group.key] })).filter((g) => g.providers.length)
    : []

  // Keep the current region selectable even where the title has no offers, so
  // the switcher never silently drops the user's own setting.
  const regionOptions = [...new Set([region, ...(providers?.available_regions ?? [])])].sort((a, b) =>
    regionLabel(a).localeCompare(regionLabel(b))
  )

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h3 className="font-marquee text-[11px] font-medium uppercase tracking-[.14em] text-accent">
          Where to Watch
        </h3>
        {tmdbId && (
          <select
            value={region}
            onChange={(e) => handleRegionChange(e.target.value)}
            aria-label="Streaming region"
            className="max-w-[12rem] cursor-pointer truncate rounded border border-marquee-hairline bg-transparent py-0.5 pl-1.5 pr-1 font-marquee text-[10px] uppercase tracking-[.12em] text-muted-foreground transition-colors duration-150 hover:text-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {regionOptions.map((code) => (
              <option key={code} value={code} className="font-sans normal-case tracking-normal text-foreground">
                {regionLabel(code)}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Reserved height so the loading → loaded transition doesn't nudge the page. */}
      <div className="min-h-[76px]">
        {!tmdbId ? (
          <p className="text-sm text-muted-foreground">Availability isn't linked for this title.</p>
        ) : loading ? (
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-8 w-8 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : failed ? (
          <p className="text-sm text-muted-foreground">Couldn't load streaming availability right now.</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not available to stream, rent or buy in {regionLabel(region)}.
          </p>
        ) : (
          <div className="space-y-2">
            {groups.map((group) => (
              <ProviderRow key={group.key} label={group.label} providers={group.providers} />
            ))}
          </div>
        )}

        {/* TMDB's terms require this data to be credited to JustWatch. */}
        {tmdbId && !loading && !failed && (
          <p className="mt-3 text-[11px] text-marquee-tertiary">
            {providers?.link ? (
              <a
                href={providers.link}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors duration-150 hover:text-accent"
              >
                Streaming data by JustWatch
              </a>
            ) : (
              'Streaming data by JustWatch'
            )}
          </p>
        )}
      </div>
    </div>
  )
}
