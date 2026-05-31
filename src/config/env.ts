export const env = {
  convexUrl: process.env.EXPO_PUBLIC_CONVEX_URL ?? '',
  clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
};

const CONVEX_URL_RE = /^https:\/\/[a-z0-9-]+\.convex\.cloud\/?$/i;
const CLERK_KEY_RE = /^pk_(test|live)_/;

/** True when the APK was built with a Clerk **development** instance (100 emails/month cap). */
export function isClerkDevelopmentKey(): boolean {
  return env.clerkPublishableKey.trim().startsWith('pk_test_');
}

/** Human-readable problems when the APK was built without required EAS env vars. */
export function getEnvIssues(): string[] {
  const issues: string[] = [];
  if (!env.convexUrl.trim()) {
    issues.push('EXPO_PUBLIC_CONVEX_URL');
  } else if (!CONVEX_URL_RE.test(env.convexUrl.trim())) {
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
