import { useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Release APKs occasionally never set navigationState.key; unblock auth routing after a short wait. */
const NAV_READY_FALLBACK_MS = 2_500;

/**
 * Avoid duplicate router.replace calls — rapid redirects can crash Android release builds.
 */
export function useSafeRouter() {
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const [navFallbackReady, setNavFallbackReady] = useState(false);

  useEffect(() => {
    if (navigationState?.key) return;
    const timer = setTimeout(() => setNavFallbackReady(true), NAV_READY_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [navigationState?.key]);

  const navigationReady = Boolean(navigationState?.key) || navFallbackReady;
  const lastTarget = useRef<string | null>(null);

  const replace = useCallback(
    (href: string) => {
      if (!navigationReady) return;
      if (lastTarget.current === href) return;
      lastTarget.current = href;
      try {
        router.replace(href as never);
      } catch (err) {
        if (__DEV__) {
          console.warn('[navigation] replace failed:', href, err);
        }
        lastTarget.current = null;
      }
    },
    [navigationReady, router],
  );

  return { replace, segments, navigationReady };
}
