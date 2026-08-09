import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Screen } from '../../../components/layout/Screen';
import { DetailSkeleton, SoftToast } from '../../../components/states';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon } from '../../../components/ui/Icon';
import { InfoBlock } from '../../../components/ui/InfoBlock';
import { PressableScale } from '../../../components/ui/PressableScale';
import { StatusChip } from '../../../components/ui/StatusChip';
import { parseTalkingPoints } from '../../../lib/briefs-api';
import {
  getAssignment,
  type AssignmentWithBrief,
} from '../../../lib/tasks-api';
import type { TaskStatus } from '../../../lib/tasks';
import { borderWidth, color, radius, shadow, space, type } from '../../../theme/tokens';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

function dueLabel(scheduledDate: string): string {
  const today = dayKey(new Date());
  if (scheduledDate === today) return 'Due today';
  const d = new Date(`${scheduledDate}T12:00:00`);
  return `Due ${DAY_SHORT[d.getDay()]}`;
}

function clipCount(brief: AssignmentWithBrief['briefs']): number {
  const points = parseTalkingPoints(brief.talking_points).filter(
    (p) => (p.text?.trim() ?? '').length > 0,
  );
  const pointN =
    brief.point_count !== null && brief.point_count > 0
      ? brief.point_count
      : points.length;
  let n = pointN;
  if (brief.hook?.trim()) n += 1;
  if (brief.cta?.trim()) n += 1;
  return Math.max(n, 1);
}

function whatToCover(brief: AssignmentWithBrief['briefs']): string | null {
  const points = parseTalkingPoints(brief.talking_points)
    .map((p) => p.text?.trim() ?? '')
    .filter((t) => t.length > 0);
  if (points.length === 0) {
    const script = brief.script?.trim();
    return script && script.length > 0 ? script : null;
  }
  return points.join(' ');
}

function isTaskStatus(value: string): value is TaskStatus {
  return (
    value === 'assigned' ||
    value === 'recorded' ||
    value === 'submitted' ||
    value === 'changes_requested' ||
    value === 'approved' ||
    value === 'posted'
  );
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [assignment, setAssignment] = useState<AssignmentWithBrief | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setAssignment(await getAssignment(id));
    } catch {
      setToast('Could not load this post. Try again.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <DetailSkeleton />
      </>
    );
  }

  if (assignment === null) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Icon name="chevron-left" size={22} color={color.ink} />
        </PressableScale>
        <Text style={styles.missing}>Post not found.</Text>
        <SoftToast
          visible={toast !== null}
          message={toast ?? ''}
          tone="error"
          onHide={() => setToast(null)}
        />
      </Screen>
    );
  }

  const brief = assignment.briefs;
  const isSlideshow = brief.format === 'photo_carousel';
  const usesUpload = isSlideshow && brief.post_type_id !== null;
  const status = isTaskStatus(assignment.status)
    ? assignment.status
    : 'assigned';
  const canAct =
    status === 'assigned' ||
    status === 'changes_requested' ||
    status === 'recorded';
  const points = parseTalkingPoints(brief.talking_points)
    .map((p) => p.text?.trim() ?? '')
    .filter((t) => t.length > 0)
    .slice(0, 3);
  const cover = whatToCover(brief);
  const metaCount = isSlideshow
    ? `${points.length > 0 ? points.length : brief.point_count ?? 0} slides`
    : `${clipCount(brief)} clips`;

  const openExample = () => {
    if (brief.example_url) {
      void WebBrowser.openBrowserAsync(brief.example_url);
    }
  };

  const onPrimary = () => {
    if (!canAct) return;
    if (usesUpload) {
      router.push(`/(creator)/upload/${assignment.id}`);
      return;
    }
    router.push(`/(creator)/record/${assignment.id}?assignment=1`);
  };

  return (
    <Screen
      scroll
      bg={color.white}
      contentStyle={styles.content}
      footer={
        canAct ? (
          <Button
            block
            size="lg"
            icon={usesUpload ? 'images' : 'video'}
            onPress={onPrimary}
          >
            {usesUpload ? 'Add pictures' : 'Record'}
          </Button>
        ) : undefined
      }
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.nav}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Icon name="chevron-left" size={22} color={color.ink} />
        </PressableScale>
        <StatusChip status={status} />
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>{brief.title}</Text>
        <View style={styles.metaRow}>
          <View style={styles.formatPill}>
            <Icon
              name={isSlideshow ? 'images' : 'video'}
              size={13}
              color={color.ink}
            />
            <Text style={styles.formatText}>
              {isSlideshow ? 'Slideshow' : 'Reel'}
            </Text>
          </View>
          <Text style={styles.metaText}>{metaCount}</Text>
          <Text style={styles.metaText}>{dueLabel(assignment.scheduled_date)}</Text>
        </View>
      </View>

      {brief.example_url ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={
            isSlideshow ? 'See the example' : 'Watch the example'
          }
          onPress={openExample}
          style={styles.exampleRow}
        >
          <View style={styles.exampleThumb}>
            <View style={styles.examplePlay}>
              <Icon
                name={isSlideshow ? 'images' : 'play'}
                size={15}
                color={color.ink}
              />
            </View>
          </View>
          <View style={styles.exampleCopy}>
            <Text style={styles.exampleTitle}>
              {isSlideshow ? 'See the example' : 'Watch the example'}
            </Text>
            <Text style={styles.exampleBody}>
              {isSlideshow
                ? points.length > 0
                  ? `${points.length === 1 ? 'One slide' : `${points.length} slides`} with the overlay text already placed.`
                  : 'Slides with the overlay text already placed.'
                : 'The full post. Clip examples are in the recorder too.'}
            </Text>
          </View>
        </PressableScale>
      ) : null}

      {status === 'submitted' ? (
        <EmptyState
          compact
          icon="clock"
          title="In review"
          body="We are reviewing your take. You will get a message if anything needs a fix."
        />
      ) : null}

      {isSlideshow ? (
        <View style={styles.blocks}>
          {points.map((text, i) => (
            <InfoBlock key={`slide-${i}`} label={`Slide ${i + 1}`}>
              {text}
            </InfoBlock>
          ))}
        </View>
      ) : (
        <View style={styles.blocks}>
          {brief.hook?.trim() ? (
            <InfoBlock label="Hook">{brief.hook.trim()}</InfoBlock>
          ) : null}
          {cover !== null ? (
            <InfoBlock label="What to cover">{cover}</InfoBlock>
          ) : null}
        </View>
      )}
      <SoftToast
        visible={toast !== null}
        message={toast ?? ''}
        tone="error"
        onHide={() => setToast(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space[5],
    paddingTop: space[2],
    paddingBottom: space[9],
  },
  nav: {
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
  titleBlock: {
    gap: 10,
  },
  title: {
    fontSize: type.size.titleSm,
    lineHeight: type.size.titleSm * 1.2,
    letterSpacing: type.tracking.title,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  formatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
  },
  formatText: {
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  metaText: {
    fontSize: type.size.meta,
    color: color.slate400,
  },
  exampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    padding: space[4],
    borderRadius: radius.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    ...shadow.shadowCard,
  },
  exampleThumb: {
    width: 72,
    height: 128,
    borderRadius: 10,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  examplePlay: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA92,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.shadowMedia,
  },
  exampleCopy: {
    flex: 1,
    gap: 5,
  },
  exampleTitle: {
    fontSize: type.size.action,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  exampleBody: {
    fontSize: type.size.meta,
    lineHeight: type.size.meta * type.leading.body,
    color: color.slate500,
  },
  blocks: {
    gap: 10,
  },
  missing: {
    marginTop: space[5],
    fontSize: type.size.body,
    color: color.textMuted,
  },
});
