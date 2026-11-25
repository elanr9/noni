import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApplicantCard, CreatorQueueCard } from '../../../components/admin/v2/review/ReviewCards';
import { Chip, Seg, useTabBarInset } from '../../../components/v2';
import type { ReviewCreatorGroup, ReviewPost } from '../../../lib/admin-review-queue';
import { PREVIEW_CREATORS } from '../../../lib/marketplace-preview';
import { color, text } from '../../../theme/v2';

type Lane = 'posts' | 'music' | 'accounts' | 'creators';

const post = (id: string, creatorId: string, creatorName: string, title: string, format: ReviewPost['format'], take: number, ageLabel: string): ReviewPost => ({
  id,
  creatorId,
  creatorName,
  title,
  format,
  mediaPath: null,
  mediaFormat: format === 'Slideshow' ? 'photo_carousel' : 'video',
  take,
  submittedAt: null,
  ageLabel,
});

const GROUPS: ReviewCreatorGroup[] = [
  {
    creatorId: 'fab',
    name: 'Fabrizio',
    photo: null,
    posts: [
      post('r1', 'fab', 'Fabrizio', 'The pass map that got me a trial', 'Reel', 2, '12m'),
      post('r2', 'fab', 'Fabrizio', 'Recovery speed: the stat nobody films', 'Reel', 1, '1h'),
      post('r3', 'fab', 'Fabrizio', 'What coaches look at first', 'Slideshow', 1, '2h'),
    ],
  },
  {
    creatorId: 'elan',
    name: 'Elan',
    photo: null,
    posts: [
      post('r4', 'elan', 'Elan', 'How to film a full match on a phone', 'Slideshow', 1, '35m'),
      post('r5', 'elan', 'Elan', '5 things film reveals that your coach misses', 'Reel', 1, '3h'),
    ],
  },
  {
    creatorId: 'jacob',
    name: 'Jacob',
    photo: null,
    posts: [post('r6', 'jacob', 'Jacob', 'How to send film a coach actually opens', 'Reel', 1, '4h')],
  },
];

/** Dev only: the Review tab with a sample queue. */
export default function ReviewPreview() {
  const insets = useSafeAreaInsets();
  const bottom = useTabBarInset();
  const params = useLocalSearchParams<{ lane?: string }>();
  const [lane, setLane] = useState<Lane>(params.lane === 'creators' ? 'creators' : 'posts');
  const [applicants, setApplicants] = useState(() => PREVIEW_CREATORS.slice(0, 3).map((c, i) => ({ ...c, application_id: `a-${c.creator_id}`, application_status: 'applied' as const, applied_at: new Date(Date.now() - (i + 1) * 3 * 36e5).toISOString() })));
  const total = GROUPS.reduce((n, g) => n + g.posts.length, 0);
  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top + 12 }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottom }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, paddingBottom: 8 }}>
          <Text style={text.title}>Review</Text>
          <Chip icon="schedule" label={`${total + 2 + applicants.length} waiting`} />
        </View>
        <Seg<Lane>
          style={{ marginTop: 8, marginBottom: 16 }}
          value={lane}
          onChange={setLane}
          options={[
            { key: 'posts', label: 'Posts', count: total, tone: 'blue' },
            { key: 'music', label: 'Music', count: 1, tone: 'purple' },
            { key: 'accounts', label: 'Accounts', count: 1, tone: 'amber' },
            { key: 'creators', label: 'Creators', count: applicants.length, tone: 'green' },
          ]}
        />
        {lane === 'creators'
          ? applicants.map((c) => (
              <ApplicantCard key={c.creator_id} creator={c} photo={null} onPress={() => undefined} onDecide={() => setApplicants((list) => list.filter((x) => x.creator_id !== c.creator_id))} />
            ))
          : GROUPS.map((g) => <CreatorQueueCard key={g.creatorId} group={g} onPress={() => undefined} onPost={() => undefined} />)}
      </ScrollView>
    </View>
  );
}
