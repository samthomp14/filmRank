import { useMemo } from 'react'

interface RatingDistributionProps {
  /** Continuous 0-5 star values, one per rated movie (see eloToStars). */
  stars: number[]
}

const BIN_WIDTH = 0.5
const BIN_COUNT = 5 / BIN_WIDTH

export default function RatingDistribution({ stars }: RatingDistributionProps) {
  const bins = useMemo(() => {
    const counts = new Array(BIN_COUNT).fill(0)
    for (const s of stars) {
      const idx = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor(s / BIN_WIDTH)))
      counts[idx]++
    }
    return counts
  }, [stars])

  if (stars.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Rate a few movies to see your distribution.
      </p>
    )
  }

  const max = Math.max(1, ...bins)

  return (
    <div>
      <div className="flex h-32 items-end gap-[3px]">
        {bins.map((count, i) => {
          const lo = i * BIN_WIDTH
          const hi = lo + BIN_WIDTH
          const heightPct = (count / max) * 100
          return (
            <div key={i} className="group/bar relative flex h-full flex-1 flex-col justify-end">
              <div
                className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded border border-border bg-card px-2 py-1 font-marquee text-[10px] font-medium uppercase tracking-[.1em] text-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover/bar:opacity-100"
                aria-hidden
              >
                {count} {count === 1 ? 'film' : 'films'}
              </div>
              <div
                role="img"
                aria-label={`${lo}–${hi} stars: ${count} ${count === 1 ? 'film' : 'films'}`}
                className="w-full min-h-[3px] rounded-t-[4px] bg-accent transition-[height] duration-300"
                style={{ height: `${heightPct}%` }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex justify-between border-t border-border pt-1 font-marquee text-[10px] uppercase tracking-[.15em] text-muted-foreground">
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <span key={n}>{n}★</span>
        ))}
      </div>
    </div>
  )
}
