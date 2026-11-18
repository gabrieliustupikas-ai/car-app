/**
 * MapLibre style for the web map: Apple-Maps-inspired, tuned to the silver/black/red theme.
 * Vector tiles: OpenFreeMap (OpenMapTiles schema, OpenStreetMap data) — free, no API key.
 * Dark: piano-black land, deep navy water, silver roads that brighten with importance, 3D buildings.
 * Light: warm paper land, Apple-blue water, white roads with grey casings.
 */
import type { StyleSpecification } from 'maplibre-gl';

const TILES = 'https://tiles.openfreemap.org/planet';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

interface Palette {
  land: string; landuse: string; park: string; water: string; waterLine: string; building: string; buildingTop: string;
  minor: string; minorCase: string; mid: string; midCase: string; major: string; majorCase: string; motorway: string; motorwayCase: string;
  rail: string; label: string; labelHalo: string; placeLabel: string; roadLabel: string; boundary: string;
}

const DARK: Palette = {
  land: '#0B0C0E', landuse: '#0F1013', park: '#0F1712', water: '#0A1622', waterLine: '#12263A', building: '#17191C', buildingTop: '#24272B',
  minor: '#25282D', minorCase: '#0B0C0E', mid: '#3B3F46', midCase: '#101114', major: '#5C626B', majorCase: '#16181B',
  motorway: '#8D939C', motorwayCase: '#1D2024', rail: '#2A2D32', label: '#C9CED6', labelHalo: '#050506',
  placeLabel: '#E6E9EE', roadLabel: '#9AA0A9', boundary: '#3A3E45',
};

const LIGHT: Palette = {
  land: '#F2F1ED', landuse: '#ECEBE6', park: '#D9EBCF', water: '#A6D0F0', waterLine: '#8EC1E8', building: '#E2E0DB', buildingTop: '#D9D6D0',
  minor: '#FFFFFF', minorCase: '#D7D5CF', mid: '#FFFFFF', midCase: '#C9C6BF', major: '#FFFFFF', majorCase: '#B9B5AD',
  motorway: '#FCE8A6', motorwayCase: '#D9B85C', rail: '#C8C5BE', label: '#3A3E45', labelHalo: '#FFFFFF',
  placeLabel: '#1A1C20', roadLabel: '#5A6069', boundary: '#B9B5AD',
};

const line = (cls: string[]) => ['match', ['get', 'class'], cls, true, false] as const;
const notTunnel = ['!=', ['get', 'brunnel'], 'tunnel'] as const;

export function buildMapStyle(scheme: 'dark' | 'light'): StyleSpecification {
  const c = scheme === 'dark' ? DARK : LIGHT;
  const w = (base: number) => ['interpolate', ['exponential', 1.6], ['zoom'], 10, base * 0.25, 14, base, 18, base * 6];
  const road = (id: string, classes: string[], color: string, casing: string, width: number, minzoom = 0) => [
    { id: `${id}-case`, type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom,
      filter: ['all', line(classes), notTunnel], layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': casing, 'line-width': w(width + 1.6) } },
    { id, type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom,
      filter: ['all', line(classes), notTunnel], layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': color, 'line-width': w(width) } },
  ];

  return {
    version: 8,
    name: `roadclub-${scheme}`,
    glyphs: GLYPHS,
    sources: { omt: { type: 'vector', url: TILES, attribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors' } },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': c.land } },
      { id: 'landuse', type: 'fill', source: 'omt', 'source-layer': 'landuse', paint: { 'fill-color': c.landuse } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': c.park } },
      { id: 'landcover', type: 'fill', source: 'omt', 'source-layer': 'landcover',
        filter: ['match', ['get', 'class'], ['wood', 'grass', 'farmland'], true, false], paint: { 'fill-color': c.park, 'fill-opacity': 0.7 } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', filter: notTunnel, paint: { 'fill-color': c.water } },
      { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', paint: { 'line-color': c.waterLine, 'line-width': 1.2 } },
      { id: 'boundary', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: ['<=', ['get', 'admin_level'], 4],
        paint: { 'line-color': c.boundary, 'line-dasharray': [3, 2], 'line-width': 1 } },
      { id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: line(['rail', 'transit']),
        paint: { 'line-color': c.rail, 'line-width': 1.2, 'line-dasharray': [2, 2] } },
      ...road('road-minor', ['minor', 'service'], c.minor, c.minorCase, 1.4, 12),
      ...road('road-mid', ['secondary', 'tertiary'], c.mid, c.midCase, 2.4),
      ...road('road-major', ['primary', 'trunk'], c.major, c.majorCase, 3.2),
      ...road('road-motorway', ['motorway'], c.motorway, c.motorwayCase, 3.8),
      { id: 'building-3d', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 14,
        filter: ['!', ['has', 'hide_3d']],
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'render_height'], 0, c.building, 40, c.buildingTop],
          'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, ['get', 'render_height']],
          'fill-extrusion-base': ['get', 'render_min_height'],
          'fill-extrusion-opacity': 0.92,
        } },
      { id: 'water-name', type: 'symbol', source: 'omt', 'source-layer': 'water_name',
        layout: { 'text-field': ['coalesce', ['get', 'name:lt'], ['get', 'name']], 'text-font': ['Noto Sans Italic'], 'text-size': 12 },
        paint: { 'text-color': scheme === 'dark' ? '#4D6F91' : '#3F7CB0', 'text-halo-color': c.labelHalo, 'text-halo-width': 1 } },
      { id: 'road-name', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 13,
        filter: line(['primary', 'secondary', 'tertiary', 'trunk', 'minor']),
        layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:lt'], ['get', 'name']], 'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 17, 13] },
        paint: { 'text-color': c.roadLabel, 'text-halo-color': c.labelHalo, 'text-halo-width': 1.2 } },
      { id: 'place-small', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 11,
        filter: ['match', ['get', 'class'], ['suburb', 'neighbourhood', 'quarter', 'village', 'hamlet'], true, false],
        layout: { 'text-field': ['coalesce', ['get', 'name:lt'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 12,
          'text-transform': 'uppercase', 'text-letter-spacing': 0.15 },
        paint: { 'text-color': c.label, 'text-halo-color': c.labelHalo, 'text-halo-width': 1.2, 'text-opacity': 0.75 } },
      { id: 'place-city', type: 'symbol', source: 'omt', 'source-layer': 'place',
        filter: ['match', ['get', 'class'], ['city', 'town'], true, false],
        layout: { 'text-field': ['coalesce', ['get', 'name:lt'], ['get', 'name']], 'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 12, 12, 18] },
        paint: { 'text-color': c.placeLabel, 'text-halo-color': c.labelHalo, 'text-halo-width': 1.5 } },
    ] as StyleSpecification['layers'],
  };
}
