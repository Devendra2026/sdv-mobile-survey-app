import { LayoutGuard } from '@/components/layout-guard';
import { Stack } from 'expo-router';

/**
 * App shell: tabs for primary navigation; stack screens for wizard,
 * survey flows, and QC so they are not nested inside the tab navigator.
 */
export default function AppLayout() {
  return (
    <LayoutGuard mode="app">
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="wizard" />
        <Stack.Screen name="survey" />
        <Stack.Screen name="qc/[id]" />
      </Stack>
    </LayoutGuard>
  );
}
