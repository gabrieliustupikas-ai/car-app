# Privacy & GDPR design

| Requirement | Implementation |
|---|---|
| Lawful basis & consent | Onboarding consent screen. Terms are required; background location and analytics are optional and unticked by default. Choices are versioned (`CONSENT_VERSION`) and written to the append-only `consents` table on first sign-in. |
| Age 16+ | Age gate in onboarding. Users who answer "no" are blocked. `profiles.age_confirmed_at` is stored. |
| Privacy by default | `location_sharing = 'ghost'`, `profile_visibility = 'friends'`, `trips_visibility = 'private'` for every new user. The map always shows a visibility indicator. |
| Data minimisation | No max/avg speed is stored. Live location keeps only the latest point, with no history, and expires after 10 min (rows are deleted after 1 h). Telemetry hooks forbid coordinates and personal data. |
| Retention | `profiles.retention_days` (30–1825, default 365). The daily `purge_expired_location_data()` job, scheduled with pg_cron, deletes raw fixes and strips route geometry and start/end points from older trips. Aggregates (km, XP) are kept. The app deletes its local raw fixes after a successful sync. |
| Right of access / portability | `export_my_data()` returns JSON with the profile, consents, cars, trips (GeoJSON), raw fixes, XP, hexes, badges, social graph, safe areas, pins and reports. The app shares it as a file. |
| Right to erasure | `delete_my_account()` transfers or deletes owned clubs, then deletes the auth user, and every user-owned row cascades. The app wipes its local SQLite. Phase 3 adds an Edge Function that also removes Storage objects (photos). |
| Report & block | `reports` and `blocks` tables exist from day one. Every RLS policy for user-generated content excludes blocked users. |
| Processors | Supabase (EU region recommended: Frankfurt, eu-central-1), Mapbox (telemetry disabled), and Expo push. List them in the privacy policy. |
