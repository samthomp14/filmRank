-- Two-stage opponent selection for get_two_random_movies.
--
-- Stage 1 (unchanged): pick a "target" movie via the existing
-- Efraimidis-Spirakis weighted sampling by 1/(match_count+1), so
-- under-compared movies keep surfacing.
--
-- Stage 2 (new): pick the target's opponent weighted toward movies close to
-- it in elo_score, via a Gaussian kernel on the elo gap. Comparisons between
-- movies with a big elo gap have a predictable outcome and barely move
-- either score; a near-50/50 matchup carries far more information about
-- relative ranking (the same intuition matchmaking systems like TrueSkill
-- use). The kernel width (150) is a soft bias, not a cutoff — a ~150-point
-- gap (roughly a 70/30 expected split) still keeps ~60% of full weight, so
-- pairings stay varied rather than turning into deterministic
-- nearest-neighbor matches every time.
--
-- Final result order is randomized so the target isn't always slot 0.

CREATE OR REPLACE FUNCTION public.get_two_random_movies()
 RETURNS TABLE(movie_id uuid, elo_score numeric, match_count integer, title text, imdb_id text, url text)
 LANGUAGE plpgsql
AS $function$
declare
  target_id uuid;
  target_elo numeric;
  kernel_sigma constant numeric := 150.0;
begin
  select um.movie_id, um.elo_score::numeric
    into target_id, target_elo
    from user_movies um
    where um.user_id = auth.uid()
    order by power(random(), coalesce(um.match_count, 0) + 1) desc
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
      where um.user_id = auth.uid() and um.movie_id = target_id

      union all

      select opp.movie_id, opp.elo_score, opp.match_count, opp.title, opp.imdb_id, opp.url
      from (
        select um.movie_id, um.elo_score::numeric as elo_score, um.match_count, m.title, m.imdb_id, m.url
        from user_movies um
        join movies m on m.id = um.movie_id
        where um.user_id = auth.uid() and um.movie_id <> target_id
        order by power(
          random(),
          1.0 / greatest(
            exp(-power(um.elo_score::numeric - target_elo, 2) / (2 * power(kernel_sigma, 2))),
            0.0001
          )
        ) desc
        limit 1
      ) opp
    ) t
    order by random();
end;
$function$;
