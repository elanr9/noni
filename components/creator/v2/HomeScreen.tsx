// Creator Home (V2Library.jsx CreatorHomeScreen): a greeting, three figures
// and this week's posts with their state. Payout figures live under Earnings.
import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { addDays, fmt, sunday, today } from '../../../lib/v2-format';
import { usePostFrame } from '../../../lib/v2-media';
import { creatorById, useV2Data, type V2Post } from '../../../lib/v2-posts';
import { color, num, stateTone, text } from '../../../theme/v2';
import { Card, Chip, Empty, Row, Screen, SectionTitle, Skeleton, Thumb } from '../../v2';

export interface HomeScreenProps {
  meId: string;
  firstName: string;
  onPost: (p: V2Post) => void;
}

function Num({ value, label, tone }: { value: string | number; label: string; tone?: 'amber' }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={[num.lg, tone === 'amber' ? { color: color.amber } : null]}>{value}</Text>
      <Text numberOfLines={1} style={text.meta}>{label}</Text>
    </View>
  );
}

function PostRow({ p, last, onPress }: { p: V2Post; last: boolean; onPress: () => void }) {
  const frame = usePostFrame(p);
  return (
    <Row last={last} chevron onPress={onPress}>
      <Thumb w={40} radius={8} post={{ frame, title: p.title, format: p.format }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={text.row}>{p.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Chip small tone={stateTone[p.state]} label={p.state} />
        </View>
      </View>
    </Row>
  );
}

export function HomeScreen({ meId, firstName, onPost }: HomeScreenProps) {
  const posts = useV2Data((s) => s.posts);
  const creators = useV2Data((s) => s.creators);
  const loaded = useV2Data((s) => s.loaded);
  const me = creatorById(creators, meId);
  const mine = useMemo(() => posts.filter((p) => p.creatorId === meId), [posts, meId]);
  const week = useMemo(() => {
    const start = sunday(today());
    const end = addDays(start, 7);
    return mine.filter((p) => p.date >= start && p.date < end).sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 6);
  }, [mine]);
  const posted = mine.filter((p) => p.state === 'Posted').length;
  const waiting = mine.filter((p) => p.state === 'Waiting').length;

  return (
    <Screen title={`Hi ${firstName}`} scroll tabRoot>
      {!loaded ? (
        <>
          <Skeleton h={92} />
          <Skeleton h={76} />
          <Skeleton h={76} />
        </>
      ) : (
        <>
          <Card style={{ flexDirection: 'row', gap: 12 }}>
            <Num value={posted} label="posted" />
            <Num value={fmt(me?.views ?? mine.reduce((n, p) => n + p.views, 0))} label="views" />
            <Num value={waiting} label="in review" tone="amber" />
          </Card>
          <SectionTitle>This week</SectionTitle>
          {week.length ? (
            <Card pad={0} style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
              {week.map((p, i) => <PostRow key={p.id} p={p} last={i === week.length - 1} onPress={() => onPost(p)} />)}
            </Card>
          ) : (
            <Empty>Nothing this week.</Empty>
          )}
        </>
      )}
    </Screen>
  );
}
