import { useEffect } from 'react';
import { useRouter } from 'expo-router';

import { BriefList } from '../../components/admin/v2/briefs/BriefList';
import { Screen } from '../../components/v2';
import { useAuth } from '../../lib/auth';
import { useLibStore } from '../../lib/brief-library-api';

/** The team's guided posts and outlines; picking one starts the matching flow. */
export default function CreatorBriefs() {
  const router = useRouter();
  const { profile } = useAuth();
  const companyId = profile?.active_company_id;
  const load = useLibStore((s) => s.load);

  useEffect(() => {
    if (companyId) void load(companyId);
  }, [companyId, load]);

  return (
    <Screen>
      <BriefList
        back
        title="Briefs"
        empty="Nothing here yet."
        onOpen={(b) => {
          if (b.kind === 'Guided' && b.type === 'Slideshow') router.push({ pathname: '/(creator)/slides/[id]', params: { id: b.id } });
          else if (b.kind === 'Guided' && b.type !== 'Long Text') router.push({ pathname: '/(creator)/capture', params: { mode: 'guided', id: b.id } });
          else router.push({ pathname: '/(creator)/outline/[id]', params: { id: b.id } });
        }}
      />
    </Screen>
  );
}
