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
import { env } from "@/config/env";
import { api } from "@/convex/_generated/api";
import { ThemeProvider } from "@/theme";
import { tokenCache } from "@/utils/tokenCache";
import { ClerkProvider, useAuth } from "@clerk/expo";
import { ConvexReactClient, useQuery } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { Slot, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const convex = new ConvexReactClient(env.convexUrl, {
  // We need verbose mode in dev to surface auth errors in console
  unsavedChangesWarning: false,
});

/* ────────────────────────── Auth gate ────────────────────────── */

function AuthGate() {
  const { isSignedIn, isLoaded } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Only call the Convex query once Clerk is loaded; otherwise the
  // request fires without an auth token and 401s.
  const me = useQuery(
    api.users.currentUser,
    isLoaded && isSignedIn ? {} : "skip",
  );

  useEffect(() => {
    if (!isLoaded) return;
    SplashScreen.hideAsync().catch(() => undefined);

    const inAuthGroup = segments[0] === "(auth)";
    const inAdminGroup = segments[0] === "(admin)";
    const inAppGroup = segments[0] === "(app)";

    // Not signed in → push to sign-in (unless already there)
    if (!isSignedIn) {
      if (!inAuthGroup) router.replace("/(auth)/sign-in");
      return;
    }

    // Signed in, but Convex hasn't loaded the user row yet — wait.
    if (me === undefined) return;

    // Webhook hasn't created the row yet — show a brief setup splash.
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

    // Active. Route by role.
    if (me.role === "admin") {
      if (!inAdminGroup && !inAppGroup) router.replace("/(admin)/approvals");
      return;
    }
    if (me.role === "surveyor" || me.role === "supervisor") {
      if (!inAppGroup) router.replace("/(app)/dashboard");
      return;
    }
  }, [isLoaded, isSignedIn, me, segments, router]);

  if (!isLoaded || (isSignedIn && me === undefined)) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#003B8E" size="large" />
      </View>
    );
  }
  return <Slot />;
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

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F7FA",
  },
});
