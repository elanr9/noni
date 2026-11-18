import { useCallback, useEffect } from 'react';
import { useRouter } from 'expo-router';

import { BriefList } from '../../components/admin/v2/briefs/BriefList';
import { Screen } from '../../components/v2';
import { toast } from '../../components/v2/Toast';
import { useAuth } from '../../lib/auth';
import { useLibStore } from '../../lib/brief-library-api';

/** The team's guided posts and outlines; picking one starts the matching flow. */
export default function CreatorBriefs() {
  const router = useRouter();
  const { profile } = useAuth();
  const companyId = profile?.active_company_id;
  const load = useLibStore((s) => s.load);
  const loaded = useLibStore((s) => s.loaded && s.companyId === companyId);
  const offline = useLibStore((s) => s.offline);
  const count = useLibStore((s) => s.briefs.length);

  const fetchBriefs = useCallback(() => {
    if (companyId) void load(companyId);
  }, [companyId, load]);

  useEffect(() => {
    fetchBriefs();
  }, [fetchBriefs]);

  // Offline with nothing cached: say so, with a way to try again.
  useEffect(() => {
    if (loaded && offline && count === 0) toast.error('Could not load briefs', { label: 'Retry', onPress: fetchBriefs });
  }, [loaded, offline, count, fetchBriefs]);

  return (
    <Screen>
      <BriefList
        back
        title="Briefs"
        loading={!loaded}
        empty={offline ? 'Briefs could not load. Check your connection and try again.' : 'Your team has not shared any briefs yet.'}
        emptyAction={{ label: 'Record your own', onPress: () => router.replace({ pathname: '/(creator)/capture', params: { mode: 'free' } }) }}
        onOpen={(b) => {
          if (b.kind === 'Guided' && b.type === 'Slideshow') router.push({ pathname: '/(creator)/slides/[id]', params: { id: b.id } });
          else if (b.kind === 'Guided' && b.type !== 'Long Text') router.push({ pathname: '/(creator)/capture', params: { mode: 'guided', id: b.id } });
          else router.push({ pathname: '/(creator)/outline/[id]', params: { id: b.id } });
        }}
      />
    </Screen>
  );
}
