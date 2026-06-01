import { authStyles } from '@/components/auth/styles';
import { clerkFrontendApiHost, env } from '@/config/env';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function ClerkStartupError() {
  const clerkHost = clerkFrontendApiHost();
  const convexHost = env.convexUrl.replace(/^https:\/\//, '').replace(/\/$/, '');

  return (
    <SafeAreaView style={authStyles.safe}>
      <ScrollView contentContainerStyle={authStyles.scroll}>
        <Text style={authStyles.title}>Sign-in could not start</Text>
        <Text style={authStyles.subtitle}>
          Clerk did not respond on this device. Check mobile data or Wi‑Fi, then force-close and reopen the app.
        </Text>
        {clerkHost ? (
          <Text style={[authStyles.label, { fontFamily: 'monospace', marginTop: 12 }]}>Clerk: {clerkHost}</Text>
        ) : null}
        {convexHost ? <Text style={[authStyles.label, { fontFamily: 'monospace' }]}>Convex: {convexHost}</Text> : null}
        <Text style={[authStyles.subtitle, { marginTop: 16 }]}>
          Use the same Clerk app as the web admin: matching pk_test_… on EAS preview, Convex
          CLERK_JWT_ISSUER_DOMAIN=https://organic-halibut-21.clerk.accounts.dev, and Clerk Dashboard → Integrations →
          Convex → Activate. Then rebuild: npm run eas:build:android:preview
        </Text>
        <Text style={[authStyles.subtitle, { marginTop: 12 }]}>
          Web app: set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to the same pk_test_… as this mobile app (not a different Clerk
          instance).
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
