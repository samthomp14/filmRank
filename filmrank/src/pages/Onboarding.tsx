import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const GENRE_OPTIONS = [
  'Action', 'Comedy', 'Drama', 'Sci-Fi', 'Horror'
];

export default function Onboarding() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleGenreToggle = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');
      const { error } = await supabase
        .from('users')
        .update({
          name,
          preferences: { genres: selectedGenres },
          onboarding_complete: true
        })
        .eq('id', user.id);
      if (error) throw error;
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to save onboarding info');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center bg-gray-50 px-4 my-8">
      <div className="w-full max-w-lg mx-auto bg-white rounded-xl shadow-md overflow-hidden">
        <div className="p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4 text-center">Welcome to FilmRank!</h1>
          <p className="text-lg text-gray-600 mb-8 text-center">
            Let's get you set up. Fill out your profile and import your movie library to get started.
          </p>
          <form className="space-y-8" onSubmit={handleSubmit}>
            {/* Name Field */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Display Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your name"
                autoComplete="name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>

            {/* Preferences (example: favorite genres) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Favorite Genres
              </label>
              <div className="flex flex-wrap gap-2">
                {GENRE_OPTIONS.map((genre) => (
                  <button
                    key={genre}
                    type="button"
                    className={`px-3 py-1 rounded-full border text-blue-600 bg-white focus:outline-none transition-colors ${selectedGenres.includes(genre) ? 'bg-blue-600 text-white border-blue-600' : 'border-blue-600 hover:bg-blue-50'}`}
                    onClick={() => handleGenreToggle(genre)}
                    aria-pressed={selectedGenres.includes(genre)}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>

            {/* File Upload Area (Letterboxd CSV) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Import Movies from Letterboxd
              </label>
              <div className="bg-gray-50 rounded-lg p-4 flex flex-col items-center">
                <label className="w-full flex flex-col items-center px-4 py-6 bg-white text-blue-600 rounded-lg border-2 border-blue-600 border-dashed cursor-pointer hover:bg-blue-50">
                  <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span className="text-sm font-medium">Click to upload CSV</span>
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                  />
                </label>
                {selectedFile && (
                  <div className="mt-2 text-sm text-gray-700">Selected: {selectedFile.name}</div>
                )}
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Export your movies from Letterboxd and upload the CSV file here.<br />
                  <a
                    href="https://letterboxd.com/settings/data/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700"
                  >
                    Get your Letterboxd export
                  </a>
                </p>
              </div>
            </div>

            {/* Continue and Skip Buttons */}
            <div className="flex items-center justify-end gap-6 pt-2">
              <button
                type="button"
                className="text-gray-400 hover:text-blue-600 font-medium bg-transparent border-none shadow-none p-0 focus:outline-none"
                style={{ boxShadow: 'none', background: 'none' }}
                onClick={() => navigate('/dashboard')}
                tabIndex={0}
                disabled={loading}
              >
                Skip
              </button>
              <button
                type="submit"
                className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                style={{ minWidth: '120px' }}
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Continue'}
              </button>
            </div>
            {error && <div className="text-red-600 text-center mt-2">{error}</div>}
          </form>
        </div>
      </div>
    </div>
  );
} 