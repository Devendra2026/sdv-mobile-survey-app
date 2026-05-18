import { authStyles } from '@/components/auth/styles';
import { env, envReady } from '@/config/env';
import type { ReactNode } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function ConfigGate({ children }: { children: ReactNode }) {
  if (envReady) return children;

  const missing: string[] = [];
  if (!env.convexUrl) missing.push('EXPO_PUBLIC_CONVEX_URL');
  if (!env.clerkPublishableKey) missing.push('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');

  return (
    <SafeAreaView style={authStyles.safe}>
      <ScrollView contentContainerStyle={authStyles.scroll}>
        <Text style={authStyles.title}>Configuration required</Text>
        <Text style={authStyles.subtitle}>
          Add these keys to `.env.local` for local dev, or set them as EAS / build secrets for production
          (`EXPO_PUBLIC_*` is inlined at build time):
        </Text>
        {missing.map((key) => (
          <Text key={key} style={[authStyles.label, { fontFamily: 'monospace' }]}>
            {key}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
