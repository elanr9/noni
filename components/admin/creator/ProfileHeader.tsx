import { StyleSheet, Text, View } from 'react-native';

import { color, type } from '../../../theme/tokens';
import { CreatorAvatar } from '../shared';
import { Icon } from '../../ui/Icon';

export interface ProfileHeaderProps {
  name: string;
  avatarUri: string | null;
  credential: string | null;
  tiktokHandle: string | null;
  instagramHandle: string | null;
  earned: string | null;
  posts: string;
  views: string;
}

/**
 * Admin handoff §10 — Instagram-shaped profile top: 64px photo beside three
 * stats, then the credential line and both linked handles.
 */
export function ProfileHeader({
  name,
  avatarUri,
  credential,
  tiktokHandle,
  instagramHandle,
  earned,
  posts,
  views,
}: ProfileHeaderProps) {
  return (
    <View style={styles.block}>
      <View style={styles.topRow}>
        <CreatorAvatar uri={avatarUri} name={name} size={64} />
        <View style={styles.stats}>
          {earned !== null ? <Stat value={earned} label="Earned" /> : null}
          <Stat value={posts} label="Posts" />
          <Stat value={views} label="Views" />
        </View>
      </View>

      {credential !== null && credential.length > 0 && (
        <Text style={styles.credential}>{credential}</Text>
      )}

      <View style={styles.handles}>
        <Handle icon="music-2" handle={tiktokHandle} />
        <Handle icon="at-sign" handle={instagramHandle} />
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Handle({
  icon,
  handle,
}: {
  icon: 'music-2' | 'at-sign';
  handle: string | null;
}) {
  return (
    <View style={styles.handleRow}>
      <Icon name={icon} size={13} color={handle !== null ? color.blue600 : color.slate300} />
      <Text style={[styles.handleText, handle === null && styles.handleMissing]}>
        {handle !== null ? `@${handle}` : 'Not linked yet'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  stats: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingRight: 8,
  },
  stat: {
    alignItems: 'center',
    gap: 1,
  },
  statValue: {
    fontSize: type.size.card,
    fontWeight: '700',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  statLabel: {
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.slate400,
    textTransform: 'uppercase',
    letterSpacing: type.tracking.label,
  },
  credential: {
    fontSize: type.size.meta,
    fontWeight: '600',
    color: color.slate500,
    lineHeight: type.size.meta * type.leading.snug,
  },
  handles: {
    flexDirection: 'row',
    gap: 14,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  handleText: {
    fontSize: type.size.chip,
    fontWeight: '700',
    color: color.blue700,
  },
  handleMissing: {
    color: color.slate400,
    fontWeight: '600',
  },
});
