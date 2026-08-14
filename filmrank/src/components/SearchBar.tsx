import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { supabase } from '../lib/supabaseClient'

const FALLBACK_IMAGE = '/no_poster_placeholder.png'

interface MovieResult {
  id: string
  title: string
  year: number | null
  url: string | null
}

interface PersonResult {
  id: string
  name: string
}

export default function SearchBar({ className = '', onNavigate }: { className?: string; onNavigate?: () => void }) {
  const [query, setQuery] = useState('')
  const [movies, setMovies] = useState<MovieResult[]>([])
  const [people, setPeople] = useState<PersonResult[]>([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const trimmed = query.trim()
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (trimmed.length < 2) {
      setMovies([])
      setPeople([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      const [{ data: movieResults, error: movieError }, { data: peopleResults, error: peopleError }] = await Promise.all([
        supabase.rpc('search_movies', { q: trimmed, limit_count: 5 }),
        supabase.rpc('search_people', { q: trimmed, limit_count: 4 }),
      ])
      if (movieError) console.error('Movie search failed:', movieError)
      if (peopleError) console.error('People search failed:', peopleError)
      setMovies(movieResults ?? [])
      setPeople(peopleResults ?? [])
    }, 250)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (path: string) => {
    setOpen(false)
    setQuery('')
    navigate(path)
    onNavigate?.()
  }

  const trimmed = query.trim()
  const showResults = open && trimmed.length >= 2
  const hasResults = movies.length > 0 || people.length > 0

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false)
              e.currentTarget.blur()
            }
          }}
          placeholder="Search movies, people..."
          className="w-full rounded-full border border-border bg-background py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {showResults && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {!hasResults ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">No results for "{trimmed}"</div>
          ) : (
            <>
              {movies.length > 0 && (
                <div className="py-1">
                  <div className="px-3 pt-1.5 pb-1 font-marquee text-[10px] font-medium uppercase tracking-[.14em] text-muted-foreground">
                    Movies
                  </div>
                  {movies.map((movie) => (
                    <button
                      key={movie.id}
                      type="button"
                      onClick={() => handleSelect(`/movie/${movie.id}`)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-secondary/60"
                    >
                      <img
                        src={movie.url || FALLBACK_IMAGE}
                        alt=""
                        className="h-10 w-7 flex-shrink-0 rounded-sm object-cover"
                        onError={(e) => {
                          e.currentTarget.src = FALLBACK_IMAGE
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{movie.title}</span>
                      {movie.year && <span className="flex-shrink-0 text-xs text-muted-foreground">{movie.year}</span>}
                    </button>
                  ))}
                </div>
              )}

              {people.length > 0 && (
                <div className="border-t border-marquee-hairline py-1">
                  <div className="px-3 pt-1.5 pb-1 font-marquee text-[10px] font-medium uppercase tracking-[.14em] text-muted-foreground">
                    People
                  </div>
                  {people.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => handleSelect(`/person/${person.id}`)}
                      className="flex w-full items-center px-3 py-2 text-left text-sm text-foreground hover:bg-secondary/60"
                    >
                      {person.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
