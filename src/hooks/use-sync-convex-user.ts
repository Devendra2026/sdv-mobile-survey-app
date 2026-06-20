import { api } from '@/convex/_generated/api';
import { toUserMessage } from '@/utils/errors';
import { useUser } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useClerkConvexAuth } from './use-clerk-convex-auth';

const RETRY_MS = 1500;
const MAX_ATTEMPTS = 15;

function readSignupMetadata(user: NonNullable<ReturnType<typeof useUser>['user']>) {
  const meta = user.unsafeMetadata as Record<string, unknown> | undefined;
  return {
    requestedRole: typeof meta?.requestedRole === 'string' ? meta.requestedRole : 'surveyor',
    requestedReason: typeof meta?.requestedReason === 'string' ? meta.requestedReason : undefined,
  };
}

function profileFromClerk(user: NonNullable<ReturnType<typeof useUser>['user']>) {
  const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? undefined;
  const name =
    user.fullName?.trim() || [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.username || email;

  return {
    email,
    name: name || undefined,
    avatarUrl: user.imageUrl,
    ...readSignupMetadata(user),
  };
}

/**
 * Ensures the signed-in Clerk user has a row in Convex `users`.
 * Safe to call from AuthGate, setup, or awaiting-approval.
 */
export function useSyncConvexUser() {
  const { convexReady } = useClerkConvexAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const me = useQuery(api.users.currentUser, convexReady ? {} : 'skip');
  const provision = useMutation(api.users.provisionCurrentUser);

  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userRef = useRef(user);
  userRef.current = user;
  const meRef = useRef(me);
  meRef.current = me;

  const sync = useCallback(async () => {
    const currentUser = userRef.current;
    const currentMe = meRef.current;
    if (!convexReady || !currentUser || currentMe) return true;

    setSyncing(true);
    try {
      await provision(profileFromClerk(currentUser));
      setError(null);
      return true;
    } catch (err) {
      setError(toUserMessage(err));
      return false;
    } finally {
      setSyncing(false);
    }
  }, [convexReady, provision]);

  const syncRef = useRef(sync);
  syncRef.current = sync;

  const clerkUserId = user?.id ?? null;
  const needsSync = convexReady && userLoaded && clerkUserId !== null && me === null;

  useEffect(() => {
    if (!needsSync) return;

    let cancelled = false;
    let attempt = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    setError(null);

    const schedule = (delay: number) => {
      timeoutId = setTimeout(() => void tick(), delay);
    };

    const tick = async () => {
      if (cancelled) return;
      attempt += 1;
      const ok = await syncRef.current();
      if (cancelled || ok) return;
      if (attempt < MAX_ATTEMPTS) schedule(RETRY_MS);
    };

    void tick();

    return () => {
      cancelled = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [needsSync]);

  return {
    me,
    convexReady,
    needsSync,
    syncing,
    error,
    sync,
  };
}
