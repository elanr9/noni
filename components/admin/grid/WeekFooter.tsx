// Admin handoff §6: the footer state machine. One week at a time: no
// buttons while in progress, Publish when every row is complete, Start
// week N+1 only after publish. Publishing never creates the next week.
import { StyleSheet, Text, View } from 'react-native';

import { color, radiusAdmin, shadow } from '../../../theme/tokens';
import { Button } from '../../ui/Button';

export type WeekPhase = 'in_progress' | 'complete' | 'published';

export interface WeekFooterProps {
  phase: WeekPhase;
  /** Rows not yet complete or killed. */
  left: number;
  weekNumber: number;
  /** True before Sunday 8:00 PM EST of the drop week. */
  beforeCutoff: boolean;
  publishing: boolean;
  onPublish: () => void;
  onStartNext: () => void;
  /** Published and still live: opens the day planner above Start week. */
  onPlanMore?: () => void;
  readyCount?: number;
  onPublishReady?: () => void;
}

export function WeekFooter({
  phase,
  left,
  weekNumber,
  beforeCutoff,
  publishing,
  onPublish,
  onStartNext,
  onPlanMore,
}: WeekFooterProps) {
  if (phase === 'in_progress') {
    return (
      <View style={[styles.strip, shadow.shadowCard]}>
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{left}</Text>
        </View>
        <Text style={styles.stripText}>
          {`${left} ${left === 1 ? 'post' : 'posts'} left this week. Publish opens when every row is complete.`}
        </Text>
      </View>
    );
  }

  if (phase === 'complete') {
    return (
      <View style={styles.stack}>
        <Button
          variant="primary"
          size="md"
          block
          disabled={publishing}
          onPress={onPublish}
        >
          {publishing ? 'Publishing…' : 'Publish to creators'}
        </Button>
        <Text style={styles.line}>
          {beforeCutoff
            ? 'Before Sunday 8:00 PM EST, so creators are notified on schedule.'
            : 'Creators are notified immediately.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      {onPlanMore ? (
        <Button variant="outline" size="md" block onPress={onPlanMore}>
          Plan more days
        </Button>
      ) : null}
      <Button variant="outline" size="md" block onPress={onStartNext}>
        {`Start week ${weekNumber + 1}`}
      </Button>
      <Text style={styles.line}>
        {`Week ${weekNumber} is with the creators. Next week opens now.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
  },
  bubble: {
    minWidth: 28,
    height: 28,
    borderRadius: radiusAdmin.pill,
    paddingHorizontal: 8,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleText: {
    fontSize: 13,
    fontWeight: '700',
    color: color.blue700,
  },
  stripText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 13 * 1.45,
    color: color.slate500,
  },
  stack: {
    gap: 8,
  },
  line: {
    textAlign: 'center',
    fontSize: 12.5,
    fontWeight: '400',
    lineHeight: 12.5 * 1.45,
    color: color.slate400,
  },
});
