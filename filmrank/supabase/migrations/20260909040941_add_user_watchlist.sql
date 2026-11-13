-- FilmRank has only ever modelled the retrospective half of a film habit:
-- user_movies means "I have watched this and I am ranking it". There is
-- nowhere to record "I intend to watch this", so the app can tell you how you
-- felt about Heat but has no answer to "what do I put on tonight" -- which is
-- exactly why people keep a Letterboxd watchlist open alongside it.
--
-- user_watchlist closes the loop: discover -> watchlist -> watch -> rank. It
-- is deliberately a separate table rather than another flag on user_movies:
-- the two lists mean different things (intent vs. history), a watchlist entry
-- carries no elo/comparison state, and a plain delete on it loses nothing
-- worth keeping (unlike user_movies, where removal has to be a soft delete to
-- preserve comparison history -- see 20260909030000).

create table if not exists public.user_watchlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  movie_id uuid not null references public.movies (id) on delete cascade,
  added_at timestamptz not null default now(),
  -- Free-text "why is this here" ("Ebert 4-star", "for the flight"). Not yet
  -- surfaced in the UI, but the row is the natural home for it.
  note text null,
  primary key (user_id, movie_id)
);

-- The watchlist page reads "everything I have, newest first"; the PK already
-- covers the user_id equality, this makes the ordering an index scan too.
create index if not exists user_watchlist_user_id_added_at_idx
  on public.user_watchlist (user_id, added_at desc);

-- Un-indexed FKs make the referenced side's deletes (a catalog movie being
-- removed) a sequential scan of this table.
create index if not exists user_watchlist_movie_id_idx
  on public.user_watchlist (movie_id);

alter table public.user_watchlist enable row level security;

-- Same shape as user_movies/users: a row is visible and writable only to the
-- user it belongs to. auth.uid() is wrapped in a select so the planner
-- evaluates it once per statement rather than once per row.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_watchlist'
      and policyname = 'Users can read their own watchlist'
  ) then
    create policy "Users can read their own watchlist"
      on public.user_watchlist
      for select
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_watchlist'
      and policyname = 'Users can add to their own watchlist'
  ) then
    create policy "Users can add to their own watchlist"
      on public.user_watchlist
      for insert
      to authenticated
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_watchlist'
      and policyname = 'Users can update their own watchlist'
  ) then
    create policy "Users can update their own watchlist"
      on public.user_watchlist
      for update
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_watchlist'
      and policyname = 'Users can remove from their own watchlist'
  ) then
    create policy "Users can remove from their own watchlist"
      on public.user_watchlist
      for delete
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end $$;

-- Coherence rule, enforced in the database rather than in each caller: a film
-- you have watched is not a film you are waiting to watch, so landing in the
-- library clears any watchlist entry for it. Doing this in a trigger means
-- every path gets it for free -- the catalog "add", the watchlist's own "I
-- watched this", the Letterboxd importer, onboarding -- instead of four
-- client-side deletes that can drift apart.
--
-- The reverse is deliberately NOT automatic: soft-removing a film from the
-- library means "stop ranking this", not "I want to see it again", so it does
-- not reappear on the watchlist. Re-adding it there is a one-click action on
-- the film's page if that is what the user actually meant.
create or replace function public.clear_watchlist_on_library_add()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  -- security definer only to sidestep RLS on user_watchlist; the rows touched
  -- are pinned to NEW.user_id, which user_movies' own RLS has already forced
  -- to equal auth.uid() for any client-originated write.
  delete from public.user_watchlist
  where user_id = new.user_id
    and movie_id = new.movie_id;
  return new;
end;
$function$;

-- Fires on a fresh add and on the un-remove path (removed_at set back to
-- null), which is how a previously-removed film re-enters the library.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'user_movies_clear_watchlist'
      and tgrelid = 'public.user_movies'::regclass
  ) then
    create trigger user_movies_clear_watchlist
      after insert or update of removed_at on public.user_movies
      for each row
      when (new.removed_at is null)
      execute function public.clear_watchlist_on_library_add();
  end if;
end $$;

-- user_movies has SELECT/INSERT/DELETE policies but has never had an UPDATE
-- one, so every client-side `update user_movies` silently matches zero rows.
-- That has been quietly breaking the soft delete added in 20260909030000
-- (`removed_at is not null` is true for 0 of 1077 rows) and the "restore a
-- previously removed film" path in AddMovie/the importer. The watchlist's "I
-- watched this" handoff runs straight through that restore path, so it needs
-- the policy to exist. Purely additive: nothing today depends on the update
-- being denied, and the check is the same ownership predicate as the others.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_movies'
      and policyname = 'Enable update for users based on user_id'
  ) then
    create policy "Enable update for users based on user_id"
      on public.user_movies
      for update
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;
