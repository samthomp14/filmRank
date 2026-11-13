-- Scoped comparisons: let the compare screen draw its pair from a slice of
-- the user's library -- one genre, one decade, one director, one actor, or
-- the films whose ranking is least settled -- instead of always drawing from
-- everything.
--
-- Why: pairwise ranking falls apart when the two options aren't comparable.
-- "Paddington vs Come and See" isn't a preference the user holds, it's a coin
-- flip they resent, and the vote it produces is noise that still moves both
-- elo scores. Every pairwise-ranking product runs into this (Beli users
-- complain about ranking Korean BBQ against a pancake house); Flickchart
-- answered it in film with filtered charts -- by genre, decade, director,
-- actor -- and those became among its most-used features. A scope turns each
-- vote back into a question the user can actually answer.
--
-- ADDITIVE ONLY. get_two_random_movies() is left exactly as it stands, so the
-- unscoped compare path is untouched; the scoped sampler is a separate
-- function the client swaps in when a scope is active. Same return column
-- shape, so the page can switch between them without restructuring.
--
-- Four new functions:
--   _scoped_library_movie_ids     resolves a scope to a set of movie ids
--   get_two_random_movies_scoped  the sampler (mirrors get_two_random_movies)
--   get_compare_scopes            which scopes this library can actually offer
--   get_scoped_leaderboard        the user's top films inside a scope
--
--
-- SAMPLING -- deliberately the same scheme, just restricted
--
-- get_two_random_movies_scoped reuses get_two_random_movies()'s sampling
-- verbatim and only changes the population it draws from. Efraimidis-Spirakis
-- weighted sampling without replacement: stage 1 picks a target weighted by
-- 1/(match_count+1) so under-compared films keep surfacing, stage 2 picks its
-- opponent weighted by a Gaussian kernel (sigma 150) on the elo gap so the
-- matchup is close enough to be informative. Two people editing the sampling
-- policy in two places would drift apart, so the intent here is that this is
-- literally the same expression against a different WHERE.
--
-- The keys are compared in LOG SPACE, and that is not a stylistic choice.
-- Commit 4394c19 fixed a production outage where the compare page 400'd
-- because the naive form key = random()^(1/weight) tripped power()'s explicit
-- range check (Postgres 22003, "value out of range: underflow"). It was
-- invisible while elo_score sat in a tight ~800-1200 band and became common
-- once Bradley-Terry widened the spread to ~568-1610: big elo gaps produce
-- tiny kernel weights, tiny weights produce huge exponents, huge exponents
-- underflow. Because ln is monotonic, argmax(random()^(1/w)) ==
-- argmax(ln(random())/w), and the log form only ever divides a bounded
-- negative number by a floored weight -- it has no exponent to underflow.
-- random() is floored away from exactly 0 first, since ln(0) errors too.
-- power() must not come back into these ORDER BY expressions.
--
-- Scoping makes that risk worse rather than better, which is why it gets
-- spelled out here: a narrow scope (say 12 Horror films spread across the
-- full elo range) has a far higher chance of drawing a distant pair than the
-- whole library does, where near neighbours are plentiful. So the kernel
-- gets one extra guard the original doesn't have: the exponent is clamped at
-- -30 before exp(), because exp() raises the same 22003 on underflow below
-- roughly exp(-745). Since the resulting weight is floored at 1e-4
-- (= exp(-9.2)) anyway, clamping at -30 is behaviourally identical to the
-- unclamped expression for every possible input while being provably safe
-- for any elo gap. (Left out of get_two_random_movies() on purpose -- that
-- function is not being touched.)
--
--
-- 'unsettled' -- what "least certain" means here
--
-- Defined as: the UNSETTLED_POOL films with the fewest comparisons, with
-- BOTH sides of the pair drawn from that pool. Two readings were available --
-- fewest comparisons, or closest elo neighbours -- and this one gets both,
-- because stage 2's elo kernel still runs inside the pool and so picks the
-- nearest neighbour among the least-evidenced films. Low match_count is the
-- primary key because it's the honest measure of missing evidence: two films
-- with close elo scores and 30 matches each are close because the user says
-- so, not because we don't know. Drawing both sides from the pool (rather
-- than just the target, which plain 'all' already biases toward) is what
-- makes the mode meaningfully different from the default -- each vote
-- resolves two uncertain films at once.
--
-- The pool itself is chosen with the same match-count-weighted log-space key
-- rather than a plain ORDER BY match_count: a fresh library has hundreds of
-- films tied at match_count = 0, and a deterministic sort would hand back the
-- same N films on every call forever.
--
--
-- SMALL SCOPES MUST NOT ERROR
--
-- A scope resolving to 0 or 1 eligible films returns zero rows, so the client
-- can render "you only have 3 Westerns ranked -- add more" instead of a
-- failed request. Unknown scope types and malformed scope values (a stale
-- client, a hand-edited localStorage value) resolve to an empty scope for the
-- same reason -- they're a client problem, not a server error.

-- Supports every scope resolution below: each one starts from "this user's
-- active library". The (user_id, movie_id) pkey already covers the user_id
-- prefix, but not the removed_at predicate, which every scope applies.
CREATE INDEX IF NOT EXISTS user_movies_user_active_idx
  ON public.user_movies (user_id)
  WHERE removed_at IS NULL;

-- movie_genres' pkey is (movie_id, genre_id), so a genre-first lookup -- which
-- is exactly what the genre scope and get_compare_scopes do -- has no index.
CREATE INDEX IF NOT EXISTS movie_genres_genre_id_idx
  ON public.movie_genres (genre_id);


-- Resolves a scope to the ids of the user's active library films inside it.
-- Single source of truth for what a scope *means*, shared by the sampler and
-- the leaderboard so the pair the user votes on and the ranking they see can
-- never disagree about membership.
--
-- Returns NULL (not an empty array) for "no such scope" so callers can treat
-- null and empty identically -- both mean "nothing to compare".
CREATE OR REPLACE FUNCTION public._scoped_library_movie_ids(p_scope_type text, p_scope_value text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_uid uuid := auth.uid();
  v_type text := lower(coalesce(nullif(btrim(p_scope_type), ''), 'all'));
  v_value text := nullif(btrim(p_scope_value), '');
  v_uuid uuid;
  v_decade integer;
  v_ids uuid[];
begin
  if v_uid is null then
    return null;
  end if;

  -- 'unsettled' is a sampling rule, not a membership rule: it draws from the
  -- whole library and narrows by match_count at sample time, so as far as
  -- *membership* goes it is the same set as 'all'.
  if v_type in ('all', 'unsettled') then
    select array_agg(um.movie_id) into v_ids
    from user_movies um
    where um.user_id = v_uid and um.removed_at is null;
    return v_ids;
  end if;

  if v_type = 'decade' then
    begin
      v_decade := v_value::integer;
    exception when others then
      return null;
    end;
    -- Tolerate a full year as the scope value ("1995" means the 1990s), so a
    -- caller that passes movies.year straight through still works.
    v_decade := (v_decade / 10) * 10;

    select array_agg(um.movie_id) into v_ids
    from user_movies um
    join movies m on m.id = um.movie_id
    where um.user_id = v_uid
      and um.removed_at is null
      and m.year >= v_decade
      and m.year < v_decade + 10;
    return v_ids;
  end if;

  if v_type in ('genre', 'director', 'actor') then
    -- Genres and people are addressed by id (genres.id / people.id), never by
    -- name. Names collide and get re-cased by the OMDB/TMDB sync, and the
    -- client already gets ids from get_compare_scopes -- so ids are the one
    -- consistent contract.
    begin
      v_uuid := v_value::uuid;
    exception when others then
      return null;
    end;

    if v_type = 'genre' then
      select array_agg(um.movie_id) into v_ids
      from user_movies um
      join movie_genres mg on mg.movie_id = um.movie_id and mg.genre_id = v_uuid
      where um.user_id = v_uid and um.removed_at is null;
    else
      -- movie_people's pkey is (movie_id, person_id, role), so pinning the
      -- role means at most one row per film -- no dedupe needed.
      select array_agg(um.movie_id) into v_ids
      from user_movies um
      join movie_people mp on mp.movie_id = um.movie_id
                          and mp.person_id = v_uuid
                          and mp.role = v_type
      where um.user_id = v_uid and um.removed_at is null;
    end if;
    return v_ids;
  end if;

  return null;
end;
$function$;


-- The scoped counterpart to get_two_random_movies(). Same two-stage
-- Efraimidis-Spirakis sampling, same log-space keys, same column shape --
-- the only difference is the population it samples from.
CREATE OR REPLACE FUNCTION public.get_two_random_movies_scoped(p_scope_type text, p_scope_value text)
 RETURNS TABLE(movie_id uuid, elo_score numeric, match_count integer, title text, imdb_id text, url text)
 LANGUAGE plpgsql
AS $function$
declare
  v_uid uuid := auth.uid();
  v_type text := lower(coalesce(nullif(btrim(p_scope_type), ''), 'all'));
  v_ids uuid[];
  target_id uuid;
  target_elo double precision;
  kernel_sigma constant double precision := 150.0;
  -- Big enough that the mode doesn't replay the same handful of pairs for a
  -- whole session, small enough that it still feels like a focused backlog
  -- rather than "all films, slightly reordered".
  unsettled_pool constant integer := 40;
begin
  if v_uid is null then
    return;
  end if;

  v_ids := public._scoped_library_movie_ids(v_type, p_scope_value);

  if v_type = 'unsettled' then
    -- Narrow to the least-evidenced slice, ties broken by the same
    -- match-count-weighted log-space key the target draw uses -- a plain
    -- ORDER BY match_count would return an identical pool every call on a
    -- library where hundreds of films sit at match_count = 0.
    select array_agg(t.movie_id) into v_ids
    from (
      select um.movie_id
      from user_movies um
      where um.user_id = v_uid
        and um.removed_at is null
        and um.movie_id = any(v_ids)
      order by (coalesce(um.match_count, 0) + 1) * ln(greatest(random(), 1e-300)) desc
      limit unsettled_pool
    ) t;
  end if;

  -- 0 or 1 eligible films is a normal state for a narrow scope, not an error:
  -- return nothing and let the client say so.
  if v_ids is null or coalesce(array_length(v_ids, 1), 0) < 2 then
    return;
  end if;

  -- Stage 1: target weighted by 1/(match_count+1), in log space.
  select um.movie_id, um.elo_score
    into target_id, target_elo
    from user_movies um
    where um.user_id = v_uid
      and um.removed_at is null
      and um.movie_id = any(v_ids)
    order by (coalesce(um.match_count, 0) + 1) * ln(greatest(random(), 1e-300)) desc
    limit 1;

  if target_id is null then
    return;
  end if;

  -- Stage 2: opponent weighted by a Gaussian kernel on the elo gap, also in
  -- log space. greatest(..., -30) keeps exp() clear of its own underflow
  -- range check; -30 sits far below the 1e-4 weight floor, so it changes no
  -- outcome. Final order is randomized so the target isn't always slot 0.
  return query
    select t.movie_id, t.elo_score, t.match_count, t.title, t.imdb_id, t.url
    from (
      select um.movie_id, um.elo_score::numeric as elo_score, um.match_count, m.title, m.imdb_id, m.url
      from user_movies um
      join movies m on m.id = um.movie_id
      where um.user_id = v_uid and um.movie_id = target_id and um.removed_at is null

      union all

      select opp.movie_id, opp.elo_score, opp.match_count, opp.title, opp.imdb_id, opp.url
      from (
        select um.movie_id, um.elo_score::numeric as elo_score, um.match_count, m.title, m.imdb_id, m.url
        from user_movies um
        join movies m on m.id = um.movie_id
        where um.user_id = v_uid
          and um.movie_id <> target_id
          and um.removed_at is null
          and um.movie_id = any(v_ids)
        order by ln(greatest(random(), 1e-300)) / greatest(
          exp(greatest(
            -power(um.elo_score - target_elo, 2) / (2 * power(kernel_sigma, 2)),
            -30::double precision
          )),
          0.0001::double precision
        ) desc
        limit 1
      ) opp
    ) t
    order by random();
end;
$function$;


-- Which scopes this user's library can actually offer, with counts, so the
-- picker only ever shows scopes that have a real matchup behind them.
--
-- p_min_films defaults to 5: five films is ten distinct pairings, enough that
-- a short session doesn't immediately repeat itself, while still keeping
-- two-film "scopes" out of the list. People are additionally capped per role
-- because a large library has a long tail of actors and the picker only needs
-- the ones the user has actually stacked up.
CREATE OR REPLACE FUNCTION public.get_compare_scopes(p_min_films integer DEFAULT 5)
 RETURNS TABLE(scope_type text, scope_value text, label text, film_count integer)
 LANGUAGE sql
 STABLE
AS $function$
  with lib as (
    select um.movie_id
    from user_movies um
    where um.user_id = auth.uid() and um.removed_at is null
  ),
  min_films as (select greatest(coalesce(p_min_films, 5), 2) as threshold)
  select 'genre'::text, g.id::text, g.name, count(*)::integer
  from lib
  join movie_genres mg on mg.movie_id = lib.movie_id
  join genres g on g.id = mg.genre_id
  group by g.id, g.name
  having count(*) >= (select threshold from min_films)

  union all

  select 'decade'::text, (((m.year / 10) * 10))::text, (((m.year / 10) * 10))::text || 's', count(*)::integer
  from lib
  join movies m on m.id = lib.movie_id
  where m.year is not null
  group by (m.year / 10) * 10
  having count(*) >= (select threshold from min_films)

  union all

  select * from (
    select 'director'::text, p.id::text, p.name, count(*)::integer as n
    from lib
    join movie_people mp on mp.movie_id = lib.movie_id and mp.role = 'director'
    join people p on p.id = mp.person_id
    group by p.id, p.name
    having count(*) >= (select threshold from min_films)
    order by n desc, p.name
    limit 15
  ) directors

  union all

  select * from (
    select 'actor'::text, p.id::text, p.name, count(*)::integer as n
    from lib
    join movie_people mp on mp.movie_id = lib.movie_id and mp.role = 'actor'
    join people p on p.id = mp.person_id
    group by p.id, p.name
    having count(*) >= (select threshold from min_films)
    order by n desc, p.name
    limit 15
  ) actors

  order by 1, 4 desc, 3;
$function$;


-- The payoff panel: the user's current standings inside a scope ("your top 10
-- Horror"), which is what makes a scoped session feel like it produced
-- something rather than just filtering the queue.
--
-- Membership comes from _scoped_library_movie_ids, so the leaderboard can't
-- disagree with the pairs the user is being shown.
CREATE OR REPLACE FUNCTION public.get_scoped_leaderboard(
  p_scope_type text,
  p_scope_value text,
  p_limit integer DEFAULT 10
)
 RETURNS TABLE(movie_id uuid, title text, year integer, url text, elo_score numeric, match_count integer)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_uid uuid := auth.uid();
  v_type text := lower(coalesce(nullif(btrim(p_scope_type), ''), 'all'));
  v_ids uuid[];
begin
  if v_uid is null then
    return;
  end if;

  v_ids := public._scoped_library_movie_ids(v_type, p_scope_value);
  if v_ids is null then
    return;
  end if;

  return query
    select um.movie_id, m.title, m.year, m.url, um.elo_score::numeric, um.match_count
    from user_movies um
    join movies m on m.id = um.movie_id
    where um.user_id = v_uid
      and um.removed_at is null
      and um.movie_id = any(v_ids)
    -- 'unsettled' has no meaningful "top": its films are precisely the ones
    -- whose position isn't established yet, so it lists the work remaining
    -- (fewest comparisons first) instead. The CASE evaluates to NULL for
    -- every other scope, leaving every row tied and the elo sort in charge.
    order by
      case when v_type = 'unsettled' then coalesce(um.match_count, 0) end asc nulls last,
      um.elo_score desc
    limit greatest(coalesce(p_limit, 10), 1);
end;
$function$;
