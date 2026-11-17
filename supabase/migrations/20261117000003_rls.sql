-- ROADCLUB · 0003 · Row Level Security on every table
-- Principles: default deny; clients never write XP/levels/trip stats (service role only);
-- blocks are honoured everywhere; private-by-default.

-- ---------- helper predicates (security definer so they can read across RLS) ----------
create or replace function public.is_admin(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = p_user);
$$;

create or replace function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a))
  );
$$;

create or replace function public.club_role_of(p_club uuid, p_user uuid default auth.uid()) returns public.club_role
language sql stable security definer set search_path = public as $$
  select role from public.club_members where club_id = p_club and user_id = p_user and status = 'active';
$$;

create or replace function public.share_a_club(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.club_members m1 join public.club_members m2 using (club_id)
    where m1.user_id = a and m2.user_id = b and m1.status = 'active' and m2.status = 'active'
  );
$$;

create or replace function public.can_see_content(p_owner uuid, p_vis public.content_visibility) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then false
    when p_owner = auth.uid() then true
    when public.is_blocked(p_owner, auth.uid()) then false
    when p_vis = 'public' then true
    when p_vis = 'friends' then public.are_friends(p_owner, auth.uid())
    else false
  end;
$$;

create or replace function public.is_cruise_participant(p_cruise uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cruise_participants where cruise_id = p_cruise and user_id = p_user and status <> 'removed');
$$;

create or replace function public.is_cruise_host(p_cruise uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cruises where id = p_cruise and host_id = p_user);
$$;

create or replace function public.is_partner_member(p_partner uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.partner_members where partner_id = p_partner and user_id = p_user);
$$;

-- ---------- enable RLS everywhere ----------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Lock down defaults: revoke broad privileges, then grant what clients may touch.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.ranks, public.badges, public.geo_areas to anon, authenticated;

-- ---------- profiles ----------
grant select on public.profiles to authenticated;
grant update (username, display_name, avatar_url, bio, language, country_code, home_region,
  location_sharing, location_paused_until, profile_visibility, trips_visibility, retention_days,
  auto_detect_trips, active_car_id, demo_mode) on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or (not public.is_blocked(id, auth.uid()) and public.can_see_content(id, profile_visibility)) or public.is_admin());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------- consents (append-only log) ----------
grant select, insert on public.consents to authenticated;
create policy consents_own_select on public.consents for select to authenticated using (user_id = auth.uid());
create policy consents_own_insert on public.consents for insert to authenticated with check (user_id = auth.uid());

-- ---------- app_admins (no client access) ----------
create policy app_admins_none on public.app_admins for select to authenticated using (public.is_admin());
grant select on public.app_admins to authenticated;

-- ---------- cars ----------
grant select, insert, delete on public.cars to authenticated;
grant update (make, model, year, nickname, color, photos, mods, ta_due_date, insurance_due_date, oil_due_km, tires_season, is_public, archived_at) on public.cars to authenticated;
create policy cars_select on public.cars for select to authenticated
  using (owner_id = auth.uid() or (is_public and public.can_see_content(owner_id, (select profile_visibility from public.profiles p where p.id = owner_id))));
create policy cars_insert on public.cars for insert to authenticated with check (owner_id = auth.uid());
create policy cars_update on public.cars for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy cars_delete on public.cars for delete to authenticated using (owner_id = auth.uid());

-- ---------- trips: read own/shared; inserts only via the trip-ingest Edge Function ----------
grant select, delete on public.trips to authenticated;
grant update (title, car_id, visibility) on public.trips to authenticated;
create policy trips_select on public.trips for select to authenticated
  using (user_id = auth.uid() or (verdict <> 'rejected' and public.can_see_content(user_id, visibility)));
create policy trips_update_own on public.trips for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy trips_delete_own on public.trips for delete to authenticated using (user_id = auth.uid());

-- raw points: owner only
grant select on public.trip_points to authenticated;
create policy trip_points_own on public.trip_points for select to authenticated using (user_id = auth.uid());

-- ---------- exploration / XP (read-only for clients) ----------
grant select on public.hexes_discovered, public.xp_events, public.user_badges, public.streaks to authenticated;
create policy hexes_own on public.hexes_discovered for select to authenticated using (user_id = auth.uid());
create policy xp_events_own on public.xp_events for select to authenticated using (user_id = auth.uid());
create policy user_badges_visible on public.user_badges for select to authenticated
  using (user_id = auth.uid() or public.can_see_content(user_id, (select profile_visibility from public.profiles p where p.id = user_id)));
create policy streaks_visible on public.streaks for select to authenticated
  using (user_id = auth.uid() or public.can_see_content(user_id, (select profile_visibility from public.profiles p where p.id = user_id)));
create policy ranks_read on public.ranks for select using (true);
create policy badges_read on public.badges for select using (is_active or public.is_admin());
create policy geo_areas_read on public.geo_areas for select using (true);

-- ---------- social graph ----------
grant select, insert, delete on public.friendships to authenticated;
grant update (status, responded_at) on public.friendships to authenticated;
create policy friendships_select on public.friendships for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy friendships_insert on public.friendships for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending' and not public.is_blocked(requester_id, addressee_id));
create policy friendships_respond on public.friendships for update to authenticated
  using (addressee_id = auth.uid()) with check (addressee_id = auth.uid());
create policy friendships_delete on public.friendships for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

grant select, insert, delete on public.blocks to authenticated;
create policy blocks_own on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy blocks_insert on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy blocks_delete on public.blocks for delete to authenticated using (blocker_id = auth.uid());

grant select, insert, delete on public.follows to authenticated;
create policy follows_select on public.follows for select to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid() or not public.is_blocked(follower_id, auth.uid()));
create policy follows_insert on public.follows for insert to authenticated
  with check (follower_id = auth.uid() and not public.is_blocked(follower_id, followee_id));
create policy follows_delete on public.follows for delete to authenticated using (follower_id = auth.uid());

-- ---------- clubs ----------
grant select, insert, delete on public.clubs to authenticated;
grant update (name, description, privacy, color_primary, color_secondary, badge_url, cover_url, home_point, city) on public.clubs to authenticated;
create policy clubs_select on public.clubs for select to authenticated
  using (privacy <> 'invite' or public.club_role_of(id) is not null or public.is_admin());
create policy clubs_insert on public.clubs for insert to authenticated with check (owner_id = auth.uid());
create policy clubs_update on public.clubs for update to authenticated
  using (public.club_role_of(id) in ('owner', 'admin')) with check (public.club_role_of(id) in ('owner', 'admin'));
create policy clubs_delete on public.clubs for delete to authenticated using (owner_id = auth.uid() or public.is_admin());

grant select, insert, delete on public.club_members to authenticated;
grant update (role, status) on public.club_members to authenticated;
create policy club_members_select on public.club_members for select to authenticated
  using (user_id = auth.uid() or public.club_role_of(club_id) is not null
         or exists (select 1 from public.clubs c where c.id = club_id and c.privacy = 'public'));
-- self-join: public → active, request → pending; admins can invite
create policy club_members_insert on public.club_members for insert to authenticated with check (
  (user_id = auth.uid() and role = 'member' and (
     (status = 'active' and exists (select 1 from public.clubs c where c.id = club_id and c.privacy = 'public'))
     or (status = 'pending' and exists (select 1 from public.clubs c where c.id = club_id and c.privacy = 'request'))))
  or (status = 'invited' and role = 'member' and public.club_role_of(club_id) in ('owner', 'admin')));
create policy club_members_update on public.club_members for update to authenticated
  using (public.club_role_of(club_id) in ('owner', 'admin') or (user_id = auth.uid() and status = 'invited'))
  with check (role <> 'owner' or public.club_role_of(club_id) = 'owner');
create policy club_members_delete on public.club_members for delete to authenticated
  using (user_id = auth.uid() or public.club_role_of(club_id) in ('owner', 'admin'));

-- ---------- safe areas & live locations ----------
grant select, insert, update, delete on public.safe_areas to authenticated;
create policy safe_areas_own on public.safe_areas for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- live_locations writes go through an RPC that applies safe areas & visibility (Phase 3)
grant select on public.live_locations to authenticated;
create policy live_locations_select on public.live_locations for select to authenticated using (
  user_id = auth.uid() or (
    updated_at > now() - interval '10 minutes'
    and not public.is_blocked(user_id, auth.uid())
    and case visibility
      when 'everyone' then true
      when 'friends' then public.are_friends(user_id, auth.uid())
      when 'club' then public.share_a_club(user_id, auth.uid())
      else false end));

-- ---------- pins & roads (moderated UGC) ----------
grant select, insert, delete on public.pins to authenticated;
grant update (title, description, photos, category) on public.pins to authenticated;
create policy pins_select on public.pins for select to authenticated
  using ((status = 'approved' and (created_by is null or not public.is_blocked(created_by, auth.uid()))) or created_by = auth.uid() or public.is_admin());
create policy pins_insert on public.pins for insert to authenticated
  with check (created_by = auth.uid() and status = 'pending' and source = 'community');
create policy pins_update on public.pins for update to authenticated
  using (created_by = auth.uid() and status = 'pending') with check (created_by = auth.uid() and status = 'pending');
create policy pins_delete on public.pins for delete to authenticated using (created_by = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.pin_ratings to authenticated;
create policy pin_ratings_read on public.pin_ratings for select to authenticated using (not public.is_blocked(user_id, auth.uid()));
create policy pin_ratings_write on public.pin_ratings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, delete on public.roads to authenticated;
grant update (name, description, tags) on public.roads to authenticated;
create policy roads_select on public.roads for select to authenticated
  using (status = 'approved' or created_by = auth.uid() or public.is_admin());
create policy roads_insert on public.roads for insert to authenticated
  with check (created_by = auth.uid() and status = 'pending');
create policy roads_update on public.roads for update to authenticated
  using (created_by = auth.uid() and status = 'pending') with check (created_by = auth.uid() and status = 'pending');
create policy roads_delete on public.roads for delete to authenticated using (created_by = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.road_ratings to authenticated;
create policy road_ratings_read on public.road_ratings for select to authenticated using (true);
create policy road_ratings_write on public.road_ratings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- events ----------
grant select, insert, delete on public.events to authenticated;
grant update (title, description, starts_at, ends_at, location, address, cover_url, visibility, kind) on public.events to authenticated;
create policy events_select on public.events for select to authenticated using (
  organizer_id = auth.uid() or public.is_admin() or (status = 'approved' and not public.is_blocked(organizer_id, auth.uid()) and (
    visibility = 'public' or (club_id is not null and public.club_role_of(club_id) is not null)
    or (visibility = 'friends' and public.are_friends(organizer_id, auth.uid())))));
create policy events_insert on public.events for insert to authenticated with check (
  organizer_id = auth.uid() and (club_id is null or public.club_role_of(club_id) in ('owner', 'admin'))
  and (partner_id is null or public.is_partner_member(partner_id)));
create policy events_update on public.events for update to authenticated using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());
create policy events_delete on public.events for delete to authenticated using (organizer_id = auth.uid() or public.is_admin());

grant select, insert, delete on public.event_rsvps to authenticated;
grant update (status) on public.event_rsvps to authenticated;   -- checked_in_at is set by the check-in RPC
create policy event_rsvps_select on public.event_rsvps for select to authenticated using (
  user_id = auth.uid() or exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())
  or (not public.is_blocked(user_id, auth.uid()) and exists (select 1 from public.events e where e.id = event_id and e.visibility = 'public')));
create policy event_rsvps_write on public.event_rsvps for insert to authenticated with check (user_id = auth.uid() and checked_in_at is null);
create policy event_rsvps_update on public.event_rsvps for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy event_rsvps_delete on public.event_rsvps for delete to authenticated using (user_id = auth.uid());

-- ---------- cruises ----------
grant select, insert, delete on public.cruises to authenticated;
grant update (title, description, meetup_point, meetup_at, destination, route, checkpoints, max_participants, status, visibility, recording_enabled) on public.cruises to authenticated;
create policy cruises_select on public.cruises for select to authenticated using (
  host_id = auth.uid() or public.is_cruise_participant(id)
  or (not public.is_blocked(host_id, auth.uid()) and (visibility = 'public'
      or (club_id is not null and public.club_role_of(club_id) is not null)
      or (visibility = 'friends' and public.are_friends(host_id, auth.uid())))));
create policy cruises_insert on public.cruises for insert to authenticated with check (host_id = auth.uid());
create policy cruises_update on public.cruises for update to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());
create policy cruises_delete on public.cruises for delete to authenticated using (host_id = auth.uid() or public.is_admin());

grant select, insert, delete on public.cruise_participants to authenticated;
grant update (role, status, car_id) on public.cruise_participants to authenticated;
create policy cruise_participants_select on public.cruise_participants for select to authenticated using (
  user_id = auth.uid() or public.is_cruise_participant(cruise_id) or public.is_cruise_host(cruise_id));
create policy cruise_participants_join on public.cruise_participants for insert to authenticated
  with check (user_id = auth.uid() and role = 'participant');
create policy cruise_participants_update on public.cruise_participants for update to authenticated using (
  user_id = auth.uid() or public.is_cruise_host(cruise_id));
create policy cruise_participants_leave on public.cruise_participants for delete to authenticated using (
  user_id = auth.uid() or public.is_cruise_host(cruise_id));

-- ---------- voice (tokens are minted by an Edge Function after these checks) ----------
grant select, insert, delete on public.voice_channels to authenticated;
create policy voice_channels_select on public.voice_channels for select to authenticated using (
  kind in ('nearby', 'friends') or owner_id = auth.uid()
  or (club_id is not null and public.club_role_of(club_id) is not null)
  or (cruise_id is not null and public.is_cruise_participant(cruise_id)));
create policy voice_channels_insert on public.voice_channels for insert to authenticated
  with check (owner_id = auth.uid() and kind = 'private' and recording_enabled = false);
create policy voice_channels_delete on public.voice_channels for delete to authenticated using (owner_id = auth.uid());

grant select on public.voice_mutes to authenticated;
create policy voice_mutes_select on public.voice_mutes for select to authenticated using (user_id = auth.uid() or muted_by = auth.uid());

-- ---------- partners / challenges / coupons ----------
grant select on public.partners, public.partner_locations, public.challenges, public.coupons to authenticated;
create policy partners_read on public.partners for select to authenticated using (true);
create policy partner_locations_read on public.partner_locations for select to authenticated using (true);
grant select on public.partner_members to authenticated;
create policy partner_members_read on public.partner_members for select to authenticated using (user_id = auth.uid() or public.is_partner_member(partner_id));
create policy challenges_read on public.challenges for select to authenticated using (
  is_active and (scope <> 'club' or public.club_role_of(club_id) is not null) or public.is_admin()
  or (partner_id is not null and public.is_partner_member(partner_id)));
create policy coupons_read on public.coupons for select to authenticated using (true);

grant select on public.challenge_progress to authenticated;
create policy challenge_progress_read on public.challenge_progress for select to authenticated using (
  user_id = auth.uid() or exists (select 1 from public.challenges c where c.id = challenge_id and c.scope in ('community', 'club', 'sponsored')));

grant select on public.redemptions to authenticated;
create policy redemptions_read on public.redemptions for select to authenticated using (
  user_id = auth.uid() or exists (select 1 from public.coupons c where c.id = coupon_id and public.is_partner_member(c.partner_id)));

-- ---------- moderation ----------
grant select, insert on public.reports to authenticated;
grant update (status, resolved_by, resolved_at) on public.reports to authenticated;
create policy reports_insert on public.reports for insert to authenticated with check (reporter_id = auth.uid() and status = 'open');
create policy reports_select on public.reports for select to authenticated using (reporter_id = auth.uid() or public.is_admin());
create policy reports_admin_update on public.reports for update to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.data_requests to authenticated;
create policy data_requests_own on public.data_requests for select to authenticated using (user_id = auth.uid());

-- service_role bypasses RLS in Supabase; make sure it has table privileges.
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
