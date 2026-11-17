-- ROADCLUB · 0004 · server functions: signup, trip ingestion, XP, GDPR, retention

-- ---------- new user bootstrap ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, language)
  values (new.id,
          coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)),
          coalesce(nullif(new.raw_user_meta_data ->> 'language', ''), 'lt'))
  on conflict (id) do nothing;
  insert into public.streaks (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- club owner becomes a member; member_count stays in sync
create or replace function public.tg_club_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.club_members (club_id, user_id, role, status) values (new.id, new.owner_id, 'owner', 'active');
  return new;
end $$;
create trigger clubs_after_insert after insert on public.clubs for each row execute function public.tg_club_created();

create or replace function public.tg_club_member_count() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_club uuid := coalesce(new.club_id, old.club_id);
begin
  update public.clubs set member_count = (select count(*) from public.club_members where club_id = v_club and status = 'active') where id = v_club;
  return null;
end $$;
create trigger club_members_count after insert or update or delete on public.club_members for each row execute function public.tg_club_member_count();

create or replace function public.tg_cruise_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.cruise_participants (cruise_id, user_id, role, status) values (new.id, new.host_id, 'host', 'joined');
  return new;
end $$;
create trigger cruises_after_insert after insert on public.cruises for each row execute function public.tg_cruise_created();

-- ---------- levels ----------
create or replace function public.level_for_xp(p_xp bigint) returns smallint
language sql stable set search_path = public as $$
  select coalesce(max(level), 1)::smallint from public.ranks where xp_required <= greatest(p_xp, 0);
$$;

-- ---------- trip ingestion (called by the trip-ingest Edge Function with the service role) ----------

-- One round-trip for everything the pipeline needs from storage.
create or replace function public.trip_context(p_user uuid, p_cells text[], p_since timestamptz, p_day date)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'new_hexes', coalesce((
      select jsonb_agg(c order by i) from unnest(p_cells) with ordinality as x(c, i)
      where not exists (select 1 from public.hexes_discovered h where h.user_id = p_user and h.h3 = c)), '[]'::jsonb),
    'recent_routes', coalesce((
      select jsonb_agg(to_jsonb(t.route_hexes)) from public.trips t
      where t.user_id = p_user and t.started_at >= p_since and t.verdict <> 'rejected' and not t.is_passenger), '[]'::jsonb),
    'km_today', coalesce((
      select sum(credited_km) from public.trips t where t.user_id = p_user and t.local_day = p_day), 0)
  );
$$;

/*
  p jsonb:
  { client_trip_id, car_id, started_at (ms), ended_at (ms), local_day 'YYYY-MM-DD', timezone,
    distance_m, duration_s, moving_time_s, elevation_gain_m, elevation_loss_m, point_count,
    route_geojson, mode, mode_confidence, verdict, flags[], is_passenger, manual, credited_km,
    platform, app_version, count_exploration bool, hexes[], hex_regions[],
    chunks: [{seq, started_at (ms), n, track}], xp_lines: [{source, amount, meta}], xp_per_hex, hex_cap }
*/
create or replace function public.ingest_trip(p_user uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_trip uuid;
  v_existing uuid;
  v_started timestamptz := to_timestamp((p ->> 'started_at')::double precision / 1000);
  v_new_hexes integer := 0;
  v_xp integer := 0;
  v_line jsonb;
  v_amount integer;
  v_profile public.profiles;
  v_counts boolean := coalesce((p ->> 'count_exploration')::boolean, false);
  v_car uuid := nullif(p ->> 'car_id', '')::uuid;
begin
  -- serialise ingestion per user: makes new-hex accounting and idempotency race-free
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 42));

  select id into v_existing from public.trips where user_id = p_user and client_trip_id = (p ->> 'client_trip_id')::uuid;
  if v_existing is not null then
    select * into v_profile from public.profiles where id = p_user;
    return jsonb_build_object('trip_id', v_existing, 'duplicate', true, 'total_xp', v_profile.total_xp, 'level', v_profile.level);
  end if;

  -- a car id must belong to the user
  if v_car is not null and not exists (select 1 from public.cars where id = v_car and owner_id = p_user) then
    v_car := null;
  end if;

  perform public.ensure_trip_points_partition(v_started::date);

  insert into public.trips (user_id, client_trip_id, car_id, started_at, ended_at, local_day, timezone,
    distance_m, duration_s, moving_time_s, elevation_gain_m, elevation_loss_m, point_count,
    route, start_point, end_point, route_hexes, mode, mode_confidence, verdict, flags,
    is_passenger, manual, credited_km, platform, app_version, visibility)
  select p_user, (p ->> 'client_trip_id')::uuid, v_car, v_started,
    to_timestamp((p ->> 'ended_at')::double precision / 1000), (p ->> 'local_day')::date, p ->> 'timezone',
    (p ->> 'distance_m')::integer, (p ->> 'duration_s')::integer, (p ->> 'moving_time_s')::integer,
    coalesce((p ->> 'elevation_gain_m')::integer, 0), coalesce((p ->> 'elevation_loss_m')::integer, 0),
    coalesce((p ->> 'point_count')::integer, 0),
    g::geography, st_startpoint(g)::geography, st_endpoint(g)::geography,
    coalesce(array(select jsonb_array_elements_text(p -> 'hexes')), '{}'),
    (p ->> 'mode')::public.transport_mode, coalesce((p ->> 'mode_confidence')::real, 0),
    (p ->> 'verdict')::public.trip_verdict, coalesce(array(select jsonb_array_elements_text(p -> 'flags')), '{}'),
    coalesce((p ->> 'is_passenger')::boolean, false), coalesce((p ->> 'manual')::boolean, false),
    coalesce((p ->> 'credited_km')::real, 0), p ->> 'platform', p ->> 'app_version',
    (select trips_visibility from public.profiles where id = p_user)
  from (select case when p ? 'route_geojson' and jsonb_array_length(p -> 'route_geojson' -> 'coordinates') >= 2
                    then st_setsrid(st_geomfromgeojson(p ->> 'route_geojson'), 4326) end as g) r
  returning id into v_trip;

  insert into public.trip_points (trip_id, user_id, chunk_seq, started_at, point_count, track)
  select v_trip, p_user, (c ->> 'seq')::integer, to_timestamp((c ->> 'started_at')::double precision / 1000), (c ->> 'n')::integer, c -> 'track'
  from jsonb_array_elements(coalesce(p -> 'chunks', '[]'::jsonb)) c;

  if v_counts then
    with src as (
      select h, r from unnest(array(select jsonb_array_elements_text(p -> 'hexes')),
                              array(select jsonb_array_elements_text(p -> 'hex_regions'))) as x(h, r)
    ), up as (
      insert into public.hexes_discovered (user_id, h3, region_h3, first_trip_id, first_seen_at)
      select p_user, h, r, v_trip, v_started from src
      on conflict (user_id, h3) do update set visit_count = public.hexes_discovered.visit_count + 1
      returning (xmax = 0) as inserted
    )
    select count(*) filter (where inserted) into v_new_hexes from up;
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(p -> 'xp_lines', '[]'::jsonb)) loop
    v_amount := (v_line ->> 'amount')::integer;
    -- authoritative recount of new hexes (the context lookup happened outside the lock)
    if v_line ->> 'source' = 'new_hex' then
      v_amount := least(v_new_hexes, coalesce((p ->> 'hex_cap')::integer, 400)) * coalesce((p ->> 'xp_per_hex')::integer, 25);
    end if;
    if v_amount <> 0 then
      insert into public.xp_events (user_id, source, amount, trip_id, meta)
      values (p_user, (v_line ->> 'source')::public.xp_source, v_amount, v_trip, coalesce(v_line -> 'meta', '{}'::jsonb));
      v_xp := v_xp + v_amount;
    end if;
  end loop;

  update public.trips set xp_total = v_xp, new_hexes = v_new_hexes where id = v_trip;

  update public.profiles set
    total_xp = total_xp + v_xp,
    level = public.level_for_xp(total_xp + v_xp),
    total_distance_m = total_distance_m + case when (p ->> 'verdict') <> 'rejected' and not coalesce((p ->> 'is_passenger')::boolean, false)
                                               then (p ->> 'distance_m')::bigint else 0 end,
    total_trips = total_trips + 1,
    hexes_explored = hexes_explored + v_new_hexes
  where id = p_user
  returning * into v_profile;

  if v_car is not null and (p ->> 'verdict') <> 'rejected' then
    update public.cars set total_distance_m = total_distance_m + (p ->> 'distance_m')::bigint where id = v_car;
  end if;

  return jsonb_build_object('trip_id', v_trip, 'duplicate', false, 'total_xp', v_profile.total_xp,
                            'level', v_profile.level, 'new_hexes', v_new_hexes, 'xp_total', v_xp);
end $$;

-- "I was a passenger" after the fact: reverses the trip's XP and distance. Hexes stay (no XP attached).
create or replace function public.mark_trip_passenger(p_trip uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_t public.trips; v_xp integer; v_total bigint;
begin
  select * into v_t from public.trips where id = p_trip and user_id = auth.uid() for update;
  if not found then raise exception 'trip not found' using errcode = 'P0002'; end if;
  if v_t.is_passenger then return jsonb_build_object('ok', true, 'xp_removed', 0); end if;
  select coalesce(sum(amount), 0) into v_xp from public.xp_events where trip_id = p_trip;
  if v_xp <> 0 then
    insert into public.xp_events (user_id, source, amount, trip_id, meta)
    values (auth.uid(), 'adjustment', -v_xp, p_trip, jsonb_build_object('reason', 'passenger'));
  end if;
  update public.trips set is_passenger = true, xp_total = 0, credited_km = 0 where id = p_trip;
  update public.profiles set
    total_xp = greatest(0, total_xp - v_xp),
    level = public.level_for_xp(greatest(0, total_xp - v_xp)),
    total_distance_m = greatest(0, total_distance_m - case when v_t.verdict <> 'rejected' then v_t.distance_m else 0 end)
  where id = auth.uid() returning total_xp into v_total;
  if v_t.car_id is not null then
    update public.cars set total_distance_m = greatest(0, total_distance_m - v_t.distance_m) where id = v_t.car_id;
  end if;
  return jsonb_build_object('ok', true, 'xp_removed', v_xp, 'total_xp', v_total);
end $$;

-- ---------- GDPR ----------
create or replace function public.export_my_data() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v jsonb;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  insert into public.data_requests (user_id, kind) values (v_uid, 'export');
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where id = v_uid),
    'consents', (select coalesce(jsonb_agg(c), '[]') from public.consents c where user_id = v_uid),
    'cars', (select coalesce(jsonb_agg(c), '[]') from public.cars c where owner_id = v_uid),
    'trips', (select coalesce(jsonb_agg(to_jsonb(t) - 'route' - 'start_point' - 'end_point'
                      || jsonb_build_object('route_geojson', st_asgeojson(t.route)::jsonb)), '[]') from public.trips t where user_id = v_uid),
    'trip_points', (select coalesce(jsonb_agg(jsonb_build_object('trip_id', trip_id, 'seq', chunk_seq, 'track', track)), '[]') from public.trip_points where user_id = v_uid),
    'xp_events', (select coalesce(jsonb_agg(x), '[]') from public.xp_events x where user_id = v_uid),
    'hexes_discovered', (select coalesce(jsonb_agg(h.h3), '[]') from public.hexes_discovered h where user_id = v_uid),
    'badges', (select coalesce(jsonb_agg(b), '[]') from public.user_badges b where user_id = v_uid),
    'streaks', (select to_jsonb(s) from public.streaks s where user_id = v_uid),
    'friendships', (select coalesce(jsonb_agg(f), '[]') from public.friendships f where requester_id = v_uid or addressee_id = v_uid),
    'club_memberships', (select coalesce(jsonb_agg(m), '[]') from public.club_members m where user_id = v_uid),
    'safe_areas', (select coalesce(jsonb_agg(to_jsonb(s) - 'center' || jsonb_build_object('center', st_asgeojson(s.center)::jsonb)), '[]') from public.safe_areas s where user_id = v_uid),
    'pins', (select coalesce(jsonb_agg(to_jsonb(p) - 'location' || jsonb_build_object('location', st_asgeojson(p.location)::jsonb)), '[]') from public.pins p where created_by = v_uid),
    'reports_filed', (select coalesce(jsonb_agg(r), '[]') from public.reports r where reporter_id = v_uid),
    'blocks', (select coalesce(jsonb_agg(b.blocked_id), '[]') from public.blocks b where blocker_id = v_uid)
  ) into v;
  return v;
end $$;

-- Deletes the auth user; every user-owned row cascades. Storage objects are removed by the
-- account-delete Edge Function before it calls this (see docs/PRIVACY.md).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  insert into public.data_requests (user_id, kind) values (v_uid, 'delete');
  -- clubs they own are handed to the longest-standing admin, or deleted if none
  update public.clubs c set owner_id = m.user_id
  from (select distinct on (club_id) club_id, user_id from public.club_members
        where role = 'admin' and status = 'active' and user_id <> v_uid order by club_id, joined_at) m
  where c.id = m.club_id and c.owner_id = v_uid;
  delete from public.clubs where owner_id = v_uid;
  delete from auth.users where id = v_uid;
end $$;

-- ---------- retention (daily) ----------
create or replace function public.purge_expired_location_data() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_points integer; v_trips integer; v_live integer;
begin
  delete from public.trip_points tp using public.profiles p
  where tp.user_id = p.id and tp.started_at < now() - make_interval(days => p.retention_days);
  get diagnostics v_points = row_count;

  update public.trips t set route = null, start_point = null, end_point = null, route_hexes = '{}', anonymized_at = now()
  from public.profiles p
  where t.user_id = p.id and t.anonymized_at is null and t.started_at < now() - make_interval(days => p.retention_days);
  get diagnostics v_trips = row_count;

  delete from public.live_locations where updated_at < now() - interval '1 hour';
  get diagnostics v_live = row_count;

  -- keep partitions ahead of time
  perform public.ensure_trip_points_partition((now() + interval '1 month')::date);
  perform public.ensure_trip_points_partition((now() + interval '2 months')::date);

  return jsonb_build_object('trip_point_chunks_deleted', v_points, 'trips_anonymized', v_trips, 'live_locations_deleted', v_live);
end $$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('roadclub-retention', '17 3 * * *', 'select public.purge_expired_location_data()');
  end if;
end $$;

-- ---------- function privileges ----------
revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_admin(uuid), public.is_blocked(uuid, uuid), public.are_friends(uuid, uuid),
  public.club_role_of(uuid, uuid), public.share_a_club(uuid, uuid), public.can_see_content(uuid, public.content_visibility),
  public.is_partner_member(uuid, uuid), public.is_cruise_participant(uuid, uuid), public.is_cruise_host(uuid, uuid),
  public.level_for_xp(bigint), public.mark_trip_passenger(uuid), public.export_my_data(), public.delete_my_account()
  to authenticated;
revoke execute on function public.ingest_trip(uuid, jsonb), public.trip_context(uuid, text[], timestamptz, date),
  public.purge_expired_location_data(), public.ensure_trip_points_partition(date) from authenticated;
grant execute on all functions in schema public to service_role;
