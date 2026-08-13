import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../lib/utils'

/** Center bulbs in the padded frame ring. */
const INSET = 7
const BULB_R = 4
/** Target center-to-center spacing — higher = fewer bulbs. */
const TARGET_GAP = 30
/** Must match the frame's border-radius. */
const OUTER_RADIUS = 12
const FRAME_PAD = 14

interface MarqueeFrameProps {
  children: ReactNode
  className?: string
  contentClassName?: string
}

interface Bulb {
  x: number
  y: number
}

/**
 * Corner-aligned bulbs: pick gap counts from width and height separately so
 * each side divides evenly and every corner gets a bulb. Horizontal vs
 * vertical spacing may differ by a few px — required to hit both axes.
 * Corner bulbs sit on the 45° point of the rounded path so they read centered
 * in the curve instead of tucked into the sharp bounding-box corner.
 */
function bulbsForRect(width: number, height: number): Bulb[] {
  const gapsX = Math.max(2, Math.round(width / TARGET_GAP))
  const gapsY = Math.max(2, Math.round(height / TARGET_GAP))
  const x0 = INSET
  const y0 = INSET
  const rx = Math.max(0, Math.min(OUTER_RADIUS - INSET, width / 2, height / 2))
  // Offset from the sharp corner onto the arc's 45° point.
  const corner = rx * (1 - Math.SQRT2 / 2)
  const bulbs: Bulb[] = []

  for (let i = 0; i <= gapsX; i++) {
    if (i === 0) {
      bulbs.push({ x: x0 + corner, y: y0 + corner })
      bulbs.push({ x: x0 + corner, y: y0 + height - corner })
    } else if (i === gapsX) {
      bulbs.push({ x: x0 + width - corner, y: y0 + corner })
      bulbs.push({ x: x0 + width - corner, y: y0 + height - corner })
    } else {
      const x = x0 + (i / gapsX) * width
      bulbs.push({ x, y: y0 })
      bulbs.push({ x, y: y0 + height })
    }
  }
  for (let j = 1; j < gapsY; j++) {
    const y = y0 + (j / gapsY) * height
    bulbs.push({ x: x0, y })
    bulbs.push({ x: x0 + width, y })
  }

  return bulbs
}

export default function MarqueeFrame({ children, className, contentClassName }: MarqueeFrameProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const update = () => {
      const { width, height } = el.getBoundingClientRect()
      setSize({ w: width, h: height })
    }
    update()

    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const innerW = size ? size.w - INSET * 2 : 0
  const innerH = size ? size.h - INSET * 2 : 0
  const canDraw = innerW > 0 && innerH > 0
  const bulbs = canDraw ? bulbsForRect(innerW, innerH) : []

  return (
    <div
      ref={ref}
      className={cn('relative overflow-hidden rounded-[12px]', className)}
      style={{
        background: 'linear-gradient(160deg, var(--marquee-gradient-start), var(--marquee-gradient-end))',
        boxShadow: '0 30px 60px -30px rgba(255, 180, 90, .35)',
        padding: FRAME_PAD,
      }}
    >
      {canDraw && size && (
        <svg
          className="pointer-events-none absolute inset-0"
          width={size.w}
          height={size.h}
          aria-hidden
        >
          {bulbs.map((b, i) => (
            <circle key={i} cx={b.x} cy={b.y} r={BULB_R} fill="var(--marquee-bulb)" />
          ))}
        </svg>
      )}
      <div className={cn('relative rounded-[3px] border border-border bg-card', contentClassName)}>
        {children}
      </div>
    </div>
  )
}
