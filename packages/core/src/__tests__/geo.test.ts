import { describe, expect, it } from 'vitest';
import { decodePolyline, encodePolyline, haversine, simplify, decodeInts, encodeInts } from '../geo.ts';
import { decodeTrack, encodeTrack } from '../codec.ts';
import { hexesForRoute } from '../hex.ts';
import { computeTripStats, elevationProfile } from '../tripStats.ts';
import { generateTrip } from '../demo/generator.ts';
import { DEMO_ROUTES } from '../demo/routes.ts';
import { samplingProfile } from '../sampling.ts';
import { localDayStart } from '../pipeline.ts';

const T0 = Date.UTC(2026, 5, 1, 8, 0, 0);

describe('geo', () => {
  it('haversine Vilnius–Kaunas ≈ 92 km', () => {
    expect(haversine({ lat: 54.6872, lng: 25.2797 }, { lat: 54.8985, lng: 23.9036 }) / 1000).toBeCloseTo(91.6, 0);
  });
  it('polyline roundtrip', () => {
    const c = [{ lat: 54.687213, lng: 25.279651 }, { lat: 54.6, lng: -25.1 }, { lat: 0, lng: 0 }];
    expect(decodePolyline(encodePolyline(c))).toEqual(c);
    expect(decodeInts(encodeInts([5, -3, 100000, -32768, 0]))).toEqual([5, -3, 100000, -32768, 0]);
  });
  it('simplify keeps endpoints and reduces points', () => {
    const pts = generateTrip(DEMO_ROUTES[0]!, { startAt: T0 });
    const s = simplify(pts, 5);
    expect(s[0]).toBe(pts[0]);
    expect(s[s.length - 1]).toBe(pts[pts.length - 1]);
    expect(s.length).toBeLessThan(pts.length / 3);
  });
  it('handles 100k points quickly', () => {
    const pts = Array.from({ length: 100_000 }, (_, i) => ({ lat: 54.6 + Math.sin(i / 500) * 0.1, lng: 25 + i * 0.00002, t: T0 + i * 1000, alt: 100, acc: 5, speed: 20 }));
    const t = performance.now();
    const enc = encodeTrack(pts);
    const dec = decodeTrack(enc);
    simplify(dec, 5);
    computeTripStats(dec);
    expect(dec).toHaveLength(100_000);
    expect(performance.now() - t).toBeLessThan(5000);
    expect(enc.coords.length / pts.length).toBeLessThan(12);
  });
});

describe('codec', () => {
  it('roundtrips a track including nulls and mocked flags', () => {
    const pts = generateTrip(DEMO_ROUTES[2]!, { startAt: T0 }).slice(0, 50);
    pts[3] = { ...pts[3]!, alt: null, speed: null, acc: null, mocked: true };
    const out = decodeTrack(JSON.parse(JSON.stringify(encodeTrack(pts))));
    expect(out).toHaveLength(50);
    expect(out[3]).toMatchObject({ alt: null, speed: null, acc: null, mocked: true });
    expect(out[10]!.lat).toBeCloseTo(pts[10]!.lat, 6);
    expect(out[10]!.t).toBe(pts[10]!.t);
    expect(out[10]!.alt).toBeCloseTo(pts[10]!.alt!, 1);
  });
});

describe('stats & hexes', () => {
  it('computes Vilnius→Trakai stats', () => {
    const s = computeTripStats(generateTrip(DEMO_ROUTES[0]!, { startAt: T0 }));
    expect(s.distanceM / 1000).toBeGreaterThan(22);
    expect(s.distanceM / 1000).toBeLessThan(28);
    expect(s.movingTimeS).toBeGreaterThan(0.9 * s.durationS);
  });
  it('smooths elevation noise', () => {
    const flat = Array.from({ length: 500 }, (_, i) => ({ lat: 0, lng: 0, t: i, alt: 100 + (i % 2 ? 2 : -2) }));
    expect(elevationProfile(flat).gain).toBe(0);
  });
  it('densifies hexes so none are skipped', () => {
    const sparse = [{ lat: 54.6872, lng: 25.2797 }, { lat: 54.6872, lng: 25.3197 }]; // ~2.6 km, two fixes
    expect(hexesForRoute(sparse, 8, 1e9).length).toBeLessThanOrEqual(2); // no densification
    expect(hexesForRoute(sparse).length).toBeGreaterThanOrEqual(4); // ~2.6 km across ~0.9 km cells
  });
});

describe('sampling & days', () => {
  it('saves battery when low', () => {
    expect(samplingProfile('driving', { batteryLevel: 0.9, charging: false, lowPowerMode: false }).name).toBe('active');
    expect(samplingProfile('driving', { batteryLevel: 0.1, charging: false, lowPowerMode: false }).name).toBe('active_saver');
    expect(samplingProfile('driving', { batteryLevel: 0.1, charging: true, lowPowerMode: false }).name).toBe('active');
    expect(samplingProfile('idle', { batteryLevel: 0.5, charging: false, lowPowerMode: true }).geofenceRadiusM).toBe(200);
  });
  it('computes local day start in Vilnius', () => {
    // 2026-06-01 00:30 Vilnius (UTC+3) = 2026-05-31 21:30 UTC
    const t = Date.UTC(2026, 4, 31, 21, 30);
    expect(localDayStart(t, 'Europe/Vilnius')).toBe(Date.UTC(2026, 4, 31, 21, 0));
  });
});
