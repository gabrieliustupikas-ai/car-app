import type { ExpoConfig, ConfigContext } from 'expo/config';
import { BRAND } from './src/config/brand.ts';

// Permission copy is shown by the OS. Keep it honest and specific (App Store 5.1.1 / Play background location policy).
const LOCATION_ALWAYS =
  `${BRAND.name} records your drives automatically in the background, even when the app is closed, so you earn XP and explore the map without touching your phone while driving. Your location is never shared unless you turn sharing on.`;
const LOCATION_WHEN_IN_USE = `${BRAND.name} shows your position on the map and records drives you start.`;
const MOTION = `${BRAND.name} uses motion activity to tell driving apart from walking and to save battery.`;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: BRAND.name,
  slug: BRAND.slug,
  scheme: BRAND.scheme,
  version: '0.1.0',
  platforms: ['ios', 'android', 'web'],
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#07090C',
  ios: {
    bundleIdentifier: BRAND.iosBundleId,
    supportsTablet: false,
    infoPlist: {
      UIBackgroundModes: ['location', 'fetch', 'remote-notification'],
      NSMicrophoneUsageDescription: `${BRAND.name} uses the microphone only while you hold the push-to-talk button.`,
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: BRAND.androidPackage,
    adaptiveIcon: {
      backgroundColor: '#07090C',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'ACTIVITY_RECOGNITION',
      'POST_NOTIFICATIONS',
    ],
    blockedPermissions: ['android.permission.RECORD_AUDIO'], // re-enabled in Phase 4 (radio)
  },
  // Web = browser preview of demo mode (Vercel). The real product is the iOS/Android app.
  web: { output: 'single', bundler: 'metro', favicon: './assets/favicon.png', name: `${BRAND.name} — demo preview`, themeColor: '#07090C', backgroundColor: '#07090C' },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 200, resizeMode: 'contain', backgroundColor: '#07090C' }],
    'expo-sqlite',
    'expo-secure-store',
    'expo-localization',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission: LOCATION_ALWAYS,
        locationAlwaysPermission: LOCATION_ALWAYS,
        locationWhenInUsePermission: LOCATION_WHEN_IN_USE,
        motionUsagePermission: MOTION,
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        isAndroidMotionActivityEnabled: true,
      },
    ],
    ['expo-notifications', { color: '#00E5FF' }],
    ['@rnmapbox/maps', { RNMapboxMapsImpl: 'mapbox' }],
    ['expo-build-properties', { android: { minSdkVersion: 26 }, ios: { deploymentTarget: '16.4' } }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
});
