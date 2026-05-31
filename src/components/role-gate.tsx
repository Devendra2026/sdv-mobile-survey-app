import { useCurrentUser } from '@/hooks/use-current-user';
import { can, canAny, type Capability } from '@/lib/permissions';
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
  const { role } = useCurrentUser();
  const allowed = capability ? can(role, capability) : anyOf ? canAny(role, anyOf) : false;
  return <>{allowed ? children : fallback}</>;
}
