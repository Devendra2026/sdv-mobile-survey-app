import { api } from '@/convex/_generated/api';
import { normalizeMastersBundle, type MastersBundle } from '@/utils/mastersBundle';
import { useQuery } from 'convex/react';
import { useMemo } from 'react';
import { useClerkConvexAuth } from './use-clerk-convex-auth';

/** Reactive masters bundle — skips until Clerk JWT is accepted by Convex. */
export function useMastersBundle(): MastersBundle | undefined {
  const { convexReady } = useClerkConvexAuth();
  const raw = useQuery(api.masters.bundle, convexReady ? {} : 'skip');
  return useMemo(() => (raw ? normalizeMastersBundle(raw) : undefined), [raw]);
}
