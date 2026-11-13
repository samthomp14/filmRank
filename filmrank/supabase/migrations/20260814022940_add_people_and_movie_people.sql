-- People catalog, shared across all users (same model as public.movies)
create table public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create unique index people_name_unique_idx on public.people (lower(btrim(name)));

alter table public.people enable row level security;

create policy "Enable read access for all users" on public.people
  for select using (true);

create policy "Enable insert for authenticated users" on public.people
  for insert with check (true);

-- Movie <-> person credits, one row per (movie, person, role)
create table public.movie_people (
  movie_id uuid not null references public.movies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  role text not null check (role in ('director', 'writer', 'actor')),
  billing_order int,
  primary key (movie_id, person_id, role)
);

create index movie_people_person_id_idx on public.movie_people (person_id);
create index movie_people_movie_id_idx on public.movie_people (movie_id);

alter table public.movie_people enable row level security;

create policy "Enable read access for all users" on public.movie_people
  for select using (true);

create policy "Enable insert for authenticated users" on public.movie_people
  for insert with check (true);

-- Parses OMDB's comma-separated Director/Writer/Actors strings (which can
-- include "(story)"/"(uncredited)"-style suffixes) into people + credits.
-- Used both for the one-time backfill below and for every future movie insert,
-- so the parsing rules only live in one place.
create or replace function public.sync_movie_people(
  p_movie_id uuid,
  p_director text,
  p_writer text,
  p_actors text
) returns void
language plpgsql
as $$
declare
  v_raw text;
  v_name text;
  v_person_id uuid;
  v_billing int;
begin
  if p_director is not null and p_director <> '' and p_director <> 'N/A' then
    foreach v_raw in array string_to_array(p_director, ',') loop
      v_name := btrim(regexp_replace(v_raw, '\s*\([^)]*\)\s*', '', 'g'));
      if v_name = '' then continue; end if;
      insert into public.people (name) values (v_name)
        on conflict (lower(btrim(name))) do update set name = public.people.name
        returning id into v_person_id;
      insert into public.movie_people (movie_id, person_id, role, billing_order)
        values (p_movie_id, v_person_id, 'director', null)
        on conflict (movie_id, person_id, role) do nothing;
    end loop;
  end if;

  if p_writer is not null and p_writer <> '' and p_writer <> 'N/A' then
    foreach v_raw in array string_to_array(p_writer, ',') loop
      v_name := btrim(regexp_replace(v_raw, '\s*\([^)]*\)\s*', '', 'g'));
      if v_name = '' then continue; end if;
      insert into public.people (name) values (v_name)
        on conflict (lower(btrim(name))) do update set name = public.people.name
        returning id into v_person_id;
      insert into public.movie_people (movie_id, person_id, role, billing_order)
        values (p_movie_id, v_person_id, 'writer', null)
        on conflict (movie_id, person_id, role) do nothing;
    end loop;
  end if;

  if p_actors is not null and p_actors <> '' and p_actors <> 'N/A' then
    v_billing := 0;
    foreach v_raw in array string_to_array(p_actors, ',') loop
      v_name := btrim(regexp_replace(v_raw, '\s*\([^)]*\)\s*', '', 'g'));
      if v_name = '' then
        v_billing := v_billing + 1;
        continue;
      end if;
      insert into public.people (name) values (v_name)
        on conflict (lower(btrim(name))) do update set name = public.people.name
        returning id into v_person_id;
      insert into public.movie_people (movie_id, person_id, role, billing_order)
        values (p_movie_id, v_person_id, 'actor', v_billing)
        on conflict (movie_id, person_id, role) do nothing;
      v_billing := v_billing + 1;
    end loop;
  end if;
end;
$$;

grant execute on function public.sync_movie_people(uuid, text, text, text) to authenticated;

-- One-time backfill from existing movies
do $$
begin
  perform public.sync_movie_people(m.id, m.director, m.metadata ->> 'Writer', m.metadata ->> 'Actors')
  from public.movies m;
end;
$$;
