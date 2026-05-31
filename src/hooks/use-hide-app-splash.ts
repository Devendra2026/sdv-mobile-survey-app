import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

/**
 * Hide the native splash once React has something to show underneath.
 * Call from ConfigGate, boot screens, and AuthGate — do not require navigationReady.
 */
export function useHideAppSplash(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
}
