import { forwardRef, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { hasMapbox } from '@/config/env';
import { KLAIPEDA_CENTER } from '@roadclub/core';
import { MAP_STYLE, Mapbox } from '@/lib/mapbox';
import type { MapDriver, MapPlace, MapReport, RoadMapProps } from './types';
import { useTheme } from '@/theme/useTheme';
import { space } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';

export type { MapDriver, MapPlace, MapReport } from './types';

type CameraRef = React.ComponentRef<typeof Mapbox.Camera>;

type Props = RoadMapProps;

/**
 * Themed Mapbox map with 3D buildings and terrain. Falls back to a styled placeholder when no
 * Mapbox token is configured so the rest of the app (tracking, demo) still works.
 */
export const RoadMap = forwardRef<CameraRef, PropsWithChildren<Props>>(function RoadMap(
  { children, follow = false, followCoord, interactive = true, bounds, pitch = 45, showUser = true, compact = false }, cameraRef,
) {
  const { scheme, colors } = useTheme();
  const { t } = useTranslation();

  if (!hasMapbox) {
    return (
      <View style={StyleSheet.absoluteFill} accessibilityLabel={t('map.noMapbox')}>
        <LinearGradient colors={[colors.surface, colors.bg]} style={StyleSheet.absoluteFill} />
        {!compact && (
          <View style={styles.fallback}>
            <Ionicons name="map-outline" size={48} color={colors.textFaint} />
            <AppText variant="h3" color="textMuted">{t('map.noMapbox')}</AppText>
            <AppText variant="small" color="textFaint" style={{ textAlign: 'center' }}>{t('map.noMapboxBody')}</AppText>
          </View>
        )}
      </View>
    );
  }

  const styleURL = scheme === 'dark' ? MAP_STYLE.dark : MAP_STYLE.light;
  return (
    <Mapbox.MapView
      style={StyleSheet.absoluteFill}
      styleURL={styleURL}
      scaleBarEnabled={false}
      compassEnabled={interactive}
      logoPosition={{ bottom: 8, left: 8 }}
      attributionPosition={{ bottom: 8, right: 8 }}
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      rotateEnabled={interactive}
      pitchEnabled={interactive}
      preferredFramesPerSecond={60}
    >
      {MAP_STYLE.usesStandard(scheme) && (
        <Mapbox.StyleImport
          id="basemap"
          existing
          config={{ lightPreset: scheme === 'dark' ? 'night' : 'day', theme: 'monochrome', show3dObjects: true, showPointOfInterestLabels: false, showTransitLabels: false }}
        />
      )}
      <Mapbox.RasterDemSource id="rc-dem" url="mapbox://mapbox.mapbox-terrain-dem-v1" tileSize={514} maxZoomLevel={14}>
        <Mapbox.Terrain style={{ exaggeration: 1.4 }} />
      </Mapbox.RasterDemSource>
      <Mapbox.Camera
        ref={cameraRef}
        followUserLocation={follow && !followCoord}
        followZoomLevel={15}
        followPitch={pitch}
        defaultSettings={{ centerCoordinate: KLAIPEDA_CENTER, zoomLevel: 12.4, pitch: 45, heading: -14 }}
        {...(followCoord ? { centerCoordinate: followCoord, zoomLevel: 14.6, pitch: 55, animationDuration: 900 } : {})}
        {...(bounds ? { bounds: { ...bounds, paddingTop: 80, paddingBottom: 80, paddingLeft: 40, paddingRight: 40 }, animationDuration: 0 } : {})}
      />
      {showUser && <Mapbox.LocationPuck puckBearing="course" puckBearingEnabled pulsing={{ isEnabled: true, color: colors.accent }} />}
      {children}
    </Mapbox.MapView>
  );
});

/** Glowing route line (neon accent). Coordinates are [lng, lat]. */
export function RouteLine({ id, coordinates }: { id: string; coordinates: [number, number][] }) {
  const { colors } = useTheme();
  if (!hasMapbox || coordinates.length < 2) return null;
  const shape = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates } };
  return (
    <Mapbox.ShapeSource id={`${id}-src`} shape={shape} lineMetrics>
      <Mapbox.LineLayer id={`${id}-glow`} style={{ lineColor: colors.route, lineWidth: 14, lineOpacity: 0.22, lineBlur: 8, lineCap: 'round', lineJoin: 'round' }} />
      <Mapbox.LineLayer id={`${id}-line`} style={{ lineColor: colors.route, lineWidth: 4.5, lineCap: 'round', lineJoin: 'round', lineEmissiveStrength: 1 }} />
    </Mapbox.ShapeSource>
  );
}

const CAR_FILL: Record<MapDriver['carColor'], string> = { red: '#E10600', silver: '#C9CED6', black: '#16181B' };

export function DriversLayer({ drivers, onPress }: { drivers: MapDriver[]; onPress?: (id: string) => void }) {
  const { colors, scheme } = useTheme();
  if (!hasMapbox) return null;
  const shape = {
    type: 'FeatureCollection' as const,
    features: drivers.map((d) => ({ type: 'Feature' as const, properties: { id: d.id, name: d.name, fill: CAR_FILL[d.carColor] },
      geometry: { type: 'Point' as const, coordinates: [d.lng, d.lat] } })),
  };
  return (
    <Mapbox.ShapeSource id="rc-drivers" shape={shape} onPress={(e) => { const id = e.features[0]?.properties?.id; if (id) onPress?.(String(id)); }}>
      <Mapbox.CircleLayer id="rc-drivers-halo" style={{ circleRadius: 15, circleColor: colors.accent, circleOpacity: 0.15, circleEmissiveStrength: 1 }} />
      <Mapbox.CircleLayer id="rc-drivers-car" style={{ circleRadius: 7, circleColor: ['get', 'fill'], circleStrokeWidth: 2.5, circleStrokeColor: '#FFFFFF', circleEmissiveStrength: 1 }} />
      <Mapbox.SymbolLayer id="rc-drivers-name" minZoomLevel={12.5} style={{ textField: ['get', 'name'], textSize: 11, textOffset: [0, 1.6], textAnchor: 'top',
        textColor: scheme === 'dark' ? '#E6E9EE' : '#0B0C0E', textHaloColor: scheme === 'dark' ? '#050506' : '#FFFFFF', textHaloWidth: 1.4, textAllowOverlap: true }} />
    </Mapbox.ShapeSource>
  );
}

export function PlacesLayer({ places, onPress }: { places: MapPlace[]; onPress?: (id: string) => void }) {
  const { scheme } = useTheme();
  if (!hasMapbox) return null;
  const shape = {
    type: 'FeatureCollection' as const,
    features: places.map((p) => ({ type: 'Feature' as const, properties: { id: p.id, title: p.title, category: p.category },
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] } })),
  };
  return (
    <Mapbox.ShapeSource id="rc-places" shape={shape} onPress={(e) => { const id = e.features[0]?.properties?.id; if (id) onPress?.(String(id)); }}>
      <Mapbox.CircleLayer id="rc-places-dot" minZoomLevel={11} style={{ circleRadius: 5, circleStrokeWidth: 1.5, circleEmissiveStrength: 1,
        circleStrokeColor: scheme === 'dark' ? '#050506' : '#FFFFFF',
        circleColor: ['match', ['get', 'category'], 'meet_spot', '#E10600', 'fuel', '#F2B33D', 'ev_charger', '#34C77B', 'viewpoint', '#FFFFFF', '#C9CED6'] }} />
    </Mapbox.ShapeSource>
  );
}

const REPORT_COLOR = ['match', ['get', 'kind'], 'police', '#2F6BFF', 'hidden_police', '#7A3CFF', 'checkpoint', '#F2B33D', '#2F6BFF'];

/** Police / hidden police / checkpoint reports from other drivers (short-lived). */
export function ReportsLayer({ reports, onPress }: { reports: MapReport[]; onPress?: (id: string) => void }) {
  if (!hasMapbox) return null;
  const shape = {
    type: 'FeatureCollection' as const,
    features: reports.map((r) => ({ type: 'Feature' as const, properties: { id: r.id, kind: r.kind }, geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] } })),
  };
  return (
    <Mapbox.ShapeSource id="rc-reports" shape={shape} onPress={(e) => { const id = e.features[0]?.properties?.id; if (id) onPress?.(String(id)); }}>
      <Mapbox.CircleLayer id="rc-reports-halo" style={{ circleRadius: 20, circleColor: REPORT_COLOR as never, circleOpacity: 0.2, circleEmissiveStrength: 1 }} />
      <Mapbox.CircleLayer id="rc-reports-dot" style={{ circleRadius: 9, circleColor: REPORT_COLOR as never, circleStrokeWidth: 3, circleStrokeColor: '#FFFFFF', circleEmissiveStrength: 1 }} />
    </Mapbox.ShapeSource>
  );
}

/** Native shows the OS location puck; a separate marker is only needed for simulated positions. */
export function UserPuck({ coord }: { coord: [number, number] | null }) {
  const { colors } = useTheme();
  if (!hasMapbox || !coord) return null;
  return (
    <Mapbox.ShapeSource id="rc-me" shape={{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: coord } }}>
      <Mapbox.CircleLayer id="rc-me-dot" style={{ circleRadius: 8, circleColor: colors.accent, circleStrokeWidth: 3, circleStrokeColor: '#FFFFFF', circleEmissiveStrength: 1 }} />
    </Mapbox.ShapeSource>
  );
}

const styles = StyleSheet.create({
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.xxl },
});
