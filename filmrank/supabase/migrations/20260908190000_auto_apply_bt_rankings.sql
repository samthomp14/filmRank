-- Makes the Bradley-Terry fit actually affect a user's ranking, gated by an
-- opt-in flag, instead of bt_score just sitting in its own column as an
-- alternate sort option nobody's other UI reads.
--
-- Splits the existing recompute_bt_rankings() body into:
--   * _recompute_bt_for_user(p_user_id) -- the actual fit, parameterized
--     explicitly instead of via auth.uid() so it can run outside a user's
--     own session (e.g. from a cron job with no request/JWT context).
--     SECURITY DEFINER but NOT reachable by authenticated/anon -- it takes
--     an arbitrary user id, so exposing it directly would let any logged-in
--     user recompute (and, combined with the apply step, overwrite) another
--     user's ranking. Only callable as the owning role (migrations, and the
--     other SECURITY DEFINER functions below that call it internally).
--   * recompute_bt_rankings() -- unchanged public RPC/behavior: computes
--     bt_score for the calling user only. Still just a preview column.
--   * apply_bt_rankings_now() -- new public RPC: recomputes AND copies
--     bt_score into elo_score for the calling user, so turning the
--     Settings toggle on has an immediate, visible effect instead of
--     waiting for the next nightly run.
--   * apply_bt_rankings_for_opted_in_users() -- cron entry point: does the
--     same for every user with preferences.auto_apply_bt_ranking = true.
--     Also NOT reachable by authenticated/anon -- it iterates every opted-in
--     user, so it must only run as the scheduling role (pg_cron), not be
--     triggerable on demand by any client.

CREATE OR REPLACE FUNCTION public._recompute_bt_for_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  anchor_id constant uuid := '00000000-0000-0000-0000-000000000000';
  iter integer := 0;
  max_delta numeric := 1;
begin
  -- ON COMMIT DROP only clears these at the end of the whole transaction,
  -- not between calls -- and apply_bt_rankings_for_opted_in_users() calls
  -- this once per opted-in user inside a single transaction. Drop any
  -- leftovers from a prior call in the same transaction before recreating.
  drop table if exists bt_strength;
  drop table if exists bt_pairs;

  create temporary table bt_strength (
    movie_id uuid primary key,
    wins numeric not null default 0,
    strength numeric not null default 1
  ) on commit drop;

  create temporary table bt_pairs (
    movie_a uuid not null,
    movie_b uuid not null,
    games numeric not null
  ) on commit drop;

  insert into bt_strength (movie_id, wins, strength)
  select um.movie_id, 0, 1
  from user_movies um
  where um.user_id = p_user_id;

  if not found then
    return;
  end if;

  insert into bt_pairs (movie_a, movie_b, games)
  select movie_id, anchor_id, 2 from bt_strength;
  update bt_strength set wins = wins + 1;

  insert into bt_pairs (movie_a, movie_b, games)
  select winner_movie_id, loser_movie_id, count(*)
  from comparisons
  where user_id = p_user_id
  group by winner_movie_id, loser_movie_id;

  insert into bt_pairs (movie_a, movie_b, games)
  select loser_movie_id, winner_movie_id, count(*)
  from comparisons
  where user_id = p_user_id
  group by winner_movie_id, loser_movie_id;

  update bt_strength s
  set wins = wins + w.win_count
  from (
    select winner_movie_id as movie_id, count(*) as win_count
    from comparisons
    where user_id = p_user_id
    group by winner_movie_id
  ) w
  where s.movie_id = w.movie_id;

  while iter < 100 and max_delta > 0.0001 loop
    iter := iter + 1;

    with old_strength as (
      select movie_id, strength from bt_strength
    ),
    denom as (
      select p.movie_a as movie_id,
             sum(p.games / (sa.strength + coalesce(sb.strength, 1))) as d
      from bt_pairs p
      join old_strength sa on sa.movie_id = p.movie_a
      left join old_strength sb on sb.movie_id = p.movie_b
      group by p.movie_a
    ),
    updated as (
      update bt_strength s
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

  update user_movies um
  set bt_score = 1000 + 400 * log(10, s.strength),
      bt_computed_at = now()
  from bt_strength s
  where um.user_id = p_user_id
    and um.movie_id = s.movie_id;
end;
$function$;

revoke execute on function public._recompute_bt_for_user(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.recompute_bt_rankings()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
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

grant execute on function public.recompute_bt_rankings() to authenticated;

CREATE OR REPLACE FUNCTION public.apply_bt_rankings_now()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  p_user_id uuid := auth.uid();
begin
  if p_user_id is null then
    raise exception 'apply_bt_rankings_now requires an authenticated user';
  end if;

  perform public._recompute_bt_for_user(p_user_id);

  update user_movies
  set elo_score = bt_score
  where user_id = p_user_id
    and bt_score is not null;
end;
$function$;

grant execute on function public.apply_bt_rankings_now() to authenticated;

CREATE OR REPLACE FUNCTION public.apply_bt_rankings_for_opted_in_users()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  u record;
begin
  for u in
    select id from users
    where coalesce((preferences->>'auto_apply_bt_ranking')::boolean, false)
  loop
    perform public._recompute_bt_for_user(u.id);

    update user_movies
    set elo_score = bt_score
    where user_id = u.id
      and bt_score is not null;
  end loop;
end;
$function$;

revoke execute on function public.apply_bt_rankings_for_opted_in_users() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'apply-bt-rankings-nightly') then
    perform cron.unschedule('apply-bt-rankings-nightly');
  end if;
end;
$$;

select cron.schedule(
  'apply-bt-rankings-nightly',
  '0 4 * * *',
  $$select public.apply_bt_rankings_for_opted_in_users();$$
);
