import { useCallback, useState } from 'react'
import type { Tables } from '../types/supabase'

/**
 * Queues movies for the binary-insertion placement flow (PlacementModal) as
 * they're added, so rapid adds from a gallery don't stomp on each other —
 * only one placement runs at a time, front of queue first.
 */
export function usePlacementQueue() {
  const [queue, setQueue] = useState<Tables<'movies'>[]>([])

  const enqueue = useCallback((movie: Tables<'movies'>) => {
    setQueue(q => [...q, movie])
  }, [])

  const dequeue = useCallback(() => {
    setQueue(q => q.slice(1))
  }, [])

  return { current: queue[0] ?? null, enqueue, dequeue }
}
