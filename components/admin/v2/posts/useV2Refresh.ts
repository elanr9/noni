// Keeps the v2 posts store fresh for a screen: loads on first focus,
// refetches when the screen comes back into focus (at most every 20s), and
// drives pull to refresh. A failed pull over data already on screen shows a
// toast; with nothing on screen the screen shows LoadError instead.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useV2Data } from '../../../../lib/v2-posts';
import { toast } from '../../../v2/Toast';

const FOCUS_STALE_MS = 20_000;
let lastLoadAt = 0;

export function useV2Refresh(companyId: string | null | undefined): { refreshing: boolean; onRefresh: () => void; retry: () => void } {
  const load = useV2Data((s) => s.load);
  const [pulling, setPulling] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!companyId) return;
      const st = useV2Data.getState();
      const fresh = st.companyId === companyId && st.loaded && !st.error && Date.now() - lastLoadAt < FOCUS_STALE_MS;
      if (fresh) return;
      lastLoadAt = Date.now();
      void load(companyId, st.loaded && st.companyId === companyId);
    }, [companyId, load]),
  );

  const run = useCallback(
    (pull: boolean) => {
      if (!companyId) return;
      if (pull) setPulling(true);
      lastLoadAt = Date.now();
      void load(companyId, true).then(() => {
        if (pull) setPulling(false);
        const st = useV2Data.getState();
        if (pull && st.error && (st.posts.length || st.creators.length)) toast.error("Couldn't refresh. Check your connection and try again.");
      });
    },
    [companyId, load],
  );

  return { refreshing: pulling, onRefresh: useCallback(() => run(true), [run]), retry: useCallback(() => run(false), [run]) };
}

/** The store failed and has nothing to show: the screen should show LoadError, not zeros. */
export function useV2Failed(): boolean {
  return useV2Data((s) => !!s.error && !s.loading && s.posts.length === 0 && s.creators.length === 0);
}
