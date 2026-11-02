import { useLocalSearchParams, useRouter } from 'expo-router';

import { Empty, Screen } from '../../components/v2';

/** Record: the v2 camera. Built in the Record stage; this route holds its place. */
export default function CaptureRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const router = useRouter();
  return (
    <Screen close back={() => router.back()} title={mode === 'guided' ? 'Record' : 'New post'}>
      <Empty>Nothing here yet.</Empty>
    </Screen>
  );
}
