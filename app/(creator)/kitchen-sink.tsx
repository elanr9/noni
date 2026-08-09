import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '../../components/layout/Screen';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { InfoBlock } from '../../components/ui/InfoBlock';
import { MediaCard } from '../../components/ui/MediaCard';
import { OptionCard } from '../../components/ui/OptionCard';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { StatCard } from '../../components/ui/StatCard';
import { StatusChip } from '../../components/ui/StatusChip';
import { TextField } from '../../components/ui/TextField';
import type { TaskStatus } from '../../lib/tasks';
import { color, space, type as typeTokens } from '../../theme/tokens';

const STATUSES: TaskStatus[] = [
  'assigned',
  'recorded',
  'submitted',
  'changes_requested',
  'approved',
  'posted',
];

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
  const [selected, setSelected] = useState(0);
  const [option, setOption] = useState('a');
  const [stat, setStat] = useState<'views' | 'likes'>('views');

  return (
    <Screen
      scroll
      footer={
        <Button variant="primary" size="lg" block>
          Primary CTA
        </Button>
      }
      contentStyle={{ paddingBottom: insets.bottom + 80 }}
    >
      <Text style={styles.heading}>Creator primitives</Text>

      <Section title="Button">
        <View style={styles.row}>
          <Button variant="primary" size="lg">
            Record
          </Button>
          <Button variant="secondary" size="md">
            Sign in
          </Button>
          <Button variant="tint" size="md">
            Tint
          </Button>
          <Button variant="outline" size="sm">
            Outline
          </Button>
          <Button variant="ghost" size="sm">
            Ghost
          </Button>
          <Button variant="danger" size="sm">
            Danger
          </Button>
          <Button variant="primary" size="md" disabled>
            Disabled
          </Button>
          <Button variant="primary" size="md" icon="play" iconRight="arrow-right">
            Icons
          </Button>
        </View>
      </Section>

      <Section title="Icon">
        <View style={styles.row}>
          {[11, 16, 22, 28, 36].map((size) => (
            <Icon key={size} name="zap" size={size} color={color.accent} />
          ))}
        </View>
      </Section>

      <Section title="StatusChip">
        <View style={styles.row}>
          {STATUSES.map((status) => (
            <StatusChip key={status} status={status} />
          ))}
          <StatusChip status="submitted" label="In review" />
        </View>
      </Section>

      <Section title="ProgressBar">
        <ProgressBar progress={0.5} />
        <ProgressBar variant="dots" step={2} total={4} />
      </Section>

      <Section title="OptionCard">
        <OptionCard
          label="Under 5 hours"
          hint="A few clips a week"
          selected={option === 'a'}
          onPress={() => setOption('a')}
        />
        <OptionCard
          label="5 to 10 hours"
          selected={option === 'b'}
          onPress={() => setOption('b')}
        />
      </Section>

      <Section title="TextField">
        <TextField placeholder="Your name" />
      </Section>

      <Section title="InfoBlock">
        <InfoBlock label="Hook">Open on the parent who thinks D1 is the only path.</InfoBlock>
      </Section>

      <Section title="StatCard">
        <View style={styles.row}>
          <StatCard
            label="Views"
            value="128k"
            selected={stat === 'views'}
            onPress={() => setStat('views')}
          />
          <StatCard
            label="Likes"
            value="9.4k"
            selected={stat === 'likes'}
            onPress={() => setStat('likes')}
          />
        </View>
      </Section>

      <Section title="MediaCard">
        <MediaCard
          variant="hero"
          format="reel"
          title="Why D2 coaches are the smartest call you can make"
          time="Due 9pm"
          contentTypeTag="Talking head"
          mediaHeight={280}
        />
        <View style={styles.row}>
          <View style={styles.tile}>
            <MediaCard variant="tile" format="slideshow" title="Three things" meta="12.4k" />
          </View>
          <View style={styles.tile}>
            <MediaCard variant="tile" format="reel" title="Parent myths" meta="To do" />
          </View>
        </View>
      </Section>

      <Section title="EmptyState">
        <EmptyState
          icon="inbox"
          title="Nothing up next"
          body="When a post is due, it shows up here."
          actionLabel="View posts"
          onAction={() => undefined}
        />
      </Section>

      <Section title="Segment control stand-in">
        <View style={styles.row}>
          {['Calendar', 'Grid'].map((label, i) => (
            <Button
              key={label}
              variant={selected === i ? 'tint' : 'ghost'}
              size="sm"
              onPress={() => setSelected(i)}
            >
              {label}
            </Button>
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
  tile: {
    width: '47%',
  },
});
