/**
 * 50 levels, 10 named ranks of 5 tiers each. The curve is cumulative XP = 250·(L−1)^2.25:
 * level 2 ≈ 25 km of driving, level 10 ≈ 35k XP, level 50 ≈ 1.59M XP (years of committed driving).
 */
export const MAX_LEVEL = 50;
export const TIERS_PER_RANK = 5;

export interface RankDef {
  key: string;
  lt: string;
  en: string;
}

export const RANKS: readonly RankDef[] = [
  { key: 'learner', lt: 'Pradedantysis', en: 'Learner' },
  { key: 'rookie', lt: 'Naujokas', en: 'Rookie' },
  { key: 'cruiser', lt: 'Kruizeris', en: 'Cruiser' },
  { key: 'explorer', lt: 'Tyrinėtojas', en: 'Explorer' },
  { key: 'roadtripper', lt: 'Keliautojas', en: 'Road Tripper' },
  { key: 'pathfinder', lt: 'Kelrodys', en: 'Pathfinder' },
  { key: 'navigator', lt: 'Navigatorius', en: 'Navigator' },
  { key: 'captain', lt: 'Kelio kapitonas', en: 'Road Captain' },
  { key: 'nomad', lt: 'Baltijos klajoklis', en: 'Baltic Nomad' },
  { key: 'legend', lt: 'Kelių legenda', en: 'Road Legend' },
];

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return Math.round(250 * (l - 1) ** 2.25);
}

export interface LevelInfo {
  level: number;
  rank: RankDef;
  tier: string;
  /** XP accumulated inside the current level */
  xpIntoLevel: number;
  /** XP span of the current level (0 at max level) */
  xpForNext: number;
  /** 0..1 */
  progress: number;
  totalXp: number;
}

export function levelForXp(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  // closed-form inverse, then correct for rounding
  level = Math.min(MAX_LEVEL, Math.max(1, Math.floor((xp / 250) ** (1 / 2.25)) + 1));
  while (level < MAX_LEVEL && xpForLevel(level + 1) <= xp) level++;
  while (level > 1 && xpForLevel(level) > xp) level--;
  const base = xpForLevel(level);
  const next = level < MAX_LEVEL ? xpForLevel(level + 1) : base;
  const span = next - base;
  const rankIdx = Math.floor((level - 1) / TIERS_PER_RANK);
  return {
    level,
    rank: RANKS[rankIdx]!,
    tier: ROMAN[(level - 1) % TIERS_PER_RANK]!,
    xpIntoLevel: xp - base,
    xpForNext: span,
    progress: span === 0 ? 1 : (xp - base) / span,
    totalXp: xp,
  };
}

export function rankLabel(info: LevelInfo, lang: 'lt' | 'en' | string = 'lt'): string {
  return `${lang === 'lt' ? info.rank.lt : info.rank.en} ${info.tier}`;
}

/** Levels crossed when going from `before` to `after` XP (for level-up animations). */
export function levelsGained(before: number, after: number): number[] {
  const a = levelForXp(before).level, b = levelForXp(after).level;
  const out: number[] = [];
  for (let l = a + 1; l <= b; l++) out.push(l);
  return out;
}
