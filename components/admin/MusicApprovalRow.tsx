import { Linking, StyleSheet, Text, View } from 'react-native';

import type { MusicApprovalItem } from '../../lib/admin-api';
import { borderWidth, color, radius, shadow, type } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { PressableScale } from '../ui/PressableScale';

function platformLabel(platform: string): string {
  if (platform === 'tiktok') return 'TikTok';
  if (platform === 'instagram') return 'Instagram';
  return platform;
}

function ageLabel(iso: string): string {
  const hours = Math.max(0, (Date.now() - new Date(iso).getTime()) / 36e5);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * One slideshow waiting for its song check. Open the live post, confirm the
 * sound is on it, approve. One tap, ten times a week.
 */
export function MusicApprovalRow(props: {
  item: MusicApprovalItem;
  busy: boolean;
  onApprove: () => void;
}) {
  const { item, busy, onApprove } = props;
  return (
    <View style={[styles.card, shadow.shadowCard]}>
      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={1}>
          {item.briefTitle}
        </Text>
        <Text style={styles.meta}>{ageLabel(item.markedAt)}</Text>
      </View>
      <Text style={styles.meta}>{item.creatorName} marked the song added</Text>
      <View style={styles.actionRow}>
        {item.postLinks.map((link) => (
          <PressableScale
            key={link.platform}
            accessibilityRole="link"
            onPress={() => void Linking.openURL(link.url)}
            style={styles.linkChip}
          >
            <Text style={styles.linkText}>{platformLabel(link.platform)}</Text>
          </PressableScale>
        ))}
        <View style={styles.spacer} />
        <Button size="sm" variant="primary" icon="check" disabled={busy} onPress={onApprove}>
          Approve
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.white,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flexShrink: 1,
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
  },
  meta: {
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.slate500,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  spacer: { flex: 1 },
  linkChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
  },
  linkText: {
    fontSize: type.size.chip,
    fontWeight: '700',
    color: color.blue700,
  },
});
