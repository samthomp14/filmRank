import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useInfiniteQuery } from '../hooks/use-infinite-query';
import type { Tables } from '../types/supabase';

const GENRE_OPTIONS = [
  'Action', 'Comedy', 'Drama', 'Sci-Fi', 'Horror'
];

function ProfileStep({ name, setName, selectedGenres, setSelectedGenres, onNext }: any) {
  const handleGenreToggle = (genre: string) => {
    setSelectedGenres((prev: string[]) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const handleNext = () => {
    if (!name.trim()) {
      alert('Please enter your name to continue.');
      return;
    }
    onNext();
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">Welcome to FilmRank!</h1>
      <p className="text-lg text-gray-600 mb-4 text-center">
        Let's get you set up with a quick profile. This helps us personalize your experience and recommendations.
      </p>
      <p className="text-base text-gray-500 mb-8 text-center">
        You can always update your profile later in your account settings.
      </p>
      <div className="space-y-8">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Display Name *
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
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Favorite Genres
          </label>
          <div className="flex flex-wrap gap-2">
            {GENRE_OPTIONS.map((genre) => (
              <button
                key={genre}
                type="button"
                className={`px-3 py-1 rounded-full border focus:outline-none transition-colors
                  ${selectedGenres.includes(genre)
                    ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                    : 'bg-white text-blue-600 border-blue-600 hover:bg-blue-50'}
                `}
                onClick={() => handleGenreToggle(genre)}
                aria-pressed={selectedGenres.includes(genre)}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end">
          <button 
            type="button" 
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed" 
            onClick={handleNext}
            disabled={!name.trim()}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportStep({ onNext, onSkip, onBack }: any) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4 text-center">Import Your Movie Library</h2>
      <p className="text-base text-gray-600 mb-4 text-center">
        If you already track your movies on Letterboxd, you can quickly import your watched list here.<br />
        <span className="text-gray-500">Don't use Letterboxd? <b>Skip this step</b> to add movies from our catalog instead.</span>
      </p>
      <div className="flex flex-col items-center gap-6">
        <div className="bg-gray-50 rounded-lg p-4 flex flex-col items-center gap-4 w-full max-w-md">
          <label className="w-full flex flex-col items-center px-4 py-6 bg-white text-blue-600 rounded-lg border-2 border-blue-600 border-dashed cursor-pointer hover:bg-blue-50">
            <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-sm font-medium">Click to upload Letterboxd CSV</span>
            <input type="file" accept=".csv" className="hidden" />
          </label>
          <p className="text-xs text-gray-500 text-center">
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
        <div className="flex gap-4 justify-between w-full max-w-md">
          {onBack && (
            <button type="button" className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-700" onClick={onBack}>Back</button>
          )}
          <div className="flex gap-4 ml-auto">
            <button type="button" className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-700" onClick={onSkip}>Skip</button>
            <button type="button" className="px-6 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium" onClick={onNext}>Continue</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ManualSelectStep({ onBack, onNext, selectedMovieIds, setSelectedMovieIds }: any) {
  const {
    data: movies,
    isLoading,
    hasMore,
    fetchNextPage,
  } = useInfiniteQuery<Tables<'movies'>>({
    tableName: 'movies',
    columns: 'id, title, url',
    pageSize: 24,
  });

  // Search state
  const [search, setSearch] = useState('');

  // Infinite scroll: fetch more when bottom sentinel is visible
  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore || isLoading) return;
    const observer = new window.IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        fetchNextPage();
      }
    });
    if (bottomRef.current) observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoading, fetchNextPage]);

  const toggleMovie = (id: string) => {
    setSelectedMovieIds(selectedMovieIds.includes(id)
      ? selectedMovieIds.filter((mid: string) => mid !== id)
      : [...selectedMovieIds, id]
    );
  };

  // Tooltip logic
  const [hoveredMovie, setHoveredMovie] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimer = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = (movieId: string) => (e: React.MouseEvent) => {
    setHoveredMovie(movieId);
    setTooltipPosition({ x: e.clientX, y: e.clientY });
    tooltipTimer.current = setTimeout(() => {
      setShowTooltip(true);
    }, 2000); // 2 seconds
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setTooltipPosition({ x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    setHoveredMovie(null);
    setShowTooltip(false);
    if (tooltipTimer.current) {
      clearTimeout(tooltipTimer.current);
      tooltipTimer.current = null;
    }
  };

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    };
  }, []);

  // Find hovered movie title
  const hoveredMovieObj = movies.find(m => m.id === hoveredMovie);

  // Filter movies by search query (case-insensitive)
  const filteredMovies = search.trim() === ''
    ? movies
    : movies.filter(movie => movie.title.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="flex flex-col items-center w-full pb-16">
      <h2 className="text-2xl font-bold mb-6 text-center">Add Movies to Your Library</h2>
      <p className="text-base text-gray-600 mb-4 text-center">
        Browse our movie catalog and select the films you've already watched. This helps us get your recommendations and rankings started!
      </p>
      {/* Search input */}
      <div className="w-full max-w-5xl mb-4 flex justify-center">
        <input
          type="text"
          className="w-full max-w-md px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Search movies by title..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="w-full max-w-5xl">
        {isLoading && movies.length === 0 ? (
          <div className="text-gray-500 text-center py-12">Loading movies...</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
            {filteredMovies.map(movie => {
              const selected = selectedMovieIds.includes(movie.id);
              return (
                <div key={movie.id} className="flex justify-center items-center">
                  <div
                    onClick={() => toggleMovie(movie.id)}
                    onMouseEnter={handleMouseEnter(movie.id)}
                    onMouseMove={hoveredMovie === movie.id ? handleMouseMove : undefined}
                    onMouseLeave={handleMouseLeave}
                    className={`relative w-[120px] h-[175px] rounded-lg overflow-hidden shadow transition-all duration-200 ease-in-out cursor-pointer hover:scale-105 hover:shadow-lg ${selected ? 'ring-4 ring-blue-500 scale-105' : ''}`}
                  >
                    <img
                      src={movie.url || 'https://via.placeholder.com/120x175.png?text=No+Image'}
                      alt={movie.title}
                      className="w-full h-full object-cover bg-gray-200"
                      onError={e => (e.currentTarget.src = 'https://via.placeholder.com/120x175.png?text=No+Image')}
                    />
                    {/* Show title on hover or if selected */}
                    <div className={`absolute bottom-0 left-0 w-full px-2 py-1 bg-black/80 text-xs text-white text-center truncate transition-opacity duration-200 ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                      style={{ pointerEvents: 'none' }}
                    >
                      {movie.title}
                    </div>
                    {selected && (
                      <div className="absolute inset-0 bg-blue-500/10 pointer-events-none rounded-lg border-4 border-blue-500 animate-pulse" />
                    )}
                  </div>
                </div>
              );
            })}
            {/* Infinite scroll sentinel */}
            <div ref={bottomRef} className="h-8 col-span-full" />
          </div>
        )}
      </div>
      {/* Tooltip */}
      {showTooltip && hoveredMovieObj && (
        <div
          className="fixed z-50 px-3 py-2 bg-black text-white text-sm rounded shadow-lg pointer-events-none"
          style={{
            left: tooltipPosition.x + 16,
            top: tooltipPosition.y + 8,
            maxWidth: 240,
            whiteSpace: 'pre-line',
          }}
        >
          {hoveredMovieObj.title}
        </div>
      )}
      <div className="flex gap-4 justify-between mt-8 w-full max-w-5xl mb-8">
        {onBack && (
          <button type="button" className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-700" onClick={onBack}>Back</button>
        )}
        <button type="button" className="px-6 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium ml-auto" onClick={onNext}>Continue</button>
      </div>
    </div>
  );
}

function FinalizeStep({ onBack, onFinish, selectedMovieIds, isSaving }: any) {
  return (
    <div className="flex flex-col items-center">
      <h2 className="text-2xl font-bold mb-6 text-center">You're All Set!</h2>
      <p className="text-base text-gray-600 mb-4 text-center">
        Review your selections below. When you're ready, click <b>Finish</b> to start using FilmRank!
      </p>
      <div className="bg-gray-100 rounded-lg p-8 text-center text-gray-500 mb-8">
        {selectedMovieIds && selectedMovieIds.length > 0 ? (
          <span>{selectedMovieIds.length} movies selected.</span>
        ) : (
          <span>No movies selected.</span>
        )}
      </div>
      <div className="flex gap-4 justify-between w-full max-w-md">
        {onBack && (
          <button 
            type="button" 
            className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed" 
            onClick={onBack}
            disabled={isSaving}
          >
            Back
          </button>
        )}
        <button 
          type="button" 
          className="px-6 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium ml-auto disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2" 
          onClick={onFinish}
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Saving...
            </>
          ) : (
            'Finish'
          )}
        </button>
      </div>
    </div>
  );
}

export default function Onboarding({ onOnboardingComplete }: { onOnboardingComplete?: (status: boolean) => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedMovieIds, setSelectedMovieIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  // Add more onboarding state as needed
  const navigate = useNavigate();

  // Handlers for step navigation
  const next = () => setStep(s => s + 1);
  const back = () => setStep(s => s - 1);
  const skip = () => setStep(s => s + 1);
  const finish = async () => {
    // Validate required fields
    if (!name.trim()) {
      alert('Please enter your name to continue.');
      return;
    }

    setIsSaving(true);
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.error('No user found');
        navigate('/login');
        return;
      }

      // Update user profile with onboarding data
      const { error } = await supabase
        .from('users')
        .update({
          name: name.trim(),
          preferences: { genres: selectedGenres },
          onboarding_complete: true
        })
        .eq('id', user.id);

      if (error) {
        console.error('Error saving onboarding data:', error);
        // You might want to show an error message to the user here
        return;
      }

      // Update the parent component's onboarding status
      if (onOnboardingComplete) {
        onOnboardingComplete(true);
      }

      // Navigate to dashboard on success
      navigate('/dashboard');
    } catch (error) {
      console.error('Error during onboarding completion:', error);
      // You might want to show an error message to the user here
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex justify-center bg-gray-50 px-4">
      <div className="w-full flex flex-col items-center pt-12 md:pt-20">
        {step === 1 && (
          <ProfileStep
            name={name}
            setName={setName}
            selectedGenres={selectedGenres}
            setSelectedGenres={setSelectedGenres}
            onNext={next}
          />
        )}
        {step === 2 && (
          <ImportStep
            onNext={next}
            onSkip={skip}
            onBack={back}
          />
        )}
        {step === 3 && (
          <ManualSelectStep
            onBack={back}
            onNext={next}
            selectedMovieIds={selectedMovieIds}
            setSelectedMovieIds={setSelectedMovieIds}
          />
        )}
        {step === 4 && (
          <FinalizeStep
            onBack={back}
            onFinish={finish}
            selectedMovieIds={selectedMovieIds}
            isSaving={isSaving}
          />
        )}
      </div>
    </div>
  );
} 