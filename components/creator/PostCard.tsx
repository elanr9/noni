import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { supabase } from '../../lib/supabase';
import {
  parseAssignmentMetrics,
  type AssignmentWithBrief,
  type Brief,
} from '../../lib/tasks-api';
import { color, radius, type } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { MediaCard } from '../ui/MediaCard';
import { PressableScale } from '../ui/PressableScale';
import { FormatTag, TypeTag } from './Chips';

/** §6.6 number formatting, k/M branches. */
export function formatViews(views: number): string {
  if (views >= 1_000_000) return `${(views / 1e6).toFixed(views >= 1e7 ? 0 : 1)}M`;
  if (views >= 1000) return `${(views / 1000).toFixed(views >= 10000 ? 0 : 1)}k`;
  return `${views}`;
}

/** Script blocks drive clips and slides everywhere (SCREENS §3, §3b). */
export function scriptBlocks(script: string | null): string[] {
  return (script ?? '')
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * There is no duration column; estimate a reel's runtime from the script
 * word count, and read slideshows as a slide count.
 */
export function estimateDurationLabel(brief: Brief): string | undefined {
  if (brief.format === 'photo_carousel') {
    const n = scriptBlocks(brief.script).length;
    return n > 0 ? `${n} ${n === 1 ? 'slide' : 'slides'}` : undefined;
  }
  const words = (brief.script ?? '').split(/\s+/).filter(Boolean).length;
  if (words === 0) return undefined;
  const seconds = Math.max(8, Math.min(90, Math.round(words * 0.4)));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** "@handle" parsed off the brief's example url; briefs store no handle column. */
export function exampleHandle(url: string | null): string | null {
  if (url === null || url.length === 0) return null;
  const at = /@([A-Za-z0-9._-]+)/.exec(url);
  if (at) return `@${at[1]}`;
  const ig = /instagram\.com\/([A-Za-z0-9._-]+)/.exec(url);
  if (ig && ig[1] !== 'p' && ig[1] !== 'reel') return `@${ig[1]}`;
  return null;
}

export type PostTypeMeta = { key: string; label: string };

const postTypeCache = new Map<string, PostTypeMeta>();

/** post_types row behind brief.post_type_id, cached per id for the session. */
export function usePostTypeMeta(postTypeId: string | null): PostTypeMeta | null {
  const [meta, setMeta] = useState<PostTypeMeta | null>(
    postTypeId !== null ? (postTypeCache.get(postTypeId) ?? null) : null,
  );

  useEffect(() => {
    if (postTypeId === null) {
      setMeta(null);
      return;
    }
    const hit = postTypeCache.get(postTypeId);
    if (hit !== undefined) {
      setMeta(hit);
      return;
    }
    let cancelled = false;
    void supabase
      .from('post_types')
      .select('key, label')
      .eq('id', postTypeId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || data === null) return;
        postTypeCache.set(postTypeId, data);
        setMeta(data);
      });
    return () => {
      cancelled = true;
    };
  }, [postTypeId]);

  return meta;
}

export interface PostCardProps {
  assignment: AssignmentWithBrief;
  /** Swap is offered on untouched posts, today only. */
  showSwap: boolean;
  onOpen: () => void;
  onRecord: () => void;
  onSwap: () => void;
  onSee: () => void;
  onFix: () => void;
  /** Changes-requested chip and See feedback both land in messages. */
  onFeedback: () => void;
}

function StatusPill({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

/**
 * The Home hero card (SCREENS §1): MediaCard hero fill, FormatTag + TypeTag
 * on the media via chips, duration pill, title on the scrim, footer by status.
 */
export function PostCard({
  assignment,
  showSwap,
  onOpen,
  onRecord,
  onSwap,
  onSee,
  onFix,
  onFeedback,
}: PostCardProps) {
  const brief = assignment.briefs;
  const slideshow = brief.format === 'photo_carousel';
  const typeMeta = usePostTypeMeta(brief.post_type_id);
  const metrics = parseAssignmentMetrics(assignment.metrics);

  const assigned = assignment.status === 'assigned';
  const pending =
    assignment.status === 'submitted' || assignment.status === 'recorded';
  const done =
    assignment.status === 'posted' || assignment.status === 'approved';
  const changes = assignment.status === 'changes_requested';

  return (
    <MediaCard
      variant="hero"
      fill
      title={brief.title}
      format={slideshow ? 'slideshow' : 'reel'}
      duration={estimateDurationLabel(brief)}
      chips={
        <View style={styles.chipRow}>
          <FormatTag format={brief.format} />
          {typeMeta !== null ? (
            <TypeTag label={typeMeta.label} typeKey={typeMeta.key} />
          ) : null}
        </View>
      }
      onPress={onOpen}
    >
      {assigned && (
        <View style={styles.footerRow}>
          <Button
            variant="primary"
            size="lg"
            icon={slideshow ? 'images' : 'video'}
            onPress={onRecord}
            style={styles.grow}
          >
            {slideshow ? 'Create' : 'Record'}
          </Button>
          {showSwap && (
            <Button variant="tint" size="lg" icon="rotate-ccw" onPress={onSwap}>
              Swap
            </Button>
          )}
        </View>
      )}

      {pending && (
        <View style={styles.footerRow}>
          <StatusPill label="In review" fg={color.amber} bg={color.amberSoft} />
          <Text style={styles.footerNote} numberOfLines={1}>
            Sent for approval
          </Text>
          <Button variant="ghost" size="sm" onPress={onSee}>
            See it
          </Button>
        </View>
      )}

      {done && (
        <View style={styles.footerRow}>
          <StatusPill label="Posted" fg={color.green} bg={color.greenSoft} />
          <Text style={styles.footerNote} numberOfLines={1}>
            {metrics.views !== undefined
              ? `${formatViews(metrics.views)} views`
              : ''}
          </Text>
          <Button variant="ghost" size="sm" onPress={onSee}>
            See it
          </Button>
        </View>
      )}

      {changes && (
        <View style={styles.changesCol}>
          <View style={styles.footerRow}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Changes requested, open messages"
              onPress={onFeedback}
              style={[styles.pill, styles.pillButton]}
            >
              <Icon name="rotate-ccw" size={13} color={color.amber} />
              <Text style={[styles.pillText, { color: color.amber }]}>
                Changes requested
              </Text>
            </PressableScale>
          </View>
          <View style={styles.footerRow}>
            <Button variant="primary" size="md" onPress={onFix} style={styles.grow}>
              Fix it
            </Button>
            <Button
              variant="tint"
              size="md"
              icon="message-circle"
              onPress={onFeedback}
              style={styles.grow}
            >
              See feedback
            </Button>
          </View>
        </View>
      )}
    </MediaCard>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  changesCol: {
    gap: 10,
  },
  grow: {
    flex: 1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.amberSoft,
  },
  pillButton: {
    alignSelf: 'flex-start',
  },
  pillText: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    lineHeight: type.size.chip,
  },
  footerNote: {
    flex: 1,
    fontSize: type.size.chip,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
});
