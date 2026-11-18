// Builds packages/core/src/demo/klaipeda.ts from .cache/extract.json:
//  - a routable road graph (vertices snapped at ~1 m, tile seams healed, one-ways respected)
//  - real-street loops for the demo "live drivers" and routes for demo trips (Dijkstra by travel time)
//  - car-relevant places (viewpoints, fuel, EV charging, malls for meets, ferries, museums, castle)
// Usage: node scripts/klaipeda/build-klaipeda.mjs   (after fetch-tiles.mjs)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../../packages/core/src/demo/klaipeda.ts');
const { roads, pois, source } = JSON.parse(readFileSync(join(here, '.cache/extract.json'), 'utf8'));

const R = 6371008.8, rad = (d) => (d * Math.PI) / 180;
const dist = ([a, b], [c, d]) => {
  const s = Math.sin(rad(d - b) / 2) ** 2 + Math.cos(rad(b)) * Math.cos(rad(d)) * Math.sin(rad(c - a) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const SPEED = { motorway: 25, trunk: 20, primary: 15, secondary: 13, tertiary: 11, minor: 7 };

/* ---------- graph ---------- */
const key = ([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`;
const nodes = new Map(); // key -> {id, c}
const coord = [];
const adj = []; // id -> [{to, w, len}]
const nodeId = (c) => {
  const k = key(c);
  let n = nodes.get(k);
  if (!n) { n = coord.length; nodes.set(k, n); coord.push(c); adj.push([]); }
  return n;
};
const addEdge = (a, b, cls, dir) => {
  if (a === b) return;
  const len = dist(coord[a], coord[b]);
  const w = len / SPEED[cls];
  if (dir >= 0) adj[a].push({ to: b, w, len });
  if (dir <= 0) adj[b].push({ to: a, w, len });
};
// Tile geometry is simplified, so a side street ending on a main road (T-junction) usually has no
// shared vertex with it. Snap every line end onto the nearest segment of another line within 12 m,
// inserting that point into the other line so the graph connects there.
const lines = roads.map((r) => ({ ...r, coords: r.coords.map((c) => [...c]) }));
const kx = Math.cos(rad(55.71)) * 111320, ky = 110540;
const SEG_CELL = 0.0006;
const segGrid = new Map();
lines.forEach((l, li) => {
  for (let i = 1; i < l.coords.length; i++) {
    const [a, b] = [l.coords[i - 1], l.coords[i]];
    const x0 = Math.floor(Math.min(a[0], b[0]) / SEG_CELL), x1 = Math.floor(Math.max(a[0], b[0]) / SEG_CELL);
    const y0 = Math.floor(Math.min(a[1], b[1]) / SEG_CELL), y1 = Math.floor(Math.max(a[1], b[1]) / SEG_CELL);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const k = `${x},${y}`;
      (segGrid.get(k) ?? segGrid.set(k, []).get(k)).push([li, i]);
    }
  }
});
const splits = new Map(); // line index -> [{seg, t, c}]
const joins = []; // [endpointCoord, snappedCoord]
for (let li = 0; li < lines.length; li++) {
  const l = lines[li];
  for (const end of [l.coords[0], l.coords[l.coords.length - 1]]) {
    let bestD = 12, bestHit = null;
    const gx = Math.floor(end[0] / SEG_CELL), gy = Math.floor(end[1] / SEG_CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const [lj, i] of segGrid.get(`${gx + dx},${gy + dy}`) ?? []) {
        if (lj === li) continue;
        const a = lines[lj].coords[i - 1], b = lines[lj].coords[i];
        const ax = a[0] * kx, ay = a[1] * ky, bx = b[0] * kx, by = b[1] * ky, px = end[0] * kx, py = end[1] * ky;
        const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
        const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0;
        const d = Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
        if (d < bestD) { bestD = d; bestHit = { lj, seg: i, t, c: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] }; }
      }
    }
    if (bestHit) {
      if (bestHit.t > 0 && bestHit.t < 1) (splits.get(bestHit.lj) ?? splits.set(bestHit.lj, []).get(bestHit.lj)).push(bestHit);
      joins.push([end, bestHit.c]);
    }
  }
}
for (const [lj, ss] of splits) {
  ss.sort((a, b) => b.seg - a.seg || b.t - a.t); // insert from the end so indexes stay valid
  for (const sp of ss) lines[lj].coords.splice(sp.seg, 0, sp.c);
}
for (const r of lines) {
  const ids = r.coords.map(nodeId);
  for (let i = 1; i < ids.length; i++) addEdge(ids[i - 1], ids[i], r.cls, r.oneway === 1 ? 1 : r.oneway === -1 ? -1 : 0);
}
let healed = 0;
for (const [a, b] of joins) { addEdge(nodeId(a), nodeId(b), 'minor', 0); healed++; }

// Largest strongly connected component (Kosaraju, iterative): every snapped point can reach every other.
const n = coord.length;
const radj = coord.map(() => []);
adj.forEach((es, a) => es.forEach(({ to }) => radj[to].push(a)));
const order = [];
const seenV = new Uint8Array(n);
for (let s = 0; s < n; s++) {
  if (seenV[s]) continue;
  const st = [[s, 0]]; seenV[s] = 1;
  while (st.length) {
    const top = st[st.length - 1];
    const [u, i] = top;
    if (i < adj[u].length) {
      top[1]++;
      const v = adj[u][i].to;
      if (!seenV[v]) { seenV[v] = 1; st.push([v, 0]); }
    } else { order.push(u); st.pop(); }
  }
}
const comp = new Int32Array(n).fill(-1);
let best = 0, bestSize = 0, cid = 0;
for (let k = n - 1; k >= 0; k--) {
  const s = order[k];
  if (comp[s] !== -1) continue;
  let size = 0; const st = [s]; comp[s] = cid;
  while (st.length) { const u = st.pop(); size++; for (const v of radj[u]) if (comp[v] === -1) { comp[v] = cid; st.push(v); } }
  if (size > bestSize) { bestSize = size; best = cid; }
  cid++;
}

/* ---------- routing ---------- */
function nearest(lat, lng, preferMajor = true) {
  let bi = -1, bd = Infinity;
  for (let i = 0; i < coord.length; i++) {
    if (comp[i] !== best || adj[i].length === 0) continue;
    const d = dist([lng, lat], coord[i]);
    if (d < bd) { bd = d; bi = i; }
  }
  if (bd > 350) throw new Error(`no road near ${lat},${lng} (${bd.toFixed(0)} m)`);
  return bi;
}
function dijkstra(src, dst) {
  const n = coord.length, d = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
  d[src] = 0;
  const heap = [[0, src]];
  const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [du, u] = pop();
    if (u === dst) break;
    if (du > d[u]) continue;
    for (const { to, w } of adj[u]) if (du + w < d[to]) { d[to] = du + w; prev[to] = u; push([d[to], to]); }
  }
  if (!Number.isFinite(d[dst])) return null;
  const path = [];
  for (let u = dst; u !== -1; u = prev[u]) path.push(coord[u]);
  return path.reverse();
}
function routeThrough(stops, loop = false) {
  const ids = stops.map((s) => nearest(s.lat, s.lng));
  if (loop) ids.push(ids[0]);
  let path = [];
  for (let i = 1; i < ids.length; i++) {
    const seg = dijkstra(ids[i - 1], ids[i]);
    if (!seg) throw new Error(`no route ${stops[i - 1].name} → ${stops[i % stops.length].name}`);
    path = path.length ? path.concat(seg.slice(1)) : seg;
  }
  return simplify(path, 2.5);
}
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const kx = Math.cos(rad(pts[0][1])) * 111320, ky = 110540;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [ax, ay] = [pts[s][0] * kx, pts[s][1] * ky], [bx, by] = [pts[e][0] * kx, pts[e][1] * ky];
    let md = 0, mi = -1;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = [pts[i][0] * kx, pts[i][1] * ky];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
      const dd = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (dd > md) { md = dd; mi = i; }
    }
    if (mi >= 0 && md > tol) { keep[mi] = 1; stack.push([s, mi], [mi, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const length = (p) => p.reduce((s, c, i) => (i ? s + dist(p[i - 1], c) : 0), 0);

/* ---------- named places (snapped to real roads) ---------- */
const poi = (name) => {
  const p = pois.find((x) => x.name === name);
  if (!p) throw new Error(`poi not found: ${name}`);
  return { name, lat: p.lat, lng: p.lng };
};
const P = {
  oldTown: { name: 'Teatro st.', lat: 55.706817, lng: 21.131848 },
  castle: poi('Klaipėdos pilis'),
  akropolis: poi('PLC „Akropolis“'),
  arena: poi('PC „Arena“'),
  megaPlaza: poi('Mega Plaza'),
  newFerry: { name: 'Naujoji perkėla', lat: 55.688433, lng: 21.138816 },
  melnrage: { name: 'Melnragė', lat: 55.73754, lng: 21.091899 },
  giruliai: { name: 'Giruliai', lat: 55.770614, lng: 21.083713 },
  olando: poi('Olando kepurė'),
  karkle: { name: 'Karklė', lat: 55.814814, lng: 21.070994 },
  automuseum: poi('Memel Automuseum'),
  studlendas: poi('PC „Studlendas“'),
  herkaus: poi('Herkaus galerija'),
  sendvaris: poi('Circle K „Sendvaris“'),
  minijos: poi('Neste „Minijos“'),
  university: { name: 'Universiteto st.', lat: 55.725569, lng: 21.122444 },
  smelte: { name: 'Smeltė', lat: 55.664851, lng: 21.157082 },
  liepojos: { name: 'Liepojos st.', lat: 55.731336, lng: 21.124783 },
};

const DRIVERS = [
  { id: 'rokas', loop: [P.oldTown, P.akropolis, P.arena, P.castle] },
  { id: 'ieva', loop: [P.melnrage, P.giruliai, P.olando, P.liepojos, P.university] },
  { id: 'mantas', loop: [P.minijos, P.newFerry, P.castle, P.akropolis] },
  { id: 'greta', loop: [P.akropolis, P.sendvaris, P.megaPlaza, P.arena] },
  { id: 'lukas', loop: [P.herkaus, P.studlendas, P.oldTown, P.university] },
  { id: 'austeja', loop: [P.automuseum, P.smelte, P.newFerry, P.oldTown] },
  { id: 'dovydas', loop: [P.university, P.giruliai, P.karkle, P.liepojos] },
  { id: 'emilija', loop: [P.castle, P.oldTown, P.herkaus, P.melnrage] },
];
const ROUTES = [
  { id: 'klp-oldtown-giruliai', lt: 'Senamiestis → Giruliai', en: 'Old Town → Giruliai', stops: [P.oldTown, P.melnrage, P.giruliai], cruiseMs: 14 },
  { id: 'klp-akropolis-olando', lt: 'Akropolis → Olando kepurė', en: 'Akropolis → Olando kepurė', stops: [P.akropolis, P.liepojos, P.olando], cruiseMs: 16 },
  { id: 'klp-minijos-ferry', lt: 'Minijos g. → Naujoji perkėla', en: 'Minijos St → New Ferry', stops: [P.minijos, P.smelte, P.newFerry], cruiseMs: 13 },
  { id: 'klp-night-loop', lt: 'Naktinis miesto ratas', en: 'Night city loop', stops: [P.castle, P.akropolis, P.arena, P.oldTown], cruiseMs: 13, loop: true },
  { id: 'klp-coast-karkle', lt: 'Pajūris iki Karklės', en: 'Coast to Karklė', stops: [P.university, P.giruliai, P.karkle], cruiseMs: 17 },
  { id: 'klp-sendvaris-oldtown', lt: 'Sendvaris → Senamiestis', en: 'Sendvaris → Old Town', stops: [P.sendvaris, P.akropolis, P.oldTown], cruiseMs: 15 },
];

const fmt = (c) => `[${c[0]},${c[1]}]`;
const drivers = DRIVERS.map((d) => ({ id: d.id, path: routeThrough(d.loop, true) }));
const routes = ROUTES.map((r) => ({ ...r, path: routeThrough(r.stops, r.loop) }));

/* ---------- places ---------- */
const CAT = (p) => {
  if (p.sub === 'viewpoint') return 'viewpoint';
  if (p.cls === 'castle' || p.cls === 'museum' || p.sub === 'artwork') return 'photo_spot';
  if (p.sub === 'charging_station') return 'ev_charger';
  if (p.cls === 'fuel') return 'fuel';
  if (p.sub === 'mall') return 'meet_spot';
  if (p.sub === 'car_wash') return 'detailing';
  if (p.sub === 'car_repair' || p.sub === 'tyres') return 'tires';
  if (p.cls === 'ferry_terminal') return 'parking';
  return null;
};
const seen = new Set();
const places = pois
  .filter((p) => p.name && CAT(p) && !(p.cls === 'castle' && p.sub === 'ruins' && /Pabūklo|Šaudmenų|Fla/.test(p.name)))
  .filter((p) => !['Medžioklės trofėjų muziejus', 'Kalvystės muziejus', 'Parodų rūmai', 'Laikrodžių muziejus'].includes(p.name))
  .filter((p) => (seen.has(p.name) ? false : (seen.add(p.name), true)))
  .filter((p) => CAT(p) !== 'tires' || /padang|tyre|tire|auto/i.test(p.name))
  .map((p) => ({ category: CAT(p), title: p.name, lat: p.lat, lng: p.lng }));

const ts = `// GENERATED by scripts/klaipeda/build-klaipeda.mjs — do not edit by hand.
// Road geometry and places © OpenStreetMap contributors (ODbL), via OpenFreeMap vector tiles:
// ${source}
import type { DemoRoute } from './routes.ts';

export const KLAIPEDA_CENTER: [number, number] = [21.1443, 55.7033]; // [lng, lat]
export const KLAIPEDA_BOUNDS = { minLng: 21.03, minLat: 55.6, maxLng: 21.27, maxLat: 55.82 };

/** Closed loops along real Klaipėda streets ([lng, lat]) for the demo live drivers. */
export const KLAIPEDA_DRIVER_LOOPS: Record<string, [number, number][]> = {
${drivers.map((d) => `  ${d.id}: [${d.path.map(fmt).join(',')}],`).join('\n')}
};

/** Demo trips that follow real streets (waypoints are dense road geometry, [lat, lng]). */
export const KLAIPEDA_ROUTES: DemoRoute[] = [
${routes.map((r) => `  { id: '${r.id}', name: { lt: '${r.lt}', en: '${r.en}' }, cruiseMs: ${r.cruiseMs}, waypoints: [${r.path.map(([lng, lat]) => `[${lat},${lng}]`).join(',')}] },`).join('\n')}
];

export type KlaipedaPlaceCategory = 'viewpoint' | 'photo_spot' | 'ev_charger' | 'fuel' | 'meet_spot' | 'detailing' | 'tires' | 'parking';
/** Real car-relevant places in Klaipėda from OpenStreetMap. */
export const KLAIPEDA_PLACES: { category: KlaipedaPlaceCategory; title: string; lat: number; lng: number }[] = [
${places.map((p) => `  { category: '${p.category}', title: ${JSON.stringify(p.title)}, lat: ${p.lat}, lng: ${p.lng} },`).join('\n')}
];
`;
writeFileSync(out, ts);
console.log(`graph: ${coord.length} vertices, ${healed} seams healed, main component ${bestSize}`);
drivers.forEach((d) => console.log(`driver ${d.id}: ${(length(d.path) / 1000).toFixed(1)} km, ${d.path.length} pts`));
routes.forEach((r) => console.log(`route ${r.id}: ${(length(r.path) / 1000).toFixed(1)} km, ${r.path.length} pts`));
console.log(`places: ${places.length}`, Object.entries(places.reduce((a, p) => ((a[p.category] = (a[p.category] ?? 0) + 1), a), {})));
console.log(`wrote ${out} (${(ts.length / 1024).toFixed(0)} KB)`);

/* ---------- database seed (dev/demo): Klaipėda pins + scenic roads ---------- */
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const wkt = (pts) => `SRID=4326;LINESTRING(${pts.map(([lng, lat]) => `${lng} ${lat}`).join(', ')})`;
const scenic = [
  { name: 'Girulių–Karklės pajūrio kelias', desc: 'Miško kelias palei jūrą iki Karklės ir Olando kepurės.', tags: '{coast,forest,scenic}', path: routes.find((r) => r.id === 'klp-coast-karkle').path },
  { name: 'Melnragė–Giruliai', desc: 'Trumpas pajūrio važiavimas pro Melnragę.', tags: '{coast,scenic}', path: routes.find((r) => r.id === 'klp-oldtown-giruliai').path },
  { name: 'Klaipėdos naktinis ratas', desc: 'Senamiestis, Akropolis ir Arena — populiarus vakaro ratas.', tags: '{empty_at_night,historic}', path: routes.find((r) => r.id === 'klp-night-loop').path },
];
const sql = `-- GENERATED by scripts/klaipeda/build-klaipeda.mjs — Klaipėda dev/demo seed.
-- Places and road geometry © OpenStreetMap contributors (ODbL).
insert into public.pins (category, title, description, location, status, source) values
${places.map((p) => `  (${q(p.category)}, ${q(p.title.slice(0, 80))}, 'OpenStreetMap', 'SRID=4326;POINT(${p.lng} ${p.lat})', 'approved', 'osm')`).join(',\n')};

insert into public.roads (name, description, geom, tags, status, source) values
${scenic.map((r) => `  (${q(r.name)}, ${q(r.desc)}, ${q(wkt(r.path))}, ${q(r.tags)}, 'approved', 'osm')`).join(',\n')};
`;
writeFileSync(join(here, '../../supabase/seed_klaipeda.sql'), sql);
console.log(`wrote supabase/seed_klaipeda.sql (${places.length} pins, ${scenic.length} roads)`);
