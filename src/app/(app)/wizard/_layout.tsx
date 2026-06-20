/**
 * 8-step wizard stack. Screens are registered explicitly so Expo Router
 * always resolves step URLs (avoids "Unmatched Route" on nested paths).
 */
import { Stack } from 'expo-router';

export default function WizardLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="flow" />
      <Stack.Screen name="start" />
      <Stack.Screen name="property" />
      <Stack.Screen name="owner" />
      <Stack.Screen name="address" />
      <Stack.Screen name="taxation" />
      <Stack.Screen name="floors" />
      <Stack.Screen name="services" />
      <Stack.Screen name="gps" />
      <Stack.Screen name="photos" />
      <Stack.Screen name="review" />
    </Stack>
  );
}
