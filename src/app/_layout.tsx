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
 *   - signed in + approved + surveyor/supervisor → /(app)/dashboard
 */
import "react-native-gesture-handler";

import { AppErrorBoundary } from "@/components/app-error-boundary";
import { ConfigGate } from "@/components/config-gate";
import { ConvexAuthError } from "@/components/convex-auth-error";
import { env } from "@/config/env";
import { useClerkConvexAuth } from "@/hooks/use-clerk-convex-auth";
import { useSyncConvexUser } from "@/hooks/use-sync-convex-user";
import { ThemeProvider } from "@/theme";
import { tokenCache } from "@/utils/tokenCache";
import { ClerkProvider, useAuth } from "@clerk/expo";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { Slot, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../../global.css";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const convex = new ConvexReactClient(env.convexUrl, {
  unsavedChangesWarning: false,
});

/* ────────────────────────── Auth gate ────────────────────────── */

function AuthLoadingView({ message }: { message: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-page-light px-6 dark:bg-page-dark">
      <View className="mb-6 h-20 w-20 items-center justify-center rounded-xl bg-brand-soft dark:bg-brand/20">
        <Text className="text-[22px] font-medium text-brand">SDV</Text>
      </View>
      <ActivityIndicator color="#003B8E" size="large" />
      <Text className="mt-4 text-center text-helper text-ink-tertiary-light dark:text-ink-tertiary-dark">
        {message}
      </Text>
    </View>
  );
}

function signedInLoadingMessage(
  convexAuthLoading: boolean,
  convexReady: boolean,
  me: unknown,
  needsSync: boolean,
  syncing: boolean,
): string {
  if (convexAuthLoading || !convexReady) return "Securing your session…";
  if (me === undefined) return "Loading your profile…";
  if (needsSync && syncing) return "Setting up your account…";
  return "Please wait…";
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

    const inAuthGroup = segments[0] === "(auth)";
    const inAdminGroup = segments[0] === "(admin)";
    const inAppGroup = segments[0] === "(app)";

    if (!isSignedIn) {
      if (!inAuthGroup) router.replace("/(auth)/sign-in");
      return;
    }

    if (!convexReady) return;

    if (me === undefined) return;

    if (me === null) {
      if (segments[0] !== "(auth)" || segments[1] !== "setup") {
        router.replace("/(auth)/setup");
      }
      return;
    }

    if (me.status !== "active") {
      if (segments[0] !== "(auth)" || segments[1] !== "awaiting-approval") {
        router.replace("/(auth)/awaiting-approval");
      }
      return;
    }

    if (me.role === "admin") {
      if (!inAdminGroup && !inAppGroup) router.replace("/(admin)/approvals");
      return;
    }
    if (me.role === "surveyor" || me.role === "supervisor") {
      if (!inAppGroup) router.replace("/(app)/dashboard");
    }
  }, [
    isLoaded,
    isSignedIn,
    convexReady,
    me,
    needsSync,
    syncing,
    segments,
    router,
  ]);

  const loadingMessage = useMemo(
    () =>
      signedInLoadingMessage(convexAuthLoading, convexReady, me, needsSync, syncing),
    [convexAuthLoading, convexReady, me, needsSync, syncing],
  );

  if (!isLoaded) {
    return <AuthLoadingView message="Starting Survey field operations…" />;
  }

  if (isSignedIn && convexAuthFailed) {
    return <ConvexAuthError />;
  }

  const showSignedInLoading =
    isSignedIn &&
    (convexAuthLoading || !convexReady || me === undefined || (needsSync && syncing));

  return (
    <View className="flex-1">
      <Slot />
      {showSignedInLoading ? (
        <View className="absolute inset-0 z-10" pointerEvents="auto">
          <AuthLoadingView message={loadingMessage} />
        </View>
      ) : null}
    </View>
  );
}

/* ────────────────────────── Root ────────────────────────── */

export function ErrorBoundary({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return <AppErrorBoundary error={error} retry={retry} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ConfigGate>
          <ClerkProvider publishableKey={env.clerkPublishableKey} tokenCache={tokenCache}>
            <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
              <ThemeProvider>
                <StatusBar style="auto" />
                <AuthGate />
              </ThemeProvider>
            </ConvexProviderWithClerk>
          </ClerkProvider>
        </ConfigGate>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
