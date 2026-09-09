-- Removing a movie from a user's library used to hard-delete its user_movies
-- row, which cascaded (comparisons_user_id_winner_movie_id_fkey /
-- comparisons_user_id_loser_movie_id_fkey are ON DELETE CASCADE) and wiped
-- every comparisons row involving that movie for that user -- including ones
-- against OTHER movies still in the library. Re-adding the movie later reset
-- it to a fresh elo_score/match_count with no memory of its old standing.
--
-- Switch to a soft delete: mark the row removed instead of deleting it, so
-- elo_score/match_count/bt_score and the comparisons history stay intact and
-- are simply restored (removed_at set back to null) if the movie is re-added.

alter table public.user_movies
  add column removed_at timestamptz null;

-- The catalog browse's "hide already added" toggle (MovieGallery.tsx) reads
-- this view to know what's left to add; without the removed_at check a
-- removed movie would stay hidden as if still active.
CREATE OR REPLACE VIEW public.movies_not_in_user_library AS
 SELECT m.id,
    m.title,
    m.imdb_id,
    m.url,
    m.year,
    m.runtime,
    m.rating,
    m.genre,
    m.director,
    m.language,
    m.country,
    m.imdb_rating,
    m.metadata,
    m.alt_title
   FROM movies m
  WHERE NOT (EXISTS ( SELECT 1
           FROM user_movies um
          WHERE um.movie_id = m.id AND um.user_id = auth.uid() AND um.removed_at IS NULL));

-- Exclude removed movies from the compare-screen matchup picker.
CREATE OR REPLACE FUNCTION public.get_two_random_movies()
 RETURNS TABLE(movie_id uuid, elo_score numeric, match_count integer, title text, imdb_id text, url text)
 LANGUAGE plpgsql
AS $function$
declare
  target_id uuid;
  target_elo double precision;
  kernel_sigma constant double precision := 150.0;
begin
  select um.movie_id, um.elo_score
    into target_id, target_elo
    from user_movies um
    where um.user_id = auth.uid() and um.removed_at is null
    order by (coalesce(um.match_count, 0) + 1) * ln(greatest(random(), 1e-300)) desc
    limit 1;

  if target_id is null then
    return;
  end if;

  return query
    select t.movie_id, t.elo_score, t.match_count, t.title, t.imdb_id, t.url
    from (
      select um.movie_id, um.elo_score::numeric as elo_score, um.match_count, m.title, m.imdb_id, m.url
      from user_movies um
      join movies m on m.id = um.movie_id
      where um.user_id = auth.uid() and um.movie_id = target_id and um.removed_at is null

      union all

      select opp.movie_id, opp.elo_score, opp.match_count, opp.title, opp.imdb_id, opp.url
      from (
        select um.movie_id, um.elo_score::numeric as elo_score, um.match_count, m.title, m.imdb_id, m.url
        from user_movies um
        join movies m on m.id = um.movie_id
        where um.user_id = auth.uid() and um.movie_id <> target_id and um.removed_at is null
        order by ln(greatest(random(), 1e-300)) / greatest(
          exp(-power(um.elo_score - target_elo, 2) / (2 * power(kernel_sigma, 2))),
          0.0001::double precision
        ) desc
        limit 1
      ) opp
    ) t
    order by random();
end;
$function$;
