/**
 * Network connectivity for offline UX and debounced cloud sync.
 */
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const applyState = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
      if (cancelled) return;
      setIsOnline(state.isConnected === true && state.isInternetReachable !== false);
    };

    const unsub = NetInfo.addEventListener(applyState);
    void NetInfo.fetch().then(applyState);

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return { isOnline, isOffline: !isOnline };
}
