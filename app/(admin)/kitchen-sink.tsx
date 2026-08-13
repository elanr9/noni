import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ActionBar,
  AdminHeader,
  Avatar,
  Card,
  CheckboxReasonRow,
  ConfirmationTakeover,
  EmptyState,
  NoteBlock,
  PostTypeChip,
  PushHeader,
  ScoreBar,
  ScoreDial,
  SectionLabel,
  Segmented,
  Sheet,
  SkeletonCard,
  SkeletonLine,
  StatPill,
  Thumb,
  TypeChip,
  type TypeChipTone,
} from '../../components/admin/shared';
import { Button } from '../../components/ui/Button';
import { color, space } from '../../theme/tokens';

/** Agent 0 acceptance screen: every shared primitive in all tones and states. */

const CHIP_TONES: { tone: TypeChipTone; label: string }[] = [
  { tone: 'brand', label: 'Reel' },
  { tone: 'good', label: 'All clear' },
  { tone: 'warn', label: 'Needs changes' },
  { tone: 'quiet', label: 'Pending' },
  { tone: 'bad', label: 'Sent back' },
];

const REASONS = [
  'Song is not on the post',
  'Different song than the brief',
  'Only added on one platform',
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionLabel>{title}</SectionLabel>
      {children}
    </View>
  );
}

export default function KitchenSink() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState(0);
  const [reasons, setReasons] = useState<string[]>([REASONS[0]]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const [noteShown, setNoteShown] = useState(true);

  const toggleReason = (reason: string) =>
    setReasons((current) =>
      current.includes(reason) ? current.filter((r) => r !== reason) : [...current, reason],
    );

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 },
        ]}
      >
        <Section title="AdminHeader">
          <AdminHeader
            title="Review"
            subtitle="Approve posts and they will be posted automatically!"
            pill={{ label: '8 waiting', tone: 'accent' }}
          />
          <AdminHeader title="Review" pill={{ label: 'All clear', tone: 'green' }} />
        </Section>

        <Section title="PushHeader">
          <PushHeader title="Music approval" subtitle="Numbered list · Week 14" onBack={() => {}} />
        </Section>

        <Section title="SectionLabel">
          <SectionLabel right={<StatPill value="$238" unit="/day avg" />}>
            Posts made this week
          </SectionLabel>
        </Section>

        <Section title="Segmented">
          <Segmented
            options={[
              { label: 'Posts', count: 3 },
              { label: 'Music', count: 1 },
              { label: 'Accounts', count: 0 },
            ]}
            value={tab}
            onChange={setTab}
          />
          <Segmented options={[{ label: 'Script' }, { label: 'Caption' }]} value={0} onChange={() => {}} />
        </Section>

        <Section title="TypeChip">
          <View style={styles.row}>
            {CHIP_TONES.map(({ tone, label }) => (
              <TypeChip key={tone} tone={tone}>
                {label}
              </TypeChip>
            ))}
            <TypeChip tone="brand" icon="video">
              Reel
            </TypeChip>
          </View>
        </Section>

        <Section title="PostTypeChip">
          <View style={styles.row}>
            <PostTypeChip typeKey="numbered_list" label="Numbered list" />
            <PostTypeChip typeKey="talking_head" label="Talking head" />
            <PostTypeChip typeKey="explainer" label="Explainer" />
            <PostTypeChip typeKey="unknown" label="Unknown type" />
          </View>
        </Section>

        <Section title="Card">
          <Card>
            <Text style={styles.cardText}>Plain card</Text>
          </Card>
          <Card pad={12} onPress={() => {}}>
            <Text style={styles.cardText}>Pressable card, pad 12</Text>
          </Card>
        </Section>

        <Section title="StatPill">
          <View style={styles.row}>
            <StatPill value="$238" unit="/day avg" />
            <StatPill value="12.4K" unit="views/day" />
          </View>
        </Section>

        <Section title="Avatar">
          <View style={styles.row}>
            <Avatar name="Mara Jennings" />
            <Avatar name="Diego Silva" tone="quiet" />
            <Avatar name="Mara Jennings" size={52} />
          </View>
        </Section>

        <Section title="Thumb">
          <View style={styles.row}>
            <Thumb format="video" badge="0:52" width={46} height={62} radius={9} />
            <Thumb format="photo_carousel" badge="4 slides" width={46} height={62} radius={9} />
            <Thumb format="video" badge="0:52" takeBadge="Take 2" />
          </View>
        </Section>

        <Section title="CheckboxReasonRow">
          <View style={styles.stack}>
            {REASONS.map((reason) => (
              <CheckboxReasonRow
                key={reason}
                label={reason}
                selected={reasons.includes(reason)}
                onToggle={() => toggleReason(reason)}
              />
            ))}
          </View>
        </Section>

        <Section title="NoteBlock">
          {noteShown ? (
            <NoteBlock onRemove={() => setNoteShown(false)}>
              For You is mostly gym content. Rewarm it on college soccer before resubmitting.
            </NoteBlock>
          ) : (
            <Button variant="tint" size="sm" onPress={() => setNoteShown(true)}>
              Restore note
            </Button>
          )}
          <NoteBlock>Song is not on the post</NoteBlock>
        </Section>

        <Section title="Skeleton">
          <SkeletonLine width="52%" />
          <SkeletonLine width="92%" height={14} />
          <SkeletonCard height={92} />
        </Section>

        <Section title="EmptyState">
          <EmptyState
            icon="inbox"
            title="Nothing to review"
            body="Creators are recording this week's posts. New submissions land here, newest first."
          />
        </Section>

        <Section title="ScoreDial and ScoreBar">
          <View style={styles.row}>
            <ScoreDial score={86} label="score" />
            <ScoreDial score={70} label="score" />
            <ScoreDial score={48} label="score" />
          </View>
          <ScoreBar score={86} />
          <ScoreBar score={58} tone="amber" />
        </Section>

        <Section title="Sheet and ConfirmationTakeover">
          <View style={styles.row}>
            <Button variant="outline" size="md" onPress={() => setSheetOpen(true)}>
              Request Changes
            </Button>
            <Button variant="approve" size="md" icon="check" onPress={() => setTakeoverOpen(true)}>
              Accept Song
            </Button>
          </View>
        </Section>

        <Section title="ActionBar">
          <ActionBar style={styles.actionBarDemo}>
            <Button variant="ghost" size="lg" style={styles.actionGhost} onPress={() => {}}>
              Cancel
            </Button>
            <Button variant="primary" size="lg" style={styles.actionPrimary} onPress={() => {}}>
              {`Send back · ${reasons.length}`}
            </Button>
          </ActionBar>
          <View style={styles.darkGround}>
            <ActionBar dark style={styles.actionBarDemo}>
              <Button variant="outline" size="lg" style={styles.actionGhost} onPress={() => {}}>
                Back
              </Button>
              <Button variant="primary" size="lg" style={styles.actionPrimary} onPress={() => {}}>
                Approve
              </Button>
            </ActionBar>
          </View>
        </Section>
      </ScrollView>

      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Request changes"
        subtitle="Goes to Mara"
        footer={
          <View style={styles.sheetFooter}>
            <Button
              variant="ghost"
              size="lg"
              style={styles.actionGhost}
              onPress={() => setSheetOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="lg"
              icon="send"
              style={styles.actionPrimary}
              disabled={reasons.length === 0}
              onPress={() => setSheetOpen(false)}
            >
              Send back
            </Button>
          </View>
        }
      >
        <View style={styles.stack}>
          {REASONS.map((reason) => (
            <CheckboxReasonRow
              key={reason}
              label={reason}
              selected={reasons.includes(reason)}
              onToggle={() => toggleReason(reason)}
            />
          ))}
        </View>
      </Sheet>

      {takeoverOpen && (
        <ConfirmationTakeover
          icon="check"
          tone="good"
          title="Song approved"
          body="Earnings for this post are unlocked. Mara sees it in their wallet tonight."
          actionLabel="Back to Review"
          onAction={() => setTakeoverOpen(false)}
          onBack={() => setTakeoverOpen(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: color.offWhite,
  },
  content: {
    paddingHorizontal: space.gutterAdmin,
    gap: 28,
  },
  section: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  stack: {
    gap: 7,
  },
  cardText: {
    fontSize: 15,
    fontWeight: '600',
    color: color.ink,
  },
  darkGround: {
    backgroundColor: color.ink900,
    borderRadius: 18,
    overflow: 'hidden',
    paddingTop: 24,
  },
  actionBarDemo: {
    paddingBottom: 26,
  },
  actionGhost: {
    flexBasis: '28%',
    flexGrow: 0,
  },
  actionPrimary: {
    flex: 1,
  },
  sheetFooter: {
    flexDirection: 'row',
    gap: 8,
  },
});
