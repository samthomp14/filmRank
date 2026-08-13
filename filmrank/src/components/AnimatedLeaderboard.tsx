import { motion, AnimatePresence } from 'motion/react'
import type { RankedRow } from '../lib/demoTypes'

interface AnimatedLeaderboardProps {
  rows: RankedRow[]
  listLabel: string
}

export default function AnimatedLeaderboard({ rows, listLabel }: AnimatedLeaderboardProps) {
  return (
    <div className="marquee-frame-thin rounded-[6px] p-[14px]">
      <div className="rounded-[2px] bg-marquee-paper p-[18px_20px] shadow-[inset_0_0_0_1px_rgba(0,0,0,.18)]">
        <div className="mb-[10px] font-marquee text-[11px] font-medium uppercase tracking-[.2em] text-primary">
          {listLabel}
        </div>
        <div>
          <AnimatePresence initial={false}>
            {rows.map((row) => (
              <motion.div
                key={row.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ layout: { duration: 0.5, ease: 'easeOut' }, opacity: { duration: 0.3 } }}
                className="grid grid-cols-[28px_1fr_34px_auto] items-center gap-3 border-t border-marquee-paper-divider py-[11px]"
              >
                <span className="font-marquee text-[12px] font-medium text-primary">
                  {String(row.position).padStart(2, '0')}
                </span>
                <span className="font-marquee text-[16px] font-semibold uppercase tracking-[.07em] text-marquee-paper-foreground">
                  {row.title}
                </span>
                <span
                  className="text-right font-marquee text-[11px] font-medium tracking-[.06em] text-marquee-movement transition-opacity duration-300"
                  style={{ opacity: row.move > 0 ? 1 : 0 }}
                >
                  ▲{row.move || ''}
                </span>
                <span className="font-marquee text-[11px] font-medium text-marquee-paper-muted">{row.year ?? ''}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
