import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const FALLBACK_IMAGE = '/no_poster_placeholder.png'
const ROLE_LABELS: Record<string, string> = {
  director: 'Director',
  writer: 'Writer',
  actor: 'Actor',
}

interface CreditMovie {
  id: string
  title: string
  year: number | null
  url: string | null
}

interface CreditRow {
  role: string
  billing_order: number | null
  movies: CreditMovie | CreditMovie[] | null
}

function unwrapMovie(row: CreditRow): CreditMovie | null {
  const movie = Array.isArray(row.movies) ? row.movies[0] : row.movies
  return movie ?? null
}

export default function PersonInfo() {
  const { personId } = useParams<{ personId: string }>()
  const [name, setName] = useState<string | null>(null)
  const [credits, setCredits] = useState<Record<string, CreditMovie[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPerson = async () => {
      if (!personId) return

      const [{ data: person, error: personError }, { data: creditRows, error: creditsError }] = await Promise.all([
        supabase.from('people').select('id, name').eq('id', personId).single(),
        supabase
          .from('movie_people')
          .select('role, billing_order, movies:movies!movie_people_movie_id_fkey (id, title, year, url)')
          .eq('person_id', personId)
          .order('role', { ascending: true })
          .order('billing_order', { ascending: true, nullsFirst: true }),
      ])

      if (personError) console.error('Failed to fetch person:', personError)
      if (creditsError) console.error('Failed to fetch credits:', creditsError)

      setName(person?.name ?? null)

      const grouped: Record<string, CreditMovie[]> = {}
      for (const row of (creditRows as CreditRow[] | null) || []) {
        const movie = unwrapMovie(row)
        if (!movie) continue
        if (!grouped[row.role]) grouped[row.role] = []
        grouped[row.role].push(movie)
      }
      setCredits(grouped)

      setLoading(false)
    }

    fetchPerson()
  }, [personId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground text-lg">Loading...</div>
      </div>
    )
  }

  if (!name) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground text-lg">Person not found.</div>
      </div>
    )
  }

  const roleOrder = ['director', 'writer', 'actor'].filter((role) => credits[role]?.length)

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="font-marquee text-4xl font-semibold uppercase tracking-[.015em] text-foreground mb-10 text-center">
          {name}
        </h1>

        {roleOrder.length === 0 && (
          <p className="text-center text-muted-foreground">No credits found.</p>
        )}

        {roleOrder.map((role) => (
          <div key={role} className="mb-10">
            <h2 className="mb-4 font-marquee text-lg font-semibold uppercase tracking-[.06em] text-foreground">
              {ROLE_LABELS[role] || role}
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {credits[role].map((movie) => (
                <Link key={movie.id} to={`/movie/${movie.id}`} className="group">
                  <img
                    src={movie.url || FALLBACK_IMAGE}
                    alt={movie.title}
                    className="w-full aspect-[2/3] rounded-sm border border-accent/50 object-cover transition-transform duration-200 group-hover:scale-105"
                    onError={(e) => {
                      e.currentTarget.src = FALLBACK_IMAGE
                    }}
                  />
                  <div className="mt-2 truncate text-sm font-medium text-foreground">{movie.title}</div>
                  {movie.year && <div className="text-xs text-muted-foreground">{movie.year}</div>}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
