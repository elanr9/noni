import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';

import { loadPendingAgreement } from './marketplace-api';

// Each agreement opens itself once per app run, so backing out is possible
// and it is still the first thing seen the next time the app opens.
const shown = new Set<string>();

/**
 * When a company accepted this creator and the agreement is not signed yet,
 * opening the app (or coming back to it) goes straight to that agreement.
 */
export function usePendingAgreement(creatorId: string | null): void {
  const router = useRouter();
  useEffect(() => {
    if (!creatorId) return;
    let live = true;
    const check = () => {
      void loadPendingAgreement(creatorId).then((pending) => {
        if (!live || !pending || shown.has(pending.id)) return;
        shown.add(pending.id);
        router.push(`/(creator)/market/${pending.listing_id}` as never);
      });
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, [creatorId, router]);
}
