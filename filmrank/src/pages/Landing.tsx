import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import ComparisonAnimation from '../components/ComparisonAnimation'
import AnimatedLeaderboard from '../components/AnimatedLeaderboard'
import type { DemoFilm, RankedRow } from '../lib/demoTypes'

const STORAGE_KEY = 'filmrank.demo'
const POOL_SIZE = 10

interface DemoState {
  films: DemoFilm[]
  pair: [number, number]
  picks: number
  moves: Record<string, number>
}

const STEPS = [
  {
    n: '01',
    title: 'Pick a side',
    body: 'Two films at a time. One click, no review box, no half-star agonising.',
  },
  {
    n: '02',
    title: 'The list reorders',
    body: 'Every answer moves both films. Ten picks in, the order already looks like you.',
  },
  {
    n: '03',
    title: 'Your top 100 writes itself',
    body: 'Come back whenever. The ranking keeps sharpening in the background.',
  },
]

function orderFilms(films: DemoFilm[]) {
  return [...films].sort((a, b) => b.score - a.score)
}

function drawPair(n: number, exclude?: [number, number]): [number, number] {
  let a = 0
  let b = 0
  let guard = 0
  do {
    a = Math.floor(Math.random() * n)
    b = Math.floor(Math.random() * n)
    guard++
  } while ((a === b || (exclude && a === exclude[0] && b === exclude[1])) && guard < 50)
  return [a, b]
}

function drawOpponent(n: number, exclude: number[]): number {
  let candidate = 0
  let guard = 0
  do {
    candidate = Math.floor(Math.random() * n)
    guard++
  } while (exclude.includes(candidate) && guard < 50)
  return candidate
}

export default function Landing() {
  const [demo, setDemo] = useState<DemoState | null>(null)
  const [demoUnavailable, setDemoUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function init() {
      let pool: { id: string; title: string; year: number | null; url: string | null }[] = []

      const { data, error } = await supabase
        .from('movies')
        .select('id, title, year, url')
        .not('url', 'is', null)
        .order('imdb_rating', { ascending: false, nullsFirst: false })
        .limit(40)
      if (!error && data) pool = data

      if (pool.length < 2) {
        const fallback = await supabase.from('movies').select('id, title, year, url').limit(40)
        if (!fallback.error && fallback.data) pool = fallback.data
      }

      if (cancelled) return

      if (pool.length < 2) {
        setDemoUnavailable(true)
        return
      }

      const shuffled = [...pool].sort(() => 0.5 - Math.random()).slice(0, POOL_SIZE)
      const freshFilms: DemoFilm[] = shuffled.map((m) => ({
        id: m.id,
        title: m.title,
        year: m.year,
        posterUrl: m.url,
        score: 0,
      }))

      let restored: DemoState | null = null
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
        if (saved && Array.isArray(saved.films) && saved.films.length === freshFilms.length) {
          restored = {
            films: saved.films,
            pair: saved.pair ?? [0, 1],
            picks: saved.picks ?? 0,
            moves: saved.moves ?? {},
          }
        }
      } catch {
        // corrupt localStorage state — fall back to a fresh pool below
      }

      setDemo(restored ?? { films: freshFilms, pair: [0, 1], picks: 0, moves: {} })
    }

    init()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!demo) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(demo))
    } catch {
      // storage unavailable/full — the demo still works in-memory
    }
  }, [demo])

  const pick = (winnerId: string, loserId: string) => {
    setDemo((s) => {
      if (!s) return s
      const before = orderFilms(s.films).map((f) => f.id)
      const films = s.films.map((f) =>
        f.id === winnerId ? { ...f, score: f.score + 1 } : f.id === loserId ? { ...f, score: f.score - 0.5 } : f
      )
      const after = orderFilms(films).map((f) => f.id)
      const moves: Record<string, number> = {}
      after.forEach((id, i) => {
        const delta = before.indexOf(id) - i
        if (delta > 0) moves[id] = delta
      })

      const winnerIdx = films.findIndex((f) => f.id === winnerId)
      const loserIdx = films.findIndex((f) => f.id === loserId)
      const opponentIdx = drawOpponent(films.length, [winnerIdx, loserIdx])
      const pair: [number, number] = s.pair[0] === winnerIdx ? [winnerIdx, opponentIdx] : [opponentIdx, winnerIdx]

      return { films, picks: s.picks + 1, pair, moves }
    })
  }

  const skip = () => {
    setDemo((s) => (s ? { ...s, pair: drawPair(s.films.length, s.pair) } : s))
  }

  const orderedFilms = demo ? orderFilms(demo.films) : []
  const topRows: RankedRow[] = orderedFilms.slice(0, 6).map((f, i) => ({
    position: i + 1,
    id: f.id,
    title: f.title,
    year: f.year,
    move: demo?.moves[f.id] ?? 0,
  }))
  const roundLabel = demo ? String(demo.picks + 1).padStart(2, '0') : '01'
  const listLabel =
    !demo || demo.picks === 0 ? 'Your list · not started' : `Your list · ${demo.picks} ${demo.picks === 1 ? 'pick' : 'picks'}`
  const left = demo ? demo.films[demo.pair[0]] ?? null : null
  const right = demo ? demo.films[demo.pair[1]] ?? null : null

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <header className="marquee-scrim sticky top-0 z-[5] flex items-center justify-between gap-6 border-b border-marquee-hairline px-10 py-[18px] backdrop-blur">
        <div className="flex items-center gap-[11px]">
          <span className="block h-[11px] w-[11px] rounded-full bg-marquee-bulb shadow-[0_0_12px_2px_rgba(232,190,74,.7)]" />
          <span className="font-wordmark text-[19px] tracking-[.06em] text-foreground">FilmRank</span>
        </div>
        <div className="flex items-center gap-[22px]">
          <Link to="/login" className="font-marquee text-[15px] tracking-[.04em] text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <Link
            to="/signup"
            className="rounded bg-primary px-5 py-[10px] font-marquee text-[15px] font-semibold uppercase tracking-[.06em] text-primary-foreground shadow-[0_0_0_1px_rgba(232,190,74,.5),0_8px_20px_-8px_rgba(201,82,47,.7)]"
          >
            Create free account
          </Link>
        </div>
      </header>

      <div className="bulb-strip h-4" />

      <section className="mx-auto max-w-[1080px] px-10 pb-[76px] pt-[60px]">
        <div className="mb-[18px] flex flex-wrap items-center gap-[14px]">
          <span className="font-marquee text-[11px] font-medium uppercase tracking-[.24em] text-accent">Now showing</span>
          <span className="h-[5px] w-[5px] rounded-full bg-marquee-dot" />
          <span className="font-marquee text-[11px] font-medium uppercase tracking-[.18em] text-marquee-tertiary">
            Round {roundLabel} · no stars, no scores out of ten
          </span>
        </div>

        <h1 className="mb-[18px] max-w-[17ch] font-marquee text-[38px] font-semibold uppercase leading-[1.06] tracking-[.015em] sm:text-[60px]">
          Which one did you like more?
        </h1>
        <p className="mb-10 max-w-[52ch] text-[17px] leading-[1.6] text-muted-foreground">
          That is the whole app. Pick a side below and watch a ranked list build itself out of your answers.
        </p>

        {demoUnavailable ? (
          <div className="max-w-[760px] rounded border border-border bg-card p-6 text-[14px] text-muted-foreground">
            The live demo needs a few films in the catalog first — come back once some have been added.
          </div>
        ) : (
          <ComparisonAnimation left={left} right={right} onPickLeft={() => left && right && pick(left.id, right.id)} onPickRight={() => left && right && pick(right.id, left.id)} onSkip={skip} loading={!demo} />
        )}
      </section>

      <section className="border-y border-marquee-hairline bg-marquee-band">
        <div className="mx-auto grid max-w-[1080px] grid-cols-1 gap-9 px-10 py-[58px] sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n}>
              <div className="mb-3 font-marquee text-[11px] font-medium tracking-[.2em] text-accent">{step.n}</div>
              <h3 className="mb-[10px] font-marquee text-[20px] font-semibold uppercase tracking-[.06em]">{step.title}</h3>
              <p className="text-[14px] leading-[1.65] text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1080px] px-10 py-[72px]">
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <h2 className="mb-4 font-marquee text-[32px] font-semibold uppercase leading-[1.1] tracking-[.015em] sm:text-[40px]">
              A list you'd actually defend
            </h2>
            <p className="mb-[26px] max-w-[42ch] text-[16px] leading-[1.65] text-muted-foreground">
              Star ratings flatten everything into fours and fives. Comparisons force a real answer, so the order at
              the top means something.
            </p>
            <Link
              to="/signup"
              className="inline-block rounded bg-primary px-[26px] py-[13px] font-marquee text-[15px] font-semibold uppercase tracking-[.06em] text-primary-foreground shadow-[0_0_0_1px_rgba(232,190,74,.5),0_10px_22px_-8px_rgba(201,82,47,.6)]"
            >
              Create free account
            </Link>
            <p className="mt-4 font-marquee text-[12px] font-medium text-marquee-tertiary">Free. About thirty seconds.</p>
          </div>
          <AnimatedLeaderboard rows={topRows} listLabel={listLabel} />
        </div>
      </section>

      <div className="bulb-strip-static h-4" />
      <footer className="flex flex-wrap items-center justify-between gap-6 bg-marquee-footer px-10 py-7">
        <span className="font-wordmark text-[16px] tracking-[.06em] text-foreground">FilmRank</span>
        <span className="font-marquee text-[12px] font-medium uppercase tracking-[.14em] text-marquee-tertiary">
          Start with two films.
        </span>
      </footer>
    </div>
  )
}
