import { useEffect, useState, useRef} from 'react'
import { supabase } from '../lib/supabaseClient'
import RangeFilter from '../components/RangeFilter'
import MultiSelectFilter from '../components/MultiSelectFilter'
import { formatRuntime } from '../lib/movieUtils'
import { formatIMDBRating } from '../lib/movieUtils'
import { Link, useNavigate } from 'react-router-dom'
import type { Tables } from '../types/supabase';

type MovieRow = Tables<'movies'>;
interface MovieWithElo extends MovieRow {
  elo_score: number;
}

interface FilterState {
  searchTerm: string;
  yearRange: { min: number; max: number };
  runtimeRange: { min: number; max: number };
  imdbRatingRange: { min: number; max: number };
  selectedRatings: string[];
  selectedGenres: string[];
  selectedDirectors: string[];
  selectedLanguages: string[];
  selectedCountries: string[];
}

interface FilterSectionProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  hasActiveFilters?: boolean;
}

const FilterSection: React.FC<FilterSectionProps> = ({ title, isExpanded, onToggle, children, hasActiveFilters = false }) => {
  return (
    <div className="border border-gray-200 rounded-lg">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between text-left bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors duration-150"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{title}</span>
          {hasActiveFilters && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              Active
            </span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isExpanded && (
        <div className="p-4 border-t border-gray-200">
          {children}
        </div>
      )}
    </div>
  )
}

export default function MyMovies() {
  // Remove movies, setMovies, loading, setLoading, error, setError, fetchMovies
  const [movies, setMovies] = useState<MovieWithElo[]>([])
  const [filteredMovies, setFilteredMovies] = useState<MovieWithElo[]>([])
  const [movieToDelete, setMovieToDelete] = useState<MovieWithElo | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  
  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    searchTerm: '',
    yearRange: { min: 1900, max: new Date().getFullYear() },
    runtimeRange: { min: 0, max: 300 },
    imdbRatingRange: { min: 0, max: 10 },
    selectedRatings: [],
    selectedGenres: [],
    selectedDirectors: [],
    selectedLanguages: [],
    selectedCountries: []
  })

  // Expanded sections state
  const [expandedSections, setExpandedSections] = useState({
    yearRange: false,
    runtimeRange: false,
    imdbRatingRange: false,
    ratings: false,
    genres: false,
    directors: false,
    languages: false,
    countries: false,
    complexFilters: false
  })

  // Available filter options (populated from movies data)
  const [filterOptions, setFilterOptions] = useState({
    ratings: [] as string[],
    genres: [] as string[],
    directors: [] as string[],
    languages: [] as string[],
    countries: [] as string[]
  })

  // Change sortOption to only track field and direction
  const [sortOption, setSortOption] = useState<{ field: string; direction: 'asc' | 'desc' }>({ field: 'title', direction: 'asc' })

  // Fetch all user movies on mount
  useEffect(() => {
    let isMounted = true;
    async function fetchMovies() {
      setIsLoading(true);
      setError(null);
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) throw new Error('No user found');
        const { data, error: moviesError } = await supabase
          .from('user_movies')
          .select(`elo_score, movies:movies!user_movies_movie_id_fkey (
            id, title, year, runtime, rating, genre, director, language, country, imdb_rating, url
          )`)
          .eq('user_id', user.id);
        if (moviesError) throw moviesError;
        const movies: MovieWithElo[] = (data || []).map((m: any) => ({
          ...m.movies,
          elo_score: m.elo_score,
        }));
        if (isMounted) setMovies(movies);
      } catch (err: any) {
        if (isMounted) setError(err instanceof Error ? err : new Error('Failed to fetch movies'));
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    fetchMovies();
    return () => { isMounted = false; };
  }, []);

  // Remove infinite scroll logic
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Extract filter options from movies data
    const ratings = [...new Set(movies.map(m => m.rating).filter((r): r is string => !!r))].sort();
    const genres = [...new Set(movies.flatMap(m => m.genre?.split(', ') || []).filter((g): g is string => !!g))].sort();
    const directors = [...new Set(movies.map(m => m.director).filter((d): d is string => !!d))].sort();
    const languages = [...new Set(movies.flatMap(m => m.language?.split(', ') || []).filter((l): l is string => !!l))].sort();
    const countries = [...new Set(movies.flatMap(m => m.country?.split(', ') || []).filter((c): c is string => !!c))].sort();
    setFilterOptions({ ratings, genres, directors, languages, countries })
  }, [movies])

  useEffect(() => {
    // Filter movies based on all filters
    const filtered = movies.filter(movie => {
      // Search term filter
      if (filters.searchTerm && !movie.title.toLowerCase().includes(filters.searchTerm.toLowerCase())) {
        return false
      }
      
      // Year range filter
      if (movie.year && (movie.year < filters.yearRange.min || movie.year > filters.yearRange.max)) {
        return false
      }
      
      // Runtime range filter
      if (movie.runtime && (movie.runtime < filters.runtimeRange.min || movie.runtime > filters.runtimeRange.max)) {
        return false
      }
      
      // IMDB rating range filter
      if (movie.imdb_rating && (movie.imdb_rating < filters.imdbRatingRange.min || movie.imdb_rating > filters.imdbRatingRange.max)) {
        return false
      }
      
      // Rating filter
      if (filters.selectedRatings.length > 0 && movie.rating && !filters.selectedRatings.includes(movie.rating)) {
        return false
      }
      
      // Genre filter
      if (filters.selectedGenres.length > 0 && movie.genre) {
        const movieGenres = movie.genre.split(', ').map(g => g.trim())
        if (!filters.selectedGenres.some(selected => movieGenres.includes(selected))) {
          return false
        }
      }
      
      // Director filter
      if (filters.selectedDirectors.length > 0 && movie.director && !filters.selectedDirectors.includes(movie.director)) {
        return false
      }
      
      // Language filter
      if (filters.selectedLanguages.length > 0 && movie.language) {
        const movieLanguages = movie.language.split(', ').map(l => l.trim())
        if (!filters.selectedLanguages.some(selected => movieLanguages.includes(selected))) {
          return false
        }
      }
      
      // Country filter
      if (filters.selectedCountries.length > 0 && movie.country) {
        const movieCountries = movie.country.split(', ').map(c => c.trim())
        if (!filters.selectedCountries.some(selected => movieCountries.includes(selected))) {
          return false
        }
      }
      
      return true
    })
    setFilteredMovies(filtered)
  }, [filters, movies])

  // Helper: sort movies
  const sortMovies = (movies: MovieWithElo[]) => {
    const { field, direction } = sortOption
    const sorted = [...movies].sort((a, b) => {
      let aValue: any = a[field as keyof MovieWithElo]
      let bValue: any = b[field as keyof MovieWithElo]
      // For title, compare as string
      if (field === 'title') {
        aValue = aValue ? aValue.toLowerCase() : ''
        bValue = bValue ? bValue.toLowerCase() : ''
        if (aValue < bValue) return direction === 'asc' ? -1 : 1
        if (aValue > bValue) return direction === 'asc' ? 1 : -1
        return 0
      }
      // For numbers (year, imdb_rating, runtime, elo_score)
      aValue = aValue ?? -Infinity
      bValue = bValue ?? -Infinity
      if (aValue < bValue) return direction === 'asc' ? -1 : 1
      if (aValue > bValue) return direction === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }

  // Apply sort to filteredMovies
  const sortedMovies = sortMovies(filteredMovies)

  // Remove fetchMovies, loading, setLoading, setMovies, setError, error state
  
  const handleDelete = async (movie: MovieWithElo) => {
    try {

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')
        
      const { error } = await supabase
        .from('user_movies')
        .delete()
        .eq('user_id', user.id)
        .eq('movie_id', movie.id)

      if (error) throw error

      // setMovies(movies.filter(m => m.id !== movie.id)) // This line is no longer needed
      setMovieToDelete(null)
    } catch (err) {
      // setError(err instanceof Error ? err.message : 'Failed to delete movie') // This line is no longer needed
    }
  }

  // Helper to get active filter tags
  const getActiveFilterTags = () => {
    const tags: { key: string, label: string, value: string, color: string }[] = [];
    
    if (filters.searchTerm) tags.push({ 
      key: 'searchTerm', 
      label: 'Title', 
      value: filters.searchTerm,
      color: 'bg-purple-100 text-purple-800'
    })
    
    if (filters.yearRange.min !== 1900 || filters.yearRange.max !== new Date().getFullYear()) {
      tags.push({ 
        key: 'yearRange', 
        label: 'Year', 
        value: `${filters.yearRange.min} - ${filters.yearRange.max}`,
        color: 'bg-blue-100 text-blue-800'
      })
    }
    
    if (filters.runtimeRange.min !== 0 || filters.runtimeRange.max !== 300) {
      tags.push({ 
        key: 'runtimeRange', 
        label: 'Runtime', 
        value: `${filters.runtimeRange.min} - ${filters.runtimeRange.max} min`,
        color: 'bg-green-100 text-green-800'
      })
    }
    
    if (filters.imdbRatingRange.min !== 0 || filters.imdbRatingRange.max !== 10) {
      tags.push({ 
        key: 'imdbRatingRange', 
        label: 'IMDB', 
        value: `${filters.imdbRatingRange.min} - ${filters.imdbRatingRange.max}`,
        color: 'bg-yellow-100 text-yellow-800'
      })
    }
    
    if (filters.selectedRatings.length > 0) {
      tags.push({ 
        key: 'ratings', 
        label: 'Rating', 
        value: filters.selectedRatings.join(', '),
        color: 'bg-red-100 text-red-800'
      })
    }
    
    if (filters.selectedGenres.length > 0) {
      tags.push({ 
        key: 'genres', 
        label: 'Genre', 
        value: filters.selectedGenres.join(', '),
        color: 'bg-indigo-100 text-indigo-800'
      })
    }
    
    if (filters.selectedDirectors.length > 0) {
      tags.push({ 
        key: 'directors', 
        label: 'Director', 
        value: filters.selectedDirectors.join(', '),
        color: 'bg-pink-100 text-pink-800'
      })
    }
    
    if (filters.selectedLanguages.length > 0) {
      tags.push({ 
        key: 'languages', 
        label: 'Language', 
        value: filters.selectedLanguages.join(', '),
        color: 'bg-orange-100 text-orange-800'
      })
    }
    
    if (filters.selectedCountries.length > 0) {
      tags.push({ 
        key: 'countries', 
        label: 'Country', 
        value: filters.selectedCountries.join(', '),
        color: 'bg-teal-100 text-teal-800'
      })
    }
    
    return tags
  }

  const activeTags = getActiveFilterTags()

  const handleRemoveTag = (tag: { key: string, label: string, value: string, color: string }) => {
    if (tag.key === 'searchTerm') setFilters(prev => ({ ...prev, searchTerm: '' }))
    else if (tag.key === 'yearRange') setFilters(prev => ({ ...prev, yearRange: { min: 1900, max: new Date().getFullYear() } }))
    else if (tag.key === 'runtimeRange') setFilters(prev => ({ ...prev, runtimeRange: { min: 0, max: 300 } }))
    else if (tag.key === 'imdbRatingRange') setFilters(prev => ({ ...prev, imdbRatingRange: { min: 0, max: 10 } }))
    else if (tag.key === 'ratings') setFilters(prev => ({ ...prev, selectedRatings: [] }))
    else if (tag.key === 'genres') setFilters(prev => ({ ...prev, selectedGenres: [] }))
    else if (tag.key === 'directors') setFilters(prev => ({ ...prev, selectedDirectors: [] }))
    else if (tag.key === 'languages') setFilters(prev => ({ ...prev, selectedLanguages: [] }))
    else if (tag.key === 'countries') setFilters(prev => ({ ...prev, selectedCountries: [] }))
  }

  // Grid view movie card component
  const GridMovieCard = ({ movie }: { movie: MovieWithElo }) => {
    const FALLBACK_IMAGE = '/no_poster_placeholder.png'
    const navigate = useNavigate();
    if (!movie) return null; // null check for missing movie data
    const handleCardClick = (e: React.MouseEvent) => {
      // Only navigate if the click is not on the delete button
      if ((e.target as HTMLElement).closest('button')) return;
      navigate(`/movie/${movie.id}`);
    };

    return (
      <div onClick={handleCardClick} className="relative group block focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg cursor-pointer">
        <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-all duration-200 ease-in-out">
          <img
            src={movie.url || FALLBACK_IMAGE}
            alt={movie.title}
            className="w-full h-full object-cover bg-gray-200 pointer-events-none"
            onError={(e) => {
              e.currentTarget.src = FALLBACK_IMAGE
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
          {/* Delete button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMovieToDelete(movie);
            }}
            className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 z-10 pointer-events-auto"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Title and year */}
        <div className="mt-2">
          <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate" title={movie.title}>
            {movie.title}
          </h3>
          {movie.year && (
            <p className="text-gray-500 text-xs mt-1">{movie.year}</p>
          )}
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600 text-lg">Loading movies...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-600 text-lg">{error.message || error.toString()}</div>
      </div>
    )
  }

  return (
    <div className="py-6 px-2 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto transition-all duration-300 ease-in-out">
        <div className="flex flex-col lg:flex-row gap-6 transition-all duration-300 ease-in-out">
          {/* Filter Sidebar - Desktop Only */}
            {showFilters && (
            <div className="hidden lg:block w-96">
              <div className="w-96 bg-white rounded-xl shadow-md border border-gray-200 mt-16">
                <div className="flex flex-col">
                  {/* Header */}
                  <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">Filters</h3>
                    <button
                      onClick={() => setShowFilters(false)}
                      className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 rounded-lg p-1"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  {/* Filter Content */}
                  <div className="p-4 space-y-6">
                    {/* Basic Filters - Always Visible */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-medium text-gray-700">Basic Filters</h4>
                      {/* Year Range */}
                      <RangeFilter
                        label="Year Range"
                        min={filters.yearRange.min}
                        max={filters.yearRange.max}
                        onRangeChange={(min, max) => setFilters(prev => ({
                          ...prev,
                          yearRange: { min, max }
                        }))}
                        defaultValue={{ min: 1900, max: new Date().getFullYear() }}
                      />
                      {/* Runtime Range */}
                      <RangeFilter
                        label="Runtime (minutes)"
                        min={filters.runtimeRange.min}
                        max={filters.runtimeRange.max}
                        onRangeChange={(min, max) => setFilters(prev => ({
                          ...prev,
                          runtimeRange: { min, max }
                        }))}
                        defaultValue={{ min: 0, max: 300 }}
                      />
                      {/* IMDB Rating Range */}
                      <RangeFilter
                        label="IMDB Rating"
                        min={filters.imdbRatingRange.min}
                        max={filters.imdbRatingRange.max}
                        onRangeChange={(min, max) => setFilters(prev => ({
                          ...prev,
                          imdbRatingRange: { min, max }
                        }))}
                        step={0.1}
                        defaultValue={{ min: 0, max: 10 }}
                      />
                    </div>
                    {/* Complex Filters - Collapsible */}
                    <FilterSection
                      title="Complex Filters"
                      isExpanded={expandedSections.complexFilters}
                      onToggle={() => setExpandedSections(prev => ({ ...prev, complexFilters: !prev.complexFilters }))}
                      hasActiveFilters={
                        filters.selectedRatings.length > 0 ||
                        filters.selectedGenres.length > 0 ||
                        filters.selectedDirectors.length > 0 ||
                        filters.selectedLanguages.length > 0 ||
                        filters.selectedCountries.length > 0
                      }
                    >
                      <div className="space-y-4">
                        {/* Rating Filter */}
                        <MultiSelectFilter
                          label="Rating"
                          options={filterOptions.ratings}
                          selectedOptions={filters.selectedRatings}
                          onSelectionChange={(selectedRatings) => setFilters(prev => ({
                            ...prev,
                            selectedRatings
                          }))}
                          placeholder="Select ratings..."
                        />
                        {/* Genre Filter */}
                        <MultiSelectFilter
                          label="Genre"
                          options={filterOptions.genres}
                          selectedOptions={filters.selectedGenres}
                          onSelectionChange={(selectedGenres) => setFilters(prev => ({
                            ...prev,
                            selectedGenres
                          }))}
                          placeholder="Select genres..."
                        />
                        {/* Director Filter */}
                        <MultiSelectFilter
                          label="Director"
                          options={filterOptions.directors}
                          selectedOptions={filters.selectedDirectors}
                          onSelectionChange={(selectedDirectors) => setFilters(prev => ({
                            ...prev,
                            selectedDirectors
                          }))}
                          placeholder="Select directors..."
                        />
                        {/* Language Filter */}
                        <MultiSelectFilter
                          label="Language"
                          options={filterOptions.languages}
                          selectedOptions={filters.selectedLanguages}
                          onSelectionChange={(selectedLanguages) => setFilters(prev => ({
                            ...prev,
                            selectedLanguages
                          }))}
                          placeholder="Select languages..."
                        />
                        {/* Country Filter */}
                        <MultiSelectFilter
                          label="Country"
                          options={filterOptions.countries}
                          selectedOptions={filters.selectedCountries}
                          onSelectionChange={(selectedCountries) => setFilters(prev => ({
                            ...prev,
                            selectedCountries
                          }))}
                          placeholder="Select countries..."
                        />
                      </div>
                    </FilterSection>
                  </div>
                  {/* Footer */}
                  <div className="p-4 border-t border-gray-200">
                    <button
                      onClick={() => setFilters({
                        searchTerm: '',
                        yearRange: { min: 1900, max: new Date().getFullYear() },
                        runtimeRange: { min: 0, max: 300 },
                        imdbRatingRange: { min: 0, max: 10 },
                        selectedRatings: [],
                        selectedGenres: [],
                        selectedDirectors: [],
                        selectedLanguages: [],
                        selectedCountries: []
                      })}
                      className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                    >
                      Clear All Filters
                    </button>
                  </div>
                </div>
              </div>
          </div>
          )}
          {/* Main Content */}
          <div className={`flex-1 transition-[margin,max-width] duration-300 ${!showFilters ? 'mx-auto max-w-3xl' : ''}`}> 
            <div className="px-2 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">My Library</h1>
            {/* Search and Filter Bar */}
            {movies.length > 0 && (
              <div className="mb-6 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Search movies by title..."
                      value={filters.searchTerm}
                      onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                      className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  {/* View Toggle */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setViewMode('list')}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                        viewMode === 'list'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                        viewMode === 'grid'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                      </svg>
                    </button>
                  </div>
                  {/* Sort Dropdown and Toggle */}
                  <div className="flex items-center gap-2">
                    <label htmlFor="sort" className="text-sm text-gray-700">Sort by:</label>
                    <select
                      id="sort"
                      value={sortOption.field}
                      onChange={e => setSortOption(opt => ({ ...opt, field: e.target.value }))}
                      className="px-2 py-1 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="title">Title</option>
                      <option value="year">Year</option>
                      <option value="imdb_rating">IMDB Rating</option>
                      <option value="runtime">Runtime</option>
                      <option value="elo_score">ELO Score</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setSortOption(opt => ({ ...opt, direction: opt.direction === 'asc' ? 'desc' : 'asc' }))}
                      className="p-2 rounded border border-gray-300 bg-white hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      title={`Sort ${sortOption.direction === 'asc' ? 'Descending' : 'Ascending'}`}
                    >
                      {sortOption.direction === 'asc' ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" /></svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                      )}
                    </button>
                  </div>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z" />
                    </svg>
                    Filters
                  </button>
                </div>
                </div>
              )}
              {/* Filter Panel - Mobile Only, rendered after Filters button */}
              {showFilters && (
                <div className="lg:hidden w-full bg-white rounded-xl shadow-md border border-gray-200 mt-4 mb-4">
                  <div className="flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-200">
                      <h3 className="text-lg font-medium text-gray-900">Filters</h3>
                      <button
                        onClick={() => setShowFilters(false)}
                        className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 rounded-lg p-1"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    {/* Filter Content */}
                    <div className="p-4 space-y-6">
                      {/* Basic Filters - Always Visible */}
                      <div className="space-y-4">
                        <h4 className="text-sm font-medium text-gray-700">Basic Filters</h4>
                        {/* Year Range */}
                        <RangeFilter
                          label="Year Range"
                          min={filters.yearRange.min}
                          max={filters.yearRange.max}
                          onRangeChange={(min, max) => setFilters(prev => ({
                            ...prev,
                            yearRange: { min, max }
                          }))}
                          defaultValue={{ min: 1900, max: new Date().getFullYear() }}
                        />
                        {/* Runtime Range */}
                        <RangeFilter
                          label="Runtime (minutes)"
                          min={filters.runtimeRange.min}
                          max={filters.runtimeRange.max}
                          onRangeChange={(min, max) => setFilters(prev => ({
                            ...prev,
                            runtimeRange: { min, max }
                          }))}
                          defaultValue={{ min: 0, max: 300 }}
                        />
                        {/* IMDB Rating Range */}
                        <RangeFilter
                          label="IMDB Rating"
                          min={filters.imdbRatingRange.min}
                          max={filters.imdbRatingRange.max}
                          onRangeChange={(min, max) => setFilters(prev => ({
                            ...prev,
                            imdbRatingRange: { min, max }
                          }))}
                          step={0.1}
                          defaultValue={{ min: 0, max: 10 }}
                        />
                      </div>
                      {/* Complex Filters - Collapsible */}
                      <FilterSection
                        title="Complex Filters"
                        isExpanded={expandedSections.complexFilters}
                        onToggle={() => setExpandedSections(prev => ({ ...prev, complexFilters: !prev.complexFilters }))}
                        hasActiveFilters={
                          filters.selectedRatings.length > 0 ||
                          filters.selectedGenres.length > 0 ||
                          filters.selectedDirectors.length > 0 ||
                          filters.selectedLanguages.length > 0 ||
                          filters.selectedCountries.length > 0
                        }
                      >
                        <div className="space-y-4">
                          {/* Rating Filter */}
                          <MultiSelectFilter
                            label="Rating"
                            options={filterOptions.ratings}
                            selectedOptions={filters.selectedRatings}
                            onSelectionChange={(selectedRatings) => setFilters(prev => ({
                              ...prev,
                              selectedRatings
                            }))}
                            placeholder="Select ratings..."
                          />
                          {/* Genre Filter */}
                          <MultiSelectFilter
                            label="Genre"
                            options={filterOptions.genres}
                            selectedOptions={filters.selectedGenres}
                            onSelectionChange={(selectedGenres) => setFilters(prev => ({
                              ...prev,
                              selectedGenres
                            }))}
                            placeholder="Select genres..."
                          />
                          {/* Director Filter */}
                          <MultiSelectFilter
                            label="Director"
                            options={filterOptions.directors}
                            selectedOptions={filters.selectedDirectors}
                            onSelectionChange={(selectedDirectors) => setFilters(prev => ({
                              ...prev,
                              selectedDirectors
                            }))}
                            placeholder="Select directors..."
                          />
                          {/* Language Filter */}
                          <MultiSelectFilter
                            label="Language"
                            options={filterOptions.languages}
                            selectedOptions={filters.selectedLanguages}
                            onSelectionChange={(selectedLanguages) => setFilters(prev => ({
                              ...prev,
                              selectedLanguages
                            }))}
                            placeholder="Select languages..."
                          />
                          {/* Country Filter */}
                          <MultiSelectFilter
                            label="Country"
                            options={filterOptions.countries}
                            selectedOptions={filters.selectedCountries}
                            onSelectionChange={(selectedCountries) => setFilters(prev => ({
                              ...prev,
                              selectedCountries
                            }))}
                            placeholder="Select countries..."
                          />
                        </div>
                      </FilterSection>
                    </div>
                    {/* Footer */}
                    <div className="p-4 border-t border-gray-200">
                      <button
                        onClick={() => setFilters({
                          searchTerm: '',
                          yearRange: { min: 1900, max: new Date().getFullYear() },
                          runtimeRange: { min: 0, max: 300 },
                          imdbRatingRange: { min: 0, max: 10 },
                          selectedRatings: [],
                          selectedGenres: [],
                          selectedDirectors: [],
                          selectedLanguages: [],
                          selectedCountries: []
                        })}
                        className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                      >
                        Clear All Filters
                      </button>
                    </div>
                  </div>
              </div>
            )}
            </div>
              

            {/* Filter Tags/Chips */}
            {activeTags.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2 items-center">
                {activeTags.map(tag => (
                  <span key={tag.key} className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${tag.color}`}>
                    {tag.label}: {tag.value}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-2 text-blue-600 hover:text-blue-800 focus:outline-none"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
                <button
                  onClick={() => setFilters({
                    searchTerm: '',
                    yearRange: { min: 1900, max: new Date().getFullYear() },
                    runtimeRange: { min: 0, max: 300 },
                    imdbRatingRange: { min: 0, max: 10 },
                    selectedRatings: [],
                    selectedGenres: [],
                    selectedDirectors: [],
                    selectedLanguages: [],
                    selectedCountries: []
                  })}
                  className="ml-2 px-3 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 focus:outline-none"
                >
                  Clear All
                </button>
              </div>
            )}

            
            {movies.length === 0 ? (
              <div className="text-center text-gray-600">
                <p className="mb-4">You haven't added any movies yet.</p>
                <a
                  href="/add"
                  className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Add Your First Movie
                </a>
              </div>
            ) : filteredMovies.length === 0 && (filters.searchTerm || filters.selectedRatings.length > 0 || filters.selectedGenres.length > 0 || filters.selectedDirectors.length > 0 || filters.selectedLanguages.length > 0 || filters.selectedCountries.length > 0) ? (
              <div className="text-center text-gray-600">
                <p className="mb-4">No movies found matching your filters.</p>
                <button
                  onClick={() => setFilters({
                    searchTerm: '',
                    yearRange: { min: 1900, max: new Date().getFullYear() },
                    runtimeRange: { min: 0, max: 300 },
                    imdbRatingRange: { min: 0, max: 10 },
                    selectedRatings: [],
                    selectedGenres: [],
                    selectedDirectors: [],
                    selectedLanguages: [],
                    selectedCountries: []
                  })}
                  className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Clear All Filters
                </button>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 w-full px-2 sm:px-0">
                {sortedMovies.map((movie) => (
                  <GridMovieCard key={movie.id} movie={movie} />
                ))}
                <div ref={bottomRef} />
              </div>
            ) : (
              <div className="space-y-4 px-2 sm:px-0">
                {sortedMovies.map((movie) => (
                  <div key={movie.id} className="bg-white rounded-xl shadow hover:shadow-md transition duration-150 ease-in-out">
                    <Link to={`/movie/${movie.id}`} className="block rounded-xl p-6 focus:outline-none focus:ring-2 focus:ring-blue-500" state={{ from: 'my-movies' }}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h2 className="text-xl font-semibold text-gray-900 mb-2">{movie.title}</h2>
                          <div className="flex flex-wrap gap-2 text-sm text-gray-600">
                            {movie.year && (
                              <span className="bg-gray-200 px-2 py-1 rounded">{movie.year}</span>
                            )}
                            {movie.runtime && (
                              <span className="bg-gray-200 px-2 py-1 rounded">{formatRuntime(movie.runtime)}</span>
                            )}
                            {movie.rating && (
                              <span className="bg-gray-200 px-2 py-1 rounded">{movie.rating}</span>
                            )}
                            {movie.imdb_rating && (
                              <span className="bg-gray-200 px-2 py-1 rounded">{formatIMDBRating(movie.imdb_rating)}</span>
                            )}
                          </div>
                          {movie.genre && (
                            <p className="text-sm text-gray-500 mt-1">{movie.genre}</p>
                          )}
                          {movie.director && (
                            <p className="text-sm text-gray-500">Director: {movie.director}</p>
                          )}
                        </div>
                        <div className="flex items-center ml-4">
                          <button
                            onClick={e => {
                              e.preventDefault();
                              setMovieToDelete(movie);
                            }}
                            className="text-red-600 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 rounded-lg p-2"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </Link>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
        </div>
      </div>
    </div>

      {/* Delete Confirmation Modal */}
      {movieToDelete && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Delete Movie</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete "{movieToDelete.title}"? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => setMovieToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(movieToDelete)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 