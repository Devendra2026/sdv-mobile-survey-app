import { useCurrentUser } from '@/hooks/use-current-user';
import { canAnyWithCapabilities, canWithCapabilities, type Capability } from '@/lib/permissions';
import { ReactNode } from 'react';

/**
 * Hides children unless the current user's role has the capability.
 * UI affordance only — Convex enforces every action server-side.
 */
export function RoleGate({
  capability,
  anyOf,
  children,
  fallback = null,
}: {
  capability?: Capability;
  anyOf?: Capability[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { role, capabilities } = useCurrentUser();
  const allowed = capability
    ? canWithCapabilities(capabilities, role, capability)
    : anyOf
      ? canAnyWithCapabilities(capabilities, role, anyOf)
      : false;
  return <>{allowed ? children : fallback}</>;
}
