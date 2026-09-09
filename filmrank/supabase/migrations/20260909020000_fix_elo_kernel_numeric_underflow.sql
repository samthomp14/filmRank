-- Fixes the compare page breaking ("Not enough movies to compare" / 400
-- from get_two_random_movies): postgres_logs showed "value out of range:
-- underflow" (Postgres error 22003) at the exact time the page failed.
--
-- My first attempt at this fix (recasting the elo-proximity kernel from
-- numeric to double precision) didn't actually fix it: Postgres's power()
-- function raises an explicit range-check error on underflow for BOTH
-- numeric and double precision, not just numeric as assumed. The
-- Efraimidis-Spirakis sampling here computes key = random()^(1/weight); once
-- weight gets small (elo gaps far enough apart), 1/weight is a large
-- exponent, and random()^large_exponent underflows past what power() will
-- return without erroring. This was invisible while elo_score sat in a
-- tight ~800-1200 range (small elo gaps keep weight comfortably away from
-- the 0.0001 floor), but applying Bradley-Terry widened elo_score's spread
-- enough (~568-1610) that large gaps -- and the underflow -- became common.
--
-- Real fix: compute the same Efraimidis-Spirakis comparison in log space.
-- Since ln is monotonic, argmax(random()^(1/weight)) == argmax(ln(random())
-- / weight) -- and that expression only involves division and a bounded
-- ln(), never an extreme exponent, so it can't hit power()'s range check.
-- Applied to both the target's match-count weighting and the opponent's
-- elo-proximity weighting, since they're the same sampling scheme and the
-- match-count one carries the identical latent risk once match_count gets
-- large (never triggered yet, but no reason to leave it exposed).
-- random() is floored away from exactly 0 first, since ln(0) itself errors.

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
    where um.user_id = auth.uid()
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
      where um.user_id = auth.uid() and um.movie_id = target_id

      union all

      select opp.movie_id, opp.elo_score, opp.match_count, opp.title, opp.imdb_id, opp.url
      from (
        select um.movie_id, um.elo_score::numeric as elo_score, um.match_count, m.title, m.imdb_id, m.url
        from user_movies um
        join movies m on m.id = um.movie_id
        where um.user_id = auth.uid() and um.movie_id <> target_id
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
