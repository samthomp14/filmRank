-- Baseline: captures the current live definitions of compare_movies and
-- get_two_random_movies verbatim. These functions were created directly
-- against the database and were never tracked in a migration until now.
-- This migration is a no-op against the live DB (CREATE OR REPLACE with the
-- existing bodies) — it exists purely so the next migration (which changes
-- get_two_random_movies) is reviewable as a real diff.

CREATE OR REPLACE FUNCTION public.compare_movies(winner_id uuid, loser_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
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
  -- Get current scores and match counts from user_movies
  select elo_score, match_count
    into winner_score, winner_matches
    from user_movies
    where user_id = p_user_id and movie_id = winner_id;

  select elo_score, match_count
    into loser_score, loser_matches
    from user_movies
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
  update user_movies
    set elo_score = new_winner_score,
        match_count = winner_matches + 1
    where user_id = p_user_id and movie_id = winner_id;

  update user_movies
    set elo_score = new_loser_score,
        match_count = loser_matches + 1
    where user_id = p_user_id and movie_id = loser_id;

  -- Record the comparison
  insert into comparisons (user_id, winner_movie_id, loser_movie_id)
  values (p_user_id, winner_id, loser_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_two_random_movies()
 RETURNS TABLE(movie_id uuid, elo_score numeric, match_count integer, title text, imdb_id text, url text)
 LANGUAGE plpgsql
AS $function$
begin
  return query
    select
      um.movie_id,
      um.elo_score::numeric,
      um.match_count,
      m.title,
      m.imdb_id,
      m.url
    from user_movies um
    join movies m on m.id = um.movie_id
    where um.user_id = auth.uid()
    order by random()
    limit 2;
end;
$function$;
