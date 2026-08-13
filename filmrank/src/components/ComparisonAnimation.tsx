import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { DemoFilm } from '../lib/demoTypes'
import MarqueeFrame from './MarqueeFrame'

interface ComparisonAnimationProps {
  left: DemoFilm | null
  right: DemoFilm | null
  onPickLeft: () => void
  onPickRight: () => void
  onSkip: () => void
  loading?: boolean
}

type SlotState = 'idle' | 'winner' | 'loser'

const DECIDE_MS = 600
const ENTER_MS = 380

function PosterSlot({
  film,
  side,
  state,
  interactive,
  placeholder,
  onClick,
}: {
  film: DemoFilm
  side: 'left' | 'right'
  state: SlotState
  interactive: boolean
  placeholder: 'a' | 'b'
  onClick: () => void
}) {
  const flyX = side === 'left' ? -80 : 80
  const flyRotate = side === 'left' ? -18 : 18

  const animate =
    state === 'winner'
      ? { opacity: 1, y: 0, x: 0, rotate: 0, scale: 1.05 }
      : state === 'loser'
        ? { opacity: 0, y: 90, x: flyX, rotate: flyRotate, scale: 1 }
        : { opacity: 1, y: 0, x: 0, rotate: 0, scale: 1 }

  return (
    <button
      onClick={onClick}
      disabled={!interactive}
      className="block w-full border-0 bg-transparent p-0 text-left text-inherit transition-transform duration-[180ms] enabled:hover:-translate-y-[3px]"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={film.id}
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={animate}
          exit={{ opacity: 0 }}
          transition={state === 'loser' ? { duration: 0.55, ease: 'easeIn' } : { duration: 0.4, ease: 'easeOut' }}
        >
          <div
            className={`poster-frame rounded p-[9px] ${
              state === 'winner' ? 'shadow-[0_0_0_3px_rgba(232,190,74,.55),0_0_20px_rgba(232,190,74,.35)]' : ''
            }`}
          >
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
                <div className="mt-1.5 font-marquee text-[11px] font-medium tracking-[.12em] text-accent">
                  {film.year}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
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
  const [phase, setPhase] = useState<'idle' | 'deciding' | 'entering'>('idle')
  const [winnerSide, setWinnerSide] = useState<'left' | 'right' | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  const choose = (side: 'left' | 'right') => {
    if (phase !== 'idle' || !left || !right) return
    const commit = side === 'left' ? onPickLeft : onPickRight
    setWinnerSide(side)
    setPhase('deciding')
    clearTimers()
    timers.current.push(
      setTimeout(() => {
        commit()
        setPhase('entering')
        timers.current.push(
          setTimeout(() => {
            setPhase('idle')
            setWinnerSide(null)
          }, ENTER_MS)
        )
      }, DECIDE_MS)
    )
  }

  const slotState = (side: 'left' | 'right'): SlotState => {
    if (phase !== 'deciding') return 'idle'
    return winnerSide === side ? 'winner' : 'loser'
  }

  return (
    <div>
      <MarqueeFrame className="max-w-[760px]" contentClassName="p-[22px]">
        {ready ? (
          <div className="grid grid-cols-[1fr_68px_1fr] items-center">
            <PosterSlot
              film={left}
              side="left"
              placeholder="a"
              state={slotState('left')}
              interactive={phase === 'idle'}
              onClick={() => choose('left')}
            />
            <div className="flex items-center justify-center">
              <span className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-primary font-marquee text-[13px] font-bold tracking-[.1em] text-primary-foreground shadow-[0_0_0_3px_rgba(232,190,74,.55),0_0_18px_rgba(232,190,74,.3)]">
                VS
              </span>
            </div>
            <PosterSlot
              film={right}
              side="right"
              placeholder="b"
              state={slotState('right')}
              interactive={phase === 'idle'}
              onClick={() => choose('right')}
            />
          </div>
        ) : (
          <div className="flex min-h-[280px] items-center justify-center">
            <span className="font-marquee text-[12px] font-medium uppercase tracking-[.14em] text-muted-foreground">
              Loading the demo…
            </span>
          </div>
        )}
      </MarqueeFrame>
      <div className="mt-5 flex items-center gap-[14px]">
        <span className="font-marquee text-[12px] font-medium text-marquee-tertiary">Haven't seen one?</span>
        <button
          onClick={onSkip}
          disabled={!ready || phase !== 'idle'}
          className="rounded border border-border bg-transparent px-[14px] py-[7px] font-marquee text-[12px] font-medium text-muted-foreground transition-colors duration-150 hover:border-accent hover:text-accent disabled:opacity-50"
        >
          Skip this pair
        </button>
      </div>
    </div>
  )
}
