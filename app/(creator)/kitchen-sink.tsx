import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '../../components/layout/Screen';
import { FormatTag, TypeTag } from '../../components/creator/Chips';
import {
  Bubble,
  DayDivider,
  PostRefCard,
  QuotedReply,
  VoiceNote,
} from '../../components/creator/ChatKit';
import { PostPager, type PostPagerItem } from '../../components/creator/PostPager';
import { SlideNav } from '../../components/creator/SlideNav';
import { TeleprompterOverlay } from '../../components/creator/TeleprompterOverlay';
import { useCreatorToast } from '../../components/creator/Toast';
import { WeekStrip, type WeekStripDay } from '../../components/creator/WeekStrip';
import { Button } from '../../components/ui/Button';
import { MediaCard } from '../../components/ui/MediaCard';
import { StatusChip } from '../../components/ui/StatusChip';
import { dayKey, slotTimeLabel, statusDotColor } from '../../lib/creator-queue';
import type { TaskStatus } from '../../lib/tasks';
import { color, radius, space, type as typeTokens } from '../../theme/tokens';

const STATUSES: TaskStatus[] = [
  'assigned',
  'recorded',
  'submitted',
  'changes_requested',
  'approved',
  'posted',
];

const MOCK_SLIDES = [
  { text: '3 numbers that decide Sunday' },
  { text: 'Goal kicks won: 62 percent' },
  { text: 'Second balls: the quiet stat' },
  { text: 'Track all three this week' },
];

function mockWeek(): WeekStripDay[] {
  const byOffset: TaskStatus[][] = [
    ['posted', 'posted', 'posted'],
    ['posted', 'approved'],
    ['posted', 'posted', 'posted'],
    ['changes_requested', 'submitted', 'assigned'],
    ['assigned', 'assigned'],
    ['assigned'],
    [],
  ];
  return byOffset.map((statuses, i) => {
    const d = new Date();
    d.setDate(d.getDate() + (i - 3));
    return { date: dayKey(d), statuses };
  });
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function CreatorKitchenSink() {
  const insets = useSafeAreaInsets();
  const toast = useCreatorToast();
  const week = useMemo(mockWeek, []);
  const [selectedDate, setSelectedDate] = useState(week[3].date);
  const [selectedSlot, setSelectedSlot] = useState('1');

  const pagerItems: PostPagerItem[] = [
    { key: '0', label: slotTimeLabel(0), status: 'posted' },
    { key: '1', label: slotTimeLabel(1), status: 'changes_requested' },
    { key: '2', label: slotTimeLabel(2), status: 'assigned' },
  ];

  return (
    <Screen scroll contentStyle={{ paddingBottom: insets.bottom + 80 }}>
      <Text style={styles.heading}>Creator primitives</Text>

      <Section title="FormatTag and TypeTag">
        <View style={styles.row}>
          <FormatTag format="video" />
          <FormatTag format="photo_carousel" />
          <TypeTag label="Talking head" typeKey="talking_head" />
          <TypeTag label="Numbered list" typeKey="numbered_list" />
          <TypeTag label="How to" typeKey="how_to" />
          <TypeTag label="Explainer" typeKey="explainer" />
          <TypeTag label="Contrast" typeKey="contrast" />
          <TypeTag label="Replay bait" typeKey="replay_bait" />
          <TypeTag label="No key fallback" />
        </View>
      </Section>

      <Section title="Status dots">
        <View style={styles.row}>
          {STATUSES.map((status) => (
            <View key={status} style={styles.dotItem}>
              <View style={[styles.dot, { backgroundColor: statusDotColor(status) }]} />
              <Text style={styles.dotLabel}>{status}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="WeekStrip">
        <WeekStrip days={week} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      </Section>

      <Section title="PostPager">
        <PostPager items={pagerItems} selectedKey={selectedSlot} onSelect={setSelectedSlot} />
      </Section>

      <Section title="MediaCard with chips">
        <MediaCard
          variant="hero"
          format="slideshow"
          title="3 numbers that decide Sunday"
          duration="0:34"
          mediaHeight={280}
          chips={
            <>
              <FormatTag format="photo_carousel" />
              <TypeTag label="Numbered list" typeKey="numbered_list" />
            </>
          }
        />
      </Section>

      <Section title="SlideNav dark">
        <View style={styles.slideFrameDark}>
          <SlideNav slides={MOCK_SLIDES} variant="dark" />
        </View>
      </Section>

      <Section title="SlideNav light">
        <View style={styles.slideFrameLight}>
          <SlideNav slides={MOCK_SLIDES} variant="light" />
        </View>
      </Section>

      <Section title="TeleprompterOverlay">
        <View style={styles.prompterFrame}>
          <TeleprompterOverlay
            text="We tagged 400 goal kicks from one U16 season."
            durationMs={9000}
          />
        </View>
      </Section>

      <Section title="Chat kit">
        <View style={styles.thread}>
          <DayDivider label="Monday" />
          <Bubble side="manager" author="Sasha" time="09:12" avatarInitial="S">
            Welcome to week 3. The brief is tripod content: setups, angles, and
            what the footage catches.
          </Bubble>
          <Bubble side="creator" time="09:40">
            Got it. Filming tonight after the U16 session.
          </Bubble>
          <DayDivider label="Today" />
          <Bubble side="manager" author="Sasha" time="10:12" avatarInitial="S">
            <PostRefCard
              title="3 numbers that decide Sunday"
              format="photo_carousel"
              onPress={() => toast.show('Post reference tapped.')}
            />
            <Text style={styles.bubbleBody}>
              Slide 2 needs the real number, not the placeholder.
            </Text>
            <VoiceNote durationLabel="0:18" />
          </Bubble>
          <Bubble side="creator" time="10:31">
            <QuotedReply
              author="Sasha"
              excerpt="Slide 2 needs the real number, not the placeholder."
              onAccent
            />
            <Text style={styles.bubbleBodyOnAccent}>
              On it. Re-uploading in an hour.
            </Text>
          </Bubble>
        </View>
      </Section>

      <Section title="Toast">
        <Button
          variant="primary"
          size="md"
          onPress={() => toast.show('Sent for approval. It posts once approved.')}
        >
          Show toast
        </Button>
      </Section>

      <Section title="StatusChip">
        <View style={styles.row}>
          {STATUSES.map((status) => (
            <StatusChip key={status} status={status} />
          ))}
        </View>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: typeTokens.size.titleSm,
    fontWeight: typeTokens.weight.heavy,
    color: color.ink,
    marginBottom: space[3],
  },
  section: {
    gap: space[3],
    marginBottom: space.sectionGap,
  },
  sectionTitle: {
    fontSize: typeTokens.size.label,
    fontWeight: typeTokens.weight.heavy,
    letterSpacing: typeTokens.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space[2],
  },
  dotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
  },
  dotLabel: {
    fontSize: typeTokens.size.label,
    fontWeight: typeTokens.weight.semibold,
    color: color.slate500,
  },
  slideFrameDark: {
    height: 280,
    borderRadius: radius['2xl'],
    overflow: 'hidden',
    backgroundColor: color.ink900,
  },
  slideFrameLight: {
    height: 220,
    borderRadius: radius['2xl'],
    overflow: 'hidden',
    backgroundColor: color.blue100,
  },
  prompterFrame: {
    borderRadius: radius['2xl'],
    backgroundColor: color.ink900,
    paddingVertical: 34,
  },
  thread: {
    gap: space[4],
    padding: space[4],
    borderRadius: radius.lg,
    backgroundColor: color.offWhite,
  },
  bubbleBody: {
    fontSize: typeTokens.size.bodySm,
    lineHeight: typeTokens.size.bodySm * typeTokens.leading.body,
    color: color.ink,
  },
  bubbleBodyOnAccent: {
    fontSize: typeTokens.size.bodySm,
    lineHeight: typeTokens.size.bodySm * typeTokens.leading.body,
    color: color.white,
  },
});
