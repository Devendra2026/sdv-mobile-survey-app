import { authStyles } from '@/components/auth/styles';
import { getEnvIssues, isClerkDevelopmentKey } from '@/config/env';
import { useHideAppSplash } from '@/hooks/use-hide-app-splash';
import type { ReactNode } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function ConfigGate({ children }: { children: ReactNode }) {
  const issues = getEnvIssues();
  const clerkDevKeyInRelease = !__DEV__ && isClerkDevelopmentKey();

  // Native splash sits above React — hide it whenever we show config errors or the app tree.
  useHideAppSplash(true);

  if (issues.length === 0 && !clerkDevKeyInRelease) return children;

  if (issues.length === 0 && clerkDevKeyInRelease) {
    return (
      <SafeAreaView style={authStyles.safe}>
        <ScrollView contentContainerStyle={authStyles.scroll}>
          <Text style={authStyles.title}>Clerk development keys in release build</Text>
          <Text style={authStyles.subtitle}>
            This APK was built with a Clerk development key (pk_test_…). Field sign-in can fail once the 100
            emails/month limit is reached (MFA codes, password reset, etc.).
          </Text>
          <Text style={[authStyles.subtitle, { marginTop: 16 }]}>
            Fix: in the Clerk Dashboard enable Production, copy the pk_live_… publishable key, set it on EAS (preview or
            production environment), update CLERK_JWT_ISSUER_DOMAIN on Convex, then rebuild the APK.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={authStyles.safe}>
      <ScrollView contentContainerStyle={authStyles.scroll}>
        <Text style={authStyles.title}>App not configured</Text>
        <Text style={authStyles.subtitle}>
          This install is missing API keys that must be set on EAS before building the APK. Add them under Project →
          Environment variables → preview (or production), then create a new build and install again from the QR code.
        </Text>
        {issues.map((key) => (
          <Text key={key} style={[authStyles.label, { fontFamily: 'monospace' }]}>
            {key}
          </Text>
        ))}
        <Text style={[authStyles.subtitle, { marginTop: 16 }]}>
          Local dev: copy `.env.example` to `.env.local`. EAS: run `npm run verify:eas-preview` so the Clerk key matches
          the web app, then `npm run eas:build:android:preview`.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
