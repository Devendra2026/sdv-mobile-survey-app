import { authStyles } from '@/components/auth/styles';
import { getEnvIssues } from '@/config/env';
import { useHideAppSplash } from '@/hooks/use-hide-app-splash';
import type { ReactNode } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function ConfigGate({ children }: { children: ReactNode }) {
  const issues = getEnvIssues();

  // Native splash sits above React — hide it whenever we show config errors or the app tree.
  useHideAppSplash(true);

  if (issues.length === 0) return children;

  return (
    <SafeAreaView style={authStyles.safe}>
      <ScrollView contentContainerStyle={authStyles.scroll}>
        <Text style={authStyles.title}>App not configured</Text>
        <Text style={authStyles.subtitle}>
          This install is missing API keys that must be set on EAS before building the APK. Add them under Project →
          Environment variables → preview (or production), then create a new build and install again from the QR code.
        </Text>
        <Text style={[authStyles.label, { fontFamily: 'monospace' }]}>{issues.join('\n')}</Text>
        <Text style={[authStyles.subtitle, { marginTop: 16 }]}>
          Fleet APK: fill `.env.prod` (copy from `.env.prod.example`), run `npm run env:sync:preview`, then `npm run
          verify:env-prod` and `npm run eas:build:android:preview`. Local dev uses `.env.local`.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
