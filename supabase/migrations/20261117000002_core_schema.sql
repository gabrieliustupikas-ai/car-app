-- ROADCLUB · 0002 · core tables
-- Conventions: uuid PKs, timestamptz, geography(…, 4326) for anything on the map, GiST on every geo column.
-- Safety: no table stores or ranks by speed. trip_points keep raw fixes only for the retention window.

-- ===================== identity & privacy =====================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username extensions.citext unique check (username ~ '^[a-zA-Z0-9_.]{3,24}$'),
  display_name text check (char_length(display_name) <= 48),
  avatar_url text,
  bio text check (char_length(bio) <= 280),
  language text not null default 'lt' check (language in ('lt', 'en', 'lv', 'et', 'pl')),
  country_code text not null default 'LT' check (country_code ~ '^[A-Z]{2}$'),
  home_region text,
  -- gamification (written only by server functions)
  total_xp bigint not null default 0 check (total_xp >= 0),
  level smallint not null default 1 check (level between 1 and 50),
  total_distance_m bigint not null default 0,
  total_trips integer not null default 0,
  hexes_explored integer not null default 0,
  -- privacy (defaults are the most private option)
  age_confirmed_at timestamptz,               -- 16+ age gate
  location_sharing public.visibility_level not null default 'ghost',
  location_paused_until timestamptz,
  profile_visibility public.content_visibility not null default 'friends',
  trips_visibility public.content_visibility not null default 'private',
  retention_days integer not null default 365 check (retention_days between 30 and 1825),
  auto_detect_trips boolean not null default true,
  active_car_id uuid,
  demo_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles for each row execute function public.tg_set_updated_at();

create table public.consents (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('terms', 'privacy', 'location_background', 'analytics', 'marketing', 'voice')),
  version text not null,
  granted boolean not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, version, created_at)
);

create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ===================== garage =====================
create table public.cars (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  make text not null check (char_length(make) between 1 and 40),
  model text not null check (char_length(model) between 1 and 60),
  year smallint check (year between 1900 and 2100),
  nickname text check (char_length(nickname) <= 40),
  color text,
  photos text[] not null default '{}',
  mods jsonb not null default '[]'::jsonb,
  total_distance_m bigint not null default 0,
  ta_due_date date,              -- Lithuanian technical inspection (techninė apžiūra)
  insurance_due_date date,
  oil_due_km integer,
  tires_season text check (tires_season in ('summer', 'winter', 'all_season')),
  is_public boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cars_owner_idx on public.cars (owner_id);
create trigger cars_updated_at before update on public.cars for each row execute function public.tg_set_updated_at();
alter table public.profiles add constraint profiles_active_car_fk foreign key (active_car_id) references public.cars (id) on delete set null;

-- ===================== trips =====================
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  client_trip_id uuid not null,
  car_id uuid references public.cars (id) on delete set null,
  title text check (char_length(title) <= 80),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  local_day date not null,
  timezone text not null default 'Europe/Vilnius',
  distance_m integer not null check (distance_m >= 0),
  duration_s integer not null check (duration_s >= 0),
  moving_time_s integer not null check (moving_time_s >= 0),
  elevation_gain_m integer not null default 0,
  elevation_loss_m integer not null default 0,
  point_count integer not null default 0,
  route extensions.geography(LineString, 4326),      -- simplified (~5 m) for display; nulled after retention
  start_point extensions.geography(Point, 4326),
  end_point extensions.geography(Point, 4326),
  route_hexes text[] not null default '{}',          -- res-8 cells, used for anti-farming similarity
  mode public.transport_mode not null default 'car',
  mode_confidence real not null default 0,
  verdict public.trip_verdict not null default 'ok',
  flags text[] not null default '{}',
  is_passenger boolean not null default false,
  manual boolean not null default false,
  credited_km real not null default 0,               -- km that counted toward the daily cap
  xp_total integer not null default 0,
  new_hexes integer not null default 0,
  visibility public.content_visibility not null default 'private',
  platform text,
  app_version text,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  constraint trips_time_order check (ended_at >= started_at),
  constraint trips_client_unique unique (user_id, client_trip_id)
);
create index trips_user_started_idx on public.trips (user_id, started_at desc);
create index trips_user_day_idx on public.trips (user_id, local_day);
create index trips_route_gix on public.trips using gist (route);
create index trips_start_gix on public.trips using gist (start_point);
create index trips_car_idx on public.trips (car_id) where car_id is not null;

-- Raw fixes, chunked (≤1000 fixes per row, encoded with the core codec) and range-partitioned by month.
-- 100k+ fixes per user = ~100 rows, and old months are dropped/purged cheaply.
create table public.trip_points (
  trip_id uuid not null,
  user_id uuid not null,
  chunk_seq integer not null,
  started_at timestamptz not null,
  point_count integer not null,
  track jsonb not null,               -- EncodedTrack (see packages/core/src/codec.ts)
  primary key (trip_id, chunk_seq, started_at)
) partition by range (started_at);
create index trip_points_user_idx on public.trip_points (user_id, started_at);

create table public.trip_points_default partition of public.trip_points default;

create or replace function public.ensure_trip_points_partition(p_month date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name text := format('trip_points_%s', to_char(v_start, 'YYYY_MM'));
begin
  if to_regclass('public.' || v_name) is null then
    execute format('create table public.%I partition of public.trip_points for values from (%L) to (%L)', v_name, v_start, v_end);
    execute format('alter table public.%I enable row level security', v_name);
  end if;
end $$;

do $$
declare m int;
begin
  for m in -2..12 loop
    perform public.ensure_trip_points_partition((date_trunc('month', now()) + make_interval(months => m))::date);
  end loop;
end $$;

-- ===================== exploration & XP =====================
create table public.hexes_discovered (
  user_id uuid not null references public.profiles (id) on delete cascade,
  h3 text not null,                 -- res-8 cell index (hex string; bigint would overflow JS numbers)
  region_h3 text not null,          -- res-6 parent for regional stats
  first_trip_id uuid references public.trips (id) on delete set null,
  first_seen_at timestamptz not null default now(),
  visit_count integer not null default 1,
  primary key (user_id, h3)
);
create index hexes_region_idx on public.hexes_discovered (user_id, region_h3);

create table public.ranks (
  level smallint primary key check (level between 1 and 50),
  rank_key text not null,
  name_lt text not null,
  name_en text not null,
  tier text not null,
  xp_required bigint not null
);

create table public.xp_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  source public.xp_source not null,
  amount integer not null,
  trip_id uuid references public.trips (id) on delete cascade,
  ref_type text,
  ref_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index xp_events_user_idx on public.xp_events (user_id, created_at desc);

create table public.badges (
  id text primary key check (id ~ '^[a-z0-9_]+$'),
  category text not null check (category in ('distance', 'exploration', 'region', 'route', 'time', 'streak', 'social', 'club', 'event', 'garage', 'level', 'special')),
  name_lt text not null,
  name_en text not null,
  description_lt text not null,
  description_en text not null,
  icon text not null default 'medal',
  tier text not null default 'bronze' check (tier in ('bronze', 'silver', 'gold', 'platinum')),
  criteria jsonb not null,           -- data-driven rule evaluated by the badge engine (Phase 2)
  xp_reward integer not null default 100,
  is_secret boolean not null default false,
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.user_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_id text not null references public.badges (id) on delete cascade,
  earned_at timestamptz not null default now(),
  trip_id uuid references public.trips (id) on delete set null,
  primary key (user_id, badge_id)
);

create table public.streaks (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  current_daily integer not null default 0,
  longest_daily integer not null default 0,
  current_weekly integer not null default 0,
  longest_weekly integer not null default 0,
  last_drive_day date,
  last_drive_week date,
  freezes_available smallint not null default 1 check (freezes_available between 0 and 5),
  updated_at timestamptz not null default now()
);

-- Named areas for explored-% and region badges (counties, cities, countries, landmarks, corridors)
create table public.geo_areas (
  key text primary key,
  kind text not null check (kind in ('country', 'county', 'city', 'landmark', 'corridor')),
  parent_key text references public.geo_areas (key),
  name_lt text not null,
  name_en text not null,
  geom extensions.geography(MultiPolygon, 4326) not null,
  hex_count integer            -- precomputed number of res-8 cells (denominator for explored %)
);
create index geo_areas_gix on public.geo_areas using gist (geom);

-- ===================== social graph =====================
create table public.friendships (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create unique index friendships_pair_uniq on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id, status);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

-- ===================== clubs =====================
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug extensions.citext unique not null check (slug ~ '^[a-z0-9-]{3,32}$'),
  name text not null check (char_length(name) between 3 and 48),
  description text check (char_length(description) <= 1000),
  privacy public.club_privacy not null default 'public',
  color_primary text not null default '#00E5FF' check (color_primary ~ '^#[0-9A-Fa-f]{6}$'),
  color_secondary text not null default '#0B0F14' check (color_secondary ~ '^#[0-9A-Fa-f]{6}$'),
  badge_url text,
  cover_url text,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  home_point extensions.geography(Point, 4326),
  city text,
  member_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clubs_home_gix on public.clubs using gist (home_point);
create trigger clubs_updated_at before update on public.clubs for each row execute function public.tg_set_updated_at();

create table public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.club_role not null default 'member',
  status public.membership_status not null default 'active',
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index club_members_user_idx on public.club_members (user_id, status);

-- ===================== live map & privacy zones =====================
create table public.safe_areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null check (char_length(label) <= 32),
  center extensions.geography(Point, 4326) not null,
  radius_m integer not null default 300 check (radius_m between 100 and 3000),
  created_at timestamptz not null default now()
);
create index safe_areas_user_idx on public.safe_areas (user_id);
create index safe_areas_gix on public.safe_areas using gist (center);

-- latest position only (no history). Rows expire after 10 minutes of silence.
create table public.live_locations (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  location extensions.geography(Point, 4326) not null,
  heading smallint check (heading between 0 and 359),
  visibility public.visibility_level not null,
  cruise_id uuid,
  updated_at timestamptz not null default now()
);
create index live_locations_gix on public.live_locations using gist (location);
create index live_locations_updated_idx on public.live_locations (updated_at);

-- ===================== map content =====================
create table public.pins (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete set null,
  category public.pin_category not null,
  title text not null check (char_length(title) between 2 and 80),
  description text check (char_length(description) <= 1000),
  location extensions.geography(Point, 4326) not null,
  photos text[] not null default '{}',
  status public.moderation_status not null default 'pending',
  moderated_by uuid references public.profiles (id),
  moderated_at timestamptz,
  rating_avg real not null default 0,
  rating_count integer not null default 0,
  source text not null default 'community' check (source in ('community', 'seed', 'partner', 'osm')),
  created_at timestamptz not null default now()
);
create index pins_gix on public.pins using gist (location);
create index pins_status_idx on public.pins (status, created_at);

create table public.pin_ratings (
  pin_id uuid not null references public.pins (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  primary key (pin_id, user_id)
);

create table public.roads (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete set null,
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 1000),
  geom extensions.geography(LineString, 4326) not null,
  length_m integer generated always as (round(extensions.st_length(geom))::integer) stored,
  tags text[] not null default '{}' check (tags <@ array['twisty', 'scenic', 'coast', 'forest', 'empty_at_night', 'gravel', 'lake', 'historic', 'hills']),
  status public.moderation_status not null default 'pending',
  rating_avg real not null default 0,
  rating_count integer not null default 0,
  source text not null default 'community',
  created_at timestamptz not null default now()
);
create index roads_gix on public.roads using gist (geom);

create table public.road_ratings (
  road_id uuid not null references public.roads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (road_id, user_id)
);

-- ===================== events & cruises =====================
create table public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  club_id uuid references public.clubs (id) on delete set null,
  partner_id uuid,
  kind public.event_kind not null,
  title text not null check (char_length(title) between 3 and 80),
  description text check (char_length(description) <= 4000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location extensions.geography(Point, 4326) not null,
  address text,
  checkin_radius_m integer not null default 250 check (checkin_radius_m between 50 and 2000),
  xp_reward integer not null default 300,
  visibility public.content_visibility not null default 'public',
  cover_url text,
  status public.moderation_status not null default 'approved',
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index events_gix on public.events using gist (location);
create index events_time_idx on public.events (starts_at);

create table public.event_rsvps (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.rsvp_status not null default 'going',
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.cruises (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  club_id uuid references public.clubs (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  title text not null check (char_length(title) between 3 and 80),
  description text check (char_length(description) <= 2000),
  meetup_point extensions.geography(Point, 4326) not null,
  meetup_at timestamptz not null,
  destination extensions.geography(Point, 4326),
  route extensions.geography(LineString, 4326),
  checkpoints jsonb not null default '[]'::jsonb,
  max_participants integer not null default 100 check (max_participants between 2 and 500),
  status public.cruise_status not null default 'planned',
  join_code text unique not null default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  visibility public.content_visibility not null default 'public',
  recording_enabled boolean not null default false,
  xp_bonus integer not null default 200,
  created_at timestamptz not null default now()
);
create index cruises_meetup_gix on public.cruises using gist (meetup_point);
create index cruises_time_idx on public.cruises (meetup_at);

create table public.cruise_participants (
  cruise_id uuid not null references public.cruises (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.cruise_role not null default 'participant',
  status text not null default 'rsvp' check (status in ('rsvp', 'joined', 'left', 'removed')),
  car_id uuid references public.cars (id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (cruise_id, user_id)
);
create index cruise_participants_user_idx on public.cruise_participants (user_id);

-- ===================== voice =====================
create table public.voice_channels (
  id uuid primary key default gen_random_uuid(),
  kind public.voice_channel_kind not null,
  name text not null,
  owner_id uuid references public.profiles (id) on delete cascade,
  club_id uuid references public.clubs (id) on delete cascade,
  cruise_id uuid references public.cruises (id) on delete cascade,
  radius_km smallint check (radius_km in (1, 2, 5, 10)),
  livekit_room text unique not null default ('rc_' || replace(gen_random_uuid()::text, '-', '')),
  recording_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.voice_mutes (
  channel_id uuid not null references public.voice_channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  muted_by uuid references public.profiles (id),
  until timestamptz,
  primary key (channel_id, user_id)
);

-- ===================== challenges & partners =====================
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('detailing', 'tires', 'fuel', 'dealer', 'garage', 'cafe', 'insurance', 'other')),
  logo_url text,
  website text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.events add constraint events_partner_fk foreign key (partner_id) references public.partners (id) on delete set null;

create table public.partner_members (
  partner_id uuid not null references public.partners (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'manager', 'staff')),
  primary key (partner_id, user_id)
);

create table public.partner_locations (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  name text not null,
  location extensions.geography(Point, 4326) not null,
  address text
);
create index partner_locations_gix on public.partner_locations using gist (location);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  scope public.challenge_scope not null,
  club_id uuid references public.clubs (id) on delete cascade,
  partner_id uuid references public.partners (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  title_lt text not null,
  title_en text not null,
  description_lt text,
  description_en text,
  metric public.challenge_metric not null,
  target numeric not null check (target > 0),
  area extensions.geography(MultiPolygon, 4326),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  xp_reward integer not null default 250,
  max_winners integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (scope <> 'club' or club_id is not null),
  check (scope <> 'sponsored' or partner_id is not null)
);
create index challenges_active_idx on public.challenges (is_active, ends_at);

create table public.challenge_progress (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  progress numeric not null default 0,
  completed_at timestamptz,
  claimed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  challenge_id uuid references public.challenges (id) on delete set null,
  title text not null,
  description text,
  total_quantity integer check (total_quantity > 0),
  issued_count integer not null default 0,
  valid_until timestamptz,
  created_at timestamptz not null default now()
);

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  challenge_id uuid references public.challenges (id) on delete set null,
  -- secret token encoded in the QR the business scans; never listable by other users
  token text unique not null default encode(extensions.gen_random_bytes(18), 'base64'),
  status public.redemption_status not null default 'issued',
  issued_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references public.profiles (id),
  unique (coupon_id, user_id)
);

-- ===================== moderation =====================
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type public.report_target not null,
  target_id text not null,
  reason text not null check (reason in ('spam', 'harassment', 'hate', 'dangerous_driving', 'illegal', 'privacy', 'impersonation', 'inappropriate', 'other')),
  details text check (char_length(details) <= 2000),
  status public.report_status not null default 'open',
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index reports_status_idx on public.reports (status, created_at);

-- GDPR requests audit log
create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('export', 'delete')),
  status text not null default 'done',
  created_at timestamptz not null default now()
);
