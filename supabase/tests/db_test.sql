-- ROADCLUB database tests: RLS, ingestion, idempotency, passenger reversal, GDPR, retention.
-- Run via scripts/verify-migrations.sh. Any failed assertion raises and aborts with a non-zero exit.
\set ON_ERROR_STOP on
set search_path = public, extensions;

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERTION FAILED: %', msg; end if; end $$;

create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

-- ---------- users ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@example.com', '{"display_name":"Ana"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"language":"en"}');

select pg_temp.assert((select count(*) = 2 from profiles), 'profiles auto-created');
select pg_temp.assert((select location_sharing = 'ghost' and trips_visibility = 'private' from profiles where display_name = 'Ana'), 'private defaults');
select pg_temp.assert((select language = 'en' from profiles where id = '00000000-0000-0000-0000-00000000000b'), 'language from metadata');
select pg_temp.assert((select count(*) = 50 from ranks), '50 ranks');
select pg_temp.assert((select count(*) >= 60 from badges), '60+ badges');
select pg_temp.assert(level_for_xp(0) = 1 and level_for_xp(250) = 2 and level_for_xp(249) = 1 and level_for_xp(99999999) = 50, 'level_for_xp');

-- ---------- ingestion (service role) ----------
set role service_role;
select pg_temp.assert(
  (trip_context('00000000-0000-0000-0000-00000000000a', array['881f1d4811fffff','881f1d4813fffff'], now() - interval '1 day', current_date) -> 'new_hexes') = '["881f1d4811fffff", "881f1d4813fffff"]'::jsonb,
  'trip_context new hexes');

create temp table r1 as select ingest_trip('00000000-0000-0000-0000-00000000000a', jsonb_build_object(
  'client_trip_id', '11111111-1111-1111-1111-111111111111', 'car_id', null,
  'started_at', (extract(epoch from now() - interval '2 hours') * 1000)::bigint,
  'ended_at', (extract(epoch from now() - interval '1 hour') * 1000)::bigint,
  'local_day', current_date, 'timezone', 'Europe/Vilnius',
  'distance_m', 25000, 'duration_s', 1500, 'moving_time_s', 1400, 'elevation_gain_m', 40, 'point_count', 3,
  'route_geojson', '{"type":"LineString","coordinates":[[25.2797,54.6872],[25.1,54.66],[24.93,54.64]]}'::jsonb,
  'mode', 'car', 'mode_confidence', 0.8, 'verdict', 'ok', 'flags', '[]'::jsonb, 'is_passenger', false, 'manual', false,
  'credited_km', 25, 'platform', 'ios', 'app_version', '0.1.0', 'count_exploration', true,
  'hexes', '["881f1d4811fffff","881f1d4813fffff"]'::jsonb, 'hex_regions', '["861f1d487ffffff","861f1d487ffffff"]'::jsonb,
  'chunks', jsonb_build_array(jsonb_build_object('seq', 0, 'started_at', (extract(epoch from now() - interval '2 hours') * 1000)::bigint, 'n', 3, 'track', '{"v":1}'::jsonb)),
  'xp_lines', '[{"source":"distance","amount":250,"meta":{"km":25}},{"source":"new_hex","amount":9999},{"source":"trip_bonus","amount":20}]'::jsonb,
  'xp_per_hex', 25, 'hex_cap', 400)) as r;

select pg_temp.assert((select (r ->> 'duplicate')::boolean = false and (r ->> 'new_hexes')::int = 2 and (r ->> 'xp_total')::int = 320 from r1),
  'ingest recounts new-hex XP authoritatively (250 + 2*25 + 20)');
select pg_temp.assert((select total_xp = 320 and level = 2 and total_distance_m = 25000 and hexes_explored = 2 from profiles where id = '00000000-0000-0000-0000-00000000000a'), 'profile totals');
select pg_temp.assert((select count(*) = 1 from trip_points), 'trip points chunk stored');
select pg_temp.assert((select st_length(route) > 20000 from trips), 'route geography stored');

-- idempotent retry
select pg_temp.assert((ingest_trip('00000000-0000-0000-0000-00000000000a', jsonb_build_object('client_trip_id', '11111111-1111-1111-1111-111111111111')) ->> 'duplicate')::boolean, 'duplicate detected');
select pg_temp.assert((select total_xp = 320 from profiles where id = '00000000-0000-0000-0000-00000000000a'), 'no double XP');
-- second visit: hexes are not new
select pg_temp.assert(jsonb_array_length(trip_context('00000000-0000-0000-0000-00000000000a', array['881f1d4811fffff'], now() - interval '1 day', current_date) -> 'new_hexes') = 0, 'known hex');
select pg_temp.assert((trip_context('00000000-0000-0000-0000-00000000000a', array[]::text[], now() - interval '1 day', current_date) ->> 'km_today')::numeric = 25, 'km today');
reset role;

-- ---------- RLS ----------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.assert((select count(*) = 0 from trips), 'B cannot see A private trips');
select pg_temp.assert((select count(*) = 0 from trips_api), 'trips_api respects RLS');
select pg_temp.assert((select count(*) = 0 from trip_points), 'B cannot see A raw points');
select pg_temp.assert((select count(*) = 0 from xp_events), 'B cannot see A xp');
select pg_temp.assert((select count(*) = 1 from profiles), 'B sees only own profile (A is friends-only)');
select pg_temp.assert((select count(*) >= 150 from pins where source = 'osm'), 'Klaipėda OSM pins seeded');
select pg_temp.assert((select count(*) >= 20 from pins), 'approved pins visible');
select pg_temp.assert((select count(*) = 0 from pins where status = 'pending'), 'pending pins hidden');
-- recursion-prone policies evaluate cleanly
select pg_temp.assert((select count(*) from cruises) + (select count(*) from cruise_participants) + (select count(*) from club_members)
  + (select count(*) from voice_channels) + (select count(*) from live_locations) >= 0, 'no policy recursion');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.assert((select count(*) = 1 from trips), 'A sees own trip');
select pg_temp.assert((select route_geojson ->> 'type' = 'LineString' from trips_api), 'trips_api exposes GeoJSON route');
update profiles set age_confirmed_at = now() where id = auth.uid();
do $$ begin
  begin insert into trips (user_id, client_trip_id, started_at, ended_at, local_day, distance_m, duration_s, moving_time_s)
        values (auth.uid(), gen_random_uuid(), now(), now(), current_date, 1, 1, 1);
        raise exception 'client trip insert should fail';
  exception when insufficient_privilege then null; end;
  begin update profiles set total_xp = 999999 where id = auth.uid(); raise exception 'xp update should fail';
  exception when insufficient_privilege then null; end;
  begin perform ingest_trip(auth.uid(), '{}'::jsonb); raise exception 'ingest should be service-only';
  exception when insufficient_privilege then null; end;
end $$;
update profiles set display_name = 'Ana R.' where id = auth.uid();
insert into consents (user_id, kind, version, granted) values (auth.uid(), 'location_background', '2026-11', true);

-- club creation adds owner membership
insert into clubs (slug, name, owner_id) values ('vilnius-night', 'Vilnius Night Cruisers', auth.uid());
select pg_temp.assert((select role = 'owner' from club_members where user_id = auth.uid()), 'owner membership');
-- cruise host auto-joins
insert into cruises (host_id, title, meetup_point, meetup_at) values (auth.uid(), 'Trakai sunset', 'SRID=4326;POINT(25.28 54.68)', now() + interval '1 day');
select pg_temp.assert((select count(*) = 1 from cruise_participants where role = 'host'), 'cruise host participant');

-- passenger reversal
select pg_temp.assert((mark_trip_passenger((select id from trips limit 1)) ->> 'xp_removed')::int = 320, 'passenger removes xp');
select pg_temp.assert((select total_xp = 0 and level = 1 and total_distance_m = 0 from profiles where id = auth.uid()), 'profile reverted');

-- export
select pg_temp.assert((select jsonb_array_length(export_my_data() -> 'trips') = 1), 'export contains trips');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into club_members (club_id, user_id) select id, auth.uid() from clubs where slug = 'vilnius-night';
select pg_temp.assert((select member_count = 2 from clubs where slug = 'vilnius-night'), 'member count');
-- blocks hide content
insert into blocks (blocker_id, blocked_id) values (auth.uid(), '00000000-0000-0000-0000-00000000000a');
reset role;

-- ---------- retention ----------
update profiles set retention_days = 30;
update trips set started_at = now() - interval '40 days', ended_at = now() - interval '40 days' + interval '1 hour';
update trip_points set started_at = now() - interval '40 days';
select pg_temp.assert((purge_expired_location_data() ->> 'trips_anonymized')::int = 1, 'retention anonymizes trips');
select pg_temp.assert((select route is null and distance_m = 25000 from trips), 'aggregates kept, route removed');
select pg_temp.assert((select count(*) = 0 from trip_points), 'raw points purged');

-- ---------- account deletion ----------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select delete_my_account();
reset role;
select pg_temp.assert((select count(*) = 0 from profiles where id = '00000000-0000-0000-0000-00000000000a'), 'profile deleted');
select pg_temp.assert((select count(*) = 0 from trips), 'trips cascaded');
select pg_temp.assert((select count(*) = 0 from clubs where slug = 'vilnius-night'), 'owned club without admins removed');

\echo 'ALL DATABASE TESTS PASSED'
