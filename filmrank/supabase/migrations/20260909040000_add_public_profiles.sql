-- Opt-in, read-only public profiles at /u/:handle.
--
-- Every route in the app sits behind auth, so a finished ranking currently has
-- no shareable surface at all -- the work a user puts into comparing has no
-- artifact they can send to anyone. This adds one: a handle, an explicit
-- opt-in flag, and three readers that expose exactly the fields a public
-- profile needs.
--
-- Why SECURITY DEFINER functions rather than anon SELECT policies on
-- users/user_movies: a policy would have to be added to every table a profile
-- touches, and every later query against those tables would inherit it --
-- including ones written without public exposure in mind. Confining the
-- public surface to three functions keeps the exposed column list written
-- down in one place. Notably absent from it: email, auth user id, and any row
-- belonging to a user who has not opted in.

alter table public.users
  add column handle text,
  add column public_profile boolean not null default false;

-- Lowercase-only, so the unique constraint below is also case-insensitive
-- without needing citext or a functional index, and URL-safe so the handle
-- drops straight into /u/:handle with no escaping. NULL passes a CHECK, which
-- is what lets the column stay null for everyone who hasn't claimed one.
alter table public.users
  add constraint users_handle_format check (handle ~ '^[a-z0-9_]{3,24}$'),
  add constraint users_handle_unique unique (handle);

-- A profile can only be public once it has a handle to be public *at*: with no
-- handle there is no URL that could resolve to it, so the flag would silently
-- do nothing.
alter table public.users
  add constraint users_public_profile_requires_handle
  check (not public_profile or handle is not null);

-- Whether a handle is free for the caller to claim. Readable by anyone on
-- purpose: /u/:handle is a public namespace, so which handles are taken is
-- already discoverable by loading the URL. Excluding the caller's own row
-- means re-saving your existing handle reads as available rather than as a
-- collision with yourself.
create or replace function public.handle_available(p_handle text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $function$
  select p_handle ~ '^[a-z0-9_]{3,24}$'
     and not exists (
       select 1
       from public.users u
       where u.handle = p_handle
         and u.id is distinct from auth.uid()
     );
$function$;

-- Header data for a public profile. Returns zero rows -- not an error -- when
-- the handle is unclaimed or its owner has not opted in, so the page cannot
-- distinguish "no such profile" from "private one" and neither leaks.
--
-- elo_mean/elo_stddev are computed over the user's whole library rather than
-- left to the client, because get_public_profile_movies caps how many rows it
-- returns: deriving the distribution from a truncated list would show a
-- visitor different star ratings than the owner sees on their own profile.
-- stddev_pop (not stddev_samp) matches computeEloStats in src/lib/movieUtils.ts.
create or replace function public.get_public_profile(p_handle text)
returns table (
  handle text,
  display_name text,
  avatar_filename text,
  movie_count integer,
  comparison_count integer,
  first_ranked_at timestamptz,
  elo_mean double precision,
  elo_stddev double precision
)
language sql
security definer
set search_path = public, pg_temp
stable
as $function$
  select
    u.handle,
    coalesce(nullif(btrim(u.name), ''), u.handle) as display_name,
    u.avatar_filename,
    lib.movie_count,
    (select count(*)::integer from public.comparisons c where c.user_id = u.id) as comparison_count,
    lib.first_ranked_at,
    lib.elo_mean,
    lib.elo_stddev
  from public.users u
  cross join lateral (
    select
      count(*)::integer as movie_count,
      min(um.created_at) as first_ranked_at,
      coalesce(avg(um.elo_score), 1000)::double precision as elo_mean,
      coalesce(stddev_pop(um.elo_score), 0)::double precision as elo_stddev
    from public.user_movies um
    where um.user_id = u.id
      and um.removed_at is null
  ) lib
  where u.handle = p_handle
    and u.public_profile;
$function$;

-- The ranked list itself, best first. Capped server-side so the cap can't be
-- lifted by a crafted request; the caller pairs it with movie_count above to
-- say "top 500 of 1203" when a library overruns it.
--
-- Ties break on title so the numbering is stable between loads (elo_score is
-- a float, and untouched movies all sit at the same seed value).
create or replace function public.get_public_profile_movies(
  p_handle text,
  p_limit integer default 500
)
returns table (
  rank_position bigint,
  movie_id uuid,
  title text,
  year integer,
  url text,
  elo_score double precision
)
language sql
security definer
set search_path = public, pg_temp
stable
as $function$
  select
    row_number() over (order by um.elo_score desc nulls last, m.title asc) as rank_position,
    m.id as movie_id,
    m.title,
    m.year,
    m.url,
    um.elo_score
  from public.users u
  join public.user_movies um
    on um.user_id = u.id
   and um.removed_at is null
  join public.movies m
    on m.id = um.movie_id
  where u.handle = p_handle
    and u.public_profile
  order by um.elo_score desc nulls last, m.title asc
  limit least(greatest(coalesce(p_limit, 500), 1), 500);
$function$;

grant execute on function public.handle_available(text) to anon, authenticated;
grant execute on function public.get_public_profile(text) to anon, authenticated;
grant execute on function public.get_public_profile_movies(text, integer) to anon, authenticated;
