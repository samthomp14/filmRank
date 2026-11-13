-- Clear the remaining Supabase security-advisor findings after
-- 20261113210000_lock_down_security_definer_functions.sql.
--
-- 1. security_definer_view (ERROR): public.movies_not_in_user_library
--
--    The view is owned by postgres and ran with its owner's rights, so RLS on
--    movies / user_movies was bypassed. Worse, it is a simple auto-updatable
--    view and anon + authenticated held INSERT/UPDATE/DELETE on it, so a
--    signed-out client could rewrite or delete any row of public.movies
--    through it (movies itself has no UPDATE/DELETE policy).
--
--    With security_invoker = true it runs under the caller's RLS:
--      * movies: "Enable read access for all users" (SELECT, true) -- every
--        film stays visible.
--      * user_movies: "Enable read access for own movies" (auth.uid() = user_id)
--        -- the NOT EXISTS subquery already filters to um.user_id = auth.uid(),
--        so it sees exactly the rows it did before.
--    So the result set for a signed-in user is unchanged.
--
--    Its only caller is MovieGallery.tsx (`.from('movies_not_in_user_library')
--    .select(...)`), rendered on /add and /onboarding, both of which redirect
--    to /login when signed out. So anon needs no access at all, and nobody
--    needs to write through it: authenticated keeps SELECT only.
--
-- 2. function_search_path_mutable (WARN): pin search_path on every function
--    the advisor lists. Bodies are the live definitions verbatim except that
--    table references are schema-qualified (public.*) and the BT temp tables
--    are addressed as pg_temp.*. Built-ins (random, ln, exp, btrim, ...) live
--    in pg_catalog, which is always searched. pg_trgm is installed in public,
--    so search_movies / search_people call public.similarity() and
--    OPERATOR(public.%). CREATE OR REPLACE keeps owners and EXECUTE grants
--    (including the revokes from the previous migration). Functions whose
--    bodies were already fully qualified just get ALTER FUNCTION ... SET.

-------------------------------------------------------------------------------
-- 1. movies_not_in_user_library
-------------------------------------------------------------------------------

alter view public.movies_not_in_user_library set (security_invoker = true);

revoke all on public.movies_not_in_user_library from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.movies_not_in_user_library from authenticated;
grant select on public.movies_not_in_user_library to authenticated;

-------------------------------------------------------------------------------
-- 2a. Already fully qualified: just pin search_path.
-------------------------------------------------------------------------------

alter function public.handle_new_user() set search_path = '';
alter function public.sync_movie_genres(uuid, text) set search_path = '';
alter function public.sync_movie_people(uuid, text, text, text) set search_path = '';

-------------------------------------------------------------------------------
-- 2b. Search (pg_trgm lives in public).
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_movies(q text, limit_count integer DEFAULT 6)
 RETURNS TABLE(id uuid, title text, year integer, url text, rank real)
 LANGUAGE sql
 STABLE
 SET search_path = ''
AS $function$
  select
    m.id,
    m.title,
    m.year,
    m.url,
    greatest(public.similarity(m.title, q), public.similarity(coalesce(m.alt_title, ''), q)) as rank
  from public.movies m
  where q <> ''
    and (m.title OPERATOR(public.%) q
         or coalesce(m.alt_title, '') OPERATOR(public.%) q
         or m.title ilike '%' || q || '%')
  order by rank desc, m.title asc
  limit limit_count;
$function$;

CREATE OR REPLACE FUNCTION public.search_people(q text, limit_count integer DEFAULT 6)
 RETURNS TABLE(id uuid, name text, rank real)
 LANGUAGE sql
 STABLE
 SET search_path = ''
AS $function$
  select
    p.id,
    p.name,
    public.similarity(p.name, q) as rank
  from public.people p
  where q <> ''
    and (p.name OPERATOR(public.%) q or p.name ilike '%' || q || '%')
  order by rank desc, p.name asc
  limit limit_count;
$function$;

-------------------------------------------------------------------------------
-- 2c. Bradley-Terry ranking.
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._recompute_bt_for_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  anchor_id constant uuid := '00000000-0000-0000-0000-000000000000';
  iter integer := 0;
  max_delta numeric := 1;
begin
  drop table if exists pg_temp.bt_strength;
  drop table if exists pg_temp.bt_pairs;

  create temporary table pg_temp.bt_strength (
    movie_id uuid primary key,
    wins numeric not null default 0,
    strength numeric not null default 1
  ) on commit drop;

  create temporary table pg_temp.bt_pairs (
    movie_a uuid not null,
    movie_b uuid not null,
    games numeric not null
  ) on commit drop;

  insert into pg_temp.bt_strength (movie_id, wins, strength)
  select um.movie_id, 0, 1
  from public.user_movies um
  where um.user_id = p_user_id;

  if not found then
    return;
  end if;

  insert into pg_temp.bt_pairs (movie_a, movie_b, games)
  select movie_id, anchor_id, 2 from pg_temp.bt_strength;
  update pg_temp.bt_strength set wins = wins + 1 where true;

  insert into pg_temp.bt_pairs (movie_a, movie_b, games)
  select winner_movie_id, loser_movie_id, count(*)
  from public.comparisons
  where user_id = p_user_id
  group by winner_movie_id, loser_movie_id;

  insert into pg_temp.bt_pairs (movie_a, movie_b, games)
  select loser_movie_id, winner_movie_id, count(*)
  from public.comparisons
  where user_id = p_user_id
  group by winner_movie_id, loser_movie_id;

  update pg_temp.bt_strength s
  set wins = wins + w.win_count
  from (
    select winner_movie_id as movie_id, count(*) as win_count
    from public.comparisons
    where user_id = p_user_id
    group by winner_movie_id
  ) w
  where s.movie_id = w.movie_id;

  while iter < 100 and max_delta > 0.0001 loop
    iter := iter + 1;

    with old_strength as (
      select movie_id, strength from pg_temp.bt_strength
    ),
    denom as (
      select p.movie_a as movie_id,
             sum(p.games / (sa.strength + coalesce(sb.strength, 1))) as d
      from pg_temp.bt_pairs p
      join old_strength sa on sa.movie_id = p.movie_a
      left join old_strength sb on sb.movie_id = p.movie_b
      group by p.movie_a
    ),
    updated as (
      update pg_temp.bt_strength s
      set strength = greatest(s.wins / nullif(d.d, 0), 0.0001)
      from denom d
      where d.movie_id = s.movie_id
      returning s.movie_id, s.strength as new_strength
    )
    select coalesce(max(abs(u.new_strength - o.strength) / o.strength), 0)
      into max_delta
      from updated u
      join old_strength o on o.movie_id = u.movie_id;
  end loop;

  update public.user_movies um
  set bt_score = 1000 + 400 * log(10, s.strength),
      bt_computed_at = now()
  from pg_temp.bt_strength s
  where um.user_id = p_user_id
    and um.movie_id = s.movie_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.recompute_bt_rankings()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  p_user_id uuid := auth.uid();
begin
  if p_user_id is null then
    raise exception 'recompute_bt_rankings requires an authenticated user';
  end if;
  perform public._recompute_bt_for_user(p_user_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_bt_rankings_now()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  p_user_id uuid := auth.uid();
begin
  if p_user_id is null then
    raise exception 'apply_bt_rankings_now requires an authenticated user';
  end if;

  perform public._recompute_bt_for_user(p_user_id);

  update public.user_movies
  set elo_score = bt_score
  where user_id = p_user_id
    and bt_score is not null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_bt_rankings_for_opted_in_users()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  u record;
begin
  for u in
    select id from public.users
    where coalesce((preferences->>'auto_apply_bt_ranking')::boolean, false)
  loop
    perform public._recompute_bt_for_user(u.id);

    update public.user_movies
    set elo_score = bt_score
    where user_id = u.id
      and bt_score is not null;
  end loop;
end;
$function$;

-------------------------------------------------------------------------------
-- 2d. Comparison sampling and scopes.
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_two_random_movies()
 RETURNS TABLE(movie_id uuid, elo_score numeric, match_count integer, title text, imdb_id text, url text)
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
declare
  target_id uuid;
  target_elo double precision;
  kernel_sigma constant double precision := 150.0;
begin
  select um.movie_id, um.elo_score
    into target_id, target_elo
    from public.user_movies um
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
      from public.user_movies um
      join public.movies m on m.id = um.movie_id
      where um.user_id = auth.uid() and um.movie_id = target_id and um.removed_at is null

      union all

      select opp.movie_id, opp.elo_score, opp.match_count, opp.title, opp.imdb_id, opp.url
      from (
        select um.movie_id, um.elo_score::numeric as elo_score, um.match_count, m.title, m.imdb_id, m.url
        from public.user_movies um
        join public.movies m on m.id = um.movie_id
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

CREATE OR REPLACE FUNCTION public._scoped_library_movie_ids(p_scope_type text, p_scope_value text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE
 SET search_path = ''
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
    from public.user_movies um
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
    from public.user_movies um
    join public.movies m on m.id = um.movie_id
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
      from public.user_movies um
      join public.movie_genres mg on mg.movie_id = um.movie_id and mg.genre_id = v_uuid
      where um.user_id = v_uid and um.removed_at is null;
    else
      -- movie_people's pkey is (movie_id, person_id, role), so pinning the
      -- role means at most one row per film -- no dedupe needed.
      select array_agg(um.movie_id) into v_ids
      from public.user_movies um
      join public.movie_people mp on mp.movie_id = um.movie_id
                                 and mp.person_id = v_uuid
                                 and mp.role = v_type
      where um.user_id = v_uid and um.removed_at is null;
    end if;
    return v_ids;
  end if;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_two_random_movies_scoped(p_scope_type text, p_scope_value text)
 RETURNS TABLE(movie_id uuid, elo_score numeric, match_count integer, title text, imdb_id text, url text)
 LANGUAGE plpgsql
 SET search_path = ''
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
      from public.user_movies um
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
    from public.user_movies um
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
      from public.user_movies um
      join public.movies m on m.id = um.movie_id
      where um.user_id = v_uid and um.movie_id = target_id and um.removed_at is null

      union all

      select opp.movie_id, opp.elo_score, opp.match_count, opp.title, opp.imdb_id, opp.url
      from (
        select um.movie_id, um.elo_score::numeric as elo_score, um.match_count, m.title, m.imdb_id, m.url
        from public.user_movies um
        join public.movies m on m.id = um.movie_id
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

CREATE OR REPLACE FUNCTION public.get_compare_scopes(p_min_films integer DEFAULT 5)
 RETURNS TABLE(scope_type text, scope_value text, label text, film_count integer)
 LANGUAGE sql
 STABLE
 SET search_path = ''
AS $function$
  with lib as (
    select um.movie_id
    from public.user_movies um
    where um.user_id = auth.uid() and um.removed_at is null
  ),
  min_films as (select greatest(coalesce(p_min_films, 5), 2) as threshold)
  select 'genre'::text, g.id::text, g.name, count(*)::integer
  from lib
  join public.movie_genres mg on mg.movie_id = lib.movie_id
  join public.genres g on g.id = mg.genre_id
  group by g.id, g.name
  having count(*) >= (select threshold from min_films)

  union all

  select 'decade'::text, (((m.year / 10) * 10))::text, (((m.year / 10) * 10))::text || 's', count(*)::integer
  from lib
  join public.movies m on m.id = lib.movie_id
  where m.year is not null
  group by (m.year / 10) * 10
  having count(*) >= (select threshold from min_films)

  union all

  select * from (
    select 'director'::text, p.id::text, p.name, count(*)::integer as n
    from lib
    join public.movie_people mp on mp.movie_id = lib.movie_id and mp.role = 'director'
    join public.people p on p.id = mp.person_id
    group by p.id, p.name
    having count(*) >= (select threshold from min_films)
    order by n desc, p.name
    limit 15
  ) directors

  union all

  select * from (
    select 'actor'::text, p.id::text, p.name, count(*)::integer as n
    from lib
    join public.movie_people mp on mp.movie_id = lib.movie_id and mp.role = 'actor'
    join public.people p on p.id = mp.person_id
    group by p.id, p.name
    having count(*) >= (select threshold from min_films)
    order by n desc, p.name
    limit 15
  ) actors

  order by 1, 4 desc, 3;
$function$;

CREATE OR REPLACE FUNCTION public.get_scoped_leaderboard(p_scope_type text, p_scope_value text, p_limit integer DEFAULT 10)
 RETURNS TABLE(movie_id uuid, title text, year integer, url text, elo_score numeric, match_count integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path = ''
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
    from public.user_movies um
    join public.movies m on m.id = um.movie_id
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
