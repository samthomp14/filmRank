import { useEffect, useState } from 'react'
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { formatRuntime, formatYear, formatIMDBRating } from '../lib/movieUtils'
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
          <Link to={`/person/${person.id}`} className="hover:text-primary transition-colors duration-200">
            {person.name}
          </Link>
          {i < people.length - 1 ? ', ' : ''}
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

function MovieInfo() {
  const { movieId } = useParams<{ movieId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const from = location.state?.from
  const [movie, setMovie] = useState<Movie | null>(null)
  const [credits, setCredits] = useState<Record<string, CreditPerson[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMovie = async () => {
      if (!movieId) return

      const [{ data, error }, { data: creditRows, error: creditsError }] = await Promise.all([
        supabase
          .from('movies')
          .select('id, title, url, year, runtime, rating, genre, director, language, country, imdb_rating, imdb_id, metadata')
          .eq('id', movieId)
          .single(),
        supabase
          .from('movie_people')
          .select('role, people:people!movie_people_person_id_fkey (id, name)')
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <div className="text-muted-foreground text-lg font-medium">Loading movie information...</div>
        </div>
      </div>
    )
  }

  if (!movie) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-muted-foreground text-6xl mb-4">🎬</div>
          <div className="text-muted-foreground text-xl font-medium">Movie not found</div>
          <div className="text-muted-foreground mt-2">The movie you're looking for doesn't exist.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header Section */}
          <div className="mb-8">
            <button
              onClick={() => {
                if (from === 'my-movies') navigate('/my-movies')
                else navigate('/ranking')
              }}
              className="inline-flex items-center text-primary hover:text-primary/80 font-medium transition-colors duration-200 mb-4"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {from === 'my-movies' ? 'Back to My Library' : 'Back to Rankings'}
            </button>
          </div>

          {/* Main Content */}
          <div className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-xl border border-border overflow-hidden">
            <div className="p-8 lg:p-12">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
                {/* Movie Poster */}
                <div className="lg:col-span-1">
                  <div className="sticky top-8">
                    {movie.url && movie.url !== 'N/A' ? (
                      <div className="relative group">
                        <img
                          src={movie.url}
                          alt={movie.title}
                          className="w-full h-auto rounded-xl shadow-2xl transition-transform duration-300 group-hover:scale-105"
                          onError={(e) => {
                            e.currentTarget.src = '/public/no_poster_placeholder.png';
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      </div>
                    ) : (
                      <div className="w-full aspect-[2/3] bg-muted rounded-xl shadow-2xl flex items-center justify-center">
                        <img
                          src="/no_poster_placeholder.png"
                          alt="No poster available"
                          className="w-1/2 h-auto mx-auto rounded-lg opacity-80"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Movie Information */}
                <div className="lg:col-span-2">
                  <div className="space-y-8">
                    {/* Title and Basic Info */}
                    <div>
                      <div className="flex items-start gap-3 mb-4">
                        <h1 className="text-4xl lg:text-5xl font-bold text-foreground leading-tight flex-1">
                          {movie.title}
                        </h1>
                        {(movie.imdb_id || getOMDBField(movie.metadata, 'imdbID')) && (
                          <button
                            onClick={handleIMDBLink}
                            className="text-muted-foreground hover:text-primary transition-colors duration-200"
                            title="View on IMDB"
                          >
                            <i className="fa fa-external-link" aria-hidden="true"></i>
                          </button>
                        )}
                      </div>
                      
                      {/* Quick Stats */}
                      <div className="flex flex-wrap gap-4 mb-6">
                        {movie.year && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-muted text-muted-foreground">
                            {formatYear(movie.year)}
                          </span>
                        )}
                        {movie.runtime && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-muted text-muted-foreground">
                            {formatRuntime(movie.runtime)}
                          </span>
                        )}
                        {movie.rating && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-secondary text-secondary-foreground">
                            {movie.rating}
                          </span>
                        )}
                        {movie.imdb_rating && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-accent/20 text-accent-foreground">
                            {formatIMDBRating(movie.imdb_rating)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Plot */}
                    {getOMDBField(movie.metadata, 'Plot') && (
                      <div className="bg-muted rounded-xl p-6 border border-border">
                        <h3 className="text-lg font-semibold text-foreground mb-3">Synopsis</h3>
                        <p className="text-muted-foreground leading-relaxed">{getOMDBField(movie.metadata, 'Plot')}</p>
                      </div>
                    )}

                    {/* Movie Details Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Left Column */}
                      <div className="space-y-4">
                        {(credits.director?.length || movie.director) && (
                          <div className="bg-card rounded-lg p-4 border border-border shadow-sm">
                            <div className="text-sm font-medium text-muted-foreground mb-1">Director</div>
                            <div className="text-foreground font-medium">
                              {credits.director?.length ? <CreditLinks people={credits.director} /> : movie.director}
                            </div>
                          </div>
                        )}

                        {(credits.writer?.length || getOMDBField(movie.metadata, 'Writer')) && (
                          <div className="bg-card rounded-lg p-4 border border-border shadow-sm">
                            <div className="text-sm font-medium text-muted-foreground mb-1">Writer</div>
                            <div className="text-foreground font-medium">
                              {credits.writer?.length ? <CreditLinks people={credits.writer} /> : getOMDBField(movie.metadata, 'Writer')}
                            </div>
                          </div>
                        )}
                        
                        {movie.genre && (
                          <div className="bg-card rounded-lg p-4 border border-border shadow-sm">
                            <div className="text-sm font-medium text-muted-foreground mb-1">Genre</div>
                            <div className="text-foreground font-medium">{movie.genre}</div>
                          </div>
                        )}
                        
                        {getOMDBField(movie.metadata, 'Released') && (
                          <div className="bg-card rounded-lg p-4 border border-border shadow-sm">
                            <div className="text-sm font-medium text-muted-foreground mb-1">Release Date</div>
                            <div className="text-foreground font-medium">{getOMDBField(movie.metadata, 'Released')}</div>
                          </div>
                        )}
                      </div>

                      {/* Right Column */}
                      <div className="space-y-4">
                        {movie.language && (
                          <div className="bg-card rounded-lg p-4 border border-border shadow-sm">
                            <div className="text-sm font-medium text-muted-foreground mb-1">Language</div>
                            <div className="text-foreground font-medium">{movie.language}</div>
                          </div>
                        )}
                        
                        {movie.country && (
                          <div className="bg-card rounded-lg p-4 border border-border shadow-sm">
                            <div className="text-sm font-medium text-muted-foreground mb-1">Country</div>
                            <div className="text-foreground font-medium">{movie.country}</div>
                          </div>
                        )}
                        
                        {getOMDBField(movie.metadata, 'Awards') && (
                          <div className="bg-card rounded-lg p-4 border border-border shadow-sm">
                            <div className="text-sm font-medium text-muted-foreground mb-1">Awards</div>
                            <div className="text-foreground font-medium">{getOMDBField(movie.metadata, 'Awards')}</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Cast */}
                    {(credits.actor?.length || getOMDBField(movie.metadata, 'Actors')) && (
                      <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
                        <h3 className="text-lg font-semibold text-foreground mb-3">Cast</h3>
                        <p className="text-muted-foreground">
                          {credits.actor?.length ? <CreditLinks people={credits.actor} /> : getOMDBField(movie.metadata, 'Actors')}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MovieInfo 