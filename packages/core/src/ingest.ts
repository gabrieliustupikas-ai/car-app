import { decodeTrack, TrackDecodeError } from './codec.ts';
import { levelForXp } from './levels.ts';
import { XP_RULES } from './xp.ts';
import { localDayStart, processTrip, type ProcessedTrip, type TripContext } from './pipeline.ts';
import { TripUploadSchema, type TripIngestResponse, type TripUpload } from './schemas.ts';

/**
 * Server-side trip ingestion, written against a storage interface so the exact same code runs in
 * the Supabase Edge Function (Postgres) and in the integration test (in-memory store).
 */
export interface IngestStore extends TripContext {
  findTripByClientId(clientTripId: string): Promise<{ tripId: string; response: TripIngestResponse } | null>;
  /**
   * Persist trip + chunks + hexes + xp events atomically. Returns the new trip id, the profile's new total XP and,
   * when the store re-counted inside its transaction, the authoritative trip XP / new-hex count.
   */
  saveTrip(upload: TripUpload, processed: ProcessedTrip): Promise<{ tripId: string; totalXp: number; xpTotal?: number; newHexes?: number }>;
}

export class IngestError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const MAX_TRIP_AGE_MS = 30 * 24 * 3600_000;

export async function ingestTrip(body: unknown, store: IngestStore, now = Date.now()): Promise<TripIngestResponse> {
  const parsed = TripUploadSchema.safeParse(body);
  if (!parsed.success) throw new IngestError(400, 'invalid_payload', parsed.error.issues.map((i) => i.message).join('; '));
  const upload = parsed.data;

  const existing = await store.findTripByClientId(upload.clientTripId);
  if (existing) return { ...existing.response, duplicate: true };

  if (now - upload.endedAt > MAX_TRIP_AGE_MS) throw new IngestError(422, 'too_old', 'trip is older than 30 days');

  let points;
  try {
    points = decodeTrack(upload.track);
  } catch (e) {
    if (e instanceof TrackDecodeError) throw new IngestError(400, 'bad_track', e.message);
    throw e;
  }

  const processed = await processTrip(points, store, {
    isPassenger: upload.isPassenger,
    now,
    dayStartMs: localDayStart(upload.startedAt, upload.timezone),
  });
  const saved = await store.saveTrip(upload, processed);
  const { tripId, totalXp } = saved;
  const xpTotal = saved.xpTotal ?? processed.xp.total;
  const newHexCount = saved.newHexes ?? processed.newHexes.length;
  return {
    tripId,
    duplicate: false,
    verdict: processed.verdict,
    flags: processed.flags,
    mode: processed.mode.mode,
    stats: {
      distanceM: Math.round(processed.stats.distanceM),
      durationS: processed.stats.durationS,
      movingTimeS: processed.stats.movingTimeS,
      elevationGainM: processed.stats.elevationGainM,
    },
    newHexes: newHexCount,
    xp: {
      total: xpTotal,
      lines: processed.xp.lines.map((l) =>
        l.source === 'new_hex' && saved.newHexes != null ? { ...l, amount: Math.min(saved.newHexes, XP_RULES.newHexPerTripCap) * XP_RULES.newHex } : l),
      ...(processed.xp.withheldReason ? { withheldReason: processed.xp.withheldReason } : {}),
    },
    profile: { totalXp, level: levelForXp(totalXp).level },
  };
}
