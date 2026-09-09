-- Fixes a real failure hit through the Settings "Accurate Ranking" toggle:
-- POST rpc/apply_bt_rankings_now returned 400, and postgres_logs showed the
-- exact cause at the exact timestamps of those requests: "UPDATE requires a
-- WHERE clause".
--
-- The culprit is `update bt_strength set wins = wins + 1;` inside
-- _recompute_bt_for_user (auto_apply_bt_rankings migration) -- intentionally
-- WHERE-less, since every movie gets the virtual anchor win. This project's
-- PostgREST/authenticated connection role rejects bare UPDATEs outright.
-- Verification during development ran via the Supabase MCP execute_sql tool
-- (a superuser session without that guard), so it never surfaced until the
-- real toggle hit it through PostgREST. Fixed with a no-op `where true`.

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
  update bt_strength set wins = wins + 1 where true;

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
