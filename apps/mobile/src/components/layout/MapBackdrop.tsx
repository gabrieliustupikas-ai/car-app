import { KLAIPEDA_CENTER } from '@roadclub/core';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { boundsAround } from '@/components/map/geo';
import { DriversLayer, RangeRing, RoadMap, UserPuck } from '@/components/map/RoadMap';
import { isWebPreview } from '@/config/env';
import { useDemoDrivers } from '@/features/demo/useDemoDrivers';
import { useRadio } from '@/features/radio/radioStore';
import { useSettings } from '@/stores/settings';
import { useTracking } from '@/stores/tracking';
import { useTheme } from '@/theme/useTheme';

/**
 * One shared, non-interactive map behind every tab except Home (which has its own interactive map).
 * It keeps you "on the map" everywhere; on Radio it frames your transmit range.
 */
export function MapBackdrop() {
  const pathname = usePathname();
  const { colors } = useTheme();
  const demo = useSettings((s) => s.demoMode) || isWebPreview;
  const radiusKm = useRadio((s) => s.radiusKm);
  const channel = useRadio((s) => s.channel);
  const lat = useTracking((s) => s.lastFix?.lat);
  const lng = useTracking((s) => s.lastFix?.lng);
  const drivers = useDemoDrivers(demo && pathname !== '/', 1000);

  const center = useMemo<[number, number]>(() => (lat != null && lng != null ? [lng, lat] : KLAIPEDA_CENTER), [lat, lng]);
  const onRadio = pathname === '/radio' && channel === 'nearby';
  const bounds = useMemo(() => boundsAround(center, onRadio ? radiusKm * 1000 * 1.08 : 2200), [center, onRadio, radiusKm]);
  // On Radio, frame the range ring in the gap between the header and the radio unit.
  const { height } = useWindowDimensions();
  const padding = onRadio ? { top: 150, bottom: Math.max(260, height - 400), left: 24, right: 24 } : { top: 80, bottom: 80, left: 40, right: 40 };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <RoadMap interactive={false} bounds={bounds} boundsPadding={padding} animateBounds showUser={false} pitch={0} controlsBottomInset={96} compact>
        {onRadio && <RangeRing center={center} radiusM={radiusKm * 1000} />}
        {demo && <DriversLayer drivers={drivers} />}
        <UserPuck coord={center} />
      </RoadMap>
      {/* readability scrim: dark at the top (titles) and bottom (tab bar), map shows through the middle */}
      <LinearGradient
        colors={[colors.bg, 'rgba(11,13,16,0.55)', 'rgba(11,13,16,0.35)', 'rgba(11,13,16,0.7)', colors.bg]}
        locations={[0, 0.22, 0.5, 0.82, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
