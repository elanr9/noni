import { StyleSheet, Text, View } from 'react-native';

import { borderWidth, color, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { CreatorAvatar } from '../shared';
import { PressableScale } from '../../ui/PressableScale';
import { StatBlock } from './StatBlock';

export interface CreatorCardProps {
  name: string;
  /** Preferred linked handle; null renders a quiet placeholder. */
  handle: string | null;
  avatarUri: string | null;
  earned: string | null;
  posts: string;
  views: string;
  onPress: () => void;
}

/**
 * Admin handoff §10 — one card per creator: 44px profile photo, name,
 * @handle, three stat blocks on off-white. Every card is the same height.
 */
export function CreatorCard({
  name,
  handle,
  avatarUri,
  earned,
  posts,
  views,
  onPress,
}: CreatorCardProps) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
      onPress={onPress}
      style={[styles.card, shadow.shadowCard]}
    >
      <View style={styles.head}>
        <CreatorAvatar uri={avatarUri} name={name} size={44} />
        <View style={styles.names}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.handle} numberOfLines={1}>
            {handle !== null ? `@${handle}` : 'No handle yet'}
          </Text>
        </View>
      </View>
      <View style={styles.stats}>
        {earned !== null ? <StatBlock label="Earned" value={earned} /> : null}
        <StatBlock label="Posts" value={posts} />
        <StatBlock label="Views" value={views} />
      </View>
    </PressableScale>
  );
}

/** Fixed card height so the roster scrolls as one rhythm. */
export const CREATOR_CARD_HEIGHT = 132;

const styles = StyleSheet.create({
  card: {
    height: CREATOR_CARD_HEIGHT,
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    padding: 14,
    gap: 12,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  names: {
    flex: 1,
    gap: 1,
  },
  name: {
    fontSize: type.size.body,
    fontWeight: '700',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  handle: {
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate400,
  },
  stats: {
    flexDirection: 'row',
    gap: 8,
  },
});
