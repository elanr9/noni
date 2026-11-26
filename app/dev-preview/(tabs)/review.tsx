import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApplicantCard, CreatorQueueCard } from '../../../components/admin/v2/review/ReviewCards';
import { LaneEmpty } from '../../../components/admin/v2/review/ReviewStates';
import { CreatorSheet } from '../../../components/marketplace/AdminSheets';
import { ThreadSheet } from '../../../components/marketplace/MessageThread';
import { Chip, Seg, TabPane, useTabBarInset } from '../../../components/v2';
import { toast } from '../../../components/v2/Toast';
import type { ReviewCreatorGroup, ReviewPost } from '../../../lib/admin-review-queue';
import { PREVIEW_CREATORS, PREVIEW_LISTING, previewThread } from '../../../lib/marketplace-preview';
import { color, text } from '../../../theme/v2';

const LANES = ['posts', 'music', 'accounts', 'creators'] as const;
type Lane = (typeof LANES)[number];

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

type Applicant = (typeof PREVIEW_CREATORS)[number];

/**
 * Dev only: the Review tab with a sample queue.
 * ?lane=posts|music|accounts|creators picks the lane, ?empty=1 empties every lane,
 * ?sheet=profile opens the first applicant, ?sheet=thread opens their messages.
 */
export default function ReviewPreview() {
  const insets = useSafeAreaInsets();
  const bottom = useTabBarInset();
  const router = useRouter();
  const params = useLocalSearchParams<{ lane?: string; empty?: string; sheet?: string }>();
  const empty = params.empty === '1';
  const [lane, setLane] = useState<Lane>(LANES.includes(params.lane as Lane) ? (params.lane as Lane) : params.sheet ? 'creators' : 'posts');
  const [applicants, setApplicants] = useState<Applicant[]>(() =>
    empty ? [] : PREVIEW_CREATORS.slice(0, 3).map((c, i) => ({ ...c, application_id: `a-${c.creator_id}`, application_status: 'applied' as const, applied_at: new Date(Date.now() - (i + 1) * 3 * 36e5).toISOString() })),
  );
  const [unread, setUnread] = useState<Record<string, number>>({ 'a-c1': 1 });
  const [open, setOpen] = useState<Applicant | null>(params.sheet === 'profile' ? (applicants[0] ?? null) : null);
  const [thread, setThread] = useState<Applicant | null>(params.sheet === 'thread' ? (applicants[0] ?? null) : null);
  const [source] = useState(() => previewThread('company'));
  const groups = empty ? [] : GROUPS;
  const total = groups.reduce((n, g) => n + g.posts.length, 0);
  const waiting = total + (empty ? 0 : 2) + applicants.length;
  const briefs = () => router.push('/dev-preview/(tabs)/briefs');

  const decide = (c: Applicant, accept: boolean) => {
    setApplicants((list) => list.filter((x) => x.creator_id !== c.creator_id));
    setOpen(null);
    const first = c.full_name?.trim().split(/\s+/)[0] || 'Creator';
    if (accept) toast.success(`${first} is on your team`);
    else toast.show(`Declined ${first}`);
  };
  const openThread = (c: Applicant) => {
    setOpen(null);
    setTimeout(() => setThread(c), open ? 340 : 0);
  };
  const hasUnread = (c: Applicant | null) => !!c?.application_id && (unread[c.application_id] ?? 0) > 0;

  const body = () => {
    if (lane === 'creators') {
      if (applicants.length === 0) return <LaneEmpty icon="group" tone="green" title="No creators waiting" action="Open Market" onAction={() => router.push({ pathname: '/dev-preview/market', params: { view: 'admin' } })} />;
      return applicants.map((c) => (
        <ApplicantCard key={c.creator_id} creator={c} photo={null} unread={hasUnread(c)} onPress={() => setOpen(c)} onDecide={(accept) => decide(c, accept)} />
      ));
    }
    if (lane === 'music' && empty) return <LaneEmpty icon="music_note" tone="purple" title="No songs waiting" action="Open Briefs" onAction={briefs} />;
    if (lane === 'accounts' && empty) return <LaneEmpty icon="person" tone="amber" title="No accounts waiting" action="Open Creators" onAction={() => undefined} />;
    if (groups.length === 0) return <LaneEmpty icon="check_circle" tone="green" title="Nothing to review" action="Open Briefs" onAction={briefs} />;
    return groups.map((g) => <CreatorQueueCard key={g.creatorId} group={g} onPress={() => undefined} onPost={() => undefined} />);
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top + 12 }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingBottom: bottom }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, paddingBottom: 8 }}>
          <Text style={text.title}>Review</Text>
          {waiting > 0 ? <Chip icon="schedule" label={`${waiting} waiting`} /> : <Chip icon="check" tone="green" label="All clear" />}
        </View>
        <Seg<Lane>
          style={{ marginTop: 8, marginBottom: 16 }}
          value={lane}
          onChange={setLane}
          options={[
            { key: 'posts', label: 'Posts', count: total || undefined, tone: 'blue' },
            { key: 'music', label: 'Music', count: empty ? undefined : 1, tone: 'purple' },
            { key: 'accounts', label: 'Accounts', count: empty ? undefined : 1, tone: 'amber' },
            { key: 'creators', label: 'Creators', count: applicants.length || undefined, tone: 'green' },
          ]}
        />
        <TabPane k={lane}>{body()}</TabPane>
      </ScrollView>
      <CreatorSheet creator={open} photo={null} listing={PREVIEW_LISTING} onClose={() => setOpen(null)} onInvite={() => undefined} onDecide={decide} onMessage={openThread} unread={hasUnread(open)} />
      <ThreadSheet
        applicationId={thread?.application_id ?? null}
        title={thread?.full_name?.trim() || 'Creator'}
        tint={PREVIEW_LISTING.brand_color}
        source={source}
        onRead={() => thread?.application_id && setUnread((u) => ({ ...u, [thread.application_id as string]: 0 }))}
        onClose={() => setThread(null)}
      />
    </View>
  );
}
