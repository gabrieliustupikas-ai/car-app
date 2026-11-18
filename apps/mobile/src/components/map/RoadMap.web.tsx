/**
 * Web map (MapLibre GL + OpenFreeMap vector tiles). Same component API as RoadMap.tsx (Mapbox native):
 * <RoadMap> plus overlay children <RouteLine>, <DriversLayer>, <PlacesLayer>, <UserPuck>.
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import { KLAIPEDA_CENTER } from '@roadclub/core';
import { Map as MlMap, setWorkerUrl, type GeoJSONSource, type LayerSpecification, type MapLayerMouseEvent } from 'maplibre-gl';
import { createContext, forwardRef, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { buildMapStyle } from './mapStyle';
import type { MapDriver, MapPlace, RoadMapProps } from './types';

export type { MapDriver, MapPlace } from './types';

// Served from apps/mobile/public (copied by scripts/copy-maplibre-worker.mjs).
setWorkerUrl('/maplibre-gl-worker.mjs');

const MapCtx = createContext<{ map: MlMap | null; version: number }>({ map: null, version: 0 });

const CAR_COLORS: Record<MapDriver['carColor'], { fill: string; stroke: string }> = {
  red: { fill: '#E10600', stroke: '#FFFFFF' },
  silver: { fill: '#C9CED6', stroke: '#0B0C0E' },
  black: { fill: '#16181B', stroke: '#C9CED6' },
};

/** Car puck: a rounded arrow drawn on a canvas, rotated on the map by heading. */
function carImage(fill: string, stroke: string) {
  const s = 64, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.translate(s / 2, s / 2);
  g.shadowColor = 'rgba(0,0,0,0.6)';
  g.shadowBlur = 8;
  g.beginPath();
  g.moveTo(0, -24); g.lineTo(17, 20); g.quadraticCurveTo(0, 10, -17, 20); g.closePath();
  g.fillStyle = fill; g.fill();
  g.shadowBlur = 0; g.lineWidth = 4; g.strokeStyle = stroke; g.stroke();
  return g.getImageData(0, 0, s, s);
}

export const RoadMap = forwardRef<unknown, PropsWithChildren<RoadMapProps>>(function RoadMap(
  { children, bounds, followCoord, interactive = true, pitch = 50, controlsBottomInset = 0 }, _ref,
) {
  const host = useRef<unknown>(null);
  const { scheme } = useTheme();
  const [map, setMap] = useState<MlMap | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const el = host.current as unknown as HTMLElement | null;
    if (!el) return;
    el.classList.add('rc-map');
    const m = new MlMap({
      container: el,
      style: buildMapStyle(scheme),
      center: KLAIPEDA_CENTER,
      zoom: 12.4,
      pitch,
      bearing: -14,
      interactive,
      attributionControl: { compact: true },
      maxPitch: 70,
    });
    const addImages = () => {
      for (const [k, v] of Object.entries(CAR_COLORS)) if (!m.hasImage(`rc-car-${k}`)) m.addImage(`rc-car-${k}`, carImage(v.fill, v.stroke), { pixelRatio: 2 });
    };
    m.on('load', () => {
      addImages();
      el.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      setMap(m);
      setVersion((x) => x + 1);
    });
    m.on('style.load', () => { addImages(); setVersion((x) => x + 1); });
    return () => { setMap(null); m.remove(); };
    // the map instance is created once; theme/bounds/follow are applied by the effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appliedScheme = useRef(scheme);
  useEffect(() => {
    if (!map || appliedScheme.current === scheme) return;
    appliedScheme.current = scheme;
    map.setStyle(buildMapStyle(scheme));
  }, [map, scheme]);

  useEffect(() => {
    if (map && bounds) map.fitBounds([bounds.sw, bounds.ne], { padding: { top: 70, bottom: 40, left: 40, right: 40 }, duration: 0, pitch: 0, bearing: 0 });
  }, [map, bounds]);

  const fLng = followCoord?.[0], fLat = followCoord?.[1];
  useEffect(() => {
    if (map && fLng != null && fLat != null) map.easeTo({ center: [fLng, fLat], zoom: Math.max(map.getZoom(), 14.6), pitch: 55, duration: 900 });
  }, [map, fLng, fLat]);

  return (
    // maplibre's CSS makes its container position:relative, so size it with flex inside an absolute wrapper
    <View style={StyleSheet.absoluteFill}>
      <style>{`.rc-map .maplibregl-ctrl-bottom-right,.rc-map .maplibregl-ctrl-bottom-left{bottom:var(--rc-bottom,0px)}`}</style>
      <View ref={host as never} style={{ flex: 1, ['--rc-bottom' as string]: `${controlsBottomInset}px` } as never}>
        <MapCtx.Provider value={{ map, version }}>{children}</MapCtx.Provider>
      </View>
    </View>
  );
});

/** Adds a GeoJSON source + layers while mounted; re-adds after style (theme) changes. */
function useGeoJsonLayers(id: string, data: GeoJSON.FeatureCollection | GeoJSON.Feature, layers: LayerSpecification[], key: string,
  onClick?: (props: Record<string, unknown>) => void) {
  const { map, version } = useContext(MapCtx);
  const dataRef = useRef(data);
  const clickRef = useRef(onClick);
  useLayoutEffect(() => { dataRef.current = data; clickRef.current = onClick; });

  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!map) return;
    // isStyleLoaded() is also false while *any* GeoJSON source is still parsing, so instead of bailing
    // out, try to add and retry on the next idle frame if the style really isn't ready yet.
    try {
      if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: dataRef.current });
      for (const l of layers) if (!map.getLayer(l.id)) map.addLayer(l);
    } catch (e) {
      if (retry < 20) map.once('idle', () => setRetry((r) => r + 1));
      else console.warn('[map] layer setup failed', id, e);
      return;
    }
    const handlers = layers.filter((l) => l.type !== 'line').map((l) => {
      const click = (e: MapLayerMouseEvent) => { const f = e.features?.[0]; if (f) clickRef.current?.(f.properties ?? {}); };
      const enter = () => { map.getCanvas().style.cursor = 'pointer'; };
      const leave = () => { map.getCanvas().style.cursor = ''; };
      map.on('click', l.id, click); map.on('mouseenter', l.id, enter); map.on('mouseleave', l.id, leave);
      return () => { map.off('click', l.id, click); map.off('mouseenter', l.id, enter); map.off('mouseleave', l.id, leave); };
    });
    return () => {
      handlers.forEach((off) => off());
      try {
        for (const l of layers) if (map.getLayer(l.id)) map.removeLayer(l.id);
        if (map.getSource(id)) map.removeSource(id);
      } catch { /* map already removed */ }
    };
    // `key` captures the layer styling (theme) so layers are rebuilt when it changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, version, id, key, retry]);

  useEffect(() => {
    try { (map?.getSource(id) as GeoJSONSource | undefined)?.setData(data); } catch { /* not ready */ }
  }, [map, version, id, data]);
}

export function RouteLine({ id, coordinates }: { id: string; coordinates: [number, number][] }) {
  const { colors } = useTheme();
  const data = useMemo<GeoJSON.Feature>(() => ({
    type: 'Feature', properties: {},
    geometry: { type: 'LineString', coordinates: coordinates.length >= 2 ? coordinates : [] },
  }), [coordinates]);
  useGeoJsonLayers(`${id}-route`, data, [
    { id: `${id}-route-glow`, type: 'line', source: `${id}-route`, layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': colors.route, 'line-width': 14, 'line-opacity': 0.25, 'line-blur': 6 } },
    { id: `${id}-route-line`, type: 'line', source: `${id}-route`, layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': colors.route, 'line-width': 4.5 } },
  ], colors.route);
  return null;
}

export function DriversLayer({ drivers, onPress }: { drivers: MapDriver[]; onPress?: (id: string) => void }) {
  const { colors, scheme } = useTheme();
  const data = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: drivers.map((d) => ({
      type: 'Feature', properties: { id: d.id, name: d.name, color: d.carColor, heading: d.heading },
      geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
    })),
  }), [drivers]);
  useGeoJsonLayers('rc-drivers', data, [
    { id: 'rc-drivers-halo', type: 'circle', source: 'rc-drivers',
      paint: { 'circle-radius': 15, 'circle-color': colors.accent, 'circle-opacity': 0.12, 'circle-stroke-width': 1, 'circle-stroke-color': colors.accent, 'circle-stroke-opacity': 0.35 } },
    { id: 'rc-drivers-car', type: 'symbol', source: 'rc-drivers',
      layout: { 'icon-image': ['concat', 'rc-car-', ['get', 'color']], 'icon-size': 0.75, 'icon-rotate': ['get', 'heading'],
        'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true } },
    { id: 'rc-drivers-name', type: 'symbol', source: 'rc-drivers', minzoom: 12,
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-offset': [0, 1.7], 'text-anchor': 'top', 'text-allow-overlap': true },
      paint: { 'text-color': scheme === 'dark' ? '#E6E9EE' : '#0B0C0E', 'text-halo-color': scheme === 'dark' ? '#050506' : '#FFFFFF', 'text-halo-width': 1.4 } },
  ], `${colors.accent}-${scheme}`, (p) => onPress?.(String(p.id)));
  return null;
}

const PLACE_COLORS: Record<string, string> = {
  viewpoint: '#FFFFFF', photo_spot: '#C9CED6', ev_charger: '#34C77B', fuel: '#F2B33D', meet_spot: '#E10600',
  detailing: '#8AB4F8', tires: '#8AB4F8', parking: '#8AB4F8',
};

export function PlacesLayer({ places, onPress }: { places: MapPlace[]; onPress?: (id: string) => void }) {
  const { scheme } = useTheme();
  const data = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: places.map((p) => ({
      type: 'Feature', properties: { id: p.id, title: p.title, category: p.category },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    })),
  }), [places]);
  useGeoJsonLayers('rc-places', data, [
    { id: 'rc-places-dot', type: 'circle', source: 'rc-places', minzoom: 11,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 16, 6],
        // photo spots (street sculptures etc.) only appear once you zoom into the city
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, ['case', ['==', ['get', 'category'], 'photo_spot'], 0, 1], 14.5, 1],
        'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, ['case', ['==', ['get', 'category'], 'photo_spot'], 0, 1], 14.5, 1],
        'circle-color': ['match', ['get', 'category'], ...Object.entries(PLACE_COLORS).flat(), '#C9CED6'] as never,
        'circle-stroke-width': 1.5, 'circle-stroke-color': scheme === 'dark' ? '#050506' : '#FFFFFF',
      } },
    { id: 'rc-places-label', type: 'symbol', source: 'rc-places', minzoom: 14.5,
      layout: { 'text-field': ['get', 'title'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1], 'text-anchor': 'top', 'text-optional': true },
      paint: { 'text-color': scheme === 'dark' ? '#A3A9B2' : '#4A5059', 'text-halo-color': scheme === 'dark' ? '#050506' : '#FFFFFF', 'text-halo-width': 1.2 } },
  ], scheme, (p) => onPress?.(String(p.id)));
  return null;
}

export function UserPuck({ coord }: { coord: [number, number] | null }) {
  const { colors } = useTheme();
  const data = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: coord ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: coord } }] : [],
  }), [coord]);
  useGeoJsonLayers('rc-me', data, [
    { id: 'rc-me-halo', type: 'circle', source: 'rc-me', paint: { 'circle-radius': 22, 'circle-color': colors.accent, 'circle-opacity': 0.2 } },
    { id: 'rc-me-dot', type: 'circle', source: 'rc-me',
      paint: { 'circle-radius': 8, 'circle-color': colors.accent, 'circle-stroke-width': 3, 'circle-stroke-color': '#FFFFFF' } },
  ], colors.accent);
  return null;
}
