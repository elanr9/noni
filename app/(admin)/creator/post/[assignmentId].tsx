import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';

import { SkeletonCard } from '../../../../components/admin/shared';
import { FormatPill } from '../../../../components/ui/FormatPill';
import { Icon, type IconName } from '../../../../components/ui/Icon';
import { PressableScale } from '../../../../components/ui/PressableScale';
import { StatusChip } from '../../../../components/ui/StatusChip';
import { useAuth } from '../../../../lib/auth';
import {
  fetchAssignmentPostDetail,
  signedVideoUrl,
  type AssignmentPostDetail,
  type PostPlatformStats,
} from '../../../../lib/admin-api';
import { formatMetric } from '../../../../lib/analytics';
import { formatCents } from '../../../../lib/wallet-api';
import {
  borderWidth,
  color,
  radiusAdmin,
  shadow,
  space,
  type,
} from '../../../../theme/tokens';

const TILE_WIDTH = 132;
const TILE_HEIGHT = Math.round((TILE_WIDTH * 16) / 9);

const PLATFORM: Record<string, { label: string; icon: IconName }> = {
  tiktok: { label: 'TikTok', icon: 'music-2' },
  instagram: { label: 'Instagram', icon: 'instagram' },
};

function platformMeta(platform: string): { label: string; icon: IconName } {
  return PLATFORM[platform] ?? { label: platform, icon: 'share-2' };
}

function formatDay(iso: string | null): string {
  if (!iso) return 'Not scheduled';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function metricText(v: number | null): string {
  return v === null ? '–' : formatMetric(v);
}

function PostVideo({ uri }: { uri: string }) {
  const [playing, setPlaying] = useState(false);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });
  const toggle = () => {
    if (playing) player.pause();
    else player.play();
    setPlaying(!playing);
  };
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause' : 'Play'}
      onPress={toggle}
      style={styles.tile}
    >
      <VideoView
        player={player}
        style={styles.tileFill}
        contentFit="cover"
        nativeControls={false}
      />
      {!playing && (
        <View pointerEvents="none" style={styles.playScrim}>
          <View style={styles.playButton}>
            <Icon name="play" size={18} color={color.ink} />
          </View>
        </View>
      )}
    </PressableScale>
  );
}

function SlideCover({ uri, count }: { uri: string | null; count: number }) {
  return (
    <View style={styles.tile}>
      {uri !== null ? (
        <Image source={{ uri }} style={styles.tileFill} resizeMode="cover" />
      ) : (
        <View style={[styles.tileFill, styles.tileEmpty]}>
          <Icon name="image" size={22} color={color.whiteA60} />
        </View>
      )}
      <View style={styles.countBadge}>
        <Icon name="images" size={11} color={color.white} />
        <Text style={styles.countText}>{`${count} slides`}</Text>
      </View>
    </View>
  );
}

function PlatformCard({ stats }: { stats: PostPlatformStats }) {
  const meta = platformMeta(stats.platform);
  const rows: Array<[string, number | null]> = [
    ['Views', stats.views],
    ['Likes', stats.likes],
    ['Comments', stats.comments],
    ['Saves', stats.saves],
  ];
  const live = stats.url !== null;
  return (
    <PressableScale
      accessibilityRole="link"
      accessibilityLabel={`Open on ${meta.label}`}
      disabled={!live}
      onPress={() => {
        if (stats.url !== null) void Linking.openURL(stats.url);
      }}
      style={styles.platformCard}
    >
      <View style={styles.platformHead}>
        <View style={styles.platformIcon}>
          <Icon name={meta.icon} size={14} color={color.blue700} />
        </View>
        <Text style={styles.platformName}>{meta.label}</Text>
        {live && <Icon name="arrow-right" size={15} color={color.blue600} />}
      </View>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.metricRow}>
          <Text style={styles.metricLabel}>{label}</Text>
          <Text style={styles.metricValue}>{metricText(value)}</Text>
        </View>
      ))}
      <Text style={[styles.platformFoot, !live && styles.platformFootMuted]}>
        {live ? 'Open post' : 'Not live yet'}
      </Text>
    </PressableScale>
  );
}

export default function AdminCreatorPostDetail() {
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const { profile, managerAccess } = useAuth();
  const [data, setData] = useState<AssignmentPostDetail | null>(null);
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile || !assignmentId) return;
    try {
      const detail = await fetchAssignmentPostDetail(profile.active_company_id, assignmentId);
      setData(detail);
      const sub = detail.submission;
      if (!sub) return;
      const isVideo = detail.assignment.briefs.format === 'video';
      const path = isVideo ? sub.video_path : (sub.segment_paths?.[0] ?? null);
      if (path) setMediaUri(await signedVideoUrl(path));
    } catch (e) {
      Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again');
    } finally {
      setLoading(false);
    }
  }, [profile, assignmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const brief = data?.assignment.briefs;
  const isVideo = brief?.format === 'video';
  const slideCount = data?.submission?.segment_paths?.length ?? 0;
  const payoutCents = data?.assignment.bounty_amount_cents ?? null;
  const platforms = data?.platforms ?? [];

  return (
    <>
      <Stack.Screen options={{ title: 'Post' }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {loading || !data || !brief ? (
          <>
            <SkeletonCard height={TILE_HEIGHT + 32} radius={radiusAdmin.xl} />
            <SkeletonCard height={72} radius={radiusAdmin.lg} />
            <SkeletonCard height={190} radius={radiusAdmin.lg} />
          </>
        ) : (
          <>
            <View style={styles.hero}>
              {isVideo ? (
                mediaUri !== null ? (
                  <PostVideo uri={mediaUri} />
                ) : (
                  <View style={[styles.tile, styles.tileEmpty]}>
                    <Icon name="video" size={22} color={color.whiteA60} />
                  </View>
                )
              ) : (
                <SlideCover uri={mediaUri} count={slideCount} />
              )}
              <View style={styles.heroBody}>
                <View style={styles.heroTop}>
                  <FormatPill format={isVideo ? "video" : "photo_carousel"} compact />
                  <StatusChip status={data.assignment.status} />
                </View>
                <Text style={styles.title} numberOfLines={3}>
                  {brief.title}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {data.creatorName}
                </Text>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatValue}>
                    {formatMetric(data.totals.views)}
                  </Text>
                  <Text style={styles.heroStatLabel}>total views</Text>
                </View>
              </View>
            </View>

            <View style={styles.summary}>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>Likes</Text>
                <Text style={styles.summaryValue}>{formatMetric(data.totals.likes)}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>Comments</Text>
                <Text style={styles.summaryValue}>
                  {formatMetric(data.totals.comments)}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              {managerAccess.viewFinancials ? (
                <View style={styles.summaryCell}>
                  <Text style={styles.summaryLabel}>Earned</Text>
                  <Text style={[styles.summaryValue, styles.summaryGreen]}>
                    {payoutCents !== null ? formatCents(payoutCents) : '$0.00'}
                  </Text>
                </View>
              ) : (
                <View style={styles.summaryCell}>
                  <Text style={styles.summaryLabel}>Saves</Text>
                  <Text style={styles.summaryValue}>{metricText(data.totals.saves)}</Text>
                </View>
              )}
              <View style={styles.summaryDivider} />
              <View style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>Posted</Text>
                <Text style={styles.summaryValue}>
                  {formatDay(data.assignment.scheduled_date)}
                </Text>
              </View>
            </View>

            {platforms.length > 0 && (
              <View style={styles.platformRow}>
                {platforms.map((p) => (
                  <PlatformCard key={p.platform} stats={p} />
                ))}
              </View>
            )}

            <View style={styles.captionCard}>
              <Text style={styles.captionLabel}>Caption</Text>
              <Text style={styles.captionText}>
                {data.assignment.caption ?? brief.caption ?? 'No caption.'}
              </Text>
              {data.assignment.caption === null && (
                <Text style={styles.captionNote}>
                  This creator will get their own wording of this caption before it posts.
                </Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.offWhite,
  },
  content: {
    paddingHorizontal: space.gutterAdmin,
    paddingVertical: 14,
    paddingBottom: 40,
    gap: 12,
  },
  hero: {
    flexDirection: 'row',
    gap: 14,
    padding: 14,
    backgroundColor: color.white,
    borderRadius: radiusAdmin.xl,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    ...shadow.shadowCard,
  },
  tile: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.ink900,
    overflow: 'hidden',
    ...shadow.shadowMedia,
  },
  tileFill: {
    width: '100%',
    height: '100%',
  },
  tileEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.ink800,
  },
  playScrim: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.whiteA92,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
  countBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.inkA55,
  },
  countText: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
    color: color.white,
  },
  heroBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'space-between',
    gap: 8,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    fontSize: type.size.card,
    lineHeight: type.size.card * type.leading.title,
    fontWeight: type.weight.bold,
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  meta: {
    fontSize: type.size.chip,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
  heroStat: {
    marginTop: 'auto',
    gap: 1,
  },
  heroStatValue: {
    fontSize: type.size.title,
    lineHeight: type.size.title * type.leading.tight,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  heroStatLabel: {
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.slate400,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    ...shadow.shadowCard,
  },
  summaryCell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 2,
  },
  summaryDivider: {
    width: borderWidth.hair,
    height: 28,
    backgroundColor: color.line,
  },
  summaryLabel: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
    color: color.slate400,
    textTransform: 'uppercase',
    letterSpacing: type.tracking.label,
  },
  summaryValue: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  summaryGreen: {
    color: color.green,
  },
  platformRow: {
    flexDirection: 'row',
    gap: 10,
  },
  platformCard: {
    flex: 1,
    minWidth: 0,
    padding: 13,
    gap: 2,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    ...shadow.shadowCard,
  },
  platformHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  platformIcon: {
    width: 26,
    height: 26,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformName: {
    flex: 1,
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: 4,
  },
  metricLabel: {
    flex: 1,
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.slate400,
  },
  metricValue: {
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  platformFoot: {
    marginTop: 8,
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
    color: color.blue700,
  },
  platformFootMuted: {
    color: color.slate300,
  },
  captionCard: {
    padding: 14,
    gap: 6,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    ...shadow.shadowCard,
  },
  captionLabel: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
    color: color.slate400,
    textTransform: 'uppercase',
    letterSpacing: type.tracking.label,
  },
  captionText: {
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    color: color.ink,
  },
  captionNote: {
    fontSize: type.size.micro11,
    color: color.slate400,
  },
});
