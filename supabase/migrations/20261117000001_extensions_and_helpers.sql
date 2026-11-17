-- ROADCLUB · 0001 · extensions, enums, shared helpers
create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- ---------- enums ----------
create type public.visibility_level as enum ('everyone', 'friends', 'club', 'ghost');
create type public.content_visibility as enum ('public', 'friends', 'private');
create type public.trip_verdict as enum ('ok', 'flagged', 'rejected');
create type public.transport_mode as enum ('car', 'train', 'bus', 'plane', 'walk', 'unknown');
create type public.friendship_status as enum ('pending', 'accepted', 'declined');
create type public.club_privacy as enum ('public', 'request', 'invite');
create type public.club_role as enum ('owner', 'admin', 'member');
create type public.membership_status as enum ('active', 'pending', 'invited');
create type public.challenge_scope as enum ('personal', 'community', 'club', 'sponsored');
create type public.challenge_metric as enum ('distance_km', 'hexes', 'cities', 'trips', 'events', 'streak_days', 'checkins');
create type public.event_kind as enum ('meet', 'track_day', 'drift', 'cruise', 'show', 'other');
create type public.rsvp_status as enum ('going', 'interested', 'not_going');
create type public.cruise_status as enum ('planned', 'lobby', 'live', 'finished', 'cancelled');
create type public.cruise_role as enum ('host', 'lead', 'tail', 'participant');
create type public.pin_category as enum ('viewpoint', 'cafe', 'photo_spot', 'detailing', 'tires', 'ev_charger', 'fuel', 'parking', 'meet_spot', 'other');
create type public.moderation_status as enum ('pending', 'approved', 'rejected');
create type public.voice_channel_kind as enum ('nearby', 'friends', 'club', 'cruise', 'private');
create type public.report_target as enum ('user', 'pin', 'road', 'club', 'event', 'cruise', 'comment', 'photo', 'voice', 'trip');
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
create type public.redemption_status as enum ('issued', 'redeemed', 'expired', 'revoked');
create type public.xp_source as enum ('distance', 'new_hex', 'new_road', 'trip_bonus', 'challenge', 'event', 'streak', 'badge', 'cruise', 'adjustment');

-- ---------- updated_at trigger ----------
create or replace function public.tg_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
