/**
 * Integration test for the trip upload path: client recorder output → encodeTrack → JSON over the
 * wire → zod validation → decode → anti-cheat → hexes → XP → persistence → idempotent retry.
 * Uses an in-memory store implementing the same interface as the Postgres-backed Edge Function.
 */
import { describe, expect, it } from 'vitest';
import { encodeTrack } from '../codec.ts';
import { generateTrip } from '../demo/generator.ts';
import { DEMO_ROUTES } from '../demo/routes.ts';
import { ingestTrip, IngestError, type IngestStore } from '../ingest.ts';
import { TripIngestResponseSchema, type TripUpload, type TripIngestResponse } from '../schemas.ts';
import type { GeoPoint } from '../types.ts';

class MemoryStore implements IngestStore {
  hexes = new Set<string>();
  trips: { id: string; clientId: string; startedAt: number; hexes: string[]; km: number; response?: TripIngestResponse }[] = [];
  totalXp = 0;
  async filterNewHexes(cells: string[]) { return cells.filter((c) => !this.hexes.has(c)); }
  async recentRouteHexes(since: number) { return this.trips.filter((t) => t.startedAt >= since).map((t) => new Set(t.hexes)); }
  async kmCreditedOnDay(dayStart: number) { return this.trips.filter((t) => t.startedAt >= dayStart).reduce((s, t) => s + t.km, 0); }
  async findTripByClientId(id: string) {
    const t = this.trips.find((x) => x.clientId === id);
    return t?.response ? { tripId: t.id, response: t.response } : null;
  }
  async saveTrip(u: TripUpload, p: Parameters<IngestStore['saveTrip']>[1]) {
    const id = crypto.randomUUID();
    p.newHexes.forEach((h) => this.hexes.add(h));
    this.totalXp += p.xp.total;
    this.trips.push({ id, clientId: u.clientTripId, startedAt: p.stats.startedAt, hexes: p.hexes, km: p.xp.creditedKm });
    return { tripId: id, totalXp: this.totalXp };
  }
}

const NOW = Date.UTC(2026, 5, 2, 12);
const T0 = Date.UTC(2026, 5, 1, 6);

function upload(points: GeoPoint[], extra: Partial<TripUpload> = {}): unknown {
  const body: TripUpload = {
    clientTripId: crypto.randomUUID(), carId: null,
    startedAt: points[0]!.t, endedAt: points[points.length - 1]!.t,
    isPassenger: false, manual: false, timezone: 'Europe/Vilnius', platform: 'android', appVersion: '0.1.0',
    track: encodeTrack(points), ...extra,
  };
  return JSON.parse(JSON.stringify(body)); // simulate the wire
}

async function ingestAndCache(store: MemoryStore, body: unknown) {
  const res = await ingestTrip(body, store, NOW);
  const t = store.trips.find((x) => x.id === res.tripId);
  if (t) t.response = res;
  return res;
}

describe('trip upload integration', () => {
  it('ingests a valid trip, awards XP and exploration, and is idempotent', async () => {
    const store = new MemoryStore();
    const body = upload(generateTrip(DEMO_ROUTES[0]!, { startAt: T0 }));
    const res = await ingestAndCache(store, body);
    expect(TripIngestResponseSchema.parse(res)).toBeTruthy();
    expect(res.verdict).toBe('ok');
    expect(res.mode).toBe('car');
    expect(res.newHexes).toBeGreaterThan(20);
    expect(res.xp.total).toBeGreaterThan(500);
    expect(res.profile.level).toBeGreaterThan(1);

    const again = await ingestTrip(body, store, NOW);
    expect(again.duplicate).toBe(true);
    expect(again.tripId).toBe(res.tripId);
    expect(store.totalXp).toBe(res.xp.total);
  });

  it('gives no new-hex XP for the same area twice and decays farmed repeats', async () => {
    const store = new MemoryStore();
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await ingestAndCache(store, upload(generateTrip(DEMO_ROUTES[2]!, { startAt: T0 + i * 3600_000, seed: i + 1 }))));
    }
    expect(results[0]!.newHexes).toBeGreaterThan(0);
    expect(results[1]!.newHexes).toBe(0);
    expect(results[1]!.verdict).toBe('ok');
    expect(results[2]!.flags).toContain('repeated_route');
    expect(results[3]!.xp.total).toBeLessThan(results[0]!.xp.total / 4);
  });

  it('withholds XP for passengers and rejects spoofed uploads', async () => {
    const store = new MemoryStore();
    const pts = generateTrip(DEMO_ROUTES[1]!, { startAt: T0 });
    const passenger = await ingestAndCache(store, upload(pts, { isPassenger: true }));
    expect(passenger.xp).toMatchObject({ total: 0, withheldReason: 'passenger' });
    expect(passenger.newHexes).toBe(0);

    const mocked = pts.map((p, i) => (i % 50 === 0 ? { ...p, mocked: true } : p));
    const spoofed = await ingestAndCache(store, upload(mocked));
    expect(spoofed.verdict).toBe('rejected');
    expect(spoofed.xp.total).toBe(0);
  });

  it('rejects malformed payloads with 400', async () => {
    const store = new MemoryStore();
    await expect(ingestTrip({ hello: 'world' }, store, NOW)).rejects.toBeInstanceOf(IngestError);
    const pts = generateTrip(DEMO_ROUTES[2]!, { startAt: T0 });
    const bad = upload(pts) as { track: { n: number } };
    bad.track.n += 5;
    await expect(ingestTrip(bad, store, NOW)).rejects.toMatchObject({ status: 400, code: 'bad_track' });
  });
});
