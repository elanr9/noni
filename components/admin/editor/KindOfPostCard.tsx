// Briefs handoff stage 4: the first decision in the editor is the kind of
// post. Chips are the lane's types ordered by what the week still lacks;
// the clip or slide count follows from the pick.
import { StyleSheet, Text, View } from 'react-native';

import type { CampaignBriefItem, PostType } from '../../../lib/briefs-api';
import { color, postTypeTone, radiusAdmin, shadow } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export type TypeSuggestion = {
  type: PostType;
  /** Rows the week still expects of this type; zero when covered. */
  left: number;
};

/**
 * Ranks a lane's types by expected share minus the share already used
 * this week. Expected share comes from default_week_count; used share
 * from the week's rows that already carry a type.
 */
export function rankTypeSuggestions(
  postTypes: PostType[],
  family: 'video' | 'photo_carousel',
  weekRows: CampaignBriefItem[],
): TypeSuggestion[] {
  const laneTypes = postTypes.filter((t) => t.family === family);
  if (laneTypes.length === 0) return [];
  const laneRows = weekRows.filter(
    (r) => (r.briefs.post_types?.family ?? r.briefs.format) === family,
  );
  const usedById = new Map<string, number>();
  for (const row of laneRows) {
    const id = row.briefs.post_type_id;
    if (id) usedById.set(id, (usedById.get(id) ?? 0) + 1);
  }
  const totalWeight = laneTypes.reduce((s, t) => s + t.default_week_count, 0);
  const totalRows = laneRows.length;
  const shareOf = (type: PostType): number =>
    totalWeight > 0 ? type.default_week_count / totalWeight : 1 / laneTypes.length;

  // Largest remainder so the expected rows always sum to the lane's rows.
  const expectedRows = new Map<string, number>();
  let assigned = 0;
  const remainders: { id: string; frac: number }[] = [];
  for (const type of laneTypes) {
    const exact = shareOf(type) * totalRows;
    const base = Math.floor(exact);
    expectedRows.set(type.id, base);
    assigned += base;
    remainders.push({ id: type.id, frac: exact - base });
  }
  remainders.sort((a, b) => b.frac - a.frac);
  for (let i = 0; assigned < totalRows && remainders.length > 0; i += 1) {
    const { id } = remainders[i % remainders.length];
    expectedRows.set(id, (expectedRows.get(id) ?? 0) + 1);
    assigned += 1;
  }

  return laneTypes
    .map((type) => {
      const used = usedById.get(type.id) ?? 0;
      const usedShare = totalRows > 0 ? used / totalRows : 0;
      return {
        type,
        gap: shareOf(type) - usedShare,
        left: Math.max(0, (expectedRows.get(type.id) ?? 0) - used),
      };
    })
    .sort((a, b) => b.gap - a.gap || a.type.sort_order - b.type.sort_order)
    .map(({ type, left }) => ({ type, left }));
}

function toneFor(key: string): { bg: string; fg: string } {
  return key in postTypeTone
    ? postTypeTone[key as keyof typeof postTypeTone]
    : { bg: color.blue100, fg: color.blue700 };
}

function hintFor(type: PostType, family: 'video' | 'photo_carousel'): string {
  const single = type.min_points === type.max_points && type.max_points === 1;
  const unit = family === 'photo_carousel'
    ? single ? 'slide' : 'slides'
    : single ? 'point' : 'points';
  const count =
    type.min_points === type.max_points
      ? `${type.min_points}`
      : `${type.min_points} to ${type.max_points}`;
  if (family === 'photo_carousel') {
    return `Cover, ${count} ${unit}, close. The slide count and the steps follow from it.`;
  }
  return `Hook, ${count} ${unit}, outro. The clip count and the steps follow from it.`;
}

export interface KindOfPostCardProps {
  suggestions: TypeSuggestion[];
  family: 'video' | 'photo_carousel';
  selectedId: string | null;
  onSelect: (type: PostType) => void;
}

export function KindOfPostCard({
  suggestions,
  family,
  selectedId,
  onSelect,
}: KindOfPostCardProps) {
  const selected = suggestions.find((s) => s.type.id === selectedId)?.type ?? null;
  return (
    <View style={[styles.card, shadow.shadowCard]}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Kind of post</Text>
        <View style={styles.suggested}>
          <Text style={styles.suggestedText}>Suggested</Text>
          <Icon name="sparkles" size={12} color={color.blue700} />
        </View>
      </View>
      <View style={styles.chips}>
        {suggestions.map(({ type, left }) => {
          const on = type.id === selectedId;
          const tone = toneFor(type.key);
          return (
            <PressableScale
              key={type.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onSelect(type)}
              style={[
                styles.chip,
                on
                  ? { backgroundColor: tone.bg, borderColor: tone.fg }
                  : styles.chipOff,
              ]}
            >
              <Text style={[styles.chipText, { color: on ? tone.fg : color.slate500 }]}>
                {type.label}
              </Text>
              {left > 0 ? (
                <Text
                  style={[styles.chipLeft, { color: on ? tone.fg : color.slate400 }]}
                >
                  {`${left} left`}
                </Text>
              ) : null}
            </PressableScale>
          );
        })}
      </View>
      {selected ? <Text style={styles.hint}>{hintFor(selected, family)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 15,
    gap: 12,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: color.slate500,
  },
  suggested: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  suggestedText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.blue700,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: radiusAdmin.pill,
    borderWidth: 1.5,
  },
  chipOff: {
    backgroundColor: color.fillQuiet,
    borderColor: color.fillQuiet,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  chipLeft: {
    fontSize: 11,
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 13 * 1.45,
    color: color.slate500,
  },
});
