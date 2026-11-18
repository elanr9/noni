import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { toast } from '../../../components/v2/Toast';
import { useAuth } from '../../../lib/auth';
import { useLibStore } from '../../../lib/brief-library-api';
import { color, text } from '../../../theme/v2';

/** Push and link target for a brief: loads the library, then opens it the way the Briefs list does. */
export default function OpenBrief() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const companyId = useAuth().profile?.active_company_id ?? null;
  const load = useLibStore((s) => s.load);
  const loaded = useLibStore((s) => s.loaded && s.companyId === companyId);
  const brief = useLibStore((s) => s.briefs.find((b) => b.id === id));

  useEffect(() => {
    if (companyId) void load(companyId);
  }, [companyId, load]);

  useEffect(() => {
    if (!id || !loaded) return;
    if (!brief) {
      toast.show('That brief was removed.');
      router.replace('/(creator)/briefs');
      return;
    }
    if (brief.kind === 'Guided' && brief.type === 'Slideshow') router.replace({ pathname: '/(creator)/slides/[id]', params: { id: brief.id } });
    else if (brief.kind === 'Guided' && brief.type !== 'Long Text') router.replace({ pathname: '/(creator)/capture', params: { mode: 'guided', id: brief.id } });
    else router.replace({ pathname: '/(creator)/outline/[id]', params: { id: brief.id } });
  }, [id, loaded, brief, router]);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <ActivityIndicator color={color.grey4} />
      <Text style={text.meta}>Opening the brief</Text>
    </View>
  );
}
