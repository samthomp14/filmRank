-- Bias get_two_random_movies toward under-compared movies (new adds, seeded
-- bulk imports) instead of pure uniform random, so the whole library keeps
-- calibrating instead of a large fraction sitting untouched near the
-- population mean forever.
--
-- Uses Efraimidis-Spirakis weighted sampling without replacement: each row
-- gets a key = random()^(1/weight); the top-N keys are selected. Weight here
-- is 1/(match_count+1), so 1/weight = match_count+1 — a movie with
-- match_count=0 samples uniformly, while one with match_count=9 needs a
-- top-10%-ish random() draw to win, without ever fully excluding
-- well-established movies (keeps some re-comparison for accuracy drift).

CREATE OR REPLACE FUNCTION public.get_two_random_movies()
 RETURNS TABLE(movie_id uuid, elo_score numeric, match_count integer, title text, imdb_id text, url text)
 LANGUAGE plpgsql
AS $function$
begin
  return query
    select
      t.movie_id,
      t.elo_score,
      t.match_count,
      t.title,
      t.imdb_id,
      t.url
    from (
      select
        um.movie_id,
        um.elo_score::numeric as elo_score,
        um.match_count,
        m.title,
        m.imdb_id,
        m.url,
        power(random(), coalesce(um.match_count, 0) + 1) as sample_key
      from user_movies um
      join movies m on m.id = um.movie_id
      where um.user_id = auth.uid()
    ) t
    order by t.sample_key desc
    limit 2;
end;
$function$;
