import { useRouter } from 'expo-router';

import { CreatorSlides } from '../../components/creator/v2/slides/CreatorSlides';
import { useLibStore } from '../../lib/brief-library-api';

export default function Preview() {
  const router = useRouter();
  const brief = useLibStore((s) => s.briefs.find((b) => b.kind === 'Guided' && b.type === 'Slideshow'));
  if (!brief) return null;
  return <CreatorSlides brief={brief} handle="@fabri.fv" onClose={() => router.back()} onSubmit={async () => undefined} onSent={() => router.back()} />;
}
