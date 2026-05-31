import { authStyles } from '@/components/auth/styles';
import { getEnvIssues } from '@/config/env';
import type { ReactNode } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function ConfigGate({ children }: { children: ReactNode }) {
  const issues = getEnvIssues();
  if (issues.length === 0) return children;

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
