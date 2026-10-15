import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { FORMAT_LABEL } from '../../../lib/brief-copy';
import { toMediaFormat } from '../../../lib/briefs-api';
import type { LibraryItemWithBriefs, ReadyBrief } from '../../../lib/library-api';
import { activeStepIndex, isNewFormat, makeSteps, previewOf, type MakePhase } from '../../../lib/library-make';
import { borderWidth, color, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { Icon, type IconName } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { PostThumb, PostTypeChip } from '../shared';

/** A make running or finished badly for this row, on this device. */
export type MakeJob = { phase: MakePhase | null; error: string | null };

export interface ReadyPostCardProps {
  item: LibraryItemWithBriefs;
  /** The made post this card shows; null while making or when it never got made. */
  brief: ReadyBrief | null;
  job: MakeJob | null;
  /** References: open the original link. */
  onOpenSource?: () => void;
  onOpen: (brief: ReadyBrief) => void;
  onAdd: (brief: ReadyBrief) => void;
  adding: boolean;
  /** Redo on a made post, Retry on one that never got made. */
  onRedo: () => void;
  onDelete: () => void;
  /** Another make or add is running; actions wait. */
  locked: boolean;
}

function platformOf(url: string | null): string | null {
  if (!url) return null;
  if (/tiktok\.com/i.test(url)) return 'TikTok';
  if (/instagram\.com/i.test(url)) return 'Instagram';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function handleOf(url: string | null): string | null {
  const match = url?.match(/@([A-Za-z0-9._]+)/);
  return match ? match[1] : null;
}

function Action({
  icon,
  label,
  onPress,
  disabled,
  tone = 'quiet',
  busy = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'quiet' | 'tint' | 'danger';
  busy?: boolean;
}) {
  const fg = tone === 'tint' ? color.blue700 : tone === 'danger' ? color.slate500 : color.ink;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      onPress={onPress}
      style={[styles.action, tone === 'tint' && styles.actionTint, (disabled || busy) && !busy && styles.actionOff]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : <Icon name={icon} size={14} color={fg} strokeWidth={2.3} />}
      {label ? <Text style={[styles.actionText, { color: fg }]}>{label}</Text> : null}
    </PressableScale>
  );
}

function usePulse() {
  const [v] = useState(() => new Animated.Value(0.4));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
}

/** The real steps of a make, done, running or still to come. */
function LiveSteps({ source, phase }: { source: 'idea' | 'reference'; phase: MakePhase | null }) {
  const steps = makeSteps(source, phase);
  const at = activeStepIndex(steps, phase);
  const pulse = usePulse();
  return (
    <View style={styles.steps} accessibilityRole="progressbar" accessibilityLabel={steps[at]?.label} accessibilityLiveRegion="polite">
      {steps.map((s, i) => {
        const done = i < at;
        const active = i === at;
        return (
          <View key={s.id} style={styles.stepRow}>
            <View style={[styles.stepMark, done && styles.stepDone]}>
              {done ? (
                <Icon name="check" size={11} color={color.white} strokeWidth={3} />
              ) : active ? (
                <Animated.View style={[styles.stepDot, { opacity: pulse }]} />
              ) : (
                <View style={styles.stepTodo} />
              )}
            </View>
            <Text style={[styles.stepText, done && styles.stepTextDone, active && styles.stepTextActive]}>{s.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * One idea or reference and the post the AI made from it: the cover in bold,
 * format and post type, the first slide lines, what a remix kept, and Open,
 * Add to week, Redo and Delete. While making it shows the live steps; a post
 * that never got made shows why and Retry.
 */
export function ReadyPostCard({ item, brief, job, onOpenSource, onOpen, onAdd, adding, onRedo, onDelete, locked }: ReadyPostCardProps) {
  const isReference = item.source === 'reference';
  const handle = handleOf(item.url);
  const platform = platformOf(item.url);
  const sourceTitle = isReference ? item.text?.trim() || item.url?.replace(/^https?:\/\/(www\.)?/, '') || 'Reference' : (item.text ?? '');
  const sourceSub = isReference ? [handle ? `@${handle}` : null, platform].filter(Boolean).join(' · ') : null;
  const making = job !== null && job.error === null;
  const fresh = brief !== null && isNewFormat(brief);
  const preview = brief ? previewOf(brief) : null;
  const format = brief ? toMediaFormat(brief.format) : null;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={!brief || making}
      onPress={brief ? () => onOpen(brief) : undefined}
      style={[styles.card, shadow.shadowCard]}
    >
      <Pressable onPress={onOpenSource} disabled={onOpenSource === undefined} style={styles.source}>
        {isReference && <PostThumb uri={item.thumbnail_url} format="video" width={30} height={40} />}
        <View style={styles.sourceBody}>
          <Text style={styles.sourceLabel}>{isReference ? 'From reference' : 'From idea'}</Text>
          <Text style={styles.sourceTitle} numberOfLines={2}>
            {sourceTitle}
          </Text>
          {sourceSub ? (
            <Text style={styles.sourceSub} numberOfLines={1}>
              {sourceSub}
            </Text>
          ) : null}
          {isReference && item.notes?.trim() ? (
            <Text style={styles.sourceSub} numberOfLines={2}>
              {`Ours: ${item.notes.trim()}`}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {making ? (
        <View style={styles.body}>
          <Text style={styles.makingTitle}>{brief ? 'Making a fresh take' : 'Making your post'}</Text>
          <LiveSteps source={isReference ? 'reference' : 'idea'} phase={job.phase} />
        </View>
      ) : brief && preview ? (
        <View style={styles.body}>
          <View style={styles.meta}>
            <View style={styles.formatChip}>
              <Icon name={format === 'slideshow' ? 'images' : 'video'} size={12} color={color.blue700} strokeWidth={2.4} />
              <Text style={styles.formatText}>{format ? FORMAT_LABEL[format] : ''}</Text>
            </View>
            {brief.post_types ? <PostTypeChip typeKey={brief.post_types.key} label={brief.post_types.label} /> : null}
            {!fresh ? <Text style={styles.oldChip}>Old format</Text> : null}
          </View>
          <Text style={styles.cover} numberOfLines={3}>
            {preview.cover}
          </Text>
          {preview.lines.length > 0 ? (
            <View style={styles.lines}>
              {preview.lines.map((l, i) => (
                <Text key={i} style={styles.line} numberOfLines={1}>
                  {l}
                </Text>
              ))}
            </View>
          ) : null}
          {isReference && fresh && brief.why_it_works?.trim() ? (
            <Text style={styles.note} numberOfLines={2}>
              {brief.why_it_works.trim()}
            </Text>
          ) : null}
          {job?.error ? <Text style={styles.error}>{job.error}</Text> : null}
          <View style={styles.actions}>
            <Action icon="pencil" label="Open" onPress={() => onOpen(brief)} disabled={locked} />
            {fresh ? <Action icon="plus" label="Add to week" tone="tint" busy={adding} onPress={() => onAdd(brief)} disabled={locked} /> : null}
            <Action icon="rotate-ccw" label={fresh ? 'Redo' : 'Remake'} onPress={onRedo} disabled={locked} />
            <View style={styles.flex} />
            <Action icon="trash-2" label="" tone="danger" onPress={onDelete} disabled={locked} />
          </View>
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.failRow}>
            <Icon name="circle-alert" size={15} color={color.slate400} />
            <Text style={styles.failText}>{job?.error ?? 'Not made yet'}</Text>
          </View>
          <View style={styles.actions}>
            <Action icon="rotate-ccw" label="Retry" tone="tint" onPress={onRedo} disabled={locked} />
            <View style={styles.flex} />
            <Action icon="trash-2" label="" tone="danger" onPress={onDelete} disabled={locked} />
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    overflow: 'hidden',
  },
  flex: {
    flex: 1,
  },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 9,
    backgroundColor: color.surfaceQuiet,
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
  },
  sourceBody: {
    flex: 1,
    gap: 2,
  },
  sourceLabel: {
    fontSize: type.size.micro11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: color.slate400,
  },
  sourceTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: color.ink800,
    lineHeight: 13 * 1.35,
  },
  sourceSub: {
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate400,
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 8,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  formatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue50,
  },
  formatText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.blue700,
  },
  oldChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
    color: color.slate500,
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
  },
  cover: {
    fontSize: 16.5,
    fontWeight: '800',
    color: color.ink,
    lineHeight: 16.5 * 1.3,
  },
  lines: {
    gap: 3,
  },
  line: {
    fontSize: 13,
    fontWeight: '500',
    color: color.slate500,
    lineHeight: 13 * 1.4,
  },
  note: {
    fontSize: type.size.label,
    fontWeight: '600',
    fontStyle: 'italic',
    color: color.slate400,
  },
  error: {
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate500,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    minWidth: 32,
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
  },
  actionTint: {
    backgroundColor: color.blue100,
  },
  actionOff: {
    opacity: 0.5,
  },
  actionText: {
    fontSize: type.size.label,
    fontWeight: '700',
  },
  makingTitle: {
    fontSize: type.size.bodySm,
    fontWeight: '800',
    color: color.ink,
  },
  steps: {
    gap: 7,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  stepMark: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.blue50,
  },
  stepDone: {
    backgroundColor: color.blue500,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.blue500,
  },
  stepTodo: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: color.slate300,
  },
  stepText: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate400,
  },
  stepTextDone: {
    color: color.slate500,
  },
  stepTextActive: {
    color: color.blue700,
    fontWeight: '700',
  },
  failRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  failText: {
    flex: 1,
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
  },
});
