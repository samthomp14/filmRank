import { useEffect, useState } from 'react'
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { formatRuntime, formatYear, formatIMDBRating, computeEloStats, eloToStars } from '../lib/movieUtils'
import StarRating from '../components/StarRating'
import { Eye } from 'lucide-react'
import type { Tables } from '../types/supabase';

type Movie = Tables<'movies'>;

interface CreditPerson {
  id: string
  name: string
}

interface CreditRow {
  role: string
  people: CreditPerson | CreditPerson[] | null
}

function unwrapPerson(row: CreditRow): CreditPerson | null {
  const person = Array.isArray(row.people) ? row.people[0] : row.people
  return person ?? null
}

function CreditLinks({ people }: { people: CreditPerson[] }) {
  return (
    <>
      {people.map((person, i) => (
        <span key={person.id}>
          <Link to={`/person/${person.id}`} className="hover:text-accent transition-colors duration-200">
            {person.name}
          </Link>
          {i < people.length - 1 ? ', ' : ''}
        </span>
      ))}
    </>
  )
}

interface CreditGenre {
  id: string
  name: string
}

interface GenreRow {
  genres: CreditGenre | CreditGenre[] | null
}

function unwrapGenre(row: GenreRow): CreditGenre | null {
  const genre = Array.isArray(row.genres) ? row.genres[0] : row.genres
  return genre ?? null
}

function GenreLinks({ genres }: { genres: CreditGenre[] }) {
  return (
    <>
      {genres.map((genre, i) => (
        <span key={genre.id}>
          <Link to={`/genre/${genre.id}`} className="hover:text-accent transition-colors duration-200">
            {genre.name}
          </Link>
          {i < genres.length - 1 ? ', ' : ''}
        </span>
      ))}
    </>
  )
}

function getOMDBField(meta: unknown, field: string): string | undefined {
  if (
    typeof meta === 'object' &&
    meta !== null &&
    !Array.isArray(meta) &&
    typeof (meta as Record<string, unknown>)[field] === 'string'
  ) {
    return (meta as Record<string, string>)[field];
  }
  return undefined;
}

/** Small-caps label + value pair for the details list. */
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-marquee-hairline py-3 first:border-t-0">
      <span className="font-marquee text-[11px] font-medium uppercase tracking-[.14em] text-muted-foreground">
        {label}
      </span>
      <span className="text-right text-sm text-foreground">{children}</span>
    </div>
  )
}

function MovieInfo() {
  const { movieId } = useParams<{ movieId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const [movie, setMovie] = useState<Movie | null>(null)
  const [credits, setCredits] = useState<Record<string, CreditPerson[]>>({})
  const [genres, setGenres] = useState<CreditGenre[]>([])
  const [personalStars, setPersonalStars] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [inLibrary, setInLibrary] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [showRemoveModal, setShowRemoveModal] = useState(false)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    const fetchMovie = async () => {
      if (!movieId) return

      const [{ data: { user } }, { data, error }, { data: creditRows, error: creditsError }, { data: genreRows, error: genresError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('movies')
          .select('id, title, url, year, runtime, rating, genre, director, language, country, imdb_rating, imdb_id, tmdb_id, metadata')
          .eq('id', movieId)
          .single(),
        supabase
          .from('movie_people')
          .select('role, people:people!movie_people_person_id_fkey (id, name)')
          .eq('movie_id', movieId),
        supabase
          .from('movie_genres')
          .select('genres:genres!movie_genres_genre_id_fkey (id, name)')
          .eq('movie_id', movieId),
      ])

      if (error) {
        console.error('Failed to fetch movie:', error)
      } else {
        setMovie({ alt_title: null, ...data });
      }

      if (creditsError) console.error('Failed to fetch credits:', creditsError)

      const grouped: Record<string, CreditPerson[]> = {}
      for (const row of (creditRows as CreditRow[] | null) || []) {
        const person = unwrapPerson(row)
        if (!person) continue
        if (!grouped[row.role]) grouped[row.role] = []
        grouped[row.role].push(person)
      }
      setCredits(grouped)

      if (genresError) console.error('Failed to fetch genres:', genresError)
      const genreList: CreditGenre[] = []
      for (const row of (genreRows as GenreRow[] | null) || []) {
        const genre = unwrapGenre(row)
        if (genre) genreList.push(genre)
      }
      setGenres(genreList)

      if (user) {
        setUserId(user.id)
        const { data: userMovies, error: userMoviesError } = await supabase
          .from('user_movies')
          .select('movie_id, elo_score')
          .eq('user_id', user.id)
          .is('removed_at', null)
        if (userMoviesError) {
          console.error('Failed to fetch user ratings:', userMoviesError)
        } else if (userMovies) {
          const mine = userMovies.find((m) => m.movie_id === movieId)
          setInLibrary(!!mine)
          if (mine && mine.elo_score !== null) {
            const stats = computeEloStats(userMovies.map((m) => m.elo_score).filter((e): e is number => e !== null))
            setPersonalStars(eloToStars(mine.elo_score, stats))
          }
        }
      }

      setLoading(false)
    }

    fetchMovie()
  }, [movieId])

  const handleIMDBLink = () => {
    let imdbId = movie?.imdb_id;
    if (!imdbId) {
      imdbId = getOMDBField(movie?.metadata, 'imdbID');
    }
    if (imdbId) {
      window.open(`https://www.imdb.com/title/${imdbId}`, '_blank');
    }
  }

  const handleRemove = async () => {
    if (!userId || !movieId) return
    setRemoving(true)
    try {
      const { error } = await supabase
        .from('user_movies')
        .update({ removed_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('movie_id', movieId)
      if (error) throw error
      setInLibrary(false)
      setPersonalStars(null)
      setShowRemoveModal(false)
    } catch (err) {
      console.error('Failed to remove movie from library:', err)
    } finally {
      setRemoving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground text-lg">Loading movie information...</div>
      </div>
    )
  }

  if (!movie) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground text-lg">Movie not found.</div>
      </div>
    )
  }

  const imdbId = movie.imdb_id || getOMDBField(movie.metadata, 'imdbID')
  const quickFacts = [movie.year && formatYear(movie.year), movie.runtime && formatRuntime(movie.runtime), movie.rating].filter(Boolean)

  const compareState = location.state as { from?: string; pair?: unknown } | null
  const cameFromCompare = compareState?.from === 'compare' && !!compareState?.pair

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => {
            if (cameFromCompare) {
              // Resume the exact pair being compared rather than fetching a
              // fresh random one.
              navigate('/compare', { state: { pair: compareState!.pair } })
              return
            }
            // location.key is 'default' when there's no history to go back to
            // (e.g. a direct link/refresh), so fall back to a sensible page.
            if (location.key !== 'default') navigate(-1)
            else navigate('/dashboard')
          }}
          className="mb-8 inline-flex items-center gap-2 font-marquee text-[12px] font-medium uppercase tracking-[.1em] text-muted-foreground transition-colors duration-150 hover:text-accent"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {cameFromCompare ? 'Back to Comparison' : 'Back'}
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-14">
          {/* Poster */}
          <div className="lg:col-span-1">
            <div className="sticky top-8 poster-frame rounded p-[9px]">
              <div className="relative aspect-[2/3] overflow-hidden rounded-sm">
                <img
                  src={movie.url && movie.url !== 'N/A' ? movie.url : '/no_poster_placeholder.png'}
                  alt={movie.title}
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = '/no_poster_placeholder.png';
                  }}
                />
                <div className="poster-glare pointer-events-none absolute inset-0" />
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="lg:col-span-2 space-y-8">
            <div>
              <div className="flex items-start gap-3">
                <h1 className="font-marquee text-3xl sm:text-4xl font-semibold uppercase leading-tight tracking-[.015em] text-foreground flex-1">
                  {movie.title}
                </h1>
                {imdbId && (
                  <button
                    onClick={handleIMDBLink}
                    className="mt-1 text-muted-foreground transition-colors duration-200 hover:text-accent"
                    title="View on IMDb"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                )}
                {inLibrary && (
                  <button
                    onClick={() => setShowRemoveModal(true)}
                    className="mt-1 text-muted-foreground transition-colors duration-200 hover:text-destructive"
                    title="Remove from Library"
                    aria-label="Remove from library"
                  >
                    <Eye className="h-5 w-5" strokeWidth={2} />
                  </button>
                )}
              </div>

              {quickFacts.length > 0 && (
                <div className="mt-2 font-marquee text-[12px] font-medium uppercase tracking-[.12em] text-marquee-tertiary">
                  {quickFacts.join('   ·   ')}
                </div>
              )}

              {/* Ratings */}
              {(personalStars !== null || movie.imdb_rating) && (
                <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3">
                  {personalStars !== null && (
                    <div>
                      <div className="font-marquee text-[10px] font-medium uppercase tracking-[.14em] text-muted-foreground mb-1">
                        Your Rating
                      </div>
                      <StarRating value={personalStars} className="text-lg" />
                    </div>
                  )}
                  {movie.imdb_rating && (
                    <div>
                      <div className="font-marquee text-[10px] font-medium uppercase tracking-[.14em] text-muted-foreground mb-1">
                        IMDb
                      </div>
                      <div className="font-marquee text-lg font-semibold text-foreground">
                        {formatIMDBRating(movie.imdb_rating)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Plot */}
            {getOMDBField(movie.metadata, 'Plot') && (
              <div>
                <h3 className="font-marquee text-[11px] font-medium uppercase tracking-[.14em] text-accent mb-2">
                  Synopsis
                </h3>
                <p className="text-muted-foreground leading-relaxed">{getOMDBField(movie.metadata, 'Plot')}</p>
              </div>
            )}

            {/* Details */}
            <div>
              {(credits.director?.length || movie.director) && (
                <DetailRow label="Director">
                  {credits.director?.length ? <CreditLinks people={credits.director} /> : movie.director}
                </DetailRow>
              )}
              {(credits.writer?.length || getOMDBField(movie.metadata, 'Writer')) && (
                <DetailRow label="Writer">
                  {credits.writer?.length ? <CreditLinks people={credits.writer} /> : getOMDBField(movie.metadata, 'Writer')}
                </DetailRow>
              )}
              {(genres.length || movie.genre) && (
                <DetailRow label="Genre">
                  {genres.length ? <GenreLinks genres={genres} /> : movie.genre}
                </DetailRow>
              )}
              {getOMDBField(movie.metadata, 'Released') && (
                <DetailRow label="Release Date">{getOMDBField(movie.metadata, 'Released')}</DetailRow>
              )}
              {movie.language && <DetailRow label="Language">{movie.language}</DetailRow>}
              {movie.country && <DetailRow label="Country">{movie.country}</DetailRow>}
              {getOMDBField(movie.metadata, 'Awards') && (
                <DetailRow label="Awards">{getOMDBField(movie.metadata, 'Awards')}</DetailRow>
              )}
            </div>

            {/* Cast */}
            {(credits.actor?.length || getOMDBField(movie.metadata, 'Actors')) && (
              <div>
                <h3 className="font-marquee text-[11px] font-medium uppercase tracking-[.14em] text-accent mb-2">
                  Cast
                </h3>
                <p className="text-foreground">
                  {credits.actor?.length ? <CreditLinks people={credits.actor} /> : getOMDBField(movie.metadata, 'Actors')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showRemoveModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-medium text-foreground mb-4">Remove from Library</h3>
            <p className="text-muted-foreground mb-6">
              Remove "{movie.title}" from your library? You can add it back later without losing your rating or comparison history.
            </p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => setShowRemoveModal(false)}
                className="px-4 py-2 text-sm font-medium text-foreground bg-secondary rounded-lg hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="px-4 py-2 text-sm font-medium text-destructive-foreground bg-destructive rounded-lg hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50"
              >
                {removing ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MovieInfo
