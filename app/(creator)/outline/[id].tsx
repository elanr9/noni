import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { OutlineScreen } from '../../../components/creator/v2/OutlineScreen';
import { useAuth } from '../../../lib/auth';
import { useLibStore } from '../../../lib/brief-library-api';

export default function CreatorOutline() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const companyId = profile?.active_company_id;
  const load = useLibStore((s) => s.load);
  const brief = useLibStore((s) => s.briefs.find((b) => b.id === id));

  useEffect(() => {
    if (companyId) void load(companyId);
  }, [companyId, load]);

  return (
    <OutlineScreen
      brief={brief}
      onBack={() => router.back()}
      onRecord={(mode, myText) => router.push({ pathname: '/(creator)/capture', params: { mode, id: id ?? '', text: myText } })}
    />
  );
}
