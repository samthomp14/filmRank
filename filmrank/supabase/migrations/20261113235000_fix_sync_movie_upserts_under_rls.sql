-- sync_movie_genres / sync_movie_people failed for every signed-in caller as
-- soon as a genre or person name already existed:
--
--   new row violates row-level security policy (USING expression) for table "genres"
--
-- Both are SECURITY INVOKER and upserted with
--   on conflict (lower(btrim(name))) do update set name = <table>.name
-- purely so RETURNING would yield the existing row's id. ON CONFLICT DO UPDATE
-- is checked against the table's UPDATE policies, and genres/people only have
-- SELECT and INSERT policies, so the conflict path errors and the whole call
-- rolls back. The client calls these from movieImportUtils.ts as the signed-in
-- user, so imported films whose genre/director/actors were already in the
-- catalog (i.e. nearly all of them) got no genre or credit links. The
-- catalog-sync edge function runs as service_role, which bypasses RLS, so it
-- was unaffected.
--
-- Adding UPDATE policies would let any user rename any genre or person, so
-- instead: insert with ON CONFLICT DO NOTHING, and when that inserts nothing,
-- read the existing id back through the SELECT policy. The lookup uses the
-- same lower(btrim(name)) expression as the unique index, so it is an index
-- probe. Bodies are otherwise unchanged; search_path stays pinned to ''.
-- CREATE OR REPLACE keeps the existing EXECUTE grants.

CREATE OR REPLACE FUNCTION public.sync_movie_genres(p_movie_id uuid, p_genre text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
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

    -- RETURNING ... INTO sets v_genre_id to null when the conflict skips the row.
    insert into public.genres (name) values (v_name)
      on conflict (lower(btrim(name))) do nothing
      returning id into v_genre_id;
    if v_genre_id is null then
      select g.id into v_genre_id
        from public.genres g
        where lower(btrim(g.name)) = lower(btrim(v_name));
    end if;

    insert into public.movie_genres (movie_id, genre_id)
      values (p_movie_id, v_genre_id)
      on conflict (movie_id, genre_id) do nothing;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_movie_people(p_movie_id uuid, p_director text, p_writer text, p_actors text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
declare
  v_raw text;
  v_name text;
  v_person_id uuid;
  v_billing int;
begin
  -- RETURNING ... INTO sets v_person_id to null when the conflict skips the row.
  if p_director is not null and p_director <> '' and p_director <> 'N/A' then
    foreach v_raw in array string_to_array(p_director, ',') loop
      v_name := btrim(regexp_replace(v_raw, '\s*\([^)]*\)\s*', '', 'g'));
      if v_name = '' then continue; end if;
      insert into public.people (name) values (v_name)
        on conflict (lower(btrim(name))) do nothing
        returning id into v_person_id;
      if v_person_id is null then
        select p.id into v_person_id
          from public.people p
          where lower(btrim(p.name)) = lower(btrim(v_name));
      end if;
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
        on conflict (lower(btrim(name))) do nothing
        returning id into v_person_id;
      if v_person_id is null then
        select p.id into v_person_id
          from public.people p
          where lower(btrim(p.name)) = lower(btrim(v_name));
      end if;
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
        on conflict (lower(btrim(name))) do nothing
        returning id into v_person_id;
      if v_person_id is null then
        select p.id into v_person_id
          from public.people p
          where lower(btrim(p.name)) = lower(btrim(v_name));
      end if;
      insert into public.movie_people (movie_id, person_id, role, billing_order)
        values (p_movie_id, v_person_id, 'actor', v_billing)
        on conflict (movie_id, person_id, role) do nothing;
      v_billing := v_billing + 1;
    end loop;
  end if;
end;
$function$;
