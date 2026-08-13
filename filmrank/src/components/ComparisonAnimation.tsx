import type { DemoFilm } from '../lib/demoTypes'

interface ComparisonAnimationProps {
  left: DemoFilm | null
  right: DemoFilm | null
  onPickLeft: () => void
  onPickRight: () => void
  onSkip: () => void
  loading?: boolean
}

function PosterButton({
  film,
  placeholder,
  onClick,
}: {
  film: DemoFilm
  placeholder: 'a' | 'b'
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="block w-full border-0 bg-transparent p-0 text-left text-inherit transition-transform duration-[180ms] hover:-translate-y-[3px]"
    >
      <div className="poster-frame rounded p-[9px]">
        <div
          className={`relative aspect-[2/3] overflow-hidden ${
            film.posterUrl ? '' : placeholder === 'a' ? 'poster-placeholder-a' : 'poster-placeholder-b'
          }`}
        >
          {film.posterUrl && (
            <img
              src={film.posterUrl}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div className="poster-glare pointer-events-none absolute inset-0" />
          {!film.posterUrl && (
            <span className="absolute bottom-3 left-3 font-marquee text-[10px] font-medium uppercase tracking-[.14em] text-marquee-poster-label">
              poster
            </span>
          )}
        </div>
        <div className="px-1 pb-1 pt-3 text-center">
          <div className="font-marquee text-[17px] font-semibold uppercase leading-[1.25] tracking-[.06em] text-foreground">
            {film.title}
          </div>
          {film.year && (
            <div className="mt-1.5 font-marquee text-[11px] font-medium tracking-[.12em] text-accent">{film.year}</div>
          )}
        </div>
      </div>
    </button>
  )
}

export default function ComparisonAnimation({
  left,
  right,
  onPickLeft,
  onPickRight,
  onSkip,
  loading,
}: ComparisonAnimationProps) {
  const ready = !loading && left && right

  return (
    <div>
      <div className="marquee-frame max-w-[760px] rounded-[6px] p-5">
        <div className="rounded-[3px] border border-border bg-card p-[22px]">
          {ready ? (
            <div className="grid grid-cols-[1fr_68px_1fr] items-center">
              <PosterButton film={left} placeholder="a" onClick={onPickLeft} />
              <div className="flex items-center justify-center">
                <span className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-primary font-marquee text-[13px] font-bold tracking-[.1em] text-primary-foreground shadow-[0_0_0_3px_rgba(232,190,74,.55),0_0_18px_rgba(232,190,74,.3)]">
                  VS
                </span>
              </div>
              <PosterButton film={right} placeholder="b" onClick={onPickRight} />
            </div>
          ) : (
            <div className="flex min-h-[280px] items-center justify-center">
              <span className="font-marquee text-[12px] font-medium uppercase tracking-[.14em] text-muted-foreground">
                Loading the demo…
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="mt-5 flex items-center gap-[14px]">
        <span className="font-marquee text-[12px] font-medium text-marquee-tertiary">Haven't seen one?</span>
        <button
          onClick={onSkip}
          disabled={!ready}
          className="rounded border border-border bg-transparent px-[14px] py-[7px] font-marquee text-[12px] font-medium text-muted-foreground transition-colors duration-150 hover:border-accent hover:text-accent disabled:opacity-50"
        >
          Skip this pair
        </button>
      </div>
    </div>
  )
}
