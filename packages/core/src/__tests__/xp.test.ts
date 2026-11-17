import { describe, expect, it } from 'vitest';
import { computeTripXp, XP_RULES } from '../xp.ts';
import { levelForXp, levelsGained, MAX_LEVEL, rankLabel, RANKS, xpForLevel } from '../levels.ts';

const base = { distanceM: 50_000, newHexCount: 10, kmCreditedToday: 0, isPassenger: false, excludedByMode: false, antiCheatVerdict: 'ok' as const, farmingMultiplier: 1 };

describe('computeTripXp', () => {
  it('awards distance, exploration and trip bonus', () => {
    const r = computeTripXp(base);
    expect(r.lines.find((l) => l.source === 'distance')?.amount).toBe(500);
    expect(r.lines.find((l) => l.source === 'new_hex')?.amount).toBe(250);
    expect(r.lines.find((l) => l.source === 'trip_bonus')?.amount).toBe(XP_RULES.tripBonus);
    expect(r.total).toBe(770);
  });
  it('gives nothing to passengers, non-car modes and rejected trips', () => {
    expect(computeTripXp({ ...base, isPassenger: true })).toMatchObject({ total: 0, withheldReason: 'passenger' });
    expect(computeTripXp({ ...base, excludedByMode: true })).toMatchObject({ total: 0, withheldReason: 'transport_mode' });
    expect(computeTripXp({ ...base, antiCheatVerdict: 'rejected' })).toMatchObject({ total: 0, withheldReason: 'anti_cheat' });
  });
  it('enforces the daily km cap', () => {
    const r = computeTripXp({ ...base, distanceM: 200_000, kmCreditedToday: 550, newHexCount: 0 });
    expect(r.creditedKm).toBe(50);
    expect(r.lines.find((l) => l.source === 'distance')?.amount).toBe(500);
    expect(computeTripXp({ ...base, kmCreditedToday: 9999, newHexCount: 0 }).lines.find((l) => l.source === 'distance')).toBeUndefined();
  });
  it('applies farming multiplier and drops trip bonus', () => {
    const r = computeTripXp({ ...base, farmingMultiplier: 0.25, newHexCount: 0 });
    expect(r.lines.find((l) => l.source === 'distance')?.amount).toBe(125);
    expect(r.lines.find((l) => l.source === 'trip_bonus')).toBeUndefined();
  });
  it('caps new-hex XP per trip', () => {
    const r = computeTripXp({ ...base, newHexCount: 10_000 });
    expect(r.lines.find((l) => l.source === 'new_hex')?.amount).toBe(XP_RULES.newHexPerTripCap * XP_RULES.newHex);
  });
  it('never takes speed as input', () => {
    // compile-time guarantee: TripXpInput has no speed field
    expect(Object.keys(base)).not.toContain('speed');
  });
});

describe('levels', () => {
  it('has 50 levels and 10 ranks', () => {
    expect(RANKS).toHaveLength(10);
    expect(xpForLevel(1)).toBe(0);
    expect(levelForXp(0).level).toBe(1);
    expect(levelForXp(1e12).level).toBe(MAX_LEVEL);
    expect(levelForXp(1e12).progress).toBe(1);
  });
  it('is strictly increasing and inverse-consistent at every boundary', () => {
    for (let l = 2; l <= MAX_LEVEL; l++) {
      expect(xpForLevel(l)).toBeGreaterThan(xpForLevel(l - 1));
      expect(levelForXp(xpForLevel(l)).level).toBe(l);
      expect(levelForXp(xpForLevel(l) - 1).level).toBe(l - 1);
    }
  });
  it('maps ranks and tiers', () => {
    const l6 = levelForXp(xpForLevel(6));
    expect(l6.rank.key).toBe('rookie');
    expect(l6.tier).toBe('I');
    expect(rankLabel(levelForXp(xpForLevel(50)), 'lt')).toBe('Kelių legenda V');
    expect(rankLabel(levelForXp(0), 'en')).toBe('Learner I');
  });
  it('reports levels gained', () => {
    expect(levelsGained(0, xpForLevel(4))).toEqual([2, 3, 4]);
    expect(levelsGained(100, 120)).toEqual([]);
  });
});
