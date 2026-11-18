import Mapbox from '@rnmapbox/maps';
import { env, hasMapbox } from '@/config/env';

if (hasMapbox) {
  void Mapbox.setAccessToken(env.mapboxToken!);
  Mapbox.setTelemetryEnabled(false); // privacy by default
}

/** Mapbox Standard gives 3D buildings/landmarks with day/night light presets; custom Studio styles override it. */
export const MAP_STYLE = {
  dark: env.mapboxStyleDark ?? 'mapbox://styles/mapbox/standard',
  light: env.mapboxStyleLight ?? 'mapbox://styles/mapbox/standard',
  usesStandard: (scheme: 'dark' | 'light') => !(scheme === 'dark' ? env.mapboxStyleDark : env.mapboxStyleLight),
};


export { Mapbox };
