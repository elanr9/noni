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

import { InfoBlock } from '../../../../components/ui/InfoBlock';
import { PressableScale } from '../../../../components/ui/PressableScale';
import { SlideshowViewer } from '../../../../components/admin/SlideshowViewer';
import { useAuth } from '../../../../lib/auth';
import {
  fetchAssignmentPostDetail,
  signedVideoUrl,
  type AssignmentPostDetail,
} from '../../../../lib/admin-api';
import { slidesFromScript } from '../../../../lib/admin-queue-map';
import { formatMetric } from '../../../../lib/analytics';
import { formatCents } from '../../../../lib/wallet-api';
import { borderWidth, color, radius, shadow, space, type } from '../../../../theme/tokens';

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
          <Text style={styles.empty}>Loading post…</Text>
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
              <SlideshowViewer
                slides={slides}
                index={slideIndex}
                onSelect={setSlideIndex}
              />
            )}

            <View style={styles.statsRow}>
              <Stat label="Views" value={formatMetric(data.totals.views)} />
              <Stat
                label="Payout"
                value={payoutCents !== null ? formatCents(payoutCents) : '—'}
              />
              <Stat
                label="Saves"
                value={data.totals.saves !== null ? formatMetric(data.totals.saves) : '—'}
              />
            </View>
            <View style={styles.statsRow}>
              <Stat label="Likes" value={formatMetric(data.totals.likes)} />
              <Stat label="Comments" value={formatMetric(data.totals.comments)} />
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

function Stat(props: { label: string; value: string }) {
  return (
    <View style={[styles.stat, shadow.shadowCard]}>
      <Text style={styles.statValue}>{props.value}</Text>
      <Text style={styles.statLabel}>{props.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
  content: { paddingHorizontal: space.gutter, paddingVertical: 12, gap: 12 },
  empty: {
    fontSize: type.size.bodySm,
    color: color.slate500,
    fontWeight: '600',
  },
  video: {
    width: '100%',
    aspectRatio: 9 / 14,
    borderRadius: radius.md,
    backgroundColor: color.ink,
    overflow: 'hidden',
  },
  videoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fillQuiet,
  },
  statsRow: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    backgroundColor: color.white,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    gap: 4,
  },
  statSpacer: { flex: 1 },
  statValue: {
    fontSize: type.size.card,
    fontWeight: '800',
    color: color.ink,
  },
  statLabel: {
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.slate400,
    textTransform: 'uppercase',
    letterSpacing: type.tracking.label,
  },
  linkRow: { flexDirection: 'row', gap: 8 },
  linkChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
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
