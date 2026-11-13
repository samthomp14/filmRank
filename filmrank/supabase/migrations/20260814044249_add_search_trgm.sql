create extension if not exists pg_trgm;

create index if not exists movies_title_trgm_idx on public.movies using gin (title gin_trgm_ops);
create index if not exists movies_alt_title_trgm_idx on public.movies using gin (alt_title gin_trgm_ops);
create index if not exists people_name_trgm_idx on public.people using gin (name gin_trgm_ops);

create or replace function public.search_movies(q text, limit_count int default 6)
returns table (id uuid, title text, year int, url text, rank real)
language sql stable
as $$
  select
    m.id,
    m.title,
    m.year,
    m.url,
    greatest(similarity(m.title, q), similarity(coalesce(m.alt_title, ''), q)) as rank
  from public.movies m
  where q <> ''
    and (m.title % q or coalesce(m.alt_title, '') % q or m.title ilike '%' || q || '%')
  order by rank desc, m.title asc
  limit limit_count;
$$;

create or replace function public.search_people(q text, limit_count int default 6)
returns table (id uuid, name text, rank real)
language sql stable
as $$
  select
    p.id,
    p.name,
    similarity(p.name, q) as rank
  from public.people p
  where q <> ''
    and (p.name % q or p.name ilike '%' || q || '%')
  order by rank desc, p.name asc
  limit limit_count;
$$;
