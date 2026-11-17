/**
 * XP rules. Data-driven constants so they can be tuned (server mirrors these in xp_rules table).
 * Speed is NEVER an input: XP depends on distance, exploration and participation only.
 */
export const XP_RULES = {
  perKm: 10,
  /** km per local day that earn distance XP; prevents marathon farming */
  dailyKmCap: 600,
  newHex: 25,
  /** max new-hex XP awards per trip */
  newHexPerTripCap: 400,
  /** bonus for completing a valid trip of at least `tripBonusMinKm` */
  tripBonus: 20,
  tripBonusMinKm: 5,
  newRoadPerKm: 15,
  challenge: 250,
  eventCheckIn: 300,
  streakDay: 15,
  streakWeekBonus: 150,
} as const;

export type XpSource =
  | 'distance'
  | 'new_hex'
  | 'new_road'
  | 'trip_bonus'
  | 'challenge'
  | 'event'
  | 'streak'
  | 'badge'
  | 'cruise';

export interface XpLine {
  source: XpSource;
  amount: number;
  meta?: Record<string, number | string | boolean>;
}

export interface TripXpInput {
  distanceM: number;
  newHexCount: number;
  newRoadKm?: number;
  /** km already credited today before this trip */
  kmCreditedToday: number;
  isPassenger: boolean;
  /** from the mode classifier: train/bus/plane/walk */
  excludedByMode: boolean;
  antiCheatVerdict: 'ok' | 'flagged' | 'rejected';
  /** from farmingMultiplier() */
  farmingMultiplier: number;
}

export interface TripXpResult {
  total: number;
  lines: XpLine[];
  creditedKm: number;
  /** why XP was withheld, if it was */
  withheldReason?: 'passenger' | 'transport_mode' | 'anti_cheat';
}

export function computeTripXp(input: TripXpInput): TripXpResult {
  if (input.antiCheatVerdict === 'rejected') return { total: 0, lines: [], creditedKm: 0, withheldReason: 'anti_cheat' };
  if (input.isPassenger) return { total: 0, lines: [], creditedKm: 0, withheldReason: 'passenger' };
  if (input.excludedByMode) return { total: 0, lines: [], creditedKm: 0, withheldReason: 'transport_mode' };

  const lines: XpLine[] = [];
  const km = Math.max(0, input.distanceM / 1000);
  const remaining = Math.max(0, XP_RULES.dailyKmCap - Math.max(0, input.kmCreditedToday));
  const creditedKm = Math.min(km, remaining);
  const mult = Math.max(0, Math.min(1, input.farmingMultiplier));

  const distanceXp = Math.floor(creditedKm * XP_RULES.perKm * mult);
  if (distanceXp > 0) {
    lines.push({ source: 'distance', amount: distanceXp, meta: { km: Number(creditedKm.toFixed(2)), multiplier: mult } });
  }
  const hexes = Math.min(Math.max(0, Math.floor(input.newHexCount)), XP_RULES.newHexPerTripCap);
  if (hexes > 0) lines.push({ source: 'new_hex', amount: hexes * XP_RULES.newHex, meta: { hexes } });
  if (input.newRoadKm && input.newRoadKm > 0) {
    lines.push({ source: 'new_road', amount: Math.floor(input.newRoadKm * XP_RULES.newRoadPerKm), meta: { km: input.newRoadKm } });
  }
  if (km >= XP_RULES.tripBonusMinKm && mult === 1) lines.push({ source: 'trip_bonus', amount: XP_RULES.tripBonus });

  return { total: lines.reduce((s, l) => s + l.amount, 0), lines, creditedKm };
}
