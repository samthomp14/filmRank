// src/pages/AddMovie.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import MovieGallery from '../components/MovieGallery'
import type { Tables } from '../types/supabase';
import axios from 'axios';
import { parseOMDBResponse } from '../lib/movieUtils';
import type { OMDBResponse } from '../lib/movieUtils';
import { syncMoviePeople } from '../lib/peopleUtils';

export default function AddMovie() {
  const [userLibraryIds, setUserLibraryIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOmdbPrompt, setShowOmdbPrompt] = useState(false);
  const [omdbTitle, setOmdbTitle] = useState('');
  const [omdbYear, setOmdbYear] = useState('');
  const [omdbModal, setOmdbModal] = useState<{
    title: string;
    year: string;
    director: string;
    poster: string;
    id?: string;
    imdb_id?: string;
    alreadyInLibrary?: boolean;
    isOmdb?: boolean;
    omdbData?: OMDBResponse;
  } | null>(null);
  const [omdbError, setOmdbError] = useState<string | null>(null);

  // Fetch user's library movie IDs
  useEffect(() => {
    const fetchUserLibrary = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setUserLibraryIds([]);
        setLoading(false);
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
      setLoading(false);
    };
    fetchUserLibrary();
  }, []);

  // Add movie to user library handler
  const handleAdd = async (movie: Tables<'movies'>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in');
    // Check if already in library (should be disabled in UI, but double check)
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

  // OMDb prompt submit handler
  const handleOmdbPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    setOmdbError(null);
    const title = omdbTitle.trim();
    const year = omdbYear ? omdbYear.trim() : '';
    if (!title) return;
    // 1. Check user's library (by title/year/alt_title)
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: userMovies } = await supabase
        .from('user_movies')
        .select('movie_id');
      const userMovieIds = (userMovies || []).map((row: { movie_id: string }) => row.movie_id);
      if (userMovieIds.length > 0) {
        // Check in movies table for user's movies
        const { data: movies } = await supabase
          .from('movies')
          .select('*')
          .in('id', userMovieIds);
        const found = (movies || []).find(m =>
          (m.title && m.title.toLowerCase() === title.toLowerCase()) ||
          (m.alt_title && m.alt_title.toLowerCase() === title.toLowerCase())
        );
        if (found && (!year || (found.year && String(found.year) === year))) {
          setOmdbModal({
            title: found.title,
            year: found.year ? String(found.year) : '',
            director: found.director || '',
            poster: found.url || 'https://via.placeholder.com/120x175.png?text=No+Image',
            id: found.id,
            imdb_id: found.imdb_id || undefined,
            alreadyInLibrary: true,
          });
          return;
        }
      }
    }
    // 2. Check movie database (title, alt_title)
    let { data: foundMovies } = await supabase
      .from('movies')
      .select('*')
      .or(`title.ilike.%${title}%,alt_title.ilike.%${title}%`);
    if (year) {
      foundMovies = (foundMovies || []).filter((m: any) => m.year && String(m.year) === year);
    }
    const found = (foundMovies || [])[0];
    if (found) {
      setOmdbModal({
        title: found.title,
        year: found.year ? String(found.year) : '',
        director: found.director || '',
        poster: found.url || 'https://via.placeholder.com/120x175.png?text=No+Image',
        id: found.id,
        imdb_id: found.imdb_id || undefined,
        alreadyInLibrary: userLibraryIds.includes(found.id),
      });
      return;
    }
    // 3. Query OMDb
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const params: any = { title };
      if (year) params.year = year;
      const response = await axios.get('/api/omdb', {
        params,
        headers: { Authorization: accessToken ? `Bearer ${accessToken}` : undefined },
      });

      const movieData = response.data;
      if (movieData.Response === 'True') {
        setOmdbModal({
          title: movieData.Title,
          year: movieData.Year || '',
          director: movieData.Director || '',
          poster: movieData.Poster && movieData.Poster !== 'N/A' ? movieData.Poster : 'https://via.placeholder.com/120x175.png?text=No+Image',
          imdb_id: movieData.imdbID,
          isOmdb: true,
          omdbData: movieData,
        });
      } else {
        setOmdbError('Movie not found in OMDb.');
      }
    } catch (err) {
      setOmdbError('Error searching OMDb.');
    }
  };

  // OMDb confirm handler
  const handleOmdbConfirm = async () => {
    if (!omdbModal) return;
    // If already in library, just close
    if (omdbModal.alreadyInLibrary) {
      setOmdbModal(null);
      return;
    }
    // If movie is in DB but not in user's library, add to user_movies
    if (omdbModal.id && !omdbModal.isOmdb) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('user_movies').insert({
        user_id: user.id,
        movie_id: omdbModal.id,
        elo_score: 1000,
        match_count: 0,
      });
      setUserLibraryIds(ids => [...ids, omdbModal.id!]);
      setOmdbModal(null);
      return;
    }
    // If OMDb, add to DB and user_movies
    if (omdbModal.isOmdb && omdbModal.imdb_id && omdbModal.omdbData) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Check if already in DB by imdb_id
      const { data: existing } = await supabase
        .from('movies')
        .select('*')
        .eq('imdb_id', omdbModal.imdb_id)
        .limit(1);
      let movieId = null;
      if (existing && existing.length > 0) {
        movieId = existing[0].id;
      } else {
        // Use the OMDb data already fetched
        const movieInsertData = parseOMDBResponse(omdbModal.omdbData);
        const { data: movie, error } = await supabase
          .from('movies')
          .insert([movieInsertData])
          .select()
          .single();
        if (error) return;
        movieId = movie.id;
        await syncMoviePeople(movieId, omdbModal.omdbData);
      }
      // Add to user_movies
      await supabase.from('user_movies').insert({
        user_id: user.id,
        movie_id: movieId,
        elo_score: 1000,
        match_count: 0,
      });
      setUserLibraryIds(ids => [...ids, movieId]);
      setOmdbModal(null);
      setShowOmdbPrompt(false);
    }
  };

  // OMDb deny handler
  const handleOmdbDeny = () => {
    setOmdbModal(null);
  };

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="p-8">
          <h1 className="font-marquee text-3xl font-semibold uppercase tracking-[.02em] text-foreground mb-6 text-center">Add a Movie</h1>
          {loading ? (
            <div className="text-center text-muted-foreground py-12">Loading your library...</div>
          ) : (
            <>
              <MovieGallery
                userLibraryIds={userLibraryIds}
                onAdd={handleAdd}
                hideAdded={false}
              />
              {/* OMDb fallback prompt at bottom */}
              <div className="mt-8 flex flex-col items-center">
                <div className="text-muted-foreground mb-2">Don't see it here?</div>
                <button
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary"
                  onClick={() => setShowOmdbPrompt(true)}
                >
                  Search OMDb by Title & Year
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {/* OMDb Prompt Modal */}
      {showOmdbPrompt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-medium text-foreground mb-4">Search OMDb</h3>
            <form onSubmit={handleOmdbPrompt} className="space-y-4">
              <input
                type="text"
                value={omdbTitle}
                onChange={e => setOmdbTitle(e.target.value)}
                placeholder="Movie Title"
                required
                className="w-full px-4 py-2 rounded-lg border border-border focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                type="text"
                value={omdbYear}
                onChange={e => setOmdbYear(e.target.value)}
                placeholder="Year (optional)"
                className="w-full px-4 py-2 rounded-lg border border-border focus:ring-2 focus:ring-primary focus:border-primary"
              />
              {omdbError && <div className="text-destructive text-sm">{omdbError}</div>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowOmdbPrompt(false)} className="px-4 py-2 rounded bg-secondary text-foreground hover:bg-secondary/80">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90">Search</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* OMDb Result Modal (stub) */}
      {omdbModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-card/95 border border-border rounded-2xl shadow-2xl max-w-3xl w-full flex flex-col px-0 py-0 overflow-hidden">
            <div className="px-8 pt-8 pb-4">
              <h3 className="text-xl font-bold text-foreground mb-2 tracking-tight">
                {omdbModal.alreadyInLibrary
                  ? 'You already have this movie in your library!'
                  : omdbModal.id && !omdbModal.isOmdb
                  ? 'This movie is already in our database. Add to your library?'
                  : 'Review and confirm'}
              </h3>
            </div>
            <div className="flex flex-row gap-0 items-stretch bg-card">
              <div className="flex items-center justify-center px-8 py-8">
                <img src={omdbModal.poster} alt={omdbModal.title} className="w-56 h-80 object-cover rounded-xl shadow-lg border border-border" />
              </div>
              <div className="flex flex-col justify-center px-8 py-8 min-w-[220px] flex-1">
                <div className="font-extrabold text-3xl text-foreground mb-2 leading-tight">{omdbModal.title}</div>
                {omdbModal.year && <div className="text-primary text-lg font-semibold mb-2">{omdbModal.year}</div>}
                <div className="text-muted-foreground text-base mb-4">Director:<br /><span className="font-medium text-lg text-foreground">{omdbModal.director}</span></div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-8 py-6 bg-card border-t border-border rounded-b-2xl">
              <button onClick={handleOmdbDeny} className="px-5 py-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 font-medium transition">{omdbModal.alreadyInLibrary ? 'Close' : 'No'}</button>
              {!omdbModal.alreadyInLibrary && (
                <button onClick={handleOmdbConfirm} className="px-5 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow transition">Add to Library</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
