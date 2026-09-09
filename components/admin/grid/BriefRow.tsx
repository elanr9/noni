// Admin handoff §6: one stamped row per post, five states. Format is
// never repeated on the row; the lane states it.
import { Search } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import {
  parseTalkingPoints,
  type BriefWithType,
} from '../../../lib/briefs-api';
import { color, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { PostTypeChip } from '../shared';

export type GridRowState = 'empty' | 'partial' | 'filled' | 'complete' | 'killed';

/** Last review's overall score, stored on confirm. Never recomputed here. */
function aiScore(brief: BriefWithType): number | null {
  const raw = brief.review_result;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const scores = (raw as { scores?: unknown }).scores;
  if (scores === null || typeof scores !== 'object' || Array.isArray(scores)) return null;
  const overall = (scores as { overall?: unknown }).overall;
  return typeof overall === 'number' ? Math.round(overall) : null;
}

/** e.g. "Hook and 3 of 5 points" for a partial row. */
function progressLine(brief: BriefWithType): string {
  const points = parseTalkingPoints(brief.talking_points);
  const max = brief.post_types?.max_points ?? points.length;
  const hasHook = Boolean(brief.hook?.trim());
  const isSlideshow =
    (brief.post_types?.family ?? brief.format) === 'photo_carousel';
  if (isSlideshow) {
    return points.length === 0 ? 'Started' : `${points.length} of ${max} slides`;
  }
  if (!hasHook && points.length === 0) return 'Started';
  return `${hasHook ? 'Hook and ' : ''}${points.length} of ${max} points`;
}

const PLACEHOLDER_TITLE = 'Untitled post';

/** Stamped rows carry the placeholder title, so fall through to the phrase or hook. */
function titleOf(brief: BriefWithType): string {
  const title = brief.title.trim();
  return (
    (title !== PLACEHOLDER_TITLE ? title : '') ||
    brief.search_phrase?.trim() ||
    brief.hook?.trim() ||
    PLACEHOLDER_TITLE
  );
}

export interface BriefRowProps {
  /** 1-based position inside the lane, rendered "01". */
  index: number;
  brief: BriefWithType;
  state: GridRowState;
  disabled?: boolean;
  onPress: () => void;
}

export function BriefRow({ index, brief, state, disabled = false, onPress }: BriefRowProps) {
  const postType = brief.post_types;
  const indexLabel = String(index).padStart(2, '0');

  if (state === 'killed') {
    return (
      <View style={[styles.row, styles.rowKilled]}>
        <Text style={styles.index}>{indexLabel}</Text>
        <View style={styles.body}>
          <Text style={styles.killedTitle}>Left empty on purpose</Text>
          {brief.kill_reason ? (
            <Text style={styles.killedReason} numberOfLines={2}>
              {brief.kill_reason}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  if (state === 'empty') {
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Empty post, add a search phrase"
        disabled={disabled}
        onPress={onPress}
        style={[styles.row, styles.rowEmpty]}
      >
        <Text style={styles.index}>{indexLabel}</Text>
        <View style={styles.phraseRow}>
          <Search size={16} color={color.slate400} strokeWidth={2} />
          <Text style={styles.phrase} numberOfLines={1}>
            {brief.search_phrase?.trim()
              ? `"${brief.search_phrase.trim()}"`
              : 'Add a search phrase'}
          </Text>
        </View>
        <Icon name="plus" size={16} color={color.slate400} />
      </PressableScale>
    );
  }

  const score = state === 'complete' ? aiScore(brief) : null;
  const statusLine =
    state === 'partial'
      ? progressLine(brief)
      : state === 'filled'
        ? 'Needs review'
        : score !== null
          ? `AI score ${score}`
          : 'Complete';
  const title = titleOf(brief);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${statusLine}`}
      disabled={disabled}
      onPress={onPress}
      style={[styles.row, styles.rowWorked, shadow.shadowCard]}
    >
      <Text style={styles.index}>{indexLabel}</Text>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.metaRow}>
          {postType ? (
            <PostTypeChip typeKey={postType.key} label={postType.label} />
          ) : null}
          <Text
            style={[
              styles.status,
              state === 'partial' && styles.statusPartial,
              state === 'filled' && styles.statusFilled,
              state === 'complete' && styles.statusComplete,
            ]}
            numberOfLines={1}
          >
            {statusLine}
          </Text>
        </View>
      </View>
      {state === 'complete' ? (
        <Icon name="circle-check-big" size={19} color={color.green} />
      ) : (
        <Icon name="chevron-right" size={16} color={color.slate300} />
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: radiusAdmin.lg,
  },
  rowWorked: {
    backgroundColor: color.white,
  },
  rowEmpty: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.lineStrong,
  },
  rowKilled: {
    backgroundColor: color.fillQuiet,
  },
  index: {
    width: 20,
    fontSize: 12,
    fontWeight: '700',
    color: color.slate300,
    letterSpacing: type.tracking.flat,
  },
  body: {
    flex: 1,
    gap: 8,
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 16 * 1.3,
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  status: {
    flexShrink: 1,
    fontSize: 12,
  },
  statusPartial: {
    fontWeight: '600',
    color: color.slate500,
  },
  statusFilled: {
    fontWeight: '700',
    color: color.amber,
  },
  statusComplete: {
    fontWeight: '700',
    color: color.green,
  },
  phraseRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  phrase: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    color: color.slate400,
  },
  killedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: color.ink,
  },
  killedReason: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 13 * 1.45,
    color: color.slate500,
  },
});
