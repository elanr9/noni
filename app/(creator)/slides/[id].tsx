import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { CreatorSlides } from '../../../components/creator/v2/slides/CreatorSlides';
import { useAuth } from '../../../lib/auth';
import { useLibStore } from '../../../lib/brief-library-api';
import { ensureCreatorPost } from '../../../lib/creator-posts-api';
import { submitAssignmentPhotos } from '../../../lib/submissions';
import { creatorById, useV2Data } from '../../../lib/v2-posts';

/** Slideshow maker for a guided slideshow brief; submits as a photo carousel. */
export default function SlidesRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const companyId = profile?.active_company_id;
  const load = useLibStore((s) => s.load);
  const brief = useLibStore((s) => s.briefs.find((b) => b.id === id));
  const creators = useV2Data((s) => s.creators);

  useEffect(() => {
    if (companyId) void load(companyId);
  }, [companyId, load]);

  if (!brief || !profile || !companyId) return null;
  const me = creatorById(creators, profile.id);
  return (
    <CreatorSlides
      brief={brief}
      handle={me?.handle ?? undefined}
      onClose={() => router.back()}
      onSubmit={async (photos) => {
        const assignment = await ensureCreatorPost({ companyId, creatorId: profile.id, title: brief.title, format: 'photo_carousel', libraryBriefId: brief.id });
        await submitAssignmentPhotos({ assignment, companyId, creatorId: profile.id, photos });
      }}
      onSent={() => router.dismissTo('/(creator)/(tabs)')}
    />
  );
}
