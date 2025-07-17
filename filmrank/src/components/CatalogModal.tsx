import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface Movie {
  id: string;
  title: string;
  url?: string | null;
}

interface CatalogModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  selectedMovies: string[];
  setSelectedMovies: (ids: string[]) => void;
}

const FALLBACK_IMAGE = 'https://via.placeholder.com/300x445.png?text=No+Image';

export default function CatalogModal({ open, onClose, onSubmit, selectedMovies, setSelectedMovies }: CatalogModalProps) {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from('movies')
      .select('id, title, url')
      .limit(10)
      .then(({ data, error }) => {
        if (!error && data) setMovies(data);
        setLoading(false);
      });
  }, [open]);

  const toggleMovie = (id: string) => {
    setSelectedMovies(selectedMovies.includes(id)
      ? selectedMovies.filter(mid => mid !== id)
      : [...selectedMovies, id]
    );
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-10 max-w-4xl w-full relative">
        <button className="absolute top-2 right-2 text-gray-400 hover:text-gray-600" onClick={onClose}>&times;</button>
        <h2 className="text-2xl font-bold mb-4">Select Movies You've Watched</h2>
        {loading ? (
          <div className="text-gray-500 text-center py-8">Loading movies...</div>
        ) : movies.length === 0 ? (
          <div className="text-gray-500 text-center py-8">No movies found.</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6 max-h-[400px] overflow-y-auto">
            {movies.map(movie => {
              const selected = selectedMovies.includes(movie.id);
              return (
                <div key={movie.id} className="flex justify-center items-center">
                  <div
                    onClick={() => toggleMovie(movie.id)}
                    className={`relative w-[110px] h-[160px] rounded-2xl overflow-hidden shadow-lg transition-all duration-200 ease-in-out cursor-pointer hover:scale-105 hover:shadow-2xl ${selected ? 'ring-4 ring-blue-500 scale-105' : ''}`}
                  >
                    <img
                      src={movie.url || FALLBACK_IMAGE}
                      alt={movie.title}
                      className="w-full h-full object-cover bg-gray-200"
                      onError={e => (e.currentTarget.src = FALLBACK_IMAGE)}
                    />
                    <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/80 to-transparent px-3 py-2 flex items-end">
                      <h2 className="text-base font-bold text-white drop-shadow-md truncate w-full" title={movie.title}>
                        {movie.title}
                      </h2>
                    </div>
                    {selected && (
                      <div className="absolute inset-0 bg-blue-500/10 pointer-events-none rounded-2xl border-4 border-blue-500 animate-pulse" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex justify-end mt-6 gap-4">
          <button onClick={onClose} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-700">Cancel</button>
          <button onClick={onSubmit} className="px-6 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium">Submit</button>
        </div>
      </div>
    </div>
  );
} 