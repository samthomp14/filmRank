alter table public.users
  add column if not exists is_private boolean not null default false;

create table if not exists public.follows (
  follower_id uuid not null references public.users (id) on delete cascade,
  followee_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'accepted' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index if not exists follows_followee_id_status_idx
  on public.follows (followee_id, status);

create table if not exists public.feed_likes (
  owner_id uuid not null,
  movie_id uuid not null,
  liker_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, movie_id, liker_id),
  foreign key (owner_id, movie_id)
    references public.user_movies (user_id, movie_id) on delete cascade
);

create index if not exists feed_likes_liker_id_idx on public.feed_likes (liker_id);

create table if not exists public.feed_comments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  movie_id uuid not null,
  author_id uuid not null references public.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  foreign key (owner_id, movie_id)
    references public.user_movies (user_id, movie_id) on delete cascade
);

create index if not exists feed_comments_item_idx
  on public.feed_comments (owner_id, movie_id, created_at);
create index if not exists feed_comments_author_id_idx
  on public.feed_comments (author_id);

alter table public.follows enable row level security;
alter table public.feed_likes enable row level security;
alter table public.feed_comments enable row level security;

drop policy if exists "Users can see follows they are part of" on public.follows;
create policy "Users can see follows they are part of"
  on public.follows for select to authenticated
  using ((select auth.uid()) in (follower_id, followee_id));

drop policy if exists "Users can see their own likes" on public.feed_likes;
create policy "Users can see their own likes"
  on public.feed_likes for select to authenticated
  using ((select auth.uid()) = liker_id);

drop policy if exists "Users can see their own comments" on public.feed_comments;
create policy "Users can see their own comments"
  on public.feed_comments for select to authenticated
  using ((select auth.uid()) = author_id);

create or replace function public.can_view_library(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_owner = (select auth.uid())
    or exists (
      select 1 from public.users u
      where u.id = p_owner and not u.is_private
    )
    or exists (
      select 1 from public.follows f
      where f.follower_id = (select auth.uid())
        and f.followee_id = p_owner
        and f.status = 'accepted'
    );
$$;

create or replace function public.accept_pending_follows_on_public()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_private and not new.is_private then
    update public.follows
       set status = 'accepted'
     where followee_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists users_accept_pending_follows_on_public on public.users;
create trigger users_accept_pending_follows_on_public
  after update of is_private on public.users
  for each row execute function public.accept_pending_follows_on_public();

create or replace function public.get_user_profile(p_user_id uuid)
returns table (
  id uuid,
  name text,
  avatar_filename text,
  is_private boolean,
  is_self boolean,
  follow_status text,
  follows_me boolean,
  followers_count integer,
  following_count integer,
  pending_requests_count integer,
  movie_count integer,
  can_view boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    u.name,
    u.avatar_filename,
    u.is_private,
    u.id = (select auth.uid()),
    coalesce((
      select f.status from public.follows f
      where f.follower_id = (select auth.uid()) and f.followee_id = u.id
    ), 'none'),
    exists (
      select 1 from public.follows f
      where f.follower_id = u.id and f.followee_id = (select auth.uid())
        and f.status = 'accepted'
    ),
    (select count(*)::int from public.follows f
      where f.followee_id = u.id and f.status = 'accepted'),
    (select count(*)::int from public.follows f
      where f.follower_id = u.id and f.status = 'accepted'),
    case when u.id = (select auth.uid()) then
      (select count(*)::int from public.follows f
        where f.followee_id = u.id and f.status = 'pending')
    else 0 end,
    case when public.can_view_library(u.id) then
      (select count(*)::int from public.user_movies um
        where um.user_id = u.id and um.removed_at is null)
    end,
    public.can_view_library(u.id)
  from public.users u
  where u.id = p_user_id
    and (select auth.uid()) is not null;
$$;

create or replace function public.get_user_library(p_user_id uuid)
returns table (
  movie_id uuid,
  title text,
  year integer,
  url text,
  elo_score double precision,
  rank integer,
  added_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id,
    m.title,
    m.year,
    m.url,
    um.elo_score,
    (rank() over (order by um.elo_score desc))::int,
    um.created_at
  from public.user_movies um
  join public.movies m on m.id = um.movie_id
  where um.user_id = p_user_id
    and um.removed_at is null
    and public.can_view_library(p_user_id)
  order by um.elo_score desc;
$$;

create or replace function public.get_follow_list(p_user_id uuid, p_kind text)
returns table (
  user_id uuid,
  name text,
  avatar_filename text,
  my_follow_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    u.name,
    u.avatar_filename,
    coalesce((
      select mf.status from public.follows mf
      where mf.follower_id = (select auth.uid()) and mf.followee_id = u.id
    ), 'none')
  from public.follows f
  join public.users u
    on u.id = case when p_kind = 'followers' then f.follower_id else f.followee_id end
  where f.status = 'accepted'
    and p_kind in ('followers', 'following')
    and case when p_kind = 'followers' then f.followee_id else f.follower_id end = p_user_id
    and public.can_view_library(p_user_id)
  order by f.created_at desc;
$$;

create or replace function public.get_follow_requests()
returns table (
  user_id uuid,
  name text,
  avatar_filename text,
  requested_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.name, u.avatar_filename, f.created_at
  from public.follows f
  join public.users u on u.id = f.follower_id
  where f.followee_id = (select auth.uid()) and f.status = 'pending'
  order by f.created_at desc;
$$;

create or replace function public.follow_user(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_private boolean;
  v_status text;
begin
  if v_me is null then
    raise exception 'Not authenticated';
  end if;
  if p_user_id = v_me then
    raise exception 'You cannot follow yourself';
  end if;

  select u.is_private into v_private from public.users u where u.id = p_user_id;
  if not found then
    raise exception 'User not found';
  end if;

  insert into public.follows (follower_id, followee_id, status)
  values (v_me, p_user_id, case when v_private then 'pending' else 'accepted' end)
  on conflict (follower_id, followee_id) do nothing;

  select f.status into v_status
  from public.follows f
  where f.follower_id = v_me and f.followee_id = p_user_id;
  return v_status;
end;
$$;

create or replace function public.unfollow_user(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.follows
  where follower_id = (select auth.uid()) and followee_id = p_user_id;
$$;

create or replace function public.respond_to_follow_request(p_follower_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_accept then
    update public.follows
       set status = 'accepted'
     where follower_id = p_follower_id
       and followee_id = (select auth.uid())
       and status = 'pending';
  else
    delete from public.follows
     where follower_id = p_follower_id
       and followee_id = (select auth.uid())
       and status = 'pending';
  end if;
end;
$$;

create or replace function public.remove_follower(p_follower_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.follows
  where follower_id = p_follower_id and followee_id = (select auth.uid());
$$;

create or replace function public.get_feed(
  p_limit integer default 30,
  p_before timestamptz default null
)
returns table (
  owner_id uuid,
  owner_name text,
  owner_avatar text,
  movie_id uuid,
  title text,
  year integer,
  url text,
  added_at timestamptz,
  rank integer,
  library_size integer,
  elo_score double precision,
  library_mean double precision,
  library_stddev double precision,
  more_same_day integer,
  like_count integer,
  liked_by_me boolean,
  comment_count integer,
  on_my_watchlist boolean,
  in_my_library boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as id
  ),
  people as (
    select me.id as user_id from me where me.id is not null
    union
    select f.followee_id
    from public.follows f, me
    where f.follower_id = me.id and f.status = 'accepted'
  ),
  lib as (
    select
      um.user_id,
      um.movie_id,
      um.created_at,
      um.elo_score,
      rank() over (partition by um.user_id order by um.elo_score desc) as rnk,
      count(*) over (partition by um.user_id) as lib_size,
      avg(um.elo_score) over (partition by um.user_id) as lib_mean,
      stddev_pop(um.elo_score) over (partition by um.user_id) as lib_sd
    from public.user_movies um
    join people p on p.user_id = um.user_id
    where um.removed_at is null
  ),
  daily as (
    select
      l.*,
      row_number() over (
        partition by l.user_id, (l.created_at at time zone 'utc')::date
        order by l.created_at desc, l.movie_id
      ) as day_pos,
      count(*) over (
        partition by l.user_id, (l.created_at at time zone 'utc')::date
      ) as day_count
    from lib l
  )
  select
    d.user_id,
    u.name,
    u.avatar_filename,
    m.id,
    m.title,
    m.year,
    m.url,
    d.created_at,
    d.rnk::int,
    d.lib_size::int,
    d.elo_score,
    d.lib_mean,
    d.lib_sd,
    case when d.day_pos = 1 then greatest(d.day_count - 3, 0) else 0 end::int,
    (select count(*)::int from public.feed_likes fl
      where fl.owner_id = d.user_id and fl.movie_id = d.movie_id),
    exists (select 1 from public.feed_likes fl, me
      where fl.owner_id = d.user_id and fl.movie_id = d.movie_id and fl.liker_id = me.id),
    (select count(*)::int from public.feed_comments fc
      where fc.owner_id = d.user_id and fc.movie_id = d.movie_id),
    exists (select 1 from public.user_watchlist w, me
      where w.user_id = me.id and w.movie_id = d.movie_id),
    exists (select 1 from public.user_movies mine, me
      where mine.user_id = me.id and mine.movie_id = d.movie_id and mine.removed_at is null)
  from daily d
  join public.users u on u.id = d.user_id
  join public.movies m on m.id = d.movie_id
  where d.day_pos <= 3
    and (p_before is null or d.created_at < p_before)
  order by d.created_at desc, d.movie_id
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

create or replace function public.toggle_feed_like(p_owner_id uuid, p_movie_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Not authenticated';
  end if;
  if not public.can_view_library(p_owner_id) then
    raise exception 'Not allowed';
  end if;

  delete from public.feed_likes
   where owner_id = p_owner_id and movie_id = p_movie_id and liker_id = v_me;
  if found then
    return false;
  end if;

  insert into public.feed_likes (owner_id, movie_id, liker_id)
  values (p_owner_id, p_movie_id, v_me);
  return true;
end;
$$;

create or replace function public.get_feed_comments(p_owner_id uuid, p_movie_id uuid)
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_avatar text,
  body text,
  created_at timestamptz,
  can_delete boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    fc.id,
    fc.author_id,
    u.name,
    u.avatar_filename,
    fc.body,
    fc.created_at,
    (select auth.uid()) in (fc.author_id, fc.owner_id)
  from public.feed_comments fc
  join public.users u on u.id = fc.author_id
  where fc.owner_id = p_owner_id
    and fc.movie_id = p_movie_id
    and public.can_view_library(p_owner_id)
  order by fc.created_at;
$$;

create or replace function public.add_feed_comment(p_owner_id uuid, p_movie_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Not authenticated';
  end if;
  if not public.can_view_library(p_owner_id) then
    raise exception 'Not allowed';
  end if;

  insert into public.feed_comments (owner_id, movie_id, author_id, body)
  values (p_owner_id, p_movie_id, v_me, btrim(p_body))
  returning feed_comments.id into v_id;
  return v_id;
end;
$$;

create or replace function public.delete_feed_comment(p_comment_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.feed_comments
  where id = p_comment_id
    and (select auth.uid()) in (author_id, owner_id);
$$;

create or replace function public.get_movie_friend_ranks(p_movie_id uuid)
returns table (
  user_id uuid,
  name text,
  avatar_filename text,
  rank integer,
  library_size integer,
  elo_score double precision,
  library_mean double precision,
  library_stddev double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  with friends as (
    select f.followee_id as user_id
    from public.follows f
    where f.follower_id = (select auth.uid()) and f.status = 'accepted'
  ),
  lib as (
    select
      um.user_id,
      um.movie_id,
      um.elo_score,
      rank() over (partition by um.user_id order by um.elo_score desc) as rnk,
      count(*) over (partition by um.user_id) as lib_size,
      avg(um.elo_score) over (partition by um.user_id) as lib_mean,
      stddev_pop(um.elo_score) over (partition by um.user_id) as lib_sd
    from public.user_movies um
    join friends fr on fr.user_id = um.user_id
    where um.removed_at is null
  )
  select l.user_id, u.name, u.avatar_filename, l.rnk::int, l.lib_size::int,
         l.elo_score, l.lib_mean, l.lib_sd
  from lib l
  join public.users u on u.id = l.user_id
  where l.movie_id = p_movie_id
  order by l.rnk;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.can_view_library(uuid)',
    'public.get_user_profile(uuid)',
    'public.get_user_library(uuid)',
    'public.get_follow_list(uuid, text)',
    'public.get_follow_requests()',
    'public.follow_user(uuid)',
    'public.unfollow_user(uuid)',
    'public.respond_to_follow_request(uuid, boolean)',
    'public.remove_follower(uuid)',
    'public.get_feed(integer, timestamptz)',
    'public.toggle_feed_like(uuid, uuid)',
    'public.get_feed_comments(uuid, uuid)',
    'public.add_feed_comment(uuid, uuid, text)',
    'public.delete_feed_comment(uuid)',
    'public.get_movie_friend_ranks(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

revoke execute on function public.accept_pending_follows_on_public() from public, anon, authenticated;
