create table public.genres (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create unique index genres_name_unique_idx on public.genres (lower(btrim(name)));

alter table public.genres enable row level security;

create policy "Enable read access for all users" on public.genres
  for select using (true);

create policy "Enable insert for authenticated users" on public.genres
  for insert with check (true);

create table public.movie_genres (
  movie_id uuid not null references public.movies(id),
  genre_id uuid not null references public.genres(id),
  primary key (movie_id, genre_id)
);

alter table public.movie_genres enable row level security;

create policy "Enable read access for all users" on public.movie_genres
  for select using (true);

create policy "Enable insert for authenticated users" on public.movie_genres
  for insert with check (true);

create or replace function public.sync_movie_genres(p_movie_id uuid, p_genre text)
returns void
language plpgsql
as $function$
declare
  v_raw text;
  v_name text;
  v_genre_id uuid;
begin
  if p_genre is null or p_genre = '' or p_genre = 'N/A' then
    return;
  end if;

  foreach v_raw in array string_to_array(p_genre, ',') loop
    v_name := btrim(v_raw);
    if v_name = '' then continue; end if;

    insert into public.genres (name) values (v_name)
      on conflict (lower(btrim(name))) do update set name = public.genres.name
      returning id into v_genre_id;

    insert into public.movie_genres (movie_id, genre_id)
      values (p_movie_id, v_genre_id)
      on conflict (movie_id, genre_id) do nothing;
  end loop;
end;
$function$;
