import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { PostType } from '../../../lib/briefs-api';
import { color, radiusAdmin, shadow } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { SheetShell } from '../../ui/SheetShell';
import { PostTypeChip } from '../shared';

function hintFor(type: PostType): string {
  if (type.key === 'seven_second') return 'One clip, about 7 seconds, one idea';
  if (type.clip_structure === 'single_clip') return 'One clip that loops';
  const slideshow = type.family === 'photo_carousel';
  const count =
    type.min_points === type.max_points
      ? `${type.min_points}`
      : `${type.min_points} to ${type.max_points}`;
  const unit = slideshow
    ? type.max_points === 1 ? 'slide' : 'slides'
    : type.max_points === 1 ? 'clip' : 'clips';
  return slideshow ? `Cover, ${count} ${unit}, close` : `Hook, ${count} ${unit}, outro`;
}

function usedLine(count: number): string {
  if (count === 0) return 'Nothing this week uses it yet';
  return count === 1 ? 'Used once this week' : `Used ${count} times this week`;
}

function TypeRow(props: {
  type: PostType;
  selected: boolean;
  usedCount: number | null;
  divider: boolean;
  onPress: () => void;
}): JSX.Element {
  const { type, selected, usedCount, divider, onPress } = props;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.row, divider && styles.rowDivider]}
    >
      <View style={styles.rowBody}>
        <View style={styles.chipWrap}>
          <PostTypeChip typeKey={type.key} label={type.label} />
          {usedCount !== null && usedCount > 0 ? (
            <Text style={styles.usedCount}>{usedCount}</Text>
          ) : null}
        </View>
        <Text style={styles.hint}>{hintFor(type)}</Text>
      </View>
      {selected ? <Icon name="check" size={18} color={color.blue500} /> : null}
    </PressableScale>
  );
}

/**
 * Suggested kind on top, every other kind in the lane below. Opens first on
 * a slot with no type; swiping down or tapping the scrim closes it and the
 * header chip reopens it.
 */
export function KindOfPostSheet(props: {
  visible: boolean;
  postTypes: PostType[];
  family: 'video' | 'photo_carousel';
  selectedId: string | null;
  /** The kind this week is shortest on. */
  suggestedId: string | null;
  /** post_type_id of every post already in this week, for the usage counts. */
  weekTypeIds: (string | null)[];
  onSelect: (postType: PostType) => void;
  onClose: () => void;
}): JSX.Element {
  const { visible, postTypes, family, selectedId, suggestedId, weekTypeIds, onSelect, onClose } =
    props;
  const lane = postTypes.filter((t) => t.family === family);
  const suggested = lane.find((t) => t.id === suggestedId) ?? null;
  const rest = suggested ? lane.filter((t) => t.id !== suggested.id) : lane;
  const inWeek = weekTypeIds.length > 0;
  const countFor = (type: PostType): number | null =>
    inWeek ? weekTypeIds.filter((id) => id === type.id).length : null;

  return (
    <SheetShell visible={visible} onClose={onClose}>
      <Text style={styles.title}>Kind of post</Text>

      {suggested ? (
        <>
          <Text style={styles.section}>SUGGESTED</Text>
          <PressableScale
            accessibilityRole="button"
            accessibilityState={{ selected: suggested.id === selectedId }}
            onPress={() => onSelect(suggested)}
            style={[styles.suggestedCard, shadow.shadowCard]}
          >
            <View style={styles.rowBody}>
              <View style={styles.chipWrap}>
                <PostTypeChip typeKey={suggested.key} label={suggested.label} />
              </View>
              <Text style={styles.hint}>{hintFor(suggested)}</Text>
              {inWeek ? (
                <Text style={styles.reason}>{usedLine(countFor(suggested) ?? 0)}</Text>
              ) : null}
            </View>
            {suggested.id === selectedId ? (
              <Icon name="check" size={18} color={color.blue500} />
            ) : (
              <Icon name="chevron-right" size={18} color={color.blue500} />
            )}
          </PressableScale>
          <Text style={styles.section}>ALL KINDS</Text>
        </>
      ) : null}

      <View style={[styles.card, shadow.shadowCard]}>
        {rest.map((t, i) => (
          <TypeRow
            key={t.id}
            type={t}
            selected={t.id === selectedId}
            usedCount={countFor(t)}
            divider={i > 0}
            onPress={() => onSelect(t)}
          />
        ))}
      </View>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: color.ink,
    marginBottom: 14,
  },
  section: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: color.slate500,
    marginBottom: 8,
    marginTop: 4,
  },
  suggestedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    borderWidth: 1.5,
    borderColor: color.blue500,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 18,
  },
  card: {
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
  rowBody: { flex: 1, gap: 6 },
  chipWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  usedCount: {
    fontSize: 12,
    fontWeight: '600',
    color: color.slate500,
  },
  hint: {
    fontSize: 13,
    fontWeight: '400',
    color: color.slate500,
  },
  reason: {
    fontSize: 13,
    fontWeight: '600',
    color: color.blue500,
  },
});
