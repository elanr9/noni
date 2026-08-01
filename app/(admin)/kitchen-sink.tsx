import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StatusChip } from '../../components/StatusChip';
import { Button } from '../../components/ui/Button';
import { FormatPill } from '../../components/ui/FormatPill';
import { InfoBlock } from '../../components/ui/InfoBlock';
import { MediaFallback } from '../../components/ui/MediaFallback';
import { Segmented } from '../../components/ui/Segmented';
import { SheetShell } from '../../components/ui/SheetShell';
import { SkeletonCard, SkeletonLine } from '../../components/ui/Skeleton';
import type { TaskStatus } from '../../lib/tasks';
import { color } from '../../theme/tokens';

/** Scratch screen for Stage F1 primitives. Deleted at the end of the project. */

const STATUSES: TaskStatus[] = [
  'assigned',
  'recorded',
  'submitted',
  'changes_requested',
  'approved',
  'posted',
];

const BUTTON_VARIANTS = [
  { variant: 'primary', label: 'Approve', icon: 'check' },
  { variant: 'outline', label: 'Request changes' },
  { variant: 'ghost', label: 'Back to Queue' },
  { variant: 'tint', label: 'Open Calendar' },
  { variant: 'danger', label: 'Remove from calendar' },
] as const;

const BUTTON_SIZES = ['lg', 'md', 'sm'] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function KitchenSink() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 },
      ]}
    >
      <Section title="FormatPill">
        <View style={styles.row}>
          <FormatPill format="video" />
          <FormatPill format="photo_carousel" />
          <FormatPill format="video" compact />
          <FormatPill format="photo_carousel" compact />
        </View>
      </Section>

      <Section title="MediaFallback">
        <View style={styles.row}>
          <MediaFallback glyph="play" label="0:52" width={90} />
          <MediaFallback glyph="images" label="4 slides" width={90} />
        </View>
      </Section>

      <Section title="InfoBlock">
        <InfoBlock label="HOOK">
          Your winger isn&apos;t unfit. He&apos;s sprinting the wrong yards.
        </InfoBlock>
      </Section>

      <Section title="StatusChip">
        <View style={styles.row}>
          {STATUSES.map((status) => (
            <StatusChip key={status} status={status} />
          ))}
          <StatusChip status="submitted" label="Resubmitted" />
        </View>
      </Section>

      <Section title="SegmentedTabs">
        <Segmented options={['Script', 'Caption', 'Thread']} value={tab} onChange={setTab} />
      </Section>

      <Section title="SkeletonBlock">
        <SkeletonLine width="52%" />
        <SkeletonLine width="92%" height={14} />
        <SkeletonCard height={96} />
      </Section>

      <Section title="Button">
        {BUTTON_VARIANTS.map(({ variant, label, ...rest }) => (
          <View key={variant} style={styles.row}>
            {BUTTON_SIZES.map((size) => (
              <Button
                key={size}
                variant={variant}
                size={size}
                icon={'icon' in rest ? rest.icon : undefined}
              >
                {label}
              </Button>
            ))}
          </View>
        ))}
      </Section>

      <Section title="SheetShell">
        <Button variant="outline" size="md" onPress={() => setSheetOpen(true)}>
          Request changes
        </Button>
      </Section>

      <SheetShell visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <View style={styles.sheetBody}>
          <Text style={styles.sheetTitle}>What should Mara fix?</Text>
          <Button variant="primary" size="lg" block onPress={() => setSheetOpen(false)}>
            Send note to Mara
          </Button>
        </View>
      </SheetShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.offWhite,
  },
  content: {
    paddingHorizontal: 24,
    gap: 28,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: color.slate400,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  sheetBody: {
    gap: 16,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: color.ink,
  },
});
