/**
 * Root layout.
 *
 * Order of providers (outside → in):
 *   ClerkProvider                     → owns sign-in/sign-up state + tokens
 *   ConvexProviderWithClerk          → injects fresh JWTs into every Convex call
 *   ThemeProvider                     → app design tokens
 *
 * AuthGate handles three states:
 *   - not signed in           → redirect to /(auth)/sign-in
 *   - signed in but not approved → /(auth)/awaiting-approval
 *   - signed in + approved + admin role → /(admin)
 *   - signed in + approved + surveyor/supervisor → /dashboard
 */
import 'react-native-gesture-handler';

import { AppErrorBoundary } from '@/components/app-error-boundary';
import { AppLoadingView } from '@/components/app-loading-view';
import { ConfigGate } from '@/components/config-gate';
import { ConvexAuthError } from '@/components/convex-auth-error';
import { env } from '@/config/env';
import { useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import { useSyncConvexUser } from '@/hooks/use-sync-convex-user';
import { ThemeProvider } from '@/theme';
import { tokenCache } from '@/utils/tokenCache';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { ConvexReactClient } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../../global.css';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/* ────────────────────────── Auth gate ────────────────────────── */

function signedInLoadingMessage(
  convexAuthLoading: boolean,
  convexReady: boolean,
  me: unknown,
  needsSync: boolean,
  syncing: boolean,
): string {
  if (convexAuthLoading || !convexReady) return 'Securing your session…';
  if (me === undefined) return 'Loading your profile…';
  if (needsSync && syncing) return 'Setting up your account…';
  return 'Please wait…';
}

function AuthGate() {
  const { isSignedIn, isLoaded } = useAuth();
  const { convexReady, convexAuthFailed, convexAuthLoading } = useClerkConvexAuth();
  const { me, needsSync, syncing } = useSyncConvexUser();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    SplashScreen.hideAsync().catch(() => undefined);

    const inAuthGroup = segments[0] === '(auth)';
    const inAdminGroup = segments[0] === '(admin)';
    const inAppGroup = segments[0] === '(app)';

    if (!isSignedIn) {
      if (!inAuthGroup) router.replace('/(auth)/sign-in');
      return;
    }

    if (!convexReady) return;

    if (me === undefined) return;

    if (me === null) {
      if (segments[0] !== '(auth)' || segments[1] !== 'setup') {
        router.replace('/(auth)/setup');
      }
      return;
    }

    if (me.status !== 'active') {
      if (segments[0] !== '(auth)' || segments[1] !== 'awaiting-approval') {
        router.replace('/(auth)/awaiting-approval');
      }
      return;
    }

    if (me.role === 'admin') {
      if (!inAdminGroup && !inAppGroup) router.replace('/(admin)/approvals');
      return;
    }
    if (me.role === 'surveyor' || me.role === 'supervisor') {
      if (!inAppGroup) router.replace('/dashboard');
    }
  }, [isLoaded, isSignedIn, convexReady, me, needsSync, syncing, segments, router]);

  const loadingMessage = useMemo(
    () => signedInLoadingMessage(convexAuthLoading, convexReady, me, needsSync, syncing),
    [convexAuthLoading, convexReady, me, needsSync, syncing],
  );

  // Native splash (solid brand color, no image) stays visible until Clerk is ready.
  if (!isLoaded) {
    return <View className="flex-1 bg-brand" />;
  }

  if (isSignedIn && convexAuthFailed) {
    return <ConvexAuthError />;
  }

  const showSignedInLoading =
    isSignedIn && (convexAuthLoading || !convexReady || me === undefined || (needsSync && syncing));

  return (
    <View className="flex-1">
      <Slot />
      {showSignedInLoading ? (
        <View className="absolute inset-0 z-10" pointerEvents="auto">
          <AppLoadingView message={loadingMessage} />
        </View>
      ) : null}
    </View>
  );
}

/* ────────────────────────── Root ────────────────────────── */

function AppProviders() {
  const convex = useMemo(
    () =>
      new ConvexReactClient(env.convexUrl, {
        unsavedChangesWarning: false,
      }),
    [],
  );

  return (
    <ClerkProvider publishableKey={env.clerkPublishableKey} tokenCache={tokenCache}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <ThemeProvider>
          <StatusBar style="auto" />
          <AuthGate />
        </ThemeProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return <AppErrorBoundary error={error} retry={retry} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ConfigGate>
          <AppProviders />
        </ConfigGate>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
