import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import type { Tables } from '../types/supabase';
import { importMoviesFromFile, formatImportResult, type ImportStatus } from '../lib/movieImportUtils';
import MovieGallery from '../components/MovieGallery';

const GENRE_OPTIONS = [
  'Action', 'Comedy', 'Drama', 'Sci-Fi', 'Horror',
  'Romance', 'Thriller', 'Fantasy', 'Animation', 'Documentary',
  'Adventure', 'Mystery', 'Crime', 'Family', 'Musical',
  'Western', 'War', 'Biography', 'History', 'Sport',
  'Superhero', 'Noir', 'Short', 'Experimental', 'Reality',
  'News', 'Film-Noir', 'Children',
  'Adult', 'Disaster', 'Epic', 'Political', 'Psychological',
  'Road', 'Satire', 'Slasher', 'Spy', 'Suspense'
];

function ProfileStep({ name, setName, selectedGenres, setSelectedGenres, onNext }: any) {
  const handleGenreToggle = (genre: string) => {
    setSelectedGenres((prev: string[]) =>
      prev.includes(genre)
        ? prev.filter((g) => g !== genre)
        : prev.length < 3
          ? [...prev, genre]
          : prev
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
          <p className="text-xs text-gray-500 mb-2">Select up to 3 genres</p>
          <div className="w-full">
            <div className="flex flex-wrap gap-2 justify-center">
              {GENRE_OPTIONS.map((genre) => {
                const selected = selectedGenres.includes(genre);
                const disabled = !selected && selectedGenres.length >= 3;
                return (
                  <button
                    key={genre}
                    type="button"
                    className={`px-3 py-1 rounded-full border focus:outline-none transition-colors
                      ${selected
                        ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                        : 'bg-white text-blue-600 border-blue-600 hover:bg-blue-50'}
                      ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                    onClick={() => handleGenreToggle(genre)}
                    aria-pressed={selected}
                    disabled={disabled}
                  >
                    {genre}
                  </button>
                );
              })}
            </div>
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

function ImportStep({ onImportComplete, onManual, onBack, name, selectedGenres }: any) {
  // Import status state
  const [importStatus, setImportStatus] = useState<ImportStatus>({ status: 'idle', message: '' });
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // File upload handler (store file only)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setImportStatus({ status: 'idle', message: '' });
  };

  // Finalize import handler
  const handleFinalizeImport = async () => {
    if (!file) return;
    setIsProcessing(true);
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      // Update user profile with onboarding data first
      const { error: profileError } = await supabase
        .from('users')
        .update({
          name: name.trim(),
          preferences: { genres: selectedGenres },
          onboarding_complete: true
        })
        .eq('id', user.id);
      if (profileError) throw profileError;

      // Use the optimized import utility
      const result = await importMoviesFromFile(file, user.id, {
        onProgress: setImportStatus
      });

      setImportStatus({
        status: 'success',
        message: formatImportResult(result)
      });

      // Complete onboarding
      if (onImportComplete) onImportComplete();
    } catch (err) {
      setImportStatus({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to import movies'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4 text-center">Import Your Movie Library</h2>
      <p className="text-base text-gray-600 mb-4 text-center">
        If you already track your movies on Letterboxd, you can quickly import your watched list here.<br />
        <span className="text-gray-500">Don't use Letterboxd? <b>Add movies manually</b> instead.</span>
      </p>
      <div className="flex flex-col items-center gap-6">
        <div className="bg-gray-50 rounded-lg p-4 flex flex-col items-center gap-4 w-full max-w-md">
          <label className="w-full flex flex-col items-center px-4 py-6 bg-white text-blue-600 rounded-lg border-2 border-blue-600 border-dashed cursor-pointer hover:bg-blue-50">
            <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-sm font-medium">Click to upload ZIP or CSV</span>
            <input type="file" accept=".csv,.zip" className="hidden" onChange={handleFileUpload} disabled={isProcessing} />
          </label>
          <p className="text-xs text-gray-500 text-center">
            Import your movies from Letterboxd by uploading your exported <b>ZIP file</b> or the <b>watched.csv</b> file.<br />
            <span className="text-gray-500">We recommend uploading the ZIP file directly – we'll find the right file for you!</span><br />
            <a
              href="https://letterboxd.com/settings/data/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700"
            >
              Get your Letterboxd export
            </a>
          </p>
          {file && (
            <div className="text-sm text-gray-700">Selected file: {file.name}</div>
          )}
          {importStatus.status !== 'idle' && (
            <div className="space-y-2">
              <div className={`text-center text-sm ${
                importStatus.status === 'success' ? 'text-green-600' :
                importStatus.status === 'error' ? 'text-red-600' :
                'text-blue-600'
              }`}>
                {importStatus.message}
              </div>
              {importStatus.status === 'loading' && importStatus.progress !== undefined && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${importStatus.progress}%` }}
                  ></div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-4 justify-between w-full max-w-md">
          {onBack && (
            <button type="button" className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-700" onClick={onBack} disabled={isProcessing}>Back</button>
          )}
          <div className="flex gap-4 ml-auto">
            <button type="button" className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-700" onClick={onManual} disabled={isProcessing}>Add movies manually</button>
            <button type="button" className="px-6 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium" onClick={handleFinalizeImport} disabled={!file || isProcessing}>Finalize Import</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ManualSelectStep({ onBack, onFinish, name, selectedGenres }: any) {
  const [userLibraryIds, setUserLibraryIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchUserLibrary = async () => {
      setIsSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setUserLibraryIds([]);
        setIsSaving(false);
        return;
      }
      const { data, error } = await supabase
        .from('user_movies')
        .select('movie_id');
      if (error) {
        setUserLibraryIds([]);
      } else {
        setUserLibraryIds((data || []).map((row: { movie_id: string }) => row.movie_id));
      }
      setIsSaving(false);
    };
    fetchUserLibrary();
  }, []);

  // Add movie to user library handler
  const handleAdd = async (movie: Tables<'movies'>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in');
    if (userLibraryIds.includes(movie.id)) return;
    const { error } = await supabase
      .from('user_movies')
      .insert({
        user_id: user.id,
        movie_id: movie.id,
        elo_score: 1000,
        match_count: 0
      });
    if (error) throw error;
    setUserLibraryIds(ids => [...ids, movie.id]);
  };

  // Finish handler
  const handleFinish = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = '/login';
        return;
      }
      // Update user profile
      const { error: profileError } = await supabase
        .from('users')
        .update({
          name: name.trim(),
          preferences: { genres: selectedGenres },
          onboarding_complete: true
        })
        .eq('id', user.id);
      if (profileError) {
        alert('Error saving profile data. Please try again.');
        return;
      }
      if (onFinish) onFinish();
    } catch (error) {
      alert('An error occurred during onboarding. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-center w-full pb-16">
      <h2 className="text-2xl font-bold mb-6 text-center">Add Movies to Your Library</h2>
      <p className="text-base text-gray-600 mb-4 text-center">
        Browse our movie catalog and select the films you've already watched. This helps us get your recommendations and rankings started!
      </p>
      <div className="w-full mb-6">
        <MovieGallery
          userLibraryIds={userLibraryIds}
          onAdd={handleAdd}
          hideAdded={false}
        />
      </div>
      <div className="flex gap-4 justify-between mt-8 w-full max-w-5xl mb-8">
        {onBack && (
          <button type="button" className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-700" onClick={onBack} disabled={isSaving}>Back</button>
        )}
        <button type="button" className="px-6 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium ml-auto" onClick={handleFinish} disabled={isSaving}>Finish</button>
      </div>
    </div>
  );
}

export default function Onboarding({ onOnboardingComplete }: { onOnboardingComplete?: (status: boolean) => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const navigate = useNavigate();
  // Handlers for step navigation
  const next = () => setStep(s => s + 1);
  const back = () => setStep(s => s - 1);
  // Handler for onboarding completion
  const handleOnboardingComplete = () => {
    if (onOnboardingComplete) onOnboardingComplete(true);
    navigate('/dashboard');
  };
  return (
    <div className="flex justify-center bg-gray-50 px-4">
      <div className="w-full max-w-5xl mx-auto flex flex-col items-center pt-12 md:pt-20">
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
            onImportComplete={handleOnboardingComplete}
            onManual={() => setStep(3)}
            onBack={back}
            name={name}
            selectedGenres={selectedGenres}
          />
        )}
        {step === 3 && (
          <ManualSelectStep
            onBack={back}
            onFinish={handleOnboardingComplete}
            name={name}
            selectedGenres={selectedGenres}
          />
        )}
      </div>
    </div>
  );
} 