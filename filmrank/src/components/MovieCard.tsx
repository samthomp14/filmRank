import React from 'react'

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
}

const FALLBACK_IMAGE =
  'https://via.placeholder.com/300x445.png?text=No+Image';

const MovieCard: React.FC<MovieCardProps> = ({ movie, onClick, selected, className }) => {
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