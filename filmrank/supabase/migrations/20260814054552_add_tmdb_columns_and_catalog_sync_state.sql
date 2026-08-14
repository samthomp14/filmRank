-- TMDB linkage: store only the TMDB id (bio/photos are fetched live per TMDB's ToS,
-- not cached in the DB). tmdb_id nullable since it's backfilled incrementally.
alter table public.people add column tmdb_id integer;
create unique index people_tmdb_id_key on public.people (tmdb_id) where tmdb_id is not null;

alter table public.movies add column tmdb_id integer;
create unique index movies_tmdb_id_key on public.movies (tmdb_id) where tmdb_id is not null;

-- Singleton state row tracking TMDB discover pagination progress for catalog-sync.
create table public.catalog_sync_state (
  id smallint primary key default 1,
  tmdb_page int not null default 1,
  updated_at timestamptz not null default now(),
  constraint catalog_sync_state_singleton check (id = 1)
);
insert into public.catalog_sync_state (id) values (1);

alter table public.catalog_sync_state enable row level security;
-- No client access at all; only the service_role-driven Edge Function touches this.

-- Per-run observability log for the catalog-sync cron job.
create table public.catalog_sync_log (
  id bigserial primary key,
  run_at timestamptz not null default now(),
  tmdb_pages_scanned int not null,
  movies_inserted int not null,
  omdb_calls_used int not null,
  notes text
);

alter table public.catalog_sync_log enable row level security;
