-- ROADCLUB · 0007 · landmark & corridor areas used by route badges (approximate; refined in Phase 2,
-- when counties/cities/countries are imported from OpenStreetMap boundaries via scripts/import-areas).
create or replace function public._area_from_point(lat double precision, lng double precision, radius_m double precision)
returns extensions.geography language sql immutable set search_path = public, extensions as $$
  select st_multi(st_buffer(st_setsrid(st_makepoint(lng, lat), 4326)::geography, radius_m)::geometry)::geography;
$$;
create or replace function public._area_from_line(wkt text, width_m double precision)
returns extensions.geography language sql immutable set search_path = public, extensions as $$
  select st_multi(st_buffer(st_geogfromtext(wkt), width_m)::geometry)::geography;
$$;

insert into public.geo_areas (key, kind, name_lt, name_en, geom) values
  ('landmark_trakai', 'landmark', 'Trakų salos pilis', 'Trakai Island Castle', public._area_from_point(54.6527, 24.9335, 700)),
  ('landmark_hill_of_crosses', 'landmark', 'Kryžių kalnas', 'Hill of Crosses', public._area_from_point(56.0153, 23.4167, 600)),
  ('landmark_kernave', 'landmark', 'Kernavė', 'Kernavė', public._area_from_point(54.8862, 24.8508, 900)),
  ('landmark_palanga', 'landmark', 'Palanga', 'Palanga', public._area_from_point(55.9175, 21.0686, 3000)),
  ('landmark_zarasai', 'landmark', 'Zarasai', 'Zarasai', public._area_from_point(55.7300, 26.2460, 3000)),
  ('aukstaitija_np', 'landmark', 'Aukštaitijos nacionalinis parkas', 'Aukštaitija National Park', public._area_from_point(55.4200, 26.0500, 12000)),
  ('curonian_spit', 'corridor', 'Kuršių nerijos kelias', 'Curonian Spit road',
     public._area_from_line('LINESTRING(21.1182 55.7023, 21.1203 55.6417, 21.1235 55.5583, 21.1052 55.4911, 21.0911 55.4253, 21.0644 55.3651, 21.0059 55.3089)', 1500)),
  ('via_baltica', 'corridor', 'Via Baltica (E67)', 'Via Baltica (E67)',
     public._area_from_line('LINESTRING(23.0610 54.3980, 23.3510 54.5590, 23.6600 54.7900, 23.9612 54.9369, 24.0221 55.0331, 24.0919 55.1503, 24.1987 55.2501, 24.2971 55.3602, 24.3483 55.5017, 24.3575 55.7348, 24.3998 56.0670, 24.4100 56.2700)', 600)),
  ('coast_road', 'corridor', 'Pajūrio kelias', 'Coast road',
     public._area_from_line('LINESTRING(21.1440 55.7100, 21.0950 55.8000, 21.0686 55.9175, 21.0730 56.0450)', 800))
on conflict (key) do update set geom = excluded.geom, name_lt = excluded.name_lt, name_en = excluded.name_en, kind = excluded.kind;
