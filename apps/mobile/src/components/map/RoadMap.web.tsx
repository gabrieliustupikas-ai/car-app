/**
 * Web preview map. Draws a stylised Lithuania (cities + grid) and routes as glowing SVG paths,
 * so the browser demo shows real drives without the native Mapbox SDK.
 */
import { createContext, forwardRef, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme/useTheme';

type Bounds = { minLng: number; minLat: number; maxLng: number; maxLat: number };
const LT: Bounds = { minLng: 20.9, minLat: 53.85, maxLng: 26.9, maxLat: 56.5 };
const CITIES: [string, number, number][] = [
  ['Vilnius', 25.2797, 54.6872], ['Kaunas', 23.9036, 54.8985], ['Klaipėda', 21.1443, 55.7033], ['Šiauliai', 23.3141, 55.9349],
  ['Panevėžys', 24.3575, 55.7348], ['Alytus', 24.0458, 54.3963], ['Marijampolė', 23.3536, 54.5599], ['Utena', 25.5998, 55.4976],
  ['Telšiai', 22.2446, 55.9814], ['Tauragė', 22.2896, 55.2522], ['Trakai', 24.9335, 54.6379], ['Nida', 21.0059, 55.3089],
  ['Palanga', 21.0686, 55.9175], ['Druskininkai', 23.9696, 54.0177], ['Zarasai', 26.2460, 55.7300],
];

interface Ctx { project: (lng: number, lat: number) => [number, number]; report: (id: string, b: Bounds | null) => void; w: number; h: number }
const MapCtx = createContext<Ctx | null>(null);

/** Fit bounds into a W×H viewport (equirectangular, latitude-corrected), leaving room for overlays. */
function makeProjection(b: Bounds, W: number, H: number) {
  const midLat = ((b.minLat + b.maxLat) / 2) * (Math.PI / 180);
  const w = Math.max(1e-4, (b.maxLng - b.minLng) * Math.cos(midLat));
  const h = Math.max(1e-4, b.maxLat - b.minLat);
  const scale = Math.min((W * 0.86) / w, (H * 0.6) / h);
  const ox = (W - w * scale) / 2, oy = (H - h * scale) / 2;
  return (lng: number, lat: number): [number, number] =>
    [ox + (lng - b.minLng) * Math.cos(midLat) * scale, oy + (b.maxLat - lat) * scale];
}

interface Props { follow?: boolean; interactive?: boolean; bounds?: { ne: [number, number]; sw: [number, number] } | null; pitch?: number; showUser?: boolean; compact?: boolean }

export const RoadMap = forwardRef<unknown, PropsWithChildren<Props>>(function RoadMap({ children, bounds }, _ref) {
  const { colors } = useTheme();
  const [routes, setRoutes] = useState<Record<string, Bounds | null>>({});
  const view = useMemo<Bounds>(() => {
    const rs = Object.values(routes).filter((r): r is Bounds => !!r);
    if (rs.length) {
      const b = rs.reduce((a, r) => ({ minLng: Math.min(a.minLng, r.minLng), minLat: Math.min(a.minLat, r.minLat), maxLng: Math.max(a.maxLng, r.maxLng), maxLat: Math.max(a.maxLat, r.maxLat) }));
      const pad = Math.max(b.maxLat - b.minLat, (b.maxLng - b.minLng) * 0.6, 0.01) * 0.15;
      return { minLng: b.minLng - pad, minLat: b.minLat - pad, maxLng: b.maxLng + pad, maxLat: b.maxLat + pad };
    }
    if (bounds) return { minLng: bounds.sw[0], minLat: bounds.sw[1], maxLng: bounds.ne[0], maxLat: bounds.ne[1] };
    return LT;
  }, [routes, bounds]);
  const [size, setSize] = useState({ w: 400, h: 800 });
  const project = useMemo(() => makeProjection(view, size.w, size.h), [view, size]);
  const ctx = useMemo<Ctx>(() => ({
    project, w: size.w, h: size.h,
    report: (id, b) => setRoutes((prev) => (prev[id] === b ? prev : { ...prev, [id]: b })),
  }), [project, size]);
  const zoomedOut = view.maxLng - view.minLng > 1.5;

  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e) => {
      const { width, height } = e.nativeEvent.layout;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    }}>
      <LinearGradient colors={[colors.surface, colors.bg]} style={StyleSheet.absoluteFill} />
      <svg viewBox={`0 0 ${size.w} ${size.h}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden>
        {Array.from({ length: Math.ceil(Math.max(size.w, size.h) / 40) + 1 }, (_, i) => (
          <g key={i} stroke={colors.glassBorder} strokeWidth={1}>
            <line x1={i * 40} y1={0} x2={i * 40} y2={size.h} />
            <line x1={0} y1={i * 40} x2={size.w} y2={i * 40} />
          </g>
        ))}
        {CITIES.map(([name, lng, lat]) => {
          const [x, y] = project(lng, lat);
          if (x < 0 || y < 0 || x > size.w || y > size.h) return null;
          return (
            <g key={name}>
              <circle cx={x} cy={y} r={zoomedOut ? 3 : 4} fill={colors.textFaint} />
              <text x={x + 7} y={y + 4} fill={colors.textMuted} fontSize={zoomedOut ? 12 : 14} fontFamily="system-ui, sans-serif">{name}</text>
            </g>
          );
        })}
      </svg>
      <MapCtx.Provider value={ctx}>{children}</MapCtx.Provider>
    </View>
  );
});

export function RouteLine({ id, coordinates }: { id: string; coordinates: [number, number][] }) {
  const ctx = useContext(MapCtx);
  const { colors } = useTheme();
  const b = useMemo<Bounds | null>(() => {
    if (coordinates.length < 2) return null;
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const [lng, lat] of coordinates) {
      minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng); minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    }
    return { minLng, minLat, maxLng, maxLat };
  }, [coordinates]);
  const report = ctx?.report;
  useEffect(() => { report?.(id, b); }, [report, id, b]);
  useEffect(() => () => report?.(id, null), [report, id]);
  if (!ctx || coordinates.length < 2) return null;

  const pts = coordinates.map(([lng, lat]) => ctx.project(lng, lat));
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const [sx, sy] = pts[0]!;
  const [ex, ey] = pts[pts.length - 1]!;
  return (
    <svg viewBox={`0 0 ${ctx.w} ${ctx.h}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} aria-hidden>
      <path d={d} fill="none" stroke={colors.route} strokeOpacity={0.25} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={colors.route} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={sx} cy={sy} r={6} fill={colors.bg} stroke={colors.route} strokeWidth={3} />
      <circle cx={ex} cy={ey} r={7} fill={colors.route} />
    </svg>
  );
}
