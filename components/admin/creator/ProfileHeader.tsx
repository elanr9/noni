import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { color, type } from '../../../theme/tokens';
import { CreatorAvatar } from '../shared';
import { Icon } from '../../ui/Icon';

type SocialPlatform = 'tiktok' | 'instagram';

/**
 * Instagram exposes a username deep link, so try the app first. TikTok's scheme
 * only takes numeric ids, so its https profile URL (a universal link) opens the app.
 */
async function openSocialProfile(platform: SocialPlatform, handle: string): Promise<void> {
  const clean = handle.replace(/^@/, '');
  if (platform === 'tiktok') {
    await Linking.openURL(`https://www.tiktok.com/@${clean}`);
    return;
  }
  const appUrl = `instagram://user?username=${clean}`;
  const canOpenApp = await Linking.canOpenURL(appUrl).catch(() => false);
  await Linking.openURL(canOpenApp ? appUrl : `https://www.instagram.com/${clean}/`);
}

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
        <Handle platform="tiktok" handle={tiktokHandle} />
        <Handle platform="instagram" handle={instagramHandle} />
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

function Handle({ platform, handle }: { platform: SocialPlatform; handle: string | null }) {
  const label = platform === 'tiktok' ? 'TikTok' : 'Instagram';
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={handle !== null ? `Open @${handle} on ${label}` : `${label} not linked yet`}
      disabled={handle === null}
      onPress={() => {
        if (handle !== null) void openSocialProfile(platform, handle);
      }}
      style={({ pressed }) => [styles.handleRow, pressed && styles.handlePressed]}
    >
      <Icon
        name={platform === 'tiktok' ? 'music-2' : 'instagram'}
        size={13}
        color={handle !== null ? color.blue600 : color.slate300}
      />
      <Text style={[styles.handleText, handle === null && styles.handleMissing]}>
        {handle !== null ? `@${handle}` : 'Not linked yet'}
      </Text>
    </Pressable>
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
  handlePressed: {
    opacity: 0.6,
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
