import { Pressable, StyleSheet, Text, View } from 'react-native';

import { parseTalkingPoints, type BriefFormat } from '../../../lib/briefs-api';
import type { LibraryItemWithBriefs, ReadyBrief } from '../../../lib/library-api';
import { borderWidth, color, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { PostThumb, PostTypeChip } from '../shared';
import { MakeButton } from './MakeButton';

export interface ReadyPostCardProps {
  item: LibraryItemWithBriefs;
  /** The lane this card shows; the other lane's post is what Create makes. */
  family: BriefFormat;
  onOpenBrief: (briefId: string) => void;
  /** References: open the original link. */
  onOpenSource?: () => void;
  onLongPress: () => void;
  /** Makes the other format; hidden once both exist. */
  createOther?: { busy: boolean; disabled: boolean; onPress: () => void };
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

/** The line under the title: the spoken hook for a reel, the first slide for a slideshow. */
function previewOf(brief: ReadyBrief, family: BriefFormat): string | null {
  const first = parseTalkingPoints(brief.talking_points)[0]?.text?.trim() ?? null;
  if (family === 'video') return brief.hook?.trim() || first;
  return first || brief.caption?.split('\n')[0]?.trim() || null;
}

function ReadyRow({
  brief,
  family,
  onPress,
}: {
  brief: ReadyBrief;
  family: BriefFormat;
  onPress: () => void;
}) {
  const preview = previewOf(brief, family);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Open ${family === 'photo_carousel' ? 'slideshow' : 'reel'}`}
      onPress={onPress}
      style={styles.readyRow}
    >
      <View style={styles.laneGlyph}>
        <Icon
          name={family === 'photo_carousel' ? 'images' : 'video'}
          size={15}
          color={color.blue700}
          strokeWidth={2.2}
        />
      </View>
      <View style={styles.readyBody}>
        <View style={styles.readyMeta}>
          <Text style={styles.lane}>{family === 'photo_carousel' ? 'Slideshow' : 'Reel'}</Text>
          {brief.post_types !== null && (
            <PostTypeChip typeKey={brief.post_types.key} label={brief.post_types.label} />
          )}
        </View>
        <Text style={styles.readyTitle} numberOfLines={2}>
          {brief.title}
        </Text>
        {preview !== null && (
          <Text style={styles.preview} numberOfLines={2}>
            {preview}
          </Text>
        )}
      </View>
      <Icon name="chevron-right" size={16} color={color.slate300} />
    </PressableScale>
  );
}

/**
 * One captured idea or reference and the finished post the AI made from it in
 * this lane. The source is the small line on top; the ready post is a tappable
 * row that opens in the editor. Create makes the other format from it.
 */
export function ReadyPostCard({
  item,
  family,
  onOpenBrief,
  onOpenSource,
  onLongPress,
  createOther,
}: ReadyPostCardProps) {
  const isReference = item.source === 'reference';
  const handle = handleOf(item.url);
  const platform = platformOf(item.url);
  const sourceTitle = isReference
    ? item.text?.trim() || item.url?.replace(/^https?:\/\/(www\.)?/, '') || 'Reference'
    : item.text ?? '';
  const sourceSub = isReference
    ? [handle ? `@${handle}` : null, platform].filter(Boolean).join(' · ')
    : null;

  const brief = family === 'photo_carousel' ? item.carousel_brief : item.video_brief;
  const other = family === 'photo_carousel' ? item.video_brief : item.carousel_brief;

  return (
    <Pressable
      accessibilityRole="button"
      onLongPress={onLongPress}
      onPress={brief ? () => onOpenBrief(brief.id) : onOpenSource}
      style={[styles.card, shadow.shadowCard]}
    >
      <Pressable
        onPress={onOpenSource}
        disabled={onOpenSource === undefined}
        onLongPress={onLongPress}
        style={styles.source}
      >
        {isReference && (
          <PostThumb uri={item.thumbnail_url} format="video" width={34} height={45} />
        )}
        <View style={styles.sourceBody}>
          <Text style={styles.sourceLabel}>{isReference ? 'From reference' : 'From idea'}</Text>
          <Text style={styles.sourceTitle} numberOfLines={2}>
            {sourceTitle}
          </Text>
          {sourceSub !== null && sourceSub.length > 0 && (
            <Text style={styles.sourceSub} numberOfLines={1}>
              {sourceSub}
            </Text>
          )}
        </View>
        {createOther !== undefined && other === null && (
          <MakeButton
            label={family === 'photo_carousel' ? 'Create Reel' : 'Create Slideshow'}
            busy={createOther.busy}
            disabled={createOther.disabled}
            onPress={createOther.onPress}
          />
        )}
      </Pressable>

      {brief !== null && (
        <ReadyRow brief={brief} family={family} onPress={() => onOpenBrief(brief.id)} />
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
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
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
    fontSize: 13.5,
    fontWeight: '600',
    color: color.ink800,
    lineHeight: 13.5 * 1.35,
  },
  sourceSub: {
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate400,
  },
  readyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  laneGlyph: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.blue50,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  readyBody: {
    flex: 1,
    gap: 4,
  },
  readyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lane: {
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.blue700,
  },
  readyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: color.ink,
    lineHeight: 15 * 1.35,
  },
  preview: {
    fontSize: 13,
    fontWeight: '500',
    color: color.slate500,
    lineHeight: 13 * 1.4,
  },
});
