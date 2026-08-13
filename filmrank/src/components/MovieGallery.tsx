import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Tables } from '../types/supabase';

interface MovieGalleryProps {
  userLibraryIds: string[];
  onAdd: (movie: Tables<'movies'>) => Promise<void>;
  hideAdded?: boolean;
  pageSize?: number;
}

const FALLBACK_IMAGE = '/no_poster_placeholder.png';

// Simple spinner component
const Spinner = () => (
  <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const MovieGallery: React.FC<MovieGalleryProps> = ({ userLibraryIds, onAdd, hideAdded = false, pageSize = 40 }) => {
  // Server-side data
  const [movies, setMovies] = useState<Tables<'movies'>[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search and pagination
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const moviesPerPage = pageSize;

  // Hide already added
  const [showOnlyUnadded, setShowOnlyUnadded] = useState(hideAdded);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(handler);
  }, [search]);

  // Reset page on search or toggle
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, showOnlyUnadded]);

  // Fetch movies from Supabase
  useEffect(() => {
    let isMounted = true;
    const fetchMovies = async () => {
      setIsLoading(true);
      setError(null);
      try {
        let query;
        if (showOnlyUnadded) {
          query = (supabase
            .from('movies_not_in_user_library') as any)
            .select('*', { count: 'exact' });
        } else {
          query = (supabase
            .from('movies') as any)
            .select('*', { count: 'exact' });
        }
        if (debouncedSearch.trim()) {
          const searchTerm = debouncedSearch.trim();
          query = query.or(`title.ilike.%${searchTerm}%,alt_title.ilike.%${searchTerm}%`);
        }
        // Pagination
        const from = page * moviesPerPage;
        const to = from + moviesPerPage - 1;
        query = query.range(from, to);
        const { data, count, error } = await query;
        if (!isMounted) return;
        if (error) {
          setError('Failed to fetch movies.');
          setMovies([]);
          setTotalCount(0);
        } else {
          setMovies((data || []) as Tables<'movies'>[]);
          setTotalCount(count || 0);
        }
      } catch (e) {
        if (isMounted) setError('Failed to fetch movies.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchMovies();
    return () => { isMounted = false; };
  }, [debouncedSearch, page, moviesPerPage, showOnlyUnadded]);

  // Filter out already added if needed
  const filteredMovies = movies;

  const totalPages = Math.max(1, Math.ceil(totalCount / moviesPerPage));

  // Heart click handler
  const [addingId, setAddingId] = useState<string | null>(null);
  const handleAdd = async (movie: Tables<'movies'>) => {
    setAddingId(movie.id);
    try {
      await onAdd(movie);
    } finally {
      setAddingId(null);
    }
  };

  // Tooltip state (single for the gallery)
  const [hoveredMovieId, setHoveredMovieId] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const tooltipTimer = useRef<NodeJS.Timeout | null>(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    };
  }, []);

  const gridRef = useRef<HTMLDivElement>(null);

  return (
    <div className="w-full flex flex-col items-center">
      <div className="w-full max-w-2xl flex flex-col sm:flex-row gap-2 mb-4 items-center">
        <input
          type="text"
          className="flex-1 px-4 py-2 rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary focus:border-primary"
          placeholder="Search movies by title..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex items-center gap-2 text-sm select-none">
          <span>Hide already added</span>
          <button
            type="button"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${showOnlyUnadded ? 'bg-primary' : 'bg-muted'}`}
            onClick={() => setShowOnlyUnadded(v => !v)}
            aria-pressed={showOnlyUnadded}
            aria-label="Toggle hide already added"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${showOnlyUnadded ? 'translate-x-5' : 'translate-x-1'}`}
            />
          </button>
        </div>
      </div>
      <div className="w-full max-w-5xl">
        {error ? (
          <div className="text-destructive text-center py-12">{error}</div>
        ) : (
          <div ref={gridRef} className="relative grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-x-3 gap-y-4 mb-6 min-h-[340px]">
            {filteredMovies.map(movie => {
              const alreadyAdded = userLibraryIds.includes(movie.id);
              const handleMouseEnter = () => {
                setHoveredMovieId(movie.id);
                tooltipTimer.current = setTimeout(() => setShowTooltip(true), 1000);
              };
              const handleMouseMove = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
                setTooltipPos({
                  left: e.clientX,
                  top: e.clientY,
                });
              };
              const handleMouseLeave = () => {
                setShowTooltip(false);
                setHoveredMovieId(null);
                if (tooltipTimer.current) {
                  clearTimeout(tooltipTimer.current);
                  tooltipTimer.current = null;
                }
              };
              return (
                <div key={movie.id} className="flex justify-center items-center">
                  <div
                    className={`relative aspect-[2/3] w-[120px] rounded-lg overflow-hidden shadow transition-all duration-200 ease-in-out cursor-pointer group bg-card`}
                    onMouseEnter={handleMouseEnter}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                  >
                    <img
                      src={!movie.url || movie.url === 'N/A' ? FALLBACK_IMAGE : movie.url}
                      alt={movie.title}
                      className="w-full h-full object-cover bg-muted"
                      onError={e => { if (e.currentTarget.src !== window.location.origin + FALLBACK_IMAGE) e.currentTarget.src = FALLBACK_IMAGE; }}
                    />
                    {/* Heart icon only on hover */}
                    <button
                      className={`absolute bottom-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${alreadyAdded ? 'text-red-500' : 'text-muted-foreground hover:text-red-500'} ${alreadyAdded ? 'pointer-events-none' : ''}`}
                      disabled={alreadyAdded || addingId === movie.id}
                      title={alreadyAdded ? 'Already in your library' : 'Add to library'}
                      onClick={() => handleAdd(movie)}
                      tabIndex={-1}
                    >
                      <svg
                        className={`w-6 h-6 ${alreadyAdded ? 'fill-red-500' : 'fill-none'} stroke-red-500`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 21C12 21 4 13.5 4 8.5C4 5.42 6.42 3 9.5 3C11.24 3 12.91 3.81 14 5.08C15.09 3.81 16.76 3 18.5 3C21.58 3 24 5.42 24 8.5C24 13.5 16 21 16 21H12Z" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
            {/* Tooltip for title and year (single, positioned at mouse) */}
            {showTooltip && hoveredMovieId && (() => {
              const movie = filteredMovies.find(m => m.id === hoveredMovieId);
              if (!movie) return null;
              return (
                <div
                  className="fixed z-50 px-2 py-1 bg-black/80 text-white text-xs rounded shadow-lg pointer-events-none"
                  style={{
                    left: tooltipPos.left + 12,
                    top: tooltipPos.top - 8,
                    transform: 'translateY(-100%)',
                    whiteSpace: 'pre-line',
                  }}
                >
                  {movie.title}{movie.year ? ` (${movie.year})` : ''}
                </div>
              );
            })()}
            {/* Overlay spinner while loading */}
            {isLoading && movies.length > 0 && <Spinner />}
          </div>
        )}
        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mb-4">
            <button
              className="px-3 py-1 rounded bg-secondary text-foreground hover:bg-secondary/80 disabled:opacity-50"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Previous
            </button>
            <button
              className="px-3 py-1 rounded bg-secondary text-foreground hover:bg-secondary/80 disabled:opacity-50"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MovieGallery; 