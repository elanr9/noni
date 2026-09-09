import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { LibraryItem } from '../../../lib/library-api';
import { borderWidth, color, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PostThumb } from '../shared';
import { shortDate } from '../LibraryItemCard';
import { MakeButton } from './MakeButton';

export interface ReferenceCardProps {
  item: LibraryItem;
  onPress: () => void;
  onLongPress: () => void;
  /** Only wired when the row already became a post. */
  onMetaPress?: () => void;
  make?: { busy: boolean; disabled: boolean; onPress: () => void };
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

/** 46x62 thumb, title, "@handle · TikTok", made meta on used rows, Make. */
export function ReferenceCard({ item, onPress, onLongPress, onMetaPress, make }: ReferenceCardProps) {
  const resolving = !item.thumbnail_url && !item.text;
  const title = item.text?.trim() || item.url?.replace(/^https?:\/\/(www\.)?/, '') || '';
  const handle = handleOf(item.url);
  const platform = platformOf(item.url);
  const sub = [handle ? `@${handle}` : null, platform].filter(Boolean).join(' · ');
  const used = item.used_count > 0;
  const date = shortDate(item.last_used_at);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.card, shadow.shadowCard]}
    >
      {resolving ? (
        <View style={styles.thumbPending}>
          <ActivityIndicator size="small" color={color.slate300} />
        </View>
      ) : (
        <PostThumb uri={item.thumbnail_url} format="video" width={46} height={62} />
      )}
      <View style={styles.body}>
        <Text style={[styles.title, resolving && styles.titleMuted]} numberOfLines={1}>
          {resolving ? 'Fetching title' : title}
        </Text>
        {sub.length > 0 && (
          <Text style={styles.sub} numberOfLines={1}>
            {sub}
          </Text>
        )}
        {used && (
          <Pressable
            onPress={onMetaPress}
            disabled={onMetaPress === undefined}
            hitSlop={{ top: 6, bottom: 6 }}
            style={styles.metaRow}
          >
            <Text style={styles.meta} numberOfLines={1}>
              {date ? `Used ${item.used_count}x · ${date}` : `Used ${item.used_count}x`}
            </Text>
            {onMetaPress !== undefined && (
              <Icon name="chevron-right" size={12} color={color.blue700} />
            )}
          </Pressable>
        )}
      </View>
      {make !== undefined && (
        <MakeButton
          label={used ? 'Again' : 'Make'}
          busy={make.busy}
          disabled={make.disabled}
          onPress={make.onPress}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 10,
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  thumbPending: {
    width: 46,
    height: 62,
    borderRadius: 9,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: color.ink,
  },
  titleMuted: {
    color: color.slate400,
  },
  sub: {
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate400,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  meta: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.blue700,
  },
});
