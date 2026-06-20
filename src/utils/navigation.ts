import type { Href, Router } from 'expo-router';

/** Where to land when there is no navigation history (e.g. after `replace`). */
const DEFAULT_BACK_FALLBACK: Href = '/surveys';

export function backOrReplace(router: Router, fallback: Href = DEFAULT_BACK_FALLBACK) {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback);
  }
}
