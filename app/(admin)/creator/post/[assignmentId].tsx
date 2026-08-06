import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';

import { PostSlides } from '../../../../components/admin/creator/PostSlides';
import { StatBlock } from '../../../../components/admin/creator/StatBlock';
import { SkeletonCard } from '../../../../components/admin/shared';
import { InfoBlock } from '../../../../components/ui/InfoBlock';
import { PressableScale } from '../../../../components/ui/PressableScale';
import { useAuth } from '../../../../lib/auth';
import {
  fetchAssignmentPostDetail,
  signedVideoUrl,
  type AssignmentPostDetail,
} from '../../../../lib/admin-api';
import { slidesFromScript } from '../../../../lib/admin-queue-map';
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

const MEDIA_HEIGHT = 300;

function platformLabel(platform: string): string {
  if (platform === 'tiktok') return 'TikTok';
  if (platform === 'instagram') return 'Instagram';
  return platform;
}

function PostVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });
  return (
    <VideoView
      player={player}
      style={styles.video}
      contentFit="cover"
      nativeControls
    />
  );
}

export default function AdminCreatorPostDetail() {
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const { profile } = useAuth();
  const [data, setData] = useState<AssignmentPostDetail | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile || !assignmentId) return;
    try {
      const detail = await fetchAssignmentPostDetail(profile.company_id, assignmentId);
      setData(detail);
      if (detail.assignment.briefs.format === 'video' && detail.submission) {
        setVideoUri(await signedVideoUrl(detail.submission.video_path));
      }
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
  const slides = !isVideo && brief ? slidesFromScript(brief.script) : [];
  const payoutCents = data?.assignment.bounty_amount_cents ?? null;

  return (
    <>
      <Stack.Screen options={{ title: brief?.title ?? 'Post' }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {loading || !data || !brief ? (
          <>
            <SkeletonCard height={MEDIA_HEIGHT} radius={radiusAdmin.xl} />
            <SkeletonCard height={64} radius={radiusAdmin.lg} />
          </>
        ) : (
          <>
            {isVideo ? (
              videoUri !== null ? (
                <PostVideo uri={videoUri} />
              ) : (
                <View style={[styles.video, styles.videoEmpty]}>
                  <Text style={styles.empty}>No recording yet.</Text>
                </View>
              )
            ) : (
              <PostSlides
                slides={slides}
                index={slideIndex}
                onSelect={setSlideIndex}
              />
            )}

            <View style={styles.statsRow}>
              <StatBlock
                label="Views"
                value={formatMetric(data.totals.views)}
                style={styles.statTile}
              />
              <StatBlock
                label="Payout"
                value={payoutCents !== null ? formatCents(payoutCents) : 'None'}
                style={styles.statTile}
              />
              <StatBlock
                label="Saves"
                value={
                  data.totals.saves !== null
                    ? formatMetric(data.totals.saves)
                    : 'Pending'
                }
                style={styles.statTile}
              />
            </View>
            <View style={styles.statsRow}>
              <StatBlock
                label="Likes"
                value={formatMetric(data.totals.likes)}
                style={styles.statTile}
              />
              <StatBlock
                label="Comments"
                value={formatMetric(data.totals.comments)}
                style={styles.statTile}
              />
              <View style={styles.statSpacer} />
            </View>

            {data.platforms.filter((p) => p.url !== null).length > 0 && (
              <View style={styles.linkRow}>
                {data.platforms.map((p) =>
                  p.url !== null ? (
                    <PressableScale
                      key={p.platform}
                      accessibilityRole="link"
                      onPress={() => {
                        if (p.url !== null) void Linking.openURL(p.url);
                      }}
                      style={styles.linkChip}
                    >
                      <Text style={styles.linkText}>
                        Open on {platformLabel(p.platform)}
                      </Text>
                    </PressableScale>
                  ) : null,
                )}
              </View>
            )}

            <InfoBlock label="CAPTION">{brief.caption ?? 'No caption.'}</InfoBlock>
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
    gap: 12,
  },
  empty: {
    fontSize: type.size.bodySm,
    color: color.slate500,
    fontWeight: '600',
  },
  video: {
    width: '100%',
    height: MEDIA_HEIGHT,
    borderRadius: radiusAdmin.xl,
    backgroundColor: color.ink900,
    overflow: 'hidden',
  },
  videoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fillQuiet,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statTile: {
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    borderRadius: radiusAdmin.lg,
    ...shadow.shadowCard,
  },
  statSpacer: {
    flex: 1,
  },
  linkRow: {
    flexDirection: 'row',
    gap: 8,
  },
  linkChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  linkText: {
    fontSize: type.size.chip,
    fontWeight: '700',
    color: color.blue700,
  },
});
