import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';

import { parseChangesNote } from '../../../../components/ReviewThread';
import { Button } from '../../../../components/ui/Button';
import { Icon } from '../../../../components/ui/Icon';
import { PressableScale } from '../../../../components/ui/PressableScale';
import { StatusChip } from '../../../../components/ui/StatusChip';
import { color, radius, shadow, space, type } from '../../../../theme/tokens';
import { useAuth } from '../../../../lib/auth';
import { listBriefSegments, type BriefSegment } from '../../../../lib/briefs-api';
import {
  latestChangesNote,
  listAssignmentReviewEvents,
  type ReviewEvent,
} from '../../../../lib/review-events';
import {
  getAssignment,
  type AssignmentWithBrief,
} from '../../../../lib/tasks-api';
import {
  flaggedSlotIndices,
  formatFlaggedClipNote,
  relativeTime,
} from '../flagged';

type ClipPlanLite = {
  slotIndex: number;
  kind: string;
  label: string;
};

function buildPlan(
  _assignment: AssignmentWithBrief,
  segments: BriefSegment[],
): ClipPlanLite[] {
  const video = segments.filter((s) => s.kind !== 'slide');
  if (video.length > 0) {
    let pointNumber = 0;
    return video.map((s) => {
      if (s.kind === 'hook') {
        return { slotIndex: s.slot_index, kind: 'hook', label: 'Hook' };
      }
      if (s.kind === 'outro') {
        return { slotIndex: s.slot_index, kind: 'outro', label: 'CTA' };
      }
      pointNumber += 1;
      return {
        slotIndex: s.slot_index,
        kind: 'point',
        label: `Point ${pointNumber}`,
      };
    });
  }
  return [{ slotIndex: 0, kind: 'point', label: 'Clip 1' }];
}

export default function ChangesRequestedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useAuth();

  const [assignment, setAssignment] = useState<AssignmentWithBrief | null>(null);
  const [segments, setSegments] = useState<BriefSegment[]>([]);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const a = await getAssignment(id);
      setAssignment(a);
      if (a) {
        const [segs, ev] = await Promise.all([
          listBriefSegments(a.briefs.id),
          listAssignmentReviewEvents(a.id),
        ]);
        setSegments(segs);
        setEvents(ev);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const brief = assignment?.briefs ?? null;
  const changesNote = latestChangesNote(events);
  const changesSections =
    changesNote !== null ? parseChangesNote(changesNote) : [];
  const plan = useMemo(
    () => (assignment ? buildPlan(assignment, segments) : []),
    [assignment, segments],
  );
  const flagged = useMemo(
    () => flaggedSlotIndices(changesSections, plan),
    [changesSections, plan],
  );
  const pinnedNote = formatFlaggedClipNote(flagged, plan);
  const fixSections = changesSections.filter((s) => s.label !== null);

  const teamEvent = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const e = events[i];
      if (e.action === 'changes_requested') return e;
    }
    return null;
  }, [events]);

  const teamMessage = useMemo(() => {
    const unlabeled = changesSections
      .filter((s) => s.label === null)
      .map((s) => s.text.trim())
      .filter((t) => t.length > 0);
    if (unlabeled.length > 0) return unlabeled[unlabeled.length - 1];
    const comment = [...events].reverse().find((e) => e.action === 'comment');
    return comment?.note?.trim() || null;
  }, [changesSections, events]);

  const sentBackAt = teamEvent?.created_at
    ? relativeTime(teamEvent.created_at)
    : null;
  const authorName = teamEvent?.profiles?.full_name?.trim() || 'Your team';
  const authorInitial = authorName.charAt(0).toUpperCase() || 'T';

  function onRecordAgain() {
    if (!assignment) return;
    const usesUpload =
      assignment.briefs.format === 'photo_carousel' &&
      assignment.briefs.post_type_id !== null;
    if (usesUpload) {
      router.push(`/(creator)/upload/${assignment.id}`);
      return;
    }
    router.push(`/(creator)/record/${assignment.id}?assignment=1`);
  }

  if (loading) {
    return (
      <View style={styles.fallback}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={color.accent} />
      </View>
    );
  }

  if (!assignment || !brief) {
    return (
      <View style={[styles.fallback, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.fallbackText}>Post not found.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Icon name="chevron-left" size={22} color={color.ink} />
        </PressableScale>
        <StatusChip status="changes_requested" />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 140 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{brief.title}</Text>
        <View style={styles.metaRow}>
          <View style={styles.formatChip}>
            <Icon
              name={brief.format === 'photo_carousel' ? 'images' : 'video'}
              size={13}
              color={color.ink}
            />
            <Text style={styles.formatChipText}>
              {brief.format === 'photo_carousel' ? 'Slideshow' : 'Reel'}
            </Text>
          </View>
          <Text style={styles.metaText}>
            {plan.length} {plan.length === 1 ? 'clip' : 'clips'}
          </Text>
          {sentBackAt ? (
            <Text style={styles.metaText}>Sent back {sentBackAt}</Text>
          ) : null}
        </View>

        <View style={styles.fixCard}>
          <Text style={styles.fixLabel}>What to fix</Text>
          {fixSections.length > 0 ? (
            <View style={styles.fixList}>
              {fixSections.map((section, i) => (
                <View key={`${section.label ?? 'note'}-${i}`}>
                  {i > 0 ? <View style={styles.fixRule} /> : null}
                  <View style={styles.fixRow}>
                    {section.label !== null ? (
                      <Text style={styles.fixItemLabel}>{section.label}</Text>
                    ) : null}
                    <Text style={styles.fixBody}>{section.text}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.fixBody}>
              {changesNote ??
                'Your reviewer asked for another take. Check the note from the team below.'}
            </Text>
          )}
        </View>

        {brief.example_url ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Watch the example"
            style={styles.exampleBtn}
            onPress={() =>
              void WebBrowser.openBrowserAsync(brief.example_url as string)
            }
          >
            <Icon name="play" size={18} color={color.blue600} />
            <Text style={styles.exampleText}>Watch the example</Text>
            <Icon name="chevron-right" size={18} color={color.slate400} />
          </PressableScale>
        ) : null}

        {teamMessage ? (
          <View style={styles.teamBlock}>
            <Text style={styles.teamLabel}>From the team</Text>
            <View style={styles.teamRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{authorInitial}</Text>
              </View>
              <View style={styles.bubble}>
                <Text style={styles.bubbleText}>{teamMessage}</Text>
                <Text style={styles.bubbleMeta}>
                  {authorName}
                  {sentBackAt ? `, ${sentBackAt}` : ''}
                </Text>
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.cta,
          { paddingBottom: Math.max(30, insets.bottom + 12) },
        ]}
      >
        <Button
          variant="primary"
          size="lg"
          block
          icon="video"
          onPress={onRecordAgain}
        >
          Record again
        </Button>
        <Text style={styles.ctaNote}>{pinnedNote}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.white },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.white,
    paddingHorizontal: space.gutter,
  },
  fallbackText: {
    color: color.textMuted,
    fontSize: type.size.body,
    textAlign: 'center',
  },
  topBar: {
    paddingHorizontal: space.gutter,
    paddingTop: space[2],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: space.gutter,
    paddingTop: space[6],
    gap: space[6],
  },
  title: {
    fontSize: type.size.titleSm,
    lineHeight: type.size.titleSm * type.leading.title,
    letterSpacing: type.tracking.title,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space[2],
    marginTop: -6,
  },
  formatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
  },
  formatChipText: {
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  metaText: {
    fontSize: type.size.meta,
    color: color.slate400,
  },
  fixCard: {
    padding: space.cardPad,
    borderRadius: radius.lg,
    backgroundColor: color.amberSoft,
    borderWidth: 1,
    borderColor: color.amber,
    gap: 14,
  },
  fixLabel: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.amber,
  },
  fixList: { gap: space[3] },
  fixRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.amber,
    opacity: 0.22,
    marginBottom: space[3],
  },
  fixRow: { flexDirection: 'row', gap: space[3] },
  fixItemLabel: {
    width: 62,
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.amber,
    paddingTop: 2,
  },
  fixBody: {
    flex: 1,
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    color: color.ink,
  },
  exampleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[5],
    paddingHorizontal: space.cardPad,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.white,
    ...shadow.shadowCard,
  },
  exampleText: {
    flex: 1,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  teamBlock: { gap: 10 },
  teamLabel: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
  },
  teamRow: { flexDirection: 'row', gap: 10 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: color.blue700,
    fontSize: type.size.chip,
    fontWeight: type.weight.heavy,
  },
  bubble: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: space[5],
    borderRadius: radius.md,
    borderTopLeftRadius: 6,
    backgroundColor: color.offWhite,
  },
  bubbleText: {
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    color: color.ink,
  },
  bubbleMeta: {
    paddingTop: 6,
    fontSize: type.size.chip,
    color: color.slate400,
  },
  cta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.gutter,
    paddingTop: space[7],
    gap: 10,
    backgroundColor: color.white,
  },
  ctaNote: {
    textAlign: 'center',
    fontSize: type.size.chip,
    color: color.slate400,
  },
});
