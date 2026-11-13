-- Stop signed-out clients writing to the shared people/genres catalog.
--
-- genres, people, movie_genres and movie_people each had an INSERT policy
-- named "Enable insert for authenticated users" that actually applied to
-- every role (TO public, WITH CHECK (true)), and anon held INSERT on the
-- tables. sync_movie_genres / sync_movie_people were executable by anon too
-- (through the default PUBLIC grant and an explicit anon grant). So anyone
-- with the public anon key could create genres and people and attach them to
-- any movie.
--
-- Legitimate writers, checked:
--   * src/lib/movieImportUtils.ts calls sync_movie_people / sync_movie_genres
--     as the signed-in user (the importer is only reachable behind sign-in).
--   * supabase/functions/catalog-sync runs as service_role, which has
--     BYPASSRLS and its own EXECUTE grant, so it is unaffected.
--   * No client code inserts into these four tables directly.
--
-- Signed-in users keep the same access as before.

revoke execute on function public.sync_movie_genres(uuid, text) from public, anon;
revoke execute on function public.sync_movie_people(uuid, text, text, text) from public, anon;
grant execute on function public.sync_movie_genres(uuid, text) to authenticated, service_role;
grant execute on function public.sync_movie_people(uuid, text, text, text) to authenticated, service_role;

alter policy "Enable insert for authenticated users" on public.genres to authenticated;
alter policy "Enable insert for authenticated users" on public.people to authenticated;
alter policy "Enable insert for authenticated users" on public.movie_genres to authenticated;
alter policy "Enable insert for authenticated users" on public.movie_people to authenticated;

revoke insert on public.genres, public.people, public.movie_genres, public.movie_people from anon;
