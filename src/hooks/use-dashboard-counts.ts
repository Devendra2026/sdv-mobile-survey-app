import { api } from '@/convex/_generated/api';
import { useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import { useClientNowMs } from '@/hooks/use-client-now';
import { useQuery } from 'convex/react';
import { useMemo } from 'react';

/** Home dashboard KPI row from `masters.dashboardCounts`. */
export function useDashboardCounts() {
  const { convexReady } = useClerkConvexAuth();
  const nowMs = useClientNowMs();
  const queryArgs = useMemo((): 'skip' | { nowMs: number } => {
    if (!convexReady || !Number.isFinite(nowMs)) return 'skip';
    return { nowMs };
  }, [convexReady, nowMs]);
  return useQuery(api.masters.dashboardCounts, queryArgs);
}
