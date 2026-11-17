-- ROADCLUB · 0008 · client-facing views (security_invoker → RLS of the caller applies)
create or replace view public.trips_api with (security_invoker = true) as
select t.id, t.user_id, t.client_trip_id, t.car_id, t.title, t.started_at, t.ended_at, t.local_day,
       t.distance_m, t.duration_s, t.moving_time_s, t.elevation_gain_m, t.elevation_loss_m,
       t.mode, t.verdict, t.flags, t.is_passenger, t.manual, t.xp_total, t.new_hexes, t.visibility, t.created_at,
       extensions.st_asgeojson(t.route, 6)::jsonb as route_geojson
from public.trips t;
grant select on public.trips_api to authenticated;

-- age gate is self-attested during onboarding
grant update (age_confirmed_at) on public.profiles to authenticated;
