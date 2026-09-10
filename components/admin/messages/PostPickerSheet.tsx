import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PostSummary } from '../../../lib/post-event-labels';
import { listPostSummaries, startOfCurrentWeekIso } from '../../../lib/post-events';
import { supabase } from '../../../lib/supabase';
import { borderWidth, color, radiusAdmin } from '../../../theme/tokens';
import { usePostThumb } from '../creator/useVideoThumb';
import { Sheet, SkeletonCard, Thumb, TypeChip, type TypeChipTone } from '../shared';

export type PostPickerSheetProps = {
  visible: boolean;
  onClose: () => void;
  companyId: string;
  creatorId: string;
  onPick: (summary: PostSummary) => void;
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const STATUS_CHIP: Record<string, { tone: TypeChipTone; label: string }> = {
  assigned: { tone: 'quiet', label: 'Assigned' },
  recorded: { tone: 'quiet', label: 'Recorded' },
  submitted: { tone: 'brand', label: 'In review' },
  changes_requested: { tone: 'warn', label: 'Sent back' },
  approved: { tone: 'good', label: 'Approved' },
  posted: { tone: 'good', label: 'Live' },
};

function weekdayOf(dateIso: string): string {
  const [y, m, d] = dateIso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return WEEKDAYS[new Date(y, m - 1, d).getDay()] ?? '';
}

function plusDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const next = new Date(y, m - 1, d + days);
  const mm = String(next.getMonth() + 1).padStart(2, '0');
  const dd = String(next.getDate()).padStart(2, '0');
  return `${next.getFullYear()}-${mm}-${dd}`;
}

async function loadCreatorPosts(companyId: string, creatorId: string): Promise<PostSummary[]> {
  const start = startOfCurrentWeekIso();
  const { data, error } = await supabase
    .from('assignments')
    .select('id')
    .eq('company_id', companyId)
    .eq('creator_id', creatorId)
    .gte('scheduled_date', start)
    .lt('scheduled_date', plusDaysIso(start, 14))
    .order('scheduled_date');
  if (error) throw error;
  const ids = (data ?? []).map((row) => row.id);
  const summaries = await listPostSummaries(companyId, ids);
  return ids.flatMap((id) => {
    const summary = summaries.get(id);
    return summary !== undefined ? [summary] : [];
  });
}

function PickerRow({
  summary,
  last,
  onPress,
}: {
  summary: PostSummary;
  last: boolean;
  onPress: () => void;
}) {
  const thumb = usePostThumb(summary.mediaPath, summary.format);
  const chip = STATUS_CHIP[summary.status];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.row, !last && styles.rowDivider]}
    >
      <Thumb uri={thumb} format={summary.format} width={36} height={48} radius={radiusAdmin.sm} />
      <View style={styles.text}>
        <Text numberOfLines={1} style={styles.title}>
          {summary.title}
        </Text>
        <Text numberOfLines={1} style={styles.meta}>
          {`${summary.typeLabel} \u00b7 ${weekdayOf(summary.scheduledDate)}`}
        </Text>
      </View>
      {chip !== undefined && <TypeChip tone={chip.tone}>{chip.label}</TypeChip>}
    </Pressable>
  );
}

export function PostPickerSheet({ visible, onClose, companyId, creatorId, onPick }: PostPickerSheetProps) {
  const key = `${companyId}:${creatorId}`;
  const [loaded, setLoaded] = useState<{ key: string; list: PostSummary[] } | null>(null);
  const posts = loaded !== null && loaded.key === key ? loaded.list : null;

  useEffect(() => {
    if (!visible) return;
    let live = true;
    loadCreatorPosts(companyId, creatorId)
      .then((list) => {
        if (live) setLoaded({ key, list });
      })
      .catch(() => {
        if (live) setLoaded({ key, list: [] });
      });
    return () => {
      live = false;
    };
  }, [visible, companyId, creatorId, key]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Attach a post"
      subtitle="This creator's posts for this week and next."
    >
      {posts === null ? (
        <View style={styles.skeletons}>
          <SkeletonCard height={56} />
          <SkeletonCard height={56} />
          <SkeletonCard height={56} />
        </View>
      ) : posts.length === 0 ? (
        <Text style={styles.empty}>No posts this week or next</Text>
      ) : (
        <View>
          {posts.map((summary, i) => (
            <PickerRow
              key={summary.assignmentId}
              summary={summary}
              last={i === posts.length - 1}
              onPress={() => onPick(summary)}
            />
          ))}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rowDivider: {
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: color.ink,
  },
  meta: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '500',
    color: color.slate400,
  },
  skeletons: {
    gap: 8,
  },
  empty: {
    marginVertical: 40,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
    color: color.slate400,
  },
});
