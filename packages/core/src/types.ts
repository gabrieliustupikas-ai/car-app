/** A single GPS fix as recorded on device. Units: degrees, metres, m/s, epoch ms. */
export interface GeoPoint {
  lat: number;
  lng: number;
  /** epoch milliseconds */
  t: number;
  /** altitude above sea level in metres (may be null when unavailable) */
  alt?: number | null;
  /** horizontal accuracy in metres */
  acc?: number | null;
  /** speed reported by the OS in m/s (null/negative when unavailable) */
  speed?: number | null;
  /** true when the OS reports the fix was produced by a mock provider (Android) */
  mocked?: boolean;
}

export type TransportMode = 'car' | 'train' | 'bus' | 'plane' | 'walk' | 'unknown';

export interface TripStats {
  distanceM: number;
  durationS: number;
  movingTimeS: number;
  elevationGainM: number;
  elevationLossM: number;
  maxAltitudeM: number | null;
  minAltitudeM: number | null;
  startedAt: number;
  endedAt: number;
  pointCount: number;
}
