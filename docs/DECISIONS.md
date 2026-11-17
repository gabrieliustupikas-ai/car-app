# Architecture decisions (Phase 1)

Short, dated records of choices made without asking, so they can be revisited.

1. **Monorepo with npm workspaces**: `apps/mobile` and `packages/core`. Later phases add `apps/partner-web` (Next.js) and `apps/admin`. Expo SDK 58's Metro supports workspaces natively.
2. **One shared core for client and server.** Trip detection, anti-cheat, transport-mode classification, H3 exploration and XP rules live in `packages/core` as pure TypeScript with explicit `.ts` imports. The same files run in Hermes (app), Node (Vitest) and Deno (Edge Functions). `npm run sync:core` copies them into `supabase/functions/_shared/core`, and CI fails if the copy drifts.
3. **The server is authoritative for XP.** The app computes an instant preview offline. The Edge Function recomputes everything from raw fixes. Clients have no `INSERT` on trips and no `UPDATE` on XP columns; this is enforced by RLS and column grants.
4. **Raw fixes are stored as compressed chunks**: ≤1000 fixes per row, delta-encoded with polyline varints, in `trip_points`, range-partitioned by month. 100k fixes come to about 100 rows (about 1.2 MB) per user, and retention purges are cheap. A simplified (5 m Douglas–Peucker) `geography(LineString)` on `trips` is used for maps and GiST queries.
5. **H3 cells are stored as hex strings, not bigint.** Res-8 indexes exceed 2^53, and supabase-js would silently corrupt bigint values in JS.
6. **Anti-farming.** Distance XP has a daily cap of 600 km. A route with ≥85 % Jaccard similarity to a trip from the previous 24 h gets full XP for the first 2 repeats (commutes are legitimate), then 25 %, then 5 %. Mock locations, teleports (>306 km/h over >800 m), accelerations over 1.2 g, non-monotonic or future timestamps, and perfectly regular synthetic traces are rejected.
7. **Transport-mode classification is conservative.** It excludes XP only when confident: planes (>250 km/h or altitude), walking, and trains (railway proximity hint, or 5+ min at >160 km/h in a straight line). A likely bus is only flagged until bus-stop data exists. Users can always self-declare "passenger", which reverses the XP on the server via `mark_trip_passenger()`.
8. **Level curve**: cumulative XP = 250·(L−1)^2.25. Level 2 is about 25 km of driving and level 50 is 1.59M XP. There are 10 ranks × 5 tiers, named in Lithuanian and English. `ranks` SQL is generated from `core/levels.ts` (`npm run db:ranks`) so the app and database cannot drift.
9. **Auth uses an email one-time code** (6 digits, no deep links needed). Apple and Google sign-in arrive in Phase 6 with store setup. **Demo mode** needs no account: data is local only and is never uploaded.
10. **Map**: Mapbox Standard style with `night`/`day` light presets, 3D objects and DEM terrain. Custom Studio styles can be swapped in via env. Mapbox telemetry is off by default. Without a token, the app shows a styled placeholder and everything else keeps working.
11. **Background tracking.** Idle uses balanced/low accuracy plus a 150–200 m departure geofence. Driving uses BestForNavigation every 2 s / 10 m. Saver mode (battery <20 % or low-power mode) uses balanced accuracy every 5 s / 25 m. On Android a foreground service notification is required by the OS. Motion-activity permission is requested to improve detection in later phases.
12. **Expo SDK 58 specifics.** Routes live in `src/app`, auth gating uses `Stack.Protected`, and the splash config comes from the `expo-splash-screen` plugin. `expo install` could not reach Expo's API from the build sandbox, so versions are pinned from `expo/bundledNativeModules.json`. Run `npx expo install --check` on a networked machine to confirm.
13. **Rate limits**: 60 trip uploads per user per hour, and a 6 MB maximum payload.
14. **Not done in Phase 1, on purpose:**
    - Badge evaluation, streak updates and `geo_areas` for counties and cities: Phase 2. The tables and 77 badge definitions already exist.
    - Live location writes through a safe-area-aware RPC: Phase 3.
    - Share cards: Phase 6.
    - Generated Supabase TypeScript types: Phase 2, via `supabase gen types`.
