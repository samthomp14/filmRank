interface StarRatingProps {
  value: number
  className?: string
}

/**
 * Renders a 0-5 star rating with a partial fill on the last star, via a
 * clipped overlay of filled stars on top of muted outline stars, plus a
 * styled hover tooltip showing the precise value.
 */
export default function StarRating({ value, className = '' }: StarRatingProps) {
  return (
    <span
      className={`group/rating relative inline-block tracking-[.05em] ${className}`}
      aria-label={`${value.toFixed(1)} out of 5 stars`}
    >
      <span className="text-muted-foreground/30">★★★★★</span>
      <span
        className="absolute inset-0 overflow-hidden whitespace-nowrap text-accent"
        style={{ width: `${Math.min(100, Math.max(0, (value / 5) * 100))}%` }}
      >
        ★★★★★
      </span>
      <span className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded border border-border bg-card px-2 py-1 font-marquee text-[10px] font-medium uppercase tracking-[.1em] text-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover/rating:opacity-100">
        {value.toFixed(1)} / 5
      </span>
    </span>
  )
}
