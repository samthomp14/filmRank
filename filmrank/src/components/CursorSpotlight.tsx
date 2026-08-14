import { useEffect, useRef } from 'react'

/**
 * Warm spotlight beam, rigged from the top-right corner, that lags behind
 * and chases the cursor — first piece of the "film buddy" spotlight-operator
 * concept (see TODO.md).
 *
 * The beam's shape is the classic two-circles-and-tangent-lines construction:
 * a small fixed circle at the source, a fixed circle at the cursor, and the
 * external tangent lines connecting them. Unlike a taper formula (linear,
 * saturating, whatever), the tangent lines are geometrically exact for any
 * distance — no piecewise transition, so no possible kink — and both circles
 * stay their own fixed size regardless of how far apart they are.
 */
const LAG = 0.1
const SOURCE_OFFSET_X = 60
const SOURCE_OFFSET_Y = 60
const SOURCE_RADIUS = 22
const END_RADIUS = 65

export default function CursorSpotlight() {
  const spotRef = useRef<HTMLDivElement>(null)
  const sourceRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const spotEl = spotRef.current
    const sourceEl = sourceRef.current
    const canvas = canvasRef.current
    if (!spotEl || !sourceEl || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const canHover = window.matchMedia('(pointer: fine)').matches
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!canHover || prefersReducedMotion) return

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()

    let dpr = window.devicePixelRatio || 1
    let sourceX = window.innerWidth + SOURCE_OFFSET_X
    let sourceY = -SOURCE_OFFSET_Y

    const resize = () => {
      dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      sourceX = window.innerWidth + SOURCE_OFFSET_X
      sourceY = -SOURCE_OFFSET_Y
    }
    resize()
    window.addEventListener('resize', resize)

    let targetX = window.innerWidth / 2
    let targetY = window.innerHeight / 2
    let currentX = targetX
    let currentY = targetY
    let visible = false
    let rafId: number

    const setVisible = (next: boolean) => {
      visible = next
      const opacity = next ? '1' : '0'
      spotEl.style.opacity = opacity
      sourceEl.style.opacity = opacity
      canvas.style.opacity = opacity
    }

    const handleMove = (e: MouseEvent) => {
      targetX = e.clientX
      targetY = e.clientY
      if (!visible) setVisible(true)
    }

    const handleLeave = () => setVisible(false)

    const tick = () => {
      currentX += (targetX - currentX) * LAG
      currentY += (targetY - currentY) * LAG

      spotEl.style.setProperty('--spotlight-x', `${currentX}px`)
      spotEl.style.setProperty('--spotlight-y', `${currentY}px`)

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)

      const dx = currentX - sourceX
      const dy = currentY - sourceY
      const dist = Math.hypot(dx, dy) || 1
      const baseAngle = Math.atan2(dy, dx)

      // External tangent lines between a circle of radius SOURCE_RADIUS at
      // the source and END_RADIUS at the cursor: the tangent points sit at
      // a fixed angular offset (alpha) from the perpendicular to the line
      // joining the two centers, where sin(alpha) = (r1 - r2) / d.
      const ratio = Math.max(-1, Math.min(1, (SOURCE_RADIUS - END_RADIUS) / dist))
      const alpha = Math.asin(ratio)
      const a1 = Math.PI / 2 - alpha
      const a2 = -Math.PI / 2 + alpha

      const steps = 14
      const drawCapsule = (blur: number, opacity: number) => {
        const along = ctx.createLinearGradient(sourceX, sourceY, currentX, currentY)
        along.addColorStop(0, `hsl(${accent} / ${opacity * 0.35})`)
        along.addColorStop(1, `hsl(${accent} / ${opacity})`)

        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.filter = `blur(${blur}px)`
        ctx.beginPath()
        // Source circle's far arc (away from the cursor), sweeping through
        // the point directly opposite the cursor so the source end reads
        // as a full rounded cap rather than a point.
        for (let i = 0; i <= steps; i++) {
          const t = a1 + (i / steps) * (a2 + Math.PI * 2 - a1)
          ctx.lineTo(sourceX + SOURCE_RADIUS * Math.cos(baseAngle + t), sourceY + SOURCE_RADIUS * Math.sin(baseAngle + t))
        }
        // Cursor circle's near arc (facing away from the source), same idea.
        for (let i = 0; i <= steps; i++) {
          const t = a2 + (i / steps) * (a1 - a2)
          ctx.lineTo(currentX + END_RADIUS * Math.cos(baseAngle + t), currentY + END_RADIUS * Math.sin(baseAngle + t))
        }
        ctx.closePath()
        ctx.fillStyle = along
        ctx.fill()
        ctx.restore()
      }

      // Wide, faint bloom underneath a tighter, brighter core — a single
      // pass only ever reads as "a blurred shape"; two passes at different
      // scales read as glow.
      drawCapsule(28, 0.16)
      drawCapsule(8, 0.36)

      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    window.addEventListener('mousemove', handleMove)
    document.documentElement.addEventListener('mouseleave', handleLeave)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('resize', resize)
      document.documentElement.removeEventListener('mouseleave', handleLeave)
    }
  }, [])

  return (
    <>
      <canvas ref={canvasRef} className="cursor-spotlight-beam" aria-hidden="true" />
      <div ref={sourceRef} className="cursor-spotlight-source" aria-hidden="true" />
      <div ref={spotRef} className="cursor-spotlight" aria-hidden="true" />
    </>
  )
}
