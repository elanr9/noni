// Slideshow maker for a guided slideshow brief; submits as a slideshow edit
// document so the words the creator checked are baked onto every slide.
// `post` continues a post already started (resume, changes requested).
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { slidesForSubmit } from '../../../components/creator/v2/slides/model';
import { CreatorSlides } from '../../../components/creator/v2/slides/CreatorSlides';
import { Button, Icon } from '../../../components/v2';
import { useAuth } from '../../../lib/auth';
import { useLibStore } from '../../../lib/brief-library-api';
import { ensureCreatorPost, getOpenCreatorPost } from '../../../lib/creator-posts-api';
import { submitSlideshow } from '../../../lib/submissions';
import { creatorById, useV2Data } from '../../../lib/v2-posts';
import { color, text } from '../../../theme/v2';

export default function SlidesRoute() {
  const { id, post } = useLocalSearchParams<{ id: string; post?: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const companyId = profile?.active_company_id;
  const load = useLibStore((s) => s.load);
  const loaded = useLibStore((s) => s.loaded);
  const brief = useLibStore((s) => s.briefs.find((b) => b.id === id));
  const creators = useV2Data((s) => s.creators);

  useEffect(() => {
    if (companyId) void load(companyId);
  }, [companyId, load]);

  if (!brief || !profile || !companyId) {
    const missing = loaded && !!profile && !brief;
    return (
      <View style={{ flex: 1, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        {missing ? (
          <Animated.View entering={FadeIn.duration(200)} style={{ alignItems: 'center', gap: 12, alignSelf: 'stretch' }}>
            <Icon name="photo_library" size={40} color={color.grey3} />
            <Text style={[text.card, { color: color.white, textAlign: 'center' }]}>This brief is no longer available</Text>
            <Text style={[text.body, { color: color.grey3, textAlign: 'center' }]}>Your team may have removed it. Pick another brief to make a slideshow.</Text>
            <View style={{ flexDirection: 'row', alignSelf: 'stretch', marginTop: 8 }}>
              <Button variant="quiet" label="Close" onPress={() => router.back()} />
            </View>
          </Animated.View>
        ) : (
          <ActivityIndicator color={color.white} />
        )}
      </View>
    );
  }
  const me = creatorById(creators, profile.id);
  return (
    <CreatorSlides
      brief={brief}
      handle={me?.handle ?? undefined}
      onClose={() => router.back()}
      onSubmit={async (slides, onProgress) => {
        const resumed = post ? await getOpenCreatorPost(companyId, profile.id, post) : null;
        const assignment = resumed ?? (await ensureCreatorPost({ companyId, creatorId: profile.id, title: brief.title, format: 'photo_carousel', libraryBriefId: brief.id }));
        await submitSlideshow({ assignment, companyId, creatorId: profile.id, slides: slidesForSubmit(slides), onProgress });
        void useV2Data.getState().load(companyId, true);
      }}
      onSent={() => router.dismissTo('/(creator)/(tabs)')}
    />
  );
}
