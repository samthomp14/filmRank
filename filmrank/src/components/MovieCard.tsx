import React from 'react'
import { Info } from 'lucide-react'

interface CompareMovie {
  movie_id: string;
  title: string;
  imdb_id: string | null;
  elo_score: number;
  match_count: number;
  url: string | null;
}

interface MovieCardProps {
  movie: CompareMovie;
  onClick: () => void;
  selected: boolean;
  className?: string;
  onInfoClick?: () => void;
}

const FALLBACK_IMAGE =
  'https://via.placeholder.com/300x445.png?text=No+Image';

const MovieCard: React.FC<MovieCardProps> = ({ movie, onClick, selected, className, onInfoClick }) => {
  return (
    <div
      onClick={onClick}
      className={`relative aspect-[2/3] rounded-2xl overflow-hidden shadow-lg transition-all duration-200 ease-in-out cursor-pointer border border-border hover:scale-105 hover:shadow-2xl ${
        selected ? 'ring-4 ring-primary scale-105' : ''
      } ${className || ''}`}
    >
      <img
        src={movie.url || FALLBACK_IMAGE}
        alt={movie.title}
        className="w-full h-full object-cover bg-muted"
        onError={e => (e.currentTarget.src = FALLBACK_IMAGE)}
      />
      {onInfoClick && (
        <button
          onClick={e => {
            e.stopPropagation()
            onInfoClick()
          }}
          className="absolute top-2 right-2 z-10 rounded-full bg-black/50 p-1.5 text-white/80 transition-colors duration-150 hover:bg-black/70 hover:text-white"
          title="View movie details"
          aria-label="View movie details"
        >
          <Info className="h-4 w-4" strokeWidth={2} />
        </button>
      )}
      <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/80 to-transparent px-4 py-3 flex items-end">
        <h2 className="text-lg font-bold text-white drop-shadow-md truncate w-full" title={movie.title}>
          {movie.title}
        </h2>
      </div>
      {selected && (
        <div className="absolute inset-0 bg-primary/10 pointer-events-none rounded-2xl border-4 border-primary animate-pulse" />
      )}
    </div>
  )
}

export default MovieCard