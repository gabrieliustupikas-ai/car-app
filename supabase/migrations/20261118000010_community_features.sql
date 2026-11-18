-- ROADCLUB · 0010 · community features: police/checkpoint reports, cruise invites, stories, online drivers
-- Reports are short-lived (90 min), crowd-confirmed, rate-limited, and honour blocks.

create type public.road_report_kind as enum ('police', 'hidden_police', 'checkpoint');

create table public.road_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  kind public.road_report_kind not null,
  location extensions.geography(Point, 4326) not null,
  confirms integer not null default 0,
  denies integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 minutes')
);
create index road_reports_gix on public.road_reports using gist (location);
create index road_reports_expiry_idx on public.road_reports (expires_at);

create table public.road_report_votes (
  report_id uuid not null references public.road_reports (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  still_there boolean not null,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);

create type public.invite_status as enum ('pending', 'accepted', 'declined', 'expired');

create table public.cruise_invites (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  cruise_id uuid references public.cruises (id) on delete cascade,
  message text check (char_length(message) <= 200),
  meetup_point extensions.geography(Point, 4326),
  status public.invite_status not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  check (from_user <> to_user)
);
create index cruise_invites_to_idx on public.cruise_invites (to_user, status);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  car_id uuid references public.cars (id) on delete set null,
  trip_id uuid references public.trips (id) on delete set null,
  media_url text not null,
  caption text check (char_length(caption) <= 200),
  visibility public.content_visibility not null default 'friends',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index stories_user_idx on public.stories (user_id, created_at desc);

-- ---------- RLS ----------
alter table public.road_reports enable row level security;
alter table public.road_report_votes enable row level security;
alter table public.cruise_invites enable row level security;
alter table public.stories enable row level security;

grant select, insert on public.road_reports to authenticated;
create policy road_reports_read on public.road_reports for select to authenticated
  using (expires_at > now() and not public.is_blocked(reporter_id, auth.uid()));
-- inserts are rate limited: max 6 reports per user per hour
create policy road_reports_insert on public.road_reports for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and (select count(*) from public.road_reports r where r.reporter_id = auth.uid() and r.created_at > now() - interval '1 hour') < 6
  );

grant select, insert on public.road_report_votes to authenticated;
create policy road_report_votes_own on public.road_report_votes for select to authenticated using (user_id = auth.uid());
create policy road_report_votes_insert on public.road_report_votes for insert to authenticated with check (user_id = auth.uid());

grant select, insert, update on public.cruise_invites to authenticated;
create policy cruise_invites_read on public.cruise_invites for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());
create policy cruise_invites_send on public.cruise_invites for insert to authenticated
  with check (from_user = auth.uid() and not public.is_blocked(from_user, to_user));
create policy cruise_invites_answer on public.cruise_invites for update to authenticated
  using (to_user = auth.uid() and status = 'pending')
  with check (to_user = auth.uid() and status in ('accepted', 'declined'));

grant select, insert, delete on public.stories to authenticated;
create policy stories_read on public.stories for select to authenticated
  using (expires_at > now() and (user_id = auth.uid() or (not public.is_blocked(user_id, auth.uid()) and public.can_see_content(user_id, visibility))));
create policy stories_insert on public.stories for insert to authenticated with check (user_id = auth.uid());
create policy stories_delete on public.stories for delete to authenticated using (user_id = auth.uid());

-- ---------- vote on a report; counts are maintained server-side ----------
create or replace function public.vote_road_report(p_report uuid, p_still_there boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.road_report_votes (report_id, user_id, still_there) values (p_report, auth.uid(), p_still_there)
  on conflict (report_id, user_id) do nothing;
  if found then
    update public.road_reports
       set confirms = confirms + (case when p_still_there then 1 else 0 end),
           denies = denies + (case when p_still_there then 0 else 1 end),
           -- each confirmation extends the report by 15 min; 3 denials end it
           expires_at = case when p_still_there then least(expires_at + interval '15 minutes', created_at + interval '4 hours')
                             when denies + 1 >= 3 then now() else expires_at end
     where id = p_report;
  end if;
end $$;
revoke all on function public.vote_road_report(uuid, boolean) from public;
grant execute on function public.vote_road_report(uuid, boolean) to authenticated;

-- ---------- online drivers near a point (only people who chose to be visible) ----------
create or replace function public.online_drivers(p_lng double precision, p_lat double precision, p_radius_m integer default 25000)
returns table (user_id uuid, display_name text, lng double precision, lat double precision, heading smallint, car text)
language sql stable security definer set search_path = public, extensions as $$
  select l.user_id, p.display_name,
         st_x(l.location::geometry), st_y(l.location::geometry), l.heading,
         (select c.make || ' ' || c.model from public.cars c where c.id = p.active_car_id and c.is_public)
    from public.live_locations l
    join public.profiles p on p.id = l.user_id
   where l.updated_at > now() - interval '10 minutes'
     and l.user_id <> auth.uid()
     and not public.is_blocked(l.user_id, auth.uid())
     and case l.visibility
           when 'everyone' then true
           when 'friends' then public.are_friends(l.user_id, auth.uid())
           when 'club' then public.share_a_club(l.user_id, auth.uid())
           else false  -- 'ghost' is never shown
         end
     and st_dwithin(l.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, least(p_radius_m, 50000))
   limit 200;
$$;
revoke all on function public.online_drivers(double precision, double precision, integer) from public;
grant execute on function public.online_drivers(double precision, double precision, integer) to authenticated;

-- ---------- report / read road reports via RPC (lng/lat in, lng/lat out) ----------
create or replace function public.report_road(p_kind public.road_report_kind, p_lng double precision, p_lat double precision)
returns uuid language plpgsql security invoker set search_path = public, extensions as $$
declare v_id uuid;
begin
  insert into public.road_reports (reporter_id, kind, location)
  values (auth.uid(), p_kind, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.report_road(public.road_report_kind, double precision, double precision) from public;
grant execute on function public.report_road(public.road_report_kind, double precision, double precision) to authenticated;

create or replace function public.road_reports_near(p_lng double precision, p_lat double precision, p_radius_m integer default 30000)
returns table (id uuid, kind public.road_report_kind, lng double precision, lat double precision, confirms integer, created_at timestamptz, expires_at timestamptz)
language sql stable security invoker set search_path = public, extensions as $$
  select r.id, r.kind, st_x(r.location::geometry), st_y(r.location::geometry), r.confirms, r.created_at, r.expires_at
    from public.road_reports r
   where r.expires_at > now()
     and st_dwithin(r.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, least(p_radius_m, 60000))
   limit 300;
$$;
revoke all on function public.road_reports_near(double precision, double precision, integer) from public;
grant execute on function public.road_reports_near(double precision, double precision, integer) to authenticated;

-- ---------- quick cruise invite by position (inviter never learns the recipient's exact location) ----------
create or replace function public.send_cruise_invite(p_to uuid, p_message text, p_lng double precision, p_lat double precision)
returns uuid language plpgsql security invoker set search_path = public, extensions as $$
declare v_id uuid;
begin
  insert into public.cruise_invites (from_user, to_user, message, meetup_point)
  values (auth.uid(), p_to, nullif(left(p_message, 200), ''), st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.send_cruise_invite(uuid, text, double precision, double precision) from public;
grant execute on function public.send_cruise_invite(uuid, text, double precision, double precision) to authenticated;
