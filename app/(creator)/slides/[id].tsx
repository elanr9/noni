import { useRouter } from 'expo-router';

import { Empty, Screen } from '../../../components/v2';

/** Slideshow maker. Built in the slideshow stage; this route holds its place. */
export default function SlidesRoute() {
  const router = useRouter();
  return (
    <Screen close back={() => router.back()} title="Add photos">
      <Empty>Nothing here yet.</Empty>
    </Screen>
  );
}
