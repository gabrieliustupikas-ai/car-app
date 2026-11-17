import { describe, expect, it } from 'vitest';
import { analyzeTrip, farmingMultiplier, jaccard } from '../antiCheat.ts';
import { classifyMode } from '../modeClassifier.ts';
import { generateTrip } from '../demo/generator.ts';
import { DEMO_ROUTES } from '../demo/routes.ts';
import type { GeoPoint } from '../types.ts';

const T0 = Date.UTC(2026, 5, 1, 8, 0, 0);
const NOW = T0 + 24 * 3600_000;
const trakai = () => generateTrip(DEMO_ROUTES[0]!, { startAt: T0, seed: 7 });

describe('analyzeTrip', () => {
  it('accepts a realistic drive', () => {
    const r = analyzeTrip(trakai(), NOW);
    expect(r.verdict).toBe('ok');
    expect(r.flags).toEqual([]);
  });
  it('rejects mock locations', () => {
    const pts = trakai();
    pts[100] = { ...pts[100]!, mocked: true };
    const r = analyzeTrip(pts, NOW);
    expect(r.verdict).toBe('rejected');
    expect(r.flags).toContain('mock_location');
  });
  it('rejects a teleport jump', () => {
    const pts = trakai();
    const jumped = pts.map((p, i) => (i > 300 ? { ...p, lat: p.lat + 0.5 } : p)); // ~55 km jump
    const r = analyzeTrip(jumped, NOW);
    expect(r.verdict).toBe('rejected');
    expect(r.flags).toContain('teleport');
  });
  it('removes a single GPS spike without rejecting', () => {
    const pts = trakai();
    pts[200] = { ...pts[200]!, lat: pts[200]!.lat + 0.01 }; // 1.1 km spike, back next fix
    const r = analyzeTrip(pts, NOW);
    expect(r.verdict).not.toBe('rejected');
    expect(r.details.spikesRemoved).toBe(1);
  });
  it('rejects impossible accelerations', () => {
    const pts = trakai().map((p, i) => {
      // oscillate between standing still and 40 m/s every second → ~40 m/s² accelerations
      if (i < 50 || i > 400) return p;
      return i % 2 === 0 ? { ...p, lat: p.lat + 0.00036 } : p;
    });
    const r = analyzeTrip(pts, NOW);
    expect(r.flags).toContain('impossible_acceleration');
    expect(r.verdict).toBe('rejected');
  });
  it('rejects non-monotonic and future timestamps', () => {
    const pts = trakai();
    const swapped = [...pts];
    [swapped[10], swapped[11]] = [swapped[11]!, swapped[10]!];
    expect(analyzeTrip(swapped, NOW).flags).toContain('non_monotonic_time');
    expect(analyzeTrip(pts, T0 - 3600_000).flags).toContain('future_timestamp');
  });
  it('rejects a perfectly synthetic spoofed trace', () => {
    const pts: GeoPoint[] = Array.from({ length: 300 }, (_, i) => ({ lat: 54.68 + i * 0.0002, lng: 25.27, t: T0 + i * 1000, acc: 5, speed: 22, alt: 100 }));
    const r = analyzeTrip(pts, NOW);
    expect(r.flags).toContain('synthetic_pattern');
    expect(r.verdict).toBe('rejected');
  });
  it('rejects too few points', () => {
    expect(analyzeTrip(trakai().slice(0, 5), NOW).verdict).toBe('rejected');
  });
});

describe('farming', () => {
  it('computes jaccard similarity', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
    expect(jaccard(new Set(['a', 'b']), new Set(['c']))).toBe(0);
  });
  it('lets two commute repeats through and decays after', () => {
    const r = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(farmingMultiplier(r, [r]).multiplier).toBe(1);
    expect(farmingMultiplier(r, [r, r]).multiplier).toBe(0.25);
    expect(farmingMultiplier(r, [r, r, r, r]).multiplier).toBe(0.05);
    expect(farmingMultiplier(r, [new Set(['x']), new Set(['y'])]).multiplier).toBe(1);
  });
});

describe('classifyMode', () => {
  it('classifies a normal drive as car', () => {
    expect(classifyMode(trakai())).toMatchObject({ mode: 'car', excludeFromXp: false });
  });
  it('detects planes', () => {
    const pts = Array.from({ length: 100 }, (_, i) => ({ lat: 54.6 + i * 0.002, lng: 25.2, t: T0 + i * 1000, alt: 9000 }));
    expect(classifyMode(pts)).toMatchObject({ mode: 'plane', excludeFromXp: true });
  });
  it('detects walking', () => {
    const pts = Array.from({ length: 200 }, (_, i) => ({ lat: 54.6 + i * 0.00001, lng: 25.2, t: T0 + i * 1000 }));
    expect(classifyMode(pts)).toMatchObject({ mode: 'walk', excludeFromXp: true });
  });
  it('detects a train from sustained >160 km/h on a straight line', () => {
    const pts = Array.from({ length: 600 }, (_, i) => ({ lat: 54.6 + i * 0.00045, lng: 25.2, t: T0 + i * 1000 })); // 50 m/s
    expect(classifyMode(pts)).toMatchObject({ mode: 'train', excludeFromXp: true });
  });
  it('detects train via railway proximity hint', () => {
    expect(classifyMode(trakai(), { nearRailFraction: 0.95 })).toMatchObject({ mode: 'train' });
  });
});
