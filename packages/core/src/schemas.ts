import { z } from 'zod';

export const EncodedTrackSchema = z.object({
  v: z.literal(1),
  t0: z.number().int().positive(),
  n: z.number().int().min(2).max(200_000),
  coords: z.string().min(2).max(4_000_000),
  t: z.string().max(2_000_000),
  alt: z.string().max(2_000_000),
  acc: z.string().max(2_000_000),
  speed: z.string().max(2_000_000),
  mocked: z.array(z.number().int().nonnegative()).max(200_000),
});

export const TripUploadSchema = z.object({
  clientTripId: z.uuid(),
  carId: z.uuid().nullable(),
  startedAt: z.number().int().positive(),
  endedAt: z.number().int().positive(),
  isPassenger: z.boolean(),
  manual: z.boolean(),
  /** IANA timezone of the device, used to bucket "today" for daily caps and streaks */
  timezone: z.string().min(1).max(64),
  platform: z.enum(['ios', 'android']),
  appVersion: z.string().max(32),
  track: EncodedTrackSchema,
}).refine((v) => v.endedAt >= v.startedAt, { message: 'endedAt before startedAt', path: ['endedAt'] });

export type TripUpload = z.infer<typeof TripUploadSchema>;

export const XpLineSchema = z.object({
  source: z.string(),
  amount: z.number().int(),
  meta: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
});

export const TripIngestResponseSchema = z.object({
  tripId: z.uuid(),
  duplicate: z.boolean(),
  verdict: z.enum(['ok', 'flagged', 'rejected']),
  flags: z.array(z.string()),
  mode: z.string(),
  stats: z.object({
    distanceM: z.number(),
    durationS: z.number(),
    movingTimeS: z.number(),
    elevationGainM: z.number(),
  }),
  newHexes: z.number().int(),
  xp: z.object({ total: z.number().int(), lines: z.array(XpLineSchema), withheldReason: z.string().optional() }),
  profile: z.object({ totalXp: z.number().int(), level: z.number().int() }),
});

export type TripIngestResponse = z.infer<typeof TripIngestResponseSchema>;
