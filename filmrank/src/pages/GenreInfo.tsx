import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const FALLBACK_IMAGE = '/no_poster_placeholder.png'

interface CreditMovie {
  id: string
  title: string
  year: number | null
  url: string | null
}

interface CreditRow {
  movies: CreditMovie | CreditMovie[] | null
}

function unwrapMovie(row: CreditRow): CreditMovie | null {
  const movie = Array.isArray(row.movies) ? row.movies[0] : row.movies
  return movie ?? null
}

export default function GenreInfo() {
  const { genreId } = useParams<{ genreId: string }>()
  const [name, setName] = useState<string | null>(null)
  const [movies, setMovies] = useState<CreditMovie[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchGenre = async () => {
      if (!genreId) return

      const [{ data: genre, error: genreError }, { data: movieRows, error: moviesError }] = await Promise.all([
        supabase.from('genres').select('id, name').eq('id', genreId).single(),
        supabase
          .from('movie_genres')
          .select('movies:movies!movie_genres_movie_id_fkey (id, title, year, url)')
          .eq('genre_id', genreId),
      ])

      if (genreError) console.error('Failed to fetch genre:', genreError)
      if (moviesError) console.error('Failed to fetch genre movies:', moviesError)

      setName(genre?.name ?? null)

      const list: CreditMovie[] = []
      for (const row of (movieRows as CreditRow[] | null) || []) {
        const movie = unwrapMovie(row)
        if (movie) list.push(movie)
      }
      list.sort((a, b) => a.title.localeCompare(b.title))
      setMovies(list)

      setLoading(false)
    }

    fetchGenre()
  }, [genreId])

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
        <div className="text-muted-foreground text-lg">Genre not found.</div>
      </div>
    )
  }

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="font-marquee text-4xl font-semibold uppercase tracking-[.015em] text-foreground mb-10 text-center">
          {name}
        </h1>

        {movies.length === 0 ? (
          <p className="text-center text-muted-foreground">No movies found.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {movies.map((movie) => (
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
        )}
      </div>
    </div>
  )
}
