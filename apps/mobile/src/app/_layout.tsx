import '@/lib/mapbox';
import { QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, SplashScreen, Stack, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LevelUpOverlay } from '@/components/LevelUpOverlay';
import { ErrorState } from '@/components/ui/States';
import { getDb } from '@/db/localDb';
import { initI18n } from '@/i18n';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { telemetry } from '@/lib/telemetry';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { ensureTracking } from '@/tracking/controller';
import { hydrateTrackingUi } from '@/tracking/recorder';
import { onSignedIn } from '@/features/auth/onSignedIn';
import { requestSync } from '@/tracking/sync';
import { useTheme } from '@/theme/useTheme';

void SplashScreen.preventAutoHideAsync();
telemetry.init();

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => { telemetry.captureException(error, { scope: 'root' }); }, [error]);
  return <ErrorState message={__DEV__ ? error.message : undefined} onRetry={retry} />;
}

function useBootstrap() {
  const setSession = useSession((s) => s.setSession);
  const setReady = useSession((s) => s.setReady);

  useEffect(() => {
    getDb();
    void hydrateTrackingUi();
    void ensureTracking();

    if (!supabase) { setReady(); return; }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      telemetry.setUser(data.session?.user.id ?? null);
      setReady();
      if (data.session) requestSync(500);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      telemetry.setUser(session?.user.id ?? null);
      if (event === 'SIGNED_IN' && session) void onSignedIn(session);
    });
    return () => sub.subscription.unsubscribe();
  }, [setReady, setSession]);

  // flush the upload queue and re-check permissions whenever the app returns to the foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { requestSync(500); void ensureTracking(); }
    });
    return () => sub.remove();
  }, []);

  // open the trip summary when a "trip saved" notification is tapped
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const url = r.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/trip/')) router.push(url as never);
    });
    return () => sub.remove();
  }, []);
}

export default function RootLayout() {
  const language = useSettings((s) => s.language);
  initI18n(language);
  useBootstrap();
  const ready = useSession((s) => s.ready);
  const session = useSession((s) => s.session);
  const onboarded = useSettings((s) => s.onboarded);
  const demoMode = useSettings((s) => s.demoMode);
  const { scheme, colors } = useTheme();

  useEffect(() => { if (ready) SplashScreen.hide(); }, [ready]);
  if (!ready) return null;

  const inApp = onboarded && (Boolean(session) || demoMode);
  const navTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={{ ...navTheme, colors: { ...navTheme.colors, background: colors.bg, card: colors.surface, primary: colors.accent, text: colors.text, border: colors.glassBorder } }}>
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
              <Stack.Protected guard={inApp}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="trip/[id]" options={{ headerShown: true, headerTransparent: true, title: '', headerTintColor: colors.text }} />
              </Stack.Protected>
              <Stack.Protected guard={onboarded && !inApp}>
                <Stack.Screen name="sign-in" />
              </Stack.Protected>
              <Stack.Protected guard={!onboarded}>
                <Stack.Screen name="onboarding" />
              </Stack.Protected>
            </Stack>
            <LevelUpOverlay />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
