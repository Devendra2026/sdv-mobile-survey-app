import { api } from '@/convex/_generated/api';
import { useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import type { Role } from '@/lib/permissions';
import { useQuery } from 'convex/react';

/** Reactive domain user for the signed-in Clerk principal. */
export function useCurrentUser() {
  const { convexReady } = useClerkConvexAuth();
  const user = useQuery(api.users.currentUser, convexReady ? {} : 'skip');

  return {
    user: user ?? null,
    role: (user?.role ?? undefined) as Role | undefined,
    capabilities: user?.capabilities,
    roleName: user?.roleName,
    isLoading: user === undefined,
    isActive: user?.status === 'active',
    isPending: user?.status === 'pending_approval',
    isDisabled: user?.status === 'disabled',
  };
}
