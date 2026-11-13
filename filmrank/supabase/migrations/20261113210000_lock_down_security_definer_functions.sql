-- Lock down SECURITY DEFINER functions the Supabase advisor reports as
-- executable by `anon` (lint 0028_anon_security_definer_function_executable).
--
-- 1. compare_movies(winner_id, loser_id, p_user_id) took the target user id as
--    a parameter and never checked it, so any caller (even signed out) could
--    record comparisons and move Elo scores in any user's library. It now
--    rejects any p_user_id that is not auth.uid(). The signature is unchanged
--    so the existing frontend calls (Compare.tsx, PlacementModal.tsx), which
--    already pass the signed-in user's id, keep working. The body is otherwise
--    the live definition verbatim, now with search_path = '' and
--    schema-qualified names.
--
-- 2. Functions are created with EXECUTE granted to PUBLIC by default, and
--    `anon` inherits it, so revoking from `anon` alone is not enough: each
--    function below is revoked from PUBLIC and anon.
--
--    Callers checked:
--      * apply_bt_rankings_now   -- Settings page, signed in. Keep authenticated.
--      * recompute_bt_rankings   -- My Movies page, signed in. Keep authenticated.
--      * log_omdb_request        -- api/omdb.mjs, called with the user's session
--                                   after supabase.auth.getUser() succeeds.
--                                   Keep authenticated. (catalog-sync inserts
--                                   into omdb_request_log directly as service_role.)
--      * handle_new_user         -- trigger on auth.users only.
--      * clear_watchlist_on_library_add -- trigger on public.user_movies only.
--    Trigger functions need no EXECUTE grant to fire (it is checked only at
--    CREATE TRIGGER time), so they are revoked from authenticated too.
--    pg_cron (apply_bt_rankings_for_opted_in_users) and the catalog-sync edge
--    function run as postgres / service_role and are unaffected.

CREATE OR REPLACE FUNCTION public.compare_movies(winner_id uuid, loser_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  winner_score integer;
  loser_score integer;
  winner_matches integer;
  loser_matches integer;
  expected_winner float;
  expected_loser float;
  k float;
  new_winner_score integer;
  new_loser_score integer;
begin
  -- Only the signed-in user may record comparisons in their own library.
  if auth.uid() is null then
    raise exception 'compare_movies requires an authenticated user'
      using errcode = '42501';
  end if;
  if p_user_id is distinct from auth.uid() then
    raise exception 'compare_movies: p_user_id must be the signed-in user'
      using errcode = '42501';
  end if;

  -- Get current scores and match counts from user_movies
  select elo_score, match_count
    into winner_score, winner_matches
    from public.user_movies
    where user_id = p_user_id and movie_id = winner_id;

  select elo_score, match_count
    into loser_score, loser_matches
    from public.user_movies
    where user_id = p_user_id and movie_id = loser_id;

  -- Dynamic K based on experience
  k := 40 / (1 + greatest(winner_matches, loser_matches) / 10.0);

  -- Expected scores
  expected_winner := 1 / (1 + power(10, (loser_score - winner_score) / 400.0));
  expected_loser := 1 - expected_winner;

  -- New scores (rounded)
  new_winner_score := round(winner_score + k * (1 - expected_winner));
  new_loser_score := round(loser_score + k * (0 - expected_loser));

  -- Update user_movies with new scores and match counts
  update public.user_movies
    set elo_score = new_winner_score,
        match_count = winner_matches + 1
    where user_id = p_user_id and movie_id = winner_id;

  update public.user_movies
    set elo_score = new_loser_score,
        match_count = loser_matches + 1
    where user_id = p_user_id and movie_id = loser_id;

  -- Record the comparison
  insert into public.comparisons (user_id, winner_movie_id, loser_movie_id)
  values (p_user_id, winner_id, loser_id);
end;
$function$;

revoke execute on function public.compare_movies(uuid, uuid, uuid) from public, anon;
grant execute on function public.compare_movies(uuid, uuid, uuid) to authenticated;

revoke execute on function public.apply_bt_rankings_now() from public, anon;
grant execute on function public.apply_bt_rankings_now() to authenticated;

revoke execute on function public.recompute_bt_rankings() from public, anon;
grant execute on function public.recompute_bt_rankings() to authenticated;

revoke execute on function public.log_omdb_request() from public, anon;
grant execute on function public.log_omdb_request() to authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.clear_watchlist_on_library_add() from public, anon, authenticated;
