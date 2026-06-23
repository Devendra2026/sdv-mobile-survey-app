import { clerkFrontendApiFromPublishableKey } from '@/utils/clerk-issuer';
import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  convexUrl?: string;
  clerkPublishableKey?: string;
};

/** EAS inlines `EXPO_PUBLIC_*` at build time; `extra` is a fallback from app.config.js. */
export const env = {
  convexUrl: (process.env.EXPO_PUBLIC_CONVEX_URL ?? extra.convexUrl ?? '').trim(),
  clerkPublishableKey: (process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? extra.clerkPublishableKey ?? '').trim(),
};

export function clerkFrontendApiHost(): string | null {
  return clerkFrontendApiFromPublishableKey(env.clerkPublishableKey);
}

const CLERK_KEY_RE = /^pk_(test|live)_/;

function isValidConvexUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Human-readable problems when the APK was built without required EAS env vars. */
export function getEnvIssues(): string[] {
  const issues: string[] = [];
  if (!env.convexUrl.trim()) {
    issues.push('EXPO_PUBLIC_CONVEX_URL');
  } else if (!isValidConvexUrl(env.convexUrl)) {
    issues.push('EXPO_PUBLIC_CONVEX_URL (invalid URL)');
  }
  if (!env.clerkPublishableKey.trim()) {
    issues.push('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
  } else if (!CLERK_KEY_RE.test(env.clerkPublishableKey.trim())) {
    issues.push('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY (invalid key)');
  }
  return issues;
}

export const envReady = getEnvIssues().length === 0;

if (__DEV__) {
  for (const issue of getEnvIssues()) {
    console.warn(`[env] Missing or invalid: ${issue}`);
  }
}
