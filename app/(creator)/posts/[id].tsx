import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';

import { FormatTag } from '../../../components/creator/Chips';
import {
  INSTAGRAM_SHARE,
  TIKTOK_SHARE,
  savesForViews,
  shortDateLabel,
  viralityTopPercents,
} from '../../../components/creator/posts-shared';
import { SlideNav, type SlideNavSlide } from '../../../components/creator/SlideNav';
import { Screen } from '../../../components/layout/Screen';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { Segmented } from '../../../components/ui/Segmented';
import { useAuth } from '../../../lib/auth';
import { getCreatorAccount } from '../../../lib/creator-accounts-api';
import { slotTimeLabel, useCreatorQueue } from '../../../lib/creator-queue';
import { earningsForViews, formatCount } from '../../../lib/earnings';
import {
  getAssignment,
  parseAssignmentMetrics,
  type AssignmentWithBrief,
} from '../../../lib/tasks-api';
import { color, radius, shadow, space, type } from '../../../theme/tokens';

type Platform = 'tiktok' | 'instagram';

function cleanHandle(raw: string | null): string | null {
  const trimmed = raw?.trim().replace(/^@/, '') ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { assignments } = useCreatorQueue();

  const [assignment, setAssignment] = useState<AssignmentWithBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [platformIndex, setPlatformIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [handles, setHandles] = useState<{
    tiktok: string | null;
    instagram: string | null;
  }>({ tiktok: null, instagram: null });

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const row = await getAssignment(id);
      setAssignment(row);
      if (row !== null && profile?.id) {
        const account = await getCreatorAccount(row.company_id, profile.id);
        setHandles({
          tiktok: cleanHandle(account?.tiktok_handle ?? null),
          instagram: cleanHandle(account?.instagram_handle ?? null),
        });
      }
    } catch {
      setAssignment(null);
    } finally {
      setLoading(false);
    }
  }, [id, profile?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const isPosted =
    assignment !== null &&
    (assignment.status === 'posted' || assignment.status === 'approved');

  useEffect(() => {
    if (assignment !== null && !isPosted) {
      router.replace({
        pathname: '/(creator)/assignment/[id]',
        params: { id: assignment.id },
      });
    }
  }, [assignment, isPosted, router]);

  const topPercents = useMemo(
    () => viralityTopPercents(assignments),
    [assignments],
  );

  if (loading || (assignment !== null && !isPosted)) {
    return (
      <Screen contentStyle={styles.center}>
        <ActivityIndicator size="large" color={color.accent} />
      </Screen>
    );
  }

  if (assignment === null) {
    return (
      <Screen contentStyle={styles.center}>
        <Text style={styles.missing}>Post not found</Text>
        <PressableScale onPress={() => router.back()}>
          <Text style={styles.backLink}>Go back</Text>
        </PressableScale>
      </Screen>
    );
  }

  const brief = assignment.briefs;
  const isPhoto = brief.format === 'photo_carousel';
  const metrics = parseAssignmentMetrics(assignment.metrics);
  const totalViews = metrics.views ?? 0;
  const totalLikes = metrics.likes ?? 0;
  const totalSaves = savesForViews(totalViews, assignment.metrics);

  const platform: Platform = platformIndex === 1 ? 'instagram' : 'tiktok';
  const share = platform === 'tiktok' ? TIKTOK_SHARE : INSTAGRAM_SHARE;
  const views = Math.round(totalViews * share);
  const likes = Math.round(totalLikes * share);
  const saves = Math.round(totalSaves * share);
  const earned = earningsForViews(views).earned;

  const tier = earningsForViews(totalViews);
  const tierFill = ((tier.earned % 20) / 20) * 100;

  const topPercent = topPercents.get(assignment.id);
  const showTopChip = topPercent !== undefined && topPercent <= 10;

  const handle = handles[platform];
  const postedLine = [
    `Posted ${shortDateLabel(assignment.scheduled_date)} at ${slotTimeLabel(assignment.slot_index)}`,
    handle !== null ? `@${handle}` : null,
  ]
    .filter((v) => v !== null)
    .join(' · ');

  const slides: SlideNavSlide[] = (brief.script ?? '')
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((text) => ({ text }));
  if (slides.length === 0) {
    slides.push({ text: brief.hook ?? brief.title });
  }

  const postUrl = assignment.post_url;
  const urlFor = (p: Platform): string | null => {
    if (postUrl !== null && postUrl.toLowerCase().includes(p)) return postUrl;
    const h = handles[p];
    if (h === null) return null;
    return p === 'tiktok'
      ? `https://www.tiktok.com/@${h}`
      : `https://www.instagram.com/${h}/`;
  };

  const openOn = (p: Platform) => {
    const url = urlFor(p);
    if (url !== null) void Linking.openURL(url);
  };

  return (
    <Screen scroll bg={color.white} contentStyle={styles.content}>
      <View style={styles.topBar}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Icon name="chevron-left" size={22} color={color.ink} />
        </PressableScale>
        <Text style={styles.topTitle}>Post</Text>
        <View style={styles.topSpacer} />
      </View>

      <View style={[styles.media, shadow.shadowMedia]}>
        {isPhoto ? (
          <SlideNav slides={slides} variant="dark" style={styles.mediaFill} />
        ) : (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            onPress={() => setPlaying((p) => !p)}
            style={styles.mediaFill}
          >
            <View style={styles.playWrap}>
              <View style={styles.playBtn}>
                <Icon
                  name={playing ? 'pause' : 'play'}
                  size={22}
                  color={color.white}
                />
              </View>
            </View>
            <Text style={styles.mediaTitle} numberOfLines={2}>
              {brief.title}
            </Text>
          </PressableScale>
        )}
        <View style={styles.mediaChips} pointerEvents="none">
          <FormatTag format={brief.format} />
          {showTopChip && (
            <View style={styles.topChip}>
              <Icon name="trending-up" size={11} color={color.green} />
              <Text style={styles.topChipText}>{`Top ${topPercent}%`}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>{brief.title}</Text>
        <Text style={styles.postedLine}>{postedLine}</Text>
      </View>

      <Segmented
        options={['TikTok', 'Instagram']}
        value={platformIndex}
        onChange={setPlatformIndex}
      />

      <View style={styles.statGrid}>
        {(
          [
            { label: 'Views', value: formatCount(views), money: false },
            { label: 'Likes', value: formatCount(likes), money: false },
            { label: 'Saves', value: formatCount(saves), money: false },
            { label: 'Earned', value: `$${earned.toFixed(2)}`, money: true },
          ] as const
        ).map((s) => (
          <View key={s.label} style={[styles.statCard, shadow.shadowCard]}>
            <Text style={[styles.statValue, s.money && styles.statValueMoney]}>
              {s.value}
            </Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.tierCard, shadow.shadowCard]}>
        <View style={styles.tierRow}>
          <Text style={styles.tierAmount}>{`$${tier.earned.toFixed(2)}`}</Text>
          <Text style={styles.tierToGo}>
            {`${formatCount(tier.toGo)} views to $${tier.next}`}
          </Text>
        </View>
        <View style={styles.tierTrack}>
          <View style={[styles.tierFill, { width: `${tierFill}%` }]} />
        </View>
      </View>

      <View style={styles.links}>
        {(
          [
            { platform: 'tiktok', label: 'Open on TikTok', icon: 'music-2' },
            { platform: 'instagram', label: 'Open on Instagram', icon: 'at-sign' },
          ] as const
        ).map((row) => {
          const rowHandle = handles[row.platform];
          return (
            <PressableScale
              key={row.platform}
              accessibilityRole="button"
              accessibilityLabel={row.label}
              onPress={() => openOn(row.platform)}
              style={[styles.linkRow, shadow.shadowCard]}
            >
              <View style={styles.linkIcon}>
                <Icon name={row.icon} size={16} color={color.ink} />
              </View>
              <View style={styles.linkBody}>
                <Text style={styles.linkLabel}>{row.label}</Text>
                {rowHandle !== null && (
                  <Text style={styles.linkHandle}>{`@${rowHandle}`}</Text>
                )}
              </View>
              <Icon name="arrow-right" size={17} color={color.slate400} />
            </PressableScale>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space[4],
    paddingBottom: space[10],
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
  },
  missing: {
    fontSize: type.size.body,
    color: color.slate500,
  },
  backLink: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    color: color.blue700,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontSize: type.size.action,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  topSpacer: {
    width: 40,
  },
  media: {
    height: 330,
    borderRadius: radius['2xl'],
    backgroundColor: color.ink900,
    overflow: 'hidden',
  },
  mediaFill: {
    flex: 1,
  },
  mediaChips: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    backgroundColor: color.greenSoft,
  },
  topChipText: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
    color: color.green,
  },
  playWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaTitle: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    textAlign: 'center',
    fontSize: type.size.body,
    fontWeight: type.weight.bold,
    lineHeight: type.size.body * type.leading.snug,
    letterSpacing: -0.2,
    color: color.white,
  },
  titleBlock: {
    gap: 4,
  },
  title: {
    fontSize: type.size.cardLg,
    lineHeight: type.size.cardLg * type.leading.title,
    letterSpacing: -0.4,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  postedLine: {
    fontSize: type.size.chip,
    color: color.slate500,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[3],
  },
  statCard: {
    width: '47%',
    flexGrow: 1,
    gap: 2,
    paddingVertical: space[4],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
  },
  statValue: {
    fontSize: type.size.cardLg,
    fontWeight: type.weight.heavy,
    letterSpacing: -0.4,
    color: color.ink,
  },
  statValueMoney: {
    color: color.green,
  },
  statLabel: {
    fontSize: type.size.chip,
    color: color.slate500,
  },
  tierCard: {
    gap: 10,
    paddingVertical: space[4],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  tierAmount: {
    fontSize: type.size.action,
    fontWeight: type.weight.heavy,
    color: color.green,
  },
  tierToGo: {
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
  tierTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    overflow: 'hidden',
  },
  tierFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: color.green,
  },
  links: {
    gap: space[3],
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[4],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
  },
  linkIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  linkLabel: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  linkHandle: {
    fontSize: type.size.label,
    color: color.slate500,
  },
});
