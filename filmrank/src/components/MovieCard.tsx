import React from 'react'

interface CompareMovie {
  movie_id: string;
  title: string;
  imdb_id: string | null;
  elo_score: number;
  match_count: number;
  url: string;
}

interface MovieCardProps {
  movie: CompareMovie;
  onClick: () => void;
  selected: boolean;
}

const MovieCard: React.FC<MovieCardProps> = ({ movie, onClick, selected }) => {
  return (
    <div
      onClick={onClick}
      className={`w-full md:w-1/2 bg-white rounded-xl shadow-md overflow-hidden transition-all duration-150 ease-in-out cursor-pointer transform hover:-translate-y-1 ${
        selected ? 'ring-4 ring-blue-500 scale-105' : 'hover:shadow-lg'
      }`}
    >
      <div className="p-8 flex flex-col items-center">
        {movie.url && (
          <img
            src={movie.url}
            alt={movie.title}
            className="mb-4 w-40 h-60 object-cover rounded-lg shadow"
          />
        )}
        <h2 className="text-2xl font-semibold text-gray-900 text-center">{movie.title}</h2>
      </div>
    </div>
  )
}

export default MovieCard 