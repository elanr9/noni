import { Linking, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { MusicApprovalItem } from '../../lib/admin-api';
import { formatAge } from '../../lib/admin-queue-map';
import { borderWidth, color, radiusAdmin, shadow, type } from '../../theme/tokens';
import { PostThumb } from './shared';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';

function platformLabel(platform: string): string {
  if (platform === 'tiktok') return 'TikTok';
  if (platform === 'instagram') return 'Instagram';
  return platform;
}

/**
 * Admin handoff §2 music row — one slideshow waiting for its song check.
 * A glance, then one tap on Approve.
 */
export function MusicApprovalRow(props: {
  item: MusicApprovalItem;
  busy: boolean;
  onApprove: () => void;
}) {
  const { item, busy, onApprove } = props;
  const router = useRouter();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.briefTitle} music approval`}
      onPress={() => router.push(`/(admin)/music/${item.assignment.id}`)}
      style={[styles.card, shadow.shadowCard]}
    >
      <PostThumb uri={null} format="photo_carousel" width={44} height={58} />
      <View style={styles.column}>
        <Text numberOfLines={1} style={styles.title}>
          {item.briefTitle}
        </Text>
        <Text numberOfLines={1} style={styles.meta}>
          {`${item.creatorName} · posted`}
        </Text>
        <View style={styles.musicRow}>
          <Icon name="music-2" size={13} color={color.blue600} />
          <Text numberOfLines={1} style={styles.musicText}>
            {`Song added ${formatAge(item.markedAt)}`}
          </Text>
        </View>
        {item.postLinks.length > 0 && (
          <View style={styles.linkRow}>
            {item.postLinks.map((link) => (
              <Text
                key={link.platform}
                accessibilityRole="link"
                onPress={() => void Linking.openURL(link.url)}
                style={styles.link}
              >
                {platformLabel(link.platform)}
              </Text>
            ))}
          </View>
        )}
      </View>
      <Button size="sm" variant="approve" icon="check" disabled={busy} onPress={onApprove}>
        Approve
      </Button>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  column: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  title: {
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
    letterSpacing: -0.2,
    color: color.ink,
  },
  meta: {
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
  musicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  musicText: {
    flexShrink: 1,
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
    color: color.blue600,
  },
  linkRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
  },
  link: {
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
    color: color.blue700,
  },
});
