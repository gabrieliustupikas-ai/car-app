import { forwardRef, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { hasMapbox } from '@/config/env';
import { LITHUANIA_CENTER, MAP_STYLE, Mapbox } from '@/lib/mapbox';
import { useTheme } from '@/theme/useTheme';
import { space } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';

type CameraRef = React.ComponentRef<typeof Mapbox.Camera>;

interface Props {
  follow?: boolean;
  interactive?: boolean;
  bounds?: { ne: [number, number]; sw: [number, number] } | null;
  pitch?: number;
  showUser?: boolean;
  compact?: boolean;
}

/**
 * Themed Mapbox map with 3D buildings and terrain. Falls back to a styled placeholder when no
 * Mapbox token is configured so the rest of the app (tracking, demo) still works.
 */
export const RoadMap = forwardRef<CameraRef, PropsWithChildren<Props>>(function RoadMap(
  { children, follow = false, interactive = true, bounds, pitch = 45, showUser = true, compact = false }, cameraRef,
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
          config={{ lightPreset: scheme === 'dark' ? 'night' : 'day', show3dObjects: true, showPointOfInterestLabels: false, showTransitLabels: false }}
        />
      )}
      <Mapbox.RasterDemSource id="rc-dem" url="mapbox://mapbox.mapbox-terrain-dem-v1" tileSize={514} maxZoomLevel={14}>
        <Mapbox.Terrain style={{ exaggeration: 1.4 }} />
      </Mapbox.RasterDemSource>
      <Mapbox.Camera
        ref={cameraRef}
        followUserLocation={follow}
        followZoomLevel={15}
        followPitch={pitch}
        defaultSettings={{ centerCoordinate: LITHUANIA_CENTER, zoomLevel: 6.3, pitch: 0 }}
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

const styles = StyleSheet.create({
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.xxl },
});
