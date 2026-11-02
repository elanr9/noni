import { useLocalSearchParams, useRouter } from 'expo-router';

import { OutlineScreen } from '../../components/creator/v2/OutlineScreen';
import { useLibStore } from '../../lib/brief-library-api';

export default function Preview() {
  const router = useRouter();
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const brief = useLibStore((s) => s.briefs.find((b) => (kind === 'seven' ? b.kind === 'Guided' && b.type === 'Long Text' : b.kind === 'Outline')));
  return <OutlineScreen brief={brief} onBack={() => router.back()} onRecord={() => undefined} />;
}
