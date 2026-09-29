// Admin handoff §6: one stamped row per post, five states. Format is
// never repeated on the row; the lane states it.
import { StyleSheet, Text, View } from 'react-native';

import {
  briefDisplayTitle,
  parseTalkingPoints,
  type BriefWithType,
  type BriefSendState,
} from '../../../lib/briefs-api';
import { color, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { PostTypeChip } from '../shared';

export type GridRowState = 'empty' | 'partial' | 'filled' | 'complete' | 'killed';

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

const titleOf = briefDisplayTitle;

export interface BriefRowProps {
  /** 1-based position inside the lane, rendered "01". */
  index: number;
  brief: BriefWithType;
  state: GridRowState;
  disabled?: boolean;
  /** Set once the brief went out to creators; the row reads as sent or live. */
  sent?: BriefSendState | null;
  onPress: () => void;
}

/** "Live · 2 creators" once anything posted, otherwise "Sent to 2 creators". */
export function sentLine(sent: BriefSendState): string {
  const who = sent.creators === 1 ? '1 creator' : `${sent.creators} creators`;
  if (sent.posted > 0) {
    return sent.posted === sent.creators ? `Live · ${who}` : `Live · ${sent.posted} of ${who}`;
  }
  return `Sent to ${who}`;
}

export function BriefRow({
  index,
  brief,
  state,
  disabled = false,
  sent = null,
  onPress,
}: BriefRowProps) {
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
        accessibilityLabel={`Post ${indexLabel}, empty`}
        disabled={disabled}
        onPress={onPress}
        style={[styles.row, styles.rowEmpty]}
      >
        <Text style={styles.index}>{indexLabel}</Text>
        <View style={styles.emptyBody}>
          {postType ? (
            <PostTypeChip typeKey={postType.key} label={postType.label} />
          ) : null}
          <Text style={styles.emptyText}>Empty</Text>
        </View>
        <Icon name="plus" size={17} color={color.slate300} />
      </PressableScale>
    );
  }

  const isLive = sent !== null && sent.posted > 0;
  const statusLine =
    sent !== null
      ? sentLine(sent)
      : state === 'partial'
        ? progressLine(brief)
        : state === 'filled'
          ? 'Needs review'
          : 'Complete';
  const title = titleOf(brief);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${statusLine}`}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.row,
        styles.rowWorked,
        shadow.shadowCard,
        sent !== null && styles.rowSent,
        isLive && styles.rowLive,
      ]}
    >
      {sent !== null ? (
        <View style={[styles.sentBadge, isLive && styles.liveBadge]}>
          <Icon
            name={isLive ? 'play' : 'send'}
            size={11}
            color={isLive ? color.green : color.blue700}
          />
        </View>
      ) : (
        <Text style={styles.index}>{indexLabel}</Text>
      )}
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
              sent !== null && !isLive && styles.statusSent,
            ]}
            numberOfLines={1}
          >
            {statusLine}
          </Text>
        </View>
      </View>
      {sent !== null ? (
        <View style={styles.viewPill}>
          <Text style={styles.viewPillText}>{isLive ? 'View post' : 'View'}</Text>
          <Icon name="chevron-right" size={13} color={color.blue700} />
        </View>
      ) : state === 'complete' ? (
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
  statusSent: {
    color: color.blue700,
  },
  rowSent: {
    borderWidth: 1,
    borderColor: color.blue200,
    backgroundColor: color.blue50,
  },
  rowLive: {
    borderColor: color.greenSoft,
    backgroundColor: color.white,
  },
  sentBadge: {
    width: 20,
    height: 20,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBadge: {
    backgroundColor: color.greenSoft,
  },
  viewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 5,
    paddingLeft: 10,
    paddingRight: 6,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue100,
  },
  viewPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.blue700,
  },
  emptyBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '600',
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
