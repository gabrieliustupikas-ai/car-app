/**
 * Demo "live drivers" for Klaipėda: fictional profiles that drive real-street loops. Used by demo mode
 * on the map and in the Radio tab. Positions are a pure function of time so every screen agrees.
 */
import { haversine } from '../geo.ts';
import { KLAIPEDA_DRIVER_LOOPS } from './klaipeda.ts';

export interface DemoDriver {
  id: string;
  name: string;
  initials: string;
  car: string;
  carColor: 'silver' | 'black' | 'red';
  level: number;
  club: string;
  /** average speed on the loop (m/s) — urban, legal */
  speedMs: number;
  /** phase offset along the loop (0..1) */
  offset: number;
  /** what they say on the radio (lt, en) */
  lines: [string, string][];
}

export const DEMO_DRIVERS: readonly DemoDriver[] = [
  { id: 'rokas', name: 'Rokas K.', initials: 'RK', car: 'BMW M3 E46', carColor: 'silver', level: 23, club: 'Klaipėda Night Cruisers', speedMs: 11, offset: 0.05,
    lines: [['Rinkimės prie Akropolio aikštelės dešimtą.', 'Meeting at the Akropolis car park at ten.'], ['Taikos prospekte kamštis, važiuokit per Šilutės plentą.', 'Traffic on Taikos, take Šilutės road instead.']] },
  { id: 'ieva', name: 'Ieva P.', initials: 'IP', car: 'Mazda MX-5 NA', carColor: 'red', level: 12, club: 'Pajūrio Roadsters', speedMs: 12, offset: 0.4,
    lines: [['Prie Olando kepurės dabar nuostabus saulėlydis.', 'Amazing sunset at Olando kepurė right now.'], ['Girulių kelias tuščias, gražus važiavimas.', 'Giruliai road is empty, lovely drive.']] },
  { id: 'mantas', name: 'Mantas J.', initials: 'MJ', car: 'Audi RS4 Avant B7', carColor: 'black', level: 31, club: 'Klaipėda Night Cruisers', speedMs: 11.5, offset: 0.7,
    lines: [['Naujoji perkėla — eilė apie dvidešimt minučių.', 'New ferry queue is about twenty minutes.'], ['Kas važiuoja į Smiltynę šeštadienį?', 'Who is driving to Smiltynė on Saturday?']] },
  { id: 'greta', name: 'Greta V.', initials: 'GV', car: 'Toyota GR86', carColor: 'red', level: 9, club: 'Klaipėda Night Cruisers', speedMs: 10.5, offset: 0.2,
    lines: [['Naujas detailing prie Arenos, labai rekomenduoju.', 'New detailing place near the Arena, highly recommend.']] },
  { id: 'lukas', name: 'Lukas B.', initials: 'LB', car: 'VW Golf GTI Mk7', carColor: 'silver', level: 17, club: 'Uostamiesčio GTI', speedMs: 10, offset: 0.55,
    lines: [['Senamiestyje remontas Tiltų gatvėje, apvažiuokit.', 'Roadworks on Tiltų street in the old town, go around.']] },
  { id: 'austeja', name: 'Austėja M.', initials: 'AM', car: 'Porsche 911 (996)', carColor: 'silver', level: 28, club: 'Pajūrio Roadsters', speedMs: 12, offset: 0.85,
    lines: [['Memel Automuseum šiandien atviras iki šešių.', 'Memel Automuseum is open until six today.']] },
  { id: 'dovydas', name: 'Dovydas R.', initials: 'DR', car: 'Volvo 240 Turbo', carColor: 'black', level: 15, club: 'Uostamiesčio GTI', speedMs: 13, offset: 0.3,
    lines: [['Karklėje dar laisvų vietų aikštelėje.', 'Still free spots in the Karklė car park.']] },
  { id: 'emilija', name: 'Emilija Š.', initials: 'EŠ', car: 'Honda Civic Type R EP3', carColor: 'red', level: 20, club: 'Klaipėda Night Cruisers', speedMs: 11, offset: 0.65,
    lines: [['Melnragėje pilna žmonių, statykit prie švyturio.', 'Melnragė is busy, park near the lighthouse.']] },
];

interface LoopIndex { pts: [number, number][]; cum: number[]; total: number }
const loops = new Map<string, LoopIndex>();
function loopFor(id: string): LoopIndex | null {
  const cached = loops.get(id);
  if (cached) return cached;
  const pts = KLAIPEDA_DRIVER_LOOPS[id];
  if (!pts || pts.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1]! + haversine({ lng: pts[i - 1]![0], lat: pts[i - 1]![1] }, { lng: pts[i]![0], lat: pts[i]![1] }));
  }
  const idx = { pts, cum, total: cum[cum.length - 1]! };
  loops.set(id, idx);
  return idx;
}

export interface DriverPosition { lng: number; lat: number; heading: number; speedMs: number }

/** Where a demo driver is at time `t` (epoch ms). Speed breathes ±25 % so cars don't move in lockstep. */
export function demoDriverPosition(d: DemoDriver, t: number): DriverPosition | null {
  const loop = loopFor(d.id);
  if (!loop) return null;
  const s = t / 1000;
  const wobble = 0.25 * Math.sin(s / 37 + d.offset * 10) * 37 / 1; // integral of the speed wobble
  const dist = ((d.offset * loop.total + d.speedMs * s + d.speedMs * wobble) % loop.total + loop.total) % loop.total;
  let lo = 0, hi = loop.cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (loop.cum[mid]! <= dist) lo = mid; else hi = mid; }
  const a = loop.pts[lo]!, b = loop.pts[lo + 1] ?? loop.pts[0]!;
  const len = loop.cum[lo + 1]! - loop.cum[lo]!;
  const f = len > 0 ? (dist - loop.cum[lo]!) / len : 0;
  const heading = (Math.atan2((b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180), b[1] - a[1]) * 180) / Math.PI;
  return {
    lng: a[0] + (b[0] - a[0]) * f,
    lat: a[1] + (b[1] - a[1]) * f,
    heading: (heading + 360) % 360,
    speedMs: d.speedMs * (1 + 0.25 * Math.cos(s / 37 + d.offset * 10)),
  };
}

export function demoDriverLoop(id: string): [number, number][] {
  return KLAIPEDA_DRIVER_LOOPS[id] ?? [];
}
