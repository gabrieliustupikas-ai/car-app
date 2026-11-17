/** Hand-picked Lithuanian demo routes (approximate waypoints along real roads). */
export interface DemoRoute {
  id: string;
  name: { lt: string; en: string };
  /** [lat, lng] waypoints */
  waypoints: [number, number][];
  /** typical cruising speed on this route (m/s) */
  cruiseMs: number;
}

export const DEMO_ROUTES: readonly DemoRoute[] = [
  {
    id: 'vilnius-trakai',
    name: { lt: 'Vilnius → Trakai', en: 'Vilnius → Trakai' },
    cruiseMs: 22,
    waypoints: [
      [54.6872, 25.2797], [54.6835, 25.2512], [54.6791, 25.2108], [54.6703, 25.1702],
      [54.6566, 25.1199], [54.6493, 25.0601], [54.6431, 25.0002], [54.6409, 24.9605], [54.6458, 24.9341],
    ],
  },
  {
    id: 'curonian-spit',
    name: { lt: 'Kuršių nerija: Smiltynė → Nida', en: 'Curonian Spit: Smiltynė → Nida' },
    cruiseMs: 19,
    waypoints: [
      [55.7023, 21.1182], [55.6417, 21.1203], [55.5583, 21.1235], [55.4911, 21.1052],
      [55.4253, 21.0911], [55.3651, 21.0644], [55.3089, 21.0059],
    ],
  },
  {
    id: 'kaunas-loop',
    name: { lt: 'Kauno senamiesčio ratas', en: 'Kaunas old town loop' },
    cruiseMs: 11,
    waypoints: [
      [54.8985, 23.8862], [54.8967, 23.9043], [54.8995, 23.9223], [54.9061, 23.9349],
      [54.9105, 23.9172], [54.9068, 23.8948], [54.8985, 23.8862],
    ],
  },
  {
    id: 'via-baltica-panevezys',
    name: { lt: 'Via Baltica: Kaunas → Panevėžys', en: 'Via Baltica: Kaunas → Panevėžys' },
    cruiseMs: 30,
    waypoints: [
      [54.9369, 23.9612], [55.0331, 24.0221], [55.1503, 24.0919], [55.2501, 24.1987],
      [55.3602, 24.2971], [55.5017, 24.3483], [55.7348, 24.3575],
    ],
  },
];
