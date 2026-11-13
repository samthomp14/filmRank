-- Recommendations driven by the user's own ranking.
--
-- Ranking a library is currently a closed loop: you compare films, and you
-- get back a sorted list of the films you already told us about. This adds
-- the missing output -- pointing the ranking at the catalog to surface films
-- the user hasn't got yet -- and, just as importantly, a machine-readable
-- reason for every pick, since "why is this here" is what makes a
-- recommendation trustworthy rather than a wall of posters.
--
-- Why elo_score can't be used directly
-- ------------------------------------
-- elo_score is ordinal and per-user: it only means something relative to the
-- rest of THAT user's library. One user's 1200 is a middling film in a
-- heavily-compared 400-title library (spread ~549-1604); another user's 1200
-- is their runaway favourite in a barely-compared one (spread ~963-1037).
-- Averaging raw elo across a genre would therefore compare incomparable
-- numbers, and would rate every genre at ~1000 for a fresh library. So each
-- library film is first converted to a z-score within its own user's elo
-- distribution. That makes the taste weight signed and scale-free: films the
-- user ranks above their own median pull an affinity positive, films below it
-- pull it negative, and -- usefully -- a never-compared film still sitting at
-- the 1000 default lands at z ~ 0 and contributes nothing either way, which
-- is exactly the right behaviour for evidence the user has not yet supplied.
-- The z-score is clamped to +/-2.5 so one outlier can't swamp an affinity.
--
-- Why every affinity is shrunk
-- ----------------------------
-- A director you have ranked exactly once carries almost no evidence, but
-- their unshrunk mean z-score is just as extreme as a director you have
-- ranked twenty times. Each affinity is therefore multiplied by n/(n+k) --
-- standard empirical-Bayes shrinkage toward zero -- with k chosen per signal
-- from how much evidence one observation is actually worth there (k=2 for
-- directors, whose films are strongly self-similar; k=3 for actors; k=4 for
-- genres, which are broad enough that a handful of films says little). The
-- whole taste score is then scaled again by lib_size/(lib_size+5), so a user
-- with three ranked films gets mostly the quality prior rather than three
-- films' worth of noise presented as insight.
--
-- Cold start
-- ----------
-- The genres a user picked during onboarding (users.preferences->'genres')
-- enter as pseudo-observations in the same shrinkage expression: three
-- imaginary films at weight +0.9. With an empty library they are the only
-- taste signal there is; with a real library they are swamped by it
-- automatically, with no separate cold-start code path to fall out of sync.
-- A user with neither library nor stated genres falls through to the
-- imdb_rating prior alone, i.e. a plain popularity list, reported honestly as
-- reason_type = 'popular'.
--
-- Diversity
-- ---------
-- Director affinity is the sharpest signal and, left alone, returns seven
-- Christopher Nolan films in a top ten -- technically correct and useless as
-- a browse. Picks are penalised by 0.30*ln(their rank among picks sharing the
-- same person signal), which is zero for the first, mild for the second, and
-- never eliminates anything. Genre signals are exempt: there are only ~25
-- genres, so spreading across them would starve the list instead of
-- diversifying it.

-- Dismissals: "not interested" has to survive a reload to be worth offering,
-- and it is the only recommendation state worth persisting -- the rest of the
-- output is recomputed from the ranking each time.
create table if not exists public.recommendation_dismissals (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  movie_id uuid not null references public.movies (id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, movie_id)
);

alter table public.recommendation_dismissals enable row level security;

create policy "Users can view their own dismissals"
on public.recommendation_dismissals for select to authenticated
using (auth.uid() = user_id);

create policy "Users can create their own dismissals"
on public.recommendation_dismissals for insert to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own dismissals"
on public.recommendation_dismissals for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own dismissals"
on public.recommendation_dismissals for delete to authenticated
using (auth.uid() = user_id);

-- Deliberately SECURITY INVOKER (unlike compare_movies/recompute_bt_rankings,
-- which write). Every table it reads is either public (movies, genres,
-- people, and the link tables) or already carries an auth.uid() = user_id RLS
-- policy, so passing somebody else's p_user_id simply yields an empty taste
-- profile rather than leaking their library -- the safety property comes from
-- RLS instead of from an argument check that could drift.
create or replace function public.get_recommendations(
  p_user_id uuid,
  limit_count int default 24
)
returns table (
  movie_id uuid,
  title text,
  year integer,
  url text,
  imdb_rating numeric,
  genre text,
  runtime integer,
  score numeric,
  reason_type text,
  reason_label text,
  reason_id uuid,
  reason_count integer,
  reason_percentile integer,
  reason_movie_id uuid,
  reason_movie_title text,
  reason_movie_rank integer,
  library_size integer
)
language sql
stable
set search_path = public
as $function$
with lib_meta as materialized (
  select count(*)::int as lib_size
  from user_movies um
  where um.user_id = p_user_id and um.removed_at is null
),
lib as (
  select um.movie_id,
         um.elo_score,
         row_number() over (order by um.elo_score desc, um.movie_id) as rank,
         count(*) over ()                 as n,
         avg(um.elo_score) over ()        as mean_elo,
         stddev_pop(um.elo_score) over () as sd_elo
  from user_movies um
  where um.user_id = p_user_id and um.removed_at is null
),
-- w: signed, scale-free taste weight. pct: where the film sits in the user's
-- own library as a 0-1 fraction (1 = their #1), used only for explanations
-- ("you rank these in your top 4%"), never for scoring.
lib_w as materialized (
  select l.movie_id,
         l.rank::int as rank,
         case when coalesce(l.sd_elo, 0) < 1e-9 then 0
              else greatest(-2.5, least(2.5, (l.elo_score - l.mean_elo) / l.sd_elo))
         end as w,
         1.0 - (l.rank - 1.0) / greatest(l.n, 1) as pct
  from lib l
),
seed_genres as (
  select g.id as genre_id
  from users u
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(u.preferences -> 'genres') = 'array'
         then u.preferences -> 'genres'
         else '[]'::jsonb
    end
  ) as pref(name)
  join genres g on lower(btrim(g.name)) = lower(btrim(pref.name))
  where u.id = p_user_id
),
genre_raw as (
  select mg.genre_id, count(*)::int as n, avg(lw.w) as w, avg(lw.pct) as pct
  from lib_w lw
  join movie_genres mg on mg.movie_id = lw.movie_id
  group by mg.genre_id
),
-- Shrinkage and the onboarding seed collapse into one expression: the seed
-- adds 3 pseudo-films at w=+0.9 to the numerator and 3 to the denominator,
-- alongside the k=4 shrinkage constant.
genre_aff as (
  select coalesce(gr.genre_id, sg.genre_id) as sig_id,
         coalesce(gr.n, 0) as n,
         (coalesce(gr.w, 0) * coalesce(gr.n, 0)
            + case when sg.genre_id is not null then 3 * 0.9 else 0 end)
         / (coalesce(gr.n, 0)
            + case when sg.genre_id is not null then 3 else 0 end
            + 4) as aff,
         gr.pct
  from genre_raw gr
  full join seed_genres sg on sg.genre_id = gr.genre_id
),
director_aff as (
  select mp.person_id as sig_id,
         count(*)::int as n,
         avg(lw.w) * count(*) / (count(*) + 2) as aff,
         avg(lw.pct) as pct
  from lib_w lw
  join movie_people mp on mp.movie_id = lw.movie_id and mp.role = 'director'
  group by mp.person_id
),
-- Billing weight 1/(1+0.35*billing_order): top billing 1.0, then .74/.59/.49
-- (the catalog stores at most four actors, orders 0-3). Applied twice, for
-- two different reasons -- here, so a lead in a film you love is stronger
-- evidence of an affinity than a fourth-billed appearance; and again below,
-- so that affinity counts for more in a candidate they actually lead.
actor_aff as (
  select mp.person_id as sig_id,
         count(*)::int as n,
         (sum(lw.w * (1.0 / (1 + 0.35 * coalesce(mp.billing_order, 3))))
            / sum(1.0 / (1 + 0.35 * coalesce(mp.billing_order, 3))))
           * count(*) / (count(*) + 3) as aff,
         sum(lw.pct * (1.0 / (1 + 0.35 * coalesce(mp.billing_order, 3))))
            / sum(1.0 / (1 + 0.35 * coalesce(mp.billing_order, 3))) as pct
  from lib_w lw
  join movie_people mp on mp.movie_id = lw.movie_id and mp.role = 'actor'
  group by mp.person_id
),
-- Note the absent removed_at filter: a film the user explicitly removed from
-- their library is excluded from candidacy outright, not merely penalised.
-- Removal is a deliberate "I don't want this", and recommending it back --
-- however far down the list -- reads as the app ignoring them.
candidates as materialized (
  select m.id, m.title, m.year, m.url, m.imdb_rating, m.genre, m.runtime
  from movies m
  where not exists (
          select 1 from user_movies um
          where um.user_id = p_user_id and um.movie_id = m.id)
    and not exists (
          select 1 from recommendation_dismissals d
          where d.user_id = p_user_id and d.movie_id = m.id)
),
cand_signal as (
  select c.id as movie_id, 'genre'::text as kind, ga.sig_id, ga.aff, ga.n, ga.pct,
         1.0::double precision as share
  from candidates c
  join movie_genres mg on mg.movie_id = c.id
  join genre_aff ga on ga.sig_id = mg.genre_id
  union all
  select c.id, 'director', da.sig_id, da.aff, da.n, da.pct, 1.0
  from candidates c
  join movie_people mp on mp.movie_id = c.id and mp.role = 'director'
  join director_aff da on da.sig_id = mp.person_id
  union all
  select c.id, 'actor', aa.sig_id, aa.aff, aa.n, aa.pct,
         1.0 / (1 + 0.35 * coalesce(mp.billing_order, 3))
  from candidates c
  join movie_people mp on mp.movie_id = c.id and mp.role = 'actor'
  join actor_aff aa on aa.sig_id = mp.person_id
),
-- Shares are normalised within (movie, kind) so each kind contributes a
-- weighted average rather than a sum -- otherwise a four-genre film would out-
-- score a one-genre film purely for being tagged more times. The per-signal
-- weights (director 1.5 > genre 1.0 = actor 1.0) reflect how much a shared
-- credit actually predicts a shared reaction: two films by one director have
-- far more in common than two films sharing "Drama".
cand_scored as materialized (
  select cs.*,
         (case cs.kind when 'genre' then 1.0 when 'director' then 1.5 else 1.0 end)
           * cs.aff * cs.share
           / sum(cs.share) over (partition by cs.movie_id, cs.kind) as contribution
  from cand_signal cs
),
-- Every column reference in this function stays table-qualified: the
-- RETURNS TABLE names are in scope as parameters inside a SQL-language body,
-- so a bare `movie_id` or `imdb_rating` is ambiguous rather than wrong-but-
-- working.
cand_total as (
  select cs.movie_id, sum(cs.contribution) as taste from cand_scored cs group by cs.movie_id
),
-- The single largest positive term, which is what gets explained to the user.
-- Reporting the top contributor rather than a synthesised summary keeps the
-- sentence honest: it is literally the reason the film placed where it did.
best as (
  select distinct on (cs.movie_id)
         cs.movie_id, cs.kind, cs.sig_id, cs.n, cs.pct
  from cand_scored cs
  where cs.contribution > 0.0001
  order by cs.movie_id, cs.contribution desc
),
-- Derived from the catalog rather than hardcoded so the prior stays centred
-- as the hourly TMDB/OMDb sync shifts the catalog's rating distribution.
catalog_stats as (
  select avg(m.imdb_rating) as mu, nullif(stddev_pop(m.imdb_rating), 0) as sd
  from movies m where m.imdb_rating is not null
),
scored as (
  select c.*,
         b.kind as r_kind, b.sig_id as r_sig, b.n as r_n, b.pct as r_pct,
         lm.lib_size,
         coalesce(ct.taste, 0) * (lm.lib_size::numeric / (lm.lib_size + 5))
         -- greatest()/least() ignore nulls, so an unrated film would otherwise
         -- clamp to the maximum prior and float to the top of the list. Those
         -- are mostly unreleased titles, hence the explicit mild penalty.
         + 0.45 * (case when c.imdb_rating is null then -0.5
                        else greatest(-2.0, least(2.0, (c.imdb_rating - cst.mu) / cst.sd))
                   end) as score
  from candidates c
  cross join catalog_stats cst
  cross join lib_meta lm
  left join cand_total ct on ct.movie_id = c.id
  left join best b on b.movie_id = c.id
),
diversified as (
  select s.*,
         s.score - case when s.r_kind in ('director', 'actor')
                        then 0.30 * ln(row_number() over (partition by s.r_kind, s.r_sig
                                                          order by s.score desc))
                        else 0
                   end as final_score
  from scored s
),
-- Cut to limit_count before any of the explanation machinery runs, so the
-- reason joins below touch a couple of dozen rows rather than the catalog.
top as materialized (
  select d.*
  from diversified d
  order by d.final_score desc, d.imdb_rating desc nulls last, d.id
  limit greatest(coalesce(limit_count, 24), 1)
),
-- The user's own highest-ranked film carrying each surfaced signal -- the
-- "because you ranked Heat #3" half of the sentence.
lib_signal as (
  select 'genre'::text as kind, mg.genre_id as sig_id, lw.movie_id, lw.rank
  from lib_w lw join movie_genres mg on mg.movie_id = lw.movie_id
  union all
  select 'director', mp.person_id, lw.movie_id, lw.rank
  from lib_w lw join movie_people mp on mp.movie_id = lw.movie_id and mp.role = 'director'
  union all
  select 'actor', mp.person_id, lw.movie_id, lw.rank
  from lib_w lw join movie_people mp on mp.movie_id = lw.movie_id and mp.role = 'actor'
),
best_film as (
  select distinct on (ls.kind, ls.sig_id) ls.kind, ls.sig_id, ls.movie_id, ls.rank
  from lib_signal ls
  join (select distinct r_kind, r_sig from top) t
    on t.r_kind = ls.kind and t.r_sig = ls.sig_id
  order by ls.kind, ls.sig_id, ls.rank
)
select t.id,
       t.title,
       t.year,
       t.url,
       t.imdb_rating,
       t.genre,
       t.runtime,
       round(t.final_score::numeric, 4),
       -- 'onboarding_genre' distinguishes a genre the user merely told us they
       -- liked (n = 0 ranked films in it) from one their ranking earned, so
       -- the UI never claims evidence that doesn't exist.
       case when t.r_kind is null then 'popular'
            when t.r_kind = 'genre' and t.r_n = 0 then 'onboarding_genre'
            else t.r_kind
       end,
       coalesce(g.name, pe.name),
       t.r_sig,
       t.r_n,
       round((t.r_pct * 100)::numeric)::int,
       bf.movie_id,
       rm.title,
       bf.rank,
       t.lib_size
from top t
left join genres g on t.r_kind = 'genre' and g.id = t.r_sig
left join people pe on t.r_kind in ('director', 'actor') and pe.id = t.r_sig
left join best_film bf on bf.kind = t.r_kind and bf.sig_id = t.r_sig
left join movies rm on rm.id = bf.movie_id
order by t.final_score desc, t.imdb_rating desc nulls last, t.id;
$function$;

grant execute on function public.get_recommendations(uuid, int) to authenticated;
