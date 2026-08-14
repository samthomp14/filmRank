-- Tracks every OMDb API call (from the CSV importer and the catalog-sync cron job)
-- so both can see how much of the shared 1,000/day quota has been used today.
create table public.omdb_request_log (
  id bigserial primary key,
  created_at timestamptz not null default now()
);

create index omdb_request_log_created_at_idx on public.omdb_request_log (created_at);

alter table public.omdb_request_log enable row level security;
-- No direct table access; inserts only go through log_omdb_request() below.
-- service_role (used by the catalog-sync Edge Function) bypasses RLS entirely.

create or replace function public.log_omdb_request()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.omdb_request_log default values;
$$;

grant execute on function public.log_omdb_request() to authenticated;
