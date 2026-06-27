import { AppButton } from '@/components';
import { authStyles } from '@/components/auth/styles';
import { clerkFrontendApiHost, env } from '@/config/env';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { clerkJwtIssuerFromPublishableKey } from '@/utils/clerk-issuer';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ClerkStartupErrorProps = {
  onRetry: () => void;
  retrying?: boolean;
};

export function ClerkStartupError({ onRetry, retrying = false }: ClerkStartupErrorProps) {
  const { isOffline } = useNetworkStatus();
  const clerkHost = clerkFrontendApiHost();
  const convexHost = env.convexUrl.replace(/^https:\/\//, '').replace(/\/$/, '');
  const issuer = clerkJwtIssuerFromPublishableKey(env.clerkPublishableKey);
  const isProduction = env.clerkPublishableKey.startsWith('pk_live_');
  const keyLabel = isProduction ? 'pk_live_…' : 'pk_test_…';

  return (
    <SafeAreaView style={authStyles.safe}>
      <ScrollView contentContainerStyle={authStyles.scroll}>
        <Text style={authStyles.title}>Sign-in could not start</Text>
        <Text style={authStyles.subtitle}>
          {isOffline
            ? 'No internet connection. Connect to mobile data or Wi‑Fi, then try again.'
            : 'Clerk did not respond on this device. Check your connection, then try again or force-close and reopen the app.'}
        </Text>
        {clerkHost ? (
          <Text style={[authStyles.label, { fontFamily: 'monospace', marginTop: 12 }]}>Clerk: {clerkHost}</Text>
        ) : null}
        {convexHost ? <Text style={[authStyles.label, { fontFamily: 'monospace' }]}>Convex: {convexHost}</Text> : null}
        {issuer ? <Text style={[authStyles.label, { fontFamily: 'monospace' }]}>Issuer: {issuer}</Text> : null}
        <Text style={[authStyles.label, { fontFamily: 'monospace' }]}>Key: {keyLabel}</Text>

        <View style={{ marginTop: 20 }}>
          <AppButton label={retrying ? 'Retrying…' : 'Try again'} onPress={onRetry} loading={retrying} fullWidth />
        </View>

        {isProduction ? (
          <>
            <Text style={[authStyles.subtitle, { marginTop: 16 }]}>
              Production Clerk ({clerkHost ?? 'custom domain'}) must be reachable over HTTPS. If this persists, an admin
              should verify:
            </Text>
            <Text style={[authStyles.subtitle, { marginTop: 8 }]}>
              • Clerk Dashboard → Domains → {clerkHost} shows Active with valid SSL{'\n'}• Clerk Dashboard → Configure →
              Native applications → enable Native API for Android (`com.surveyapp.app`){'\n'}• DNS CNAME for {clerkHost}{' '}
              matches Clerk instructions (HTTPS must work from the field network){'\n'}• Convex CLERK_JWT_ISSUER_DOMAIN=
              {issuer ?? 'https://clerk.sdvedutech.in'} and Clerk → Integrations → Convex → Activate{'\n'}• Admin: npm
              run verify:clerk-reachability
            </Text>
          </>
        ) : (
          <>
            <Text style={[authStyles.subtitle, { marginTop: 16 }]}>
              Use the same Clerk app as the web admin: matching {keyLabel} on EAS preview, Convex
              CLERK_JWT_ISSUER_DOMAIN={issuer ?? 'https://organic-halibut-21.clerk.accounts.dev'}, and Clerk Dashboard →
              Integrations → Convex → Activate.
            </Text>
            <Text style={[authStyles.subtitle, { marginTop: 12 }]}>
              Web app: set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to the same {keyLabel} as this mobile app. Then rebuild:
              npm run eas:build:android:preview
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
