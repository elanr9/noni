// A creator's live (or scheduled) post, v2: the media, where it stands, the
// sound to add, real per platform numbers and what it earned, and links out.
// Posts that are not approved or live hand over to assignment/[id].
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { EmptyHero, SlidesHero, VideoHero } from '../../../components/creator/v2/PostDetailScreen';
import { AudioCover } from '../../../components/admin/v2/audio/AudioCover';
import { TikTokSoundCard } from '../../../components/admin/v2/audio/TikTokSoundCard';
import { Button, Card, Chip, Icon, Label, Row, Screen, Seg, Sheet, Skeleton, TikTokMark, InstagramMark } from '../../../components/v2';
import { toast } from '../../../components/v2/Toast';
import { useAuth } from '../../../lib/auth';
import { getCreatorAccount } from '../../../lib/creator-accounts-api';
import { loadCreatorPostDetail, type CreatorPostDetail } from '../../../lib/creator-post-detail';
import { countOnDate, publishTimeLabel, useCreatorQueue } from '../../../lib/creator-queue';
import { fmt, money, parseDayKey, shortDate } from '../../../lib/v2-format';
import { useV2Data } from '../../../lib/v2-posts';
import { markMusicAdded } from '../../../lib/tasks-api';
import { color, motion, num, radius, text, tone } from '../../../theme/v2';

type Platform = 'tiktok' | 'instagram';

function cleanHandle(raw: string | null | undefined): string | null {
  const h = raw?.trim().replace(/^@/, '') ?? '';
  return h.length > 0 ? h : null;
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={[num.lg, accent ? { color: color.green } : null]}>{value}</Text>
      <Text numberOfLines={1} style={text.meta}>{label}</Text>
    </View>
  );
}

export default function CreatorLivePostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width: W } = useWindowDimensions();
  const { profile } = useAuth();
  const { assignments } = useCreatorQueue();
  const companyId = profile?.active_company_id ?? null;

  const posts = useV2Data((s) => s.posts);
  const v2Company = useV2Data((s) => s.companyId);
  const loadV2 = useV2Data((s) => s.load);

  const [detail, setDetail] = useState<CreatorPostDetail | null>(null);
  const [error, setError] = useState<'missing' | 'failed' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [handles, setHandles] = useState<Record<Platform, string | null>>({ tiktok: null, instagram: null });
  const [platform, setPlatform] = useState<Platform>('tiktok');
  const [sound, setSound] = useState(false);
  const [marking, setMarking] = useState(false);
  const shown = useRef(false);
  const retry = useRef<() => void>(() => undefined);

  const load = useCallback(
    async (manual = false) => {
      if (!companyId || !id || !profile) return;
      try {
        const next = await loadCreatorPostDetail(companyId, id);
        if (!next) {
          setDetail(null);
          setError('missing');
          return;
        }
        setError(null);
        shown.current = true;
        setDetail(next);
        const account = await getCreatorAccount(companyId, profile.id).catch(() => null);
        setHandles({ tiktok: cleanHandle(account?.tiktok_handle), instagram: cleanHandle(account?.instagram_handle) });
      } catch {
        if (!shown.current) setError('failed');
        else if (manual) toast.error('Could not refresh this post.', { label: 'Retry', onPress: () => retry.current() });
      } finally {
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [companyId, id, profile?.id],
  );

  useEffect(() => {
    retry.current = () => void load(true);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
      if (companyId) void loadV2(companyId, v2Company === companyId);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, companyId]),
  );

  const a = detail?.assignment ?? null;
  const live = a !== null && (a.status === 'posted' || a.status === 'approved');
  const scheduled = a?.status === 'approved';

  // Anything not approved or live belongs on the post detail.
  useEffect(() => {
    if (a && !live) router.replace({ pathname: '/(creator)/assignment/[id]', params: { id: a.id } });
  }, [a, live, router]);

  const stats = useMemo(() => posts.find((p) => p.assignmentId === id) ?? null, [posts, id]);

  const heroW = Math.min(240, W * 0.6);
  const heroH = (heroW * 16) / 9;

  if (!detail || !a || !live) {
    return (
      <Screen back title="Post">
        {error ? (
          <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
            <Icon name="cloud_off" size={40} color={color.grey3} />
            <Text style={[text.card, { textAlign: 'center' }]}>{error === 'missing' ? 'This post is gone' : 'Could not load this post'}</Text>
            <Text style={[text.body, { color: color.grey4, textAlign: 'center' }]}>
              {error === 'missing' ? 'It was removed or moved to another team.' : 'Check your connection and try again.'}
            </Text>
            {error === 'missing' ? (
              <Button pill variant="quiet" label="Go back" onPress={() => router.back()} />
            ) : (
              <Button
                pill
                label="Try again"
                icon="refresh"
                onPress={() => {
                  setError(null);
                  void load();
                }}
              />
            )}
          </Animated.View>
        ) : (
          <View style={{ paddingHorizontal: 20, alignItems: 'center', gap: 12, paddingTop: 8 }}>
            <Skeleton w={heroW} h={heroH} r={radius.sheet} />
            <Skeleton h={44} />
            <Skeleton h={96} />
          </View>
        )}
      </Screen>
    );
  }

  const title = a.briefs?.title?.trim() || 'Post';
  const slideshow = detail.slideshow;
  const audio = detail.submission?.audio ?? null;
  const publishTime = publishTimeLabel(a, countOnDate(assignments, a.scheduled_date));
  const day = a.scheduled_date ? shortDate(parseDayKey(a.scheduled_date)) : null;
  const when = scheduled ? `Posts ${day ? `${day} at ` : 'at '}${publishTime}` : day ? `Posted ${day}` : 'Live';

  const urlFor = (p: Platform): string | null => {
    const postUrl = a.post_url;
    if (postUrl && postUrl.toLowerCase().includes(p)) return postUrl;
    const h = handles[p];
    if (!h) return null;
    return p === 'tiktok' ? `https://www.tiktok.com/@${h}` : `https://www.instagram.com/${h}/`;
  };
  const openOn = (p: Platform) => {
    const url = urlFor(p);
    if (!url) {
      toast.show(`Add your ${p === 'tiktok' ? 'TikTok' : 'Instagram'} handle in Settings first.`);
      return;
    }
    void Linking.openURL(url).catch(() => toast.error('Could not open the app.'));
  };

  const musicAdded = a.music_marked_by_creator_at !== null;
  const markAdded = async () => {
    if (marking) return;
    setMarking(true);
    try {
      const row = await markMusicAdded(a.id);
      setDetail((d) => (d ? { ...d, assignment: { ...d.assignment, music_marked_by_creator_at: row.music_marked_by_creator_at } } : d));
      setSound(false);
      toast.success('Sent to your team to check');
    } catch {
      toast.error('Could not save that. Try again.', { label: 'Retry', onPress: () => void markAdded() });
    } finally {
      setMarking(false);
    }
  };

  // Slideshows need the sound added by hand on each app; reels carry it already.
  const musicLine =
    slideshow && a.status === 'posted'
      ? a.music_approved_at !== null
        ? { tone: 'green' as const, label: 'Music approved' }
        : musicAdded
          ? { tone: 'amber' as const, label: 'Music in review' }
          : { tone: 'blue' as const, label: 'Add the music' }
      : null;

  const ps = stats ? stats[platform] : null;

  return (
    <Screen back title="Post">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
              if (companyId) void loadV2(companyId, true);
            }}
            tintColor={color.grey4}
          />
        }
      >
        <Animated.View entering={FadeIn.duration(220)} style={{ alignItems: 'center', paddingBottom: 16 }}>
          {detail.media.length === 0 ? (
            <EmptyHero width={heroW} height={heroH} state="Posted" />
          ) : slideshow ? (
            <SlidesHero uris={detail.media} width={heroW} height={heroH} rendering={false} />
          ) : (
            <VideoHero uri={detail.media[0]} width={heroW} height={heroH} rendering={false} />
          )}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(60).duration(240).easing(motion.tabEase)} style={{ alignItems: 'center', gap: 8, paddingBottom: 16 }}>
          <Text style={[text.card, { textAlign: 'center' }]} numberOfLines={2}>
            {title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Chip small tone="green" label={scheduled ? 'Approved' : 'Live'} />
            <Chip small tone={slideshow ? 'purple' : 'blue'} label={slideshow ? 'Slideshow' : 'Reel'} />
            <Text style={text.meta}>{when}</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(240).easing(motion.tabEase)}>
          {scheduled ? (
            <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: tone.green.tint, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="schedule" size={22} color={tone.green.fg} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={text.row}>Scheduled</Text>
                <Text style={[text.body, { color: color.grey4 }]}>{`It goes up at ${publishTime}. Views and earnings show here once it is live.`}</Text>
              </View>
            </Card>
          ) : null}

          {audio || musicLine ? (
            <>
              <Label style={{ marginTop: 8, marginBottom: 8, marginLeft: 4 }}>Sound</Label>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {audio ? (
                  <AudioCover t={audio.track} size={48} />
                ) : (
                  <View style={{ width: 48, height: 48, borderRadius: radius.thumb, backgroundColor: tone.purple.tint, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="music_note" size={24} color={tone.purple.fg} />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={text.row}>
                    {audio ? audio.track.title : 'Trending sound'}
                  </Text>
                  <Text numberOfLines={1} style={text.meta}>
                    {audio ? audio.track.artist : musicLine?.label}
                  </Text>
                </View>
                {musicLine && musicLine.tone !== 'blue' ? (
                  <Chip small tone={musicLine.tone} label={musicLine.label} />
                ) : (
                  <Button pill variant="secondary" label={musicAdded ? 'Added' : 'Add it'} disabled={musicAdded} onPress={() => setSound(true)} />
                )}
              </Card>
            </>
          ) : null}

          {!scheduled ? (
            <>
              <Seg<Platform>
                style={{ marginTop: 8, marginBottom: 12 }}
                value={platform}
                onChange={setPlatform}
                options={[
                  { key: 'tiktok', label: 'TikTok' },
                  { key: 'instagram', label: 'Instagram' },
                ]}
              />
              {stats === null ? (
                <Skeleton h={164} />
              ) : (
                <Animated.View key={platform} entering={FadeIn.duration(200)}>
                  <Card style={{ gap: 16 }}>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <Stat value={fmt(ps?.views ?? 0)} label="views" />
                      <Stat value={fmt(ps?.likes ?? 0)} label="likes" />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <Stat value={fmt(ps?.comments ?? 0)} label="comments" />
                      <Stat value={fmt(ps?.saves ?? 0)} label="saves" />
                    </View>
                  </Card>
                </Animated.View>
              )}
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: tone.green.tint, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="payments" size={22} color={tone.green.fg} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={text.row}>Earned on this post</Text>
                  <Text style={text.meta}>{stats ? `${fmt(stats.views)} views on both apps` : 'Counting views'}</Text>
                </View>
                {stats ? <Text style={[num.sm, { color: color.green }]}>{money(stats.earnedCents)}</Text> : <ActivityIndicator size="small" color={color.grey3} />}
              </Card>
            </>
          ) : null}

          <Label style={{ marginTop: 8, marginBottom: 8, marginLeft: 4 }}>Open</Label>
          <Card pad={0} style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
            <Row chevron onPress={() => openOn('tiktok')}>
              <TikTokMark size={22} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={text.row}>Open on TikTok</Text>
                {handles.tiktok ? <Text style={text.meta}>{`@${handles.tiktok}`}</Text> : null}
              </View>
            </Row>
            <Row chevron last onPress={() => openOn('instagram')}>
              <InstagramMark size={22} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={text.row}>Open on Instagram</Text>
                {handles.instagram ? <Text style={text.meta}>{`@${handles.instagram}`}</Text> : null}
              </View>
            </Row>
          </Card>
        </Animated.View>
      </ScrollView>

      <Sheet open={sound} onClose={() => (marking ? undefined : setSound(false))} title={slideshow ? 'Add the music' : 'Add the sound on TikTok'}>
        {audio ? (
          <TikTokSoundCard audio={audio} tiktokUrl={urlFor('tiktok')} onDone={() => void markAdded()} />
        ) : (
          <View style={{ gap: 16 }}>
            <Text style={[text.body, { color: color.grey4 }]}>Open the post on TikTok and Instagram, add the trending sound, then come back and tap Done.</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button variant="quiet" label="Not yet" disabled={marking} onPress={() => setSound(false)} />
              <Button label={marking ? 'Saving' : 'Done'} disabled={marking} onPress={() => void markAdded()} />
            </View>
          </View>
        )}
      </Sheet>
    </Screen>
  );
}
