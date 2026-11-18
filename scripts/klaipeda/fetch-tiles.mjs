// Extracts Klaipėda's drivable roads + car-relevant places from OpenFreeMap vector tiles (OpenMapTiles
// schema, built from OpenStreetMap). Output: scripts/klaipeda/.cache/extract.json (not committed).
// Data © OpenStreetMap contributors (ODbL).
// Usage (behind a proxy add NODE_USE_ENV_PROXY=1): node scripts/klaipeda/fetch-tiles.mjs
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader as Pbf } from 'pbf';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BBOX = { south: 55.60, west: 21.03, north: 55.82, east: 21.27 };
const Z = 14;
const ROAD_CLASSES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']);

const lng2x = (lng) => Math.floor(((lng + 180) / 360) * 2 ** Z);
const lat2y = (lat) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** Z);

const tilejson = await (await fetch('https://tiles.openfreemap.org/planet')).json();
const template = tilejson.tiles[0];
const roads = [];
const pois = new Map();
const [x0, x1] = [lng2x(BBOX.west), lng2x(BBOX.east)];
const [y0, y1] = [lat2y(BBOX.north), lat2y(BBOX.south)];
console.log(`tiles x ${x0}-${x1}, y ${y0}-${y1}: ${(x1 - x0 + 1) * (y1 - y0 + 1)} tiles`);

for (let x = x0; x <= x1; x++) {
  for (let y = y0; y <= y1; y++) {
    const url = template.replace('{z}', Z).replace('{x}', x).replace('{y}', y);
    const res = await fetch(url);
    if (!res.ok) { console.warn('skip', url, res.status); continue; }
    const tile = new VectorTile(new Pbf(new Uint8Array(await res.arrayBuffer())));
    const tr = tile.layers.transportation;
    for (let i = 0; tr && i < tr.length; i++) {
      const f = tr.feature(i);
      const p = f.properties;
      if (!ROAD_CLASSES.has(p.class) || f.type !== 2) continue;
      if (p.access === 'no' || p.service) continue;
      const gj = f.toGeoJSON(x, y, Z).geometry;
      const lines = gj.type === 'LineString' ? [gj.coordinates] : gj.coordinates;
      for (const coords of lines) {
        roads.push({ cls: p.class, ramp: p.ramp === 1, oneway: p.oneway ?? 0, brunnel: p.brunnel ?? null,
          coords: coords.map(([lng, lat]) => [Number(lng.toFixed(6)), Number(lat.toFixed(6))]) });
      }
    }
    const poi = tile.layers.poi;
    for (let i = 0; poi && i < poi.length; i++) {
      const f = poi.feature(i);
      const p = f.properties;
      if (f.type !== 1) continue;
      const [lng, lat] = f.toGeoJSON(x, y, Z).geometry.coordinates;
      const key = `${p.class}:${p.subclass}:${p.name ?? ''}:${lng.toFixed(4)}:${lat.toFixed(4)}`;
      pois.set(key, { cls: p.class, sub: p.subclass, name: p['name:lt'] ?? p.name ?? null, lng: Number(lng.toFixed(6)), lat: Number(lat.toFixed(6)) });
    }
  }
}
mkdirSync(join(here, '.cache'), { recursive: true });
writeFileSync(join(here, '.cache/extract.json'), JSON.stringify({ source: template, roads, pois: [...pois.values()] }));
console.log(`roads: ${roads.length} line parts, pois: ${pois.size}`);
