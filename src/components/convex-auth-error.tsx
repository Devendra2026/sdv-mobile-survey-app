import { authStyles } from '@/components/auth/styles';
import { lastConvexTokenError } from '@/hooks/use-auth-for-convex';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Shown when Clerk is signed in but Convex cannot validate the JWT.
 * Without this, AuthGate spins forever and user rows are never created.
 */
export function ConvexAuthError() {
  return (
    <SafeAreaView style={authStyles.safe}>
      <ScrollView contentContainerStyle={authStyles.scroll}>
        <Text style={authStyles.title}>Convex + Clerk not linked</Text>
        <Text style={authStyles.subtitle}>
          Your Clerk session is active, but Convex is not accepting auth tokens. Fix the items below, then restart the
          app.
        </Text>

        {lastConvexTokenError ? (
          <Text style={[authStyles.subtitle, { marginTop: 12, fontFamily: 'monospace' }]}>{lastConvexTokenError}</Text>
        ) : null}

        <View style={{ marginTop: 16, gap: 12 }}>
          <Step
            n={1}
            title="Clerk Convex integration"
            body='Clerk Dashboard → Integrations → Convex → Activate. This creates the "convex" JWT template automatically.'
          />
          <Step
            n={2}
            title="Or manual JWT template"
            body='JWT Templates → New → name "convex", Convex preset, audience "convex".'
          />
          <Step
            n={3}
            title="Convex issuer domain"
            body="Run: npx convex env set CLERK_JWT_ISSUER_DOMAIN https://YOUR-INSTANCE.clerk.accounts.dev (must match Clerk Frontend API URL)."
          />
          <Step
            n={4}
            title="Redeploy Convex auth"
            body="Run npm run deploy (production) or npm run dev (local) so auth.config.ts is deployed."
          />
          <Step n={5} title="Restart app" body="Stop Metro, restart the app, then sign out and sign back in." />
        </View>
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
