import 'react-native-gesture-handler';

/**
 * Root layout.
 *
 * Order of providers (outside → in):
 *   ClerkProvider                     → owns sign-in/sign-up state + tokens
 *   ConvexProviderWithAuth           → Clerk session / `convex` JWT bridge (see useAuthForConvex)
 *   ThemeProvider                     → app design tokens
 *
 * AuthGate handles three states:
 *   - not signed in           → redirect to /(auth)/sign-in
 *   - signed in but not approved → /(auth)/awaiting-approval
 *   - signed in + approved + admin role → /(admin)
 *   - signed in + approved + surveyor/supervisor → /dashboard
 */
import { AppErrorBoundary } from '@/components/app-error-boundary';
import { AppLoadingView } from '@/components/app-loading-view';
import { ConfigGate } from '@/components/config-gate';
import { ConvexAuthError } from '@/components/convex-auth-error';
import { RootErrorBoundary } from '@/components/root-error-boundary';
import { env, envReady } from '@/config/env';
import { bootScreenStyle } from '@/constants/brand';
import { useAuthForConvex } from '@/hooks/use-auth-for-convex';
import { useAppStateSessionRefresh, useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import { useSafeRouter } from '@/hooks/use-safe-router';
import { useSessionBootstrap } from '@/hooks/use-session-bootstrap';
import { useSyncConvexUser } from '@/hooks/use-sync-convex-user';
import { ThemeProvider } from '@/theme';
import { tokenCache } from '@/utils/tokenCache';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../../global.css';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/* ────────────────────────── Auth gate ────────────────────────── */

function signedInLoadingMessage(
  convexAuthPhase: ReturnType<typeof useClerkConvexAuth>['convexAuthPhase'],
  convexReady: boolean,
  me: unknown,
  needsSync: boolean,
  syncing: boolean,
): string {
  if (convexAuthPhase === 'recovering') {
    return 'Connecting to server…';
  }
  if (convexAuthPhase === 'connecting' || !convexReady) return 'Securing your session…';
  if (me === undefined) return 'Loading your profile…';
  if (needsSync && syncing) return 'Setting up your account…';
  return 'Please wait…';
}

function AuthGate() {
  const { isSignedIn, isLoaded } = useAuth();
  const { convexReady, convexAuthFailed, convexAuthPhase } = useClerkConvexAuth();
  useAppStateSessionRefresh();
  const { me, needsSync, syncing } = useSyncConvexUser();
  const { showBlockingOverlay } = useSessionBootstrap(me, needsSync, syncing);
  const { replace, segments, navigationReady } = useSafeRouter();

  useEffect(() => {
    if (!isLoaded || !navigationReady) return;
    SplashScreen.hideAsync().catch(() => undefined);
  }, [isLoaded, navigationReady]);

  useEffect(() => {
    if (!isLoaded || !navigationReady) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inAdminGroup = segments[0] === '(admin)';
    const inAppGroup = segments[0] === '(app)';

    if (!isSignedIn) {
      if (!inAuthGroup) replace('/(auth)/sign-in');
      return;
    }

    if (!convexReady) return;

    if (me === undefined) return;

    if (me === null) {
      if (segments[0] !== '(auth)' || segments[1] !== 'setup') {
        replace('/(auth)/setup');
      }
      return;
    }

    if (me.status !== 'active' || me.role === 'pending') {
      if (segments[0] !== '(auth)' || segments[1] !== 'awaiting-approval') {
        replace('/(auth)/awaiting-approval');
      }
      return;
    }

    if (me.role === 'admin') {
      if (!inAdminGroup && !inAppGroup) replace('/(admin)/approvals');
      return;
    }
    if (me.role === 'surveyor' || me.role === 'supervisor') {
      if (!inAppGroup) replace('/dashboard');
    }
  }, [isLoaded, navigationReady, isSignedIn, convexReady, me, needsSync, syncing, segments, replace]);

  const loadingMessage = useMemo(
    () => signedInLoadingMessage(convexAuthPhase, convexReady, me, needsSync, syncing),
    [convexAuthPhase, convexReady, me, needsSync, syncing],
  );

  if (!isLoaded) {
    return <View style={bootScreenStyle} />;
  }

  if (isSignedIn && convexAuthFailed) {
    return <ConvexAuthError />;
  }

  return (
    <View className="flex-1">
      <Slot />
      {showBlockingOverlay ? (
        <View className="absolute inset-0 z-10" pointerEvents="auto">
          <AppLoadingView message={loadingMessage} />
        </View>
      ) : null}
    </View>
  );
}

/* ────────────────────────── Root ────────────────────────── */

function AppProviders() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const convex = useMemo(() => {
    if (!envReady) return null;
    return new ConvexReactClient(env.convexUrl, {
      unsavedChangesWarning: false,
    });
  }, []);

  if (!mounted || !convex) {
    return <View style={bootScreenStyle} />;
  }

  return (
    <ClerkProvider publishableKey={env.clerkPublishableKey} tokenCache={tokenCache}>
      <ConvexProviderWithAuth client={convex} useAuth={useAuthForConvex}>
        <ThemeProvider>
          <StatusBar style="auto" />
          <AuthGate />
        </ThemeProvider>
      </ConvexProviderWithAuth>
    </ClerkProvider>
  );
}

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return <AppErrorBoundary error={error} retry={retry} />;
}

export default function RootLayout() {
  return (
    <RootErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ConfigGate>
            <AppProviders />
          </ConfigGate>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </RootErrorBoundary>
  );
}
