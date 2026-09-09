// src/pages/AddMovie.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import MovieGallery from '../components/MovieGallery'
import PlacementModal from '../components/PlacementModal'
import { usePlacementQueue } from '../hooks/usePlacementQueue'
import type { Tables } from '../types/supabase';

export default function AddMovie() {
  const [userLibraryIds, setUserLibraryIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const { current: placingMovie, enqueue, dequeue } = usePlacementQueue();

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
      setUserId(user.id);
      const { data, error } = await supabase
        .from('user_movies')
        .select('movie_id')
        .is('removed_at', null);
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

    // The movie may have a soft-removed row from a previous "remove from
    // library" — restore it (keeping its elo/comparison history) instead of
    // inserting a fresh row, which would violate the (user_id, movie_id) PK.
    const { data: existing, error: existingError } = await supabase
      .from('user_movies')
      .select('movie_id')
      .eq('user_id', user.id)
      .eq('movie_id', movie.id)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing) {
      const { error } = await supabase
        .from('user_movies')
        .update({ removed_at: null })
        .eq('user_id', user.id)
        .eq('movie_id', movie.id);
      if (error) throw error;
      setUserLibraryIds(ids => [...ids, movie.id]);
      return;
    }

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
    enqueue(movie);
  };

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="p-8">
          <h1 className="font-marquee text-3xl font-semibold uppercase tracking-[.02em] text-foreground mb-6 text-center">Add a Movie</h1>
          {loading ? (
            <div className="text-center text-muted-foreground py-12">Loading your library...</div>
          ) : (
            <MovieGallery
              userLibraryIds={userLibraryIds}
              onAdd={handleAdd}
              hideAdded={false}
            />
          )}
        </div>
      </div>
      {placingMovie && userId && (
        <PlacementModal newMovie={placingMovie} userId={userId} onComplete={dequeue} />
      )}
    </div>
  );
}
