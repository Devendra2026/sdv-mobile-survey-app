import { AppButton } from '@/components';
import { authStyles } from '@/components/auth/styles';
import { env } from '@/config/env';
import { classifyConvexTokenError, lastConvexTokenError, retryConvexAuth } from '@/hooks/use-auth-for-convex';
import { useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import { useAuth } from '@clerk/expo';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Shown when Clerk is signed in but Convex cannot validate the JWT.
 * Surveyors on distributed APKs get a retry action; dev details stay in __DEV__.
 */
export function ConvexAuthError() {
  const { signOut } = useAuth();
  const { convexAuthLoading } = useClerkConvexAuth();
  const [retrying, setRetrying] = useState(false);

  const onRetry = async () => {
    setRetrying(true);
    try {
      retryConvexAuth({ resetPhase: true });
      const waitMs = classifyConvexTokenError(lastConvexTokenError) === 'transient' ? 5000 : 2500;
      await new Promise((r) => setTimeout(r, waitMs));
    } finally {
      setRetrying(false);
    }
  };

  return (
    <SafeAreaView style={authStyles.safe}>
      <ScrollView contentContainerStyle={authStyles.scroll}>
        <Text style={authStyles.title}>Could not connect your session</Text>
        <Text style={authStyles.subtitle}>
          We could not verify your account with the survey server. Try again, or sign out and sign back in.
        </Text>

        {lastConvexTokenError ? (
          <Text style={[authStyles.subtitle, { marginTop: 12 }]}>{lastConvexTokenError}</Text>
        ) : null}

        <View style={{ marginTop: 20, gap: 12 }}>
          <AppButton
            label={retrying || convexAuthLoading ? 'Connecting…' : 'Try again'}
            onPress={() => void onRetry()}
            loading={retrying || convexAuthLoading}
            disabled={retrying || convexAuthLoading}
            fullWidth
          />
          <AppButton label="Sign out" variant="outline" onPress={() => void signOut()} fullWidth />
        </View>

        {__DEV__ ? (
          <View style={{ marginTop: 24, gap: 12 }}>
            <Text style={authStyles.label}>Developer checklist</Text>
            <Text style={[authStyles.subtitle, { fontFamily: 'monospace' }]}>
              Convex: {env.convexUrl || '(missing)'}
            </Text>
            <Step
              n={1}
              title="Clerk Convex integration"
              body='Clerk Dashboard → Integrations → Convex → Activate (creates the "convex" JWT template).'
            />
            <Step
              n={2}
              title="Convex issuer on deployment"
              body="npm run deploy — sets CLERK_JWT_ISSUER_DOMAIN on prod from .env.local."
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <View>
      <Text style={[authStyles.label, { marginBottom: 4 }]}>
        {n}. {title}
      </Text>
      <Text style={authStyles.subtitle}>{body}</Text>
    </View>
  );
}
