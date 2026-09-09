import { supabase } from './supabaseClient'

export const DEFAULT_WATCH_REGION = 'US'

const regionDisplayNames = new Intl.DisplayNames(['en'], { type: 'region' })

export function regionLabel(code: string): string {
  return regionDisplayNames.of(code) ?? code
}

/**
 * The countries TMDB/JustWatch report availability for (GET
 * /watch/providers/regions). Stored as codes only — display names come from
 * Intl so we don't ship a second copy of the ISO 3166-1 table.
 */
export const WATCH_REGIONS =
  'AD,AE,AG,AL,AO,AR,AT,AU,AZ,BA,BB,BE,BF,BG,BH,BM,BO,BR,BS,BY,BZ,CA,CD,CH,CI,CL,CM,CO,CR,CU,CV,CY,CZ,DE,DK,DO,DZ,EC,EE,EG,ES,FI,FJ,FR,GB,GF,GH,GI,GP,GQ,GR,GT,GY,HK,HN,HR,HU,ID,IE,IL,IN,IQ,IS,IT,JM,JO,JP,KE,KR,KW,LB,LC,LI,LT,LU,LV,LY,MA,MC,MD,ME,MG,MK,ML,MT,MU,MW,MX,MY,MZ,NE,NG,NI,NL,NO,NZ,OM,PA,PE,PF,PG,PH,PK,PL,PS,PT,PY,QA,RO,RS,RU,SA,SC,SE,SG,SI,SK,SM,SN,SV,TC,TD,TH,TN,TR,TT,TW,TZ,UA,UG,US,UY,VA,VE,XK,YE,ZA,ZM,ZW'
    .split(',')
    .sort((a, b) => regionLabel(a).localeCompare(regionLabel(b)))

export interface WatchProvider {
  provider_id: number
  provider_name: string
  logo_path: string | null
}

export interface WatchProviders {
  region: string
  /** TMDB's JustWatch-powered watch page for this title — our attribution link. */
  link: string | null
  flatrate: WatchProvider[]
  free: WatchProvider[]
  rent: WatchProvider[]
  buy: WatchProvider[]
  /** Country codes with any availability for this title, for the region switcher. */
  available_regions: string[]
}

export async function fetchWatchProviders(tmdbId: number, region: string): Promise<WatchProviders> {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token

  const response = await fetch(`/api/tmdb?movie_id=${tmdbId}&region=${encodeURIComponent(region)}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  })
  if (!response.ok) {
    throw new Error(`Watch provider request failed with status ${response.status}`)
  }
  return response.json()
}

/** Pull the region out of an already-fetched `users.preferences` blob. */
export function readWatchRegion(preferences: unknown): string {
  const region = (preferences as { watch_region?: string } | null)?.watch_region
  return typeof region === 'string' && WATCH_REGIONS.includes(region) ? region : DEFAULT_WATCH_REGION
}

export async function loadWatchRegion(userId: string): Promise<string> {
  const { data: userRow } = await supabase.from('users').select('preferences').eq('id', userId).single()
  return readWatchRegion(userRow?.preferences)
}

export async function saveWatchRegion(userId: string, region: string): Promise<void> {
  // `preferences` is a shared jsonb blob (genres, auto_apply_bt_ranking, ...),
  // so it has to be read back and merged rather than overwritten.
  const { data: userRow } = await supabase.from('users').select('preferences').eq('id', userId).single()
  const existingPreferences = (userRow?.preferences as Record<string, unknown> | null) ?? {}

  const { error } = await supabase
    .from('users')
    .update({ preferences: { ...existingPreferences, watch_region: region } })
    .eq('id', userId)
  if (error) throw error
}
