/**
 * Defense-in-depth layout guard — redirects when domain user lacks access.
 * Server-side Convex remains the authoritative boundary.
 */
import { AppLoadingView } from '@/components/app-loading-view';
import { useCurrentUser } from '@/hooks/use-current-user';
import { Redirect } from 'expo-router';
import { ReactNode } from 'react';

type GuardMode = 'app' | 'admin';

export function LayoutGuard({ mode, children }: { mode: GuardMode; children: ReactNode }) {
  const { user, role, isLoading, isActive } = useCurrentUser();

  if (isLoading) {
    return <AppLoadingView message="Loading…" />;
  }

  if (!user || !isActive) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  if (mode === 'admin' && role !== 'admin') {
    return <Redirect href="/dashboard" />;
  }

  return <>{children}</>;
}
