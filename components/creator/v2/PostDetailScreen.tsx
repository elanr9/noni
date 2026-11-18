// The creator's own post before it goes live (ANALYTICS.md 4 detail, adapted
// from BriefPostScreen): the sent media, where the post stands, the
// manager's notes when changes were asked for, the sound to add on TikTok,
// and the one action that moves it on (continue, make changes or discard).
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';

import { parseChangesNote } from '../../ReviewThread';
import type { CreatorPostDetail } from '../../../lib/creator-post-detail';
import { shortDate } from '../../../lib/v2-format';
import type { PostState } from '../../../lib/v2-posts';
import { color, motion, radius, stateTone, text, tone, type Tone } from '../../../theme/v2';
import { AudioCover } from '../../admin/v2/audio/AudioCover';
import { TikTokSoundCard } from '../../admin/v2/audio/TikTokSoundCard';
import { Button, Card, Chip, Icon, Label, Press, Screen, Sheet, Skeleton, tap, type IconName } from '../../v2';

const STATE_BY_STATUS: Record<string, PostState> = {
  assigned: 'Recording',
  recorded: 'Recording',
  submitted: 'Waiting',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  posted: 'Posted',
};

const STATE_COPY: Record<PostState, { icon: IconName; head: string; body: string }> = {
  Recording: { icon: 'videocam', head: 'Not sent yet', body: 'Pick up where you left off. Your clips and edits are saved.' },
  Waiting: { icon: 'schedule', head: 'In review', body: 'Your team is looking at it. You get a notification when they reply.' },
  'Changes requested': { icon: 'edit_note', head: 'Changes requested', body: 'Your team asked for a few changes. Make them and send it again.' },
  Approved: { icon: 'check_circle', head: 'Approved', body: 'Nice work. It goes live on your accounts soon.' },
  Posted: { icon: 'rocket_launch', head: 'Live', body: 'This post is live. See how it is doing.' },
  Open: { icon: 'info', head: 'Open', body: '' },
};

export function postStateOf(status: string): PostState {
  return STATE_BY_STATUS[status] ?? 'Recording';
}

export interface PostDetailScreenProps {
  detail: CreatorPostDetail | null;
  /** Loading failed before anything showed. */
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onRetry: () => void;
  onContinue: () => void;
  onStats: () => void;
  /** Resolves once the post is gone; rejects with a message to show. */
  onDiscard: () => Promise<void>;
}

export function VideoHero({ uri, width, height, rendering }: { uri: string; width: number; height: number; rendering: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
  });
  const { isPlaying: playing } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause' : 'Play'}
      onPress={() => (playing ? player.pause() : player.play())}
      style={{ width, height, borderRadius: radius.sheet, overflow: 'hidden', backgroundColor: color.ink }}
    >
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      {!playing ? (
        <Animated.View entering={FadeIn.duration(160)} pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <View style={styles.playDisc}>
            <Icon name="play_arrow" size={30} color={color.white} />
          </View>
        </Animated.View>
      ) : null}
      {rendering ? <RenderingTag /> : null}
    </Press>
  );
}

function RenderingTag() {
  return (
    <View pointerEvents="none" style={styles.renderTag}>
      <ActivityIndicator size="small" color={color.white} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: color.white }}>Putting your edit together</Text>
    </View>
  );
}

export function SlidesHero({ uris, width, height, rendering }: { uris: string[]; width: number; height: number; rendering: boolean }) {
  const [idx, setIdx] = useState(0);
  return (
    <View style={{ width, height, borderRadius: radius.sheet, overflow: 'hidden', backgroundColor: color.ink }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const next = Math.round(e.nativeEvent.contentOffset.x / width);
          if (next !== idx) tap();
          setIdx(next);
        }}
      >
        {uris.map((u) => (
          <Image key={u} source={{ uri: u }} resizeMode="cover" style={{ width, height }} />
        ))}
      </ScrollView>
      <View pointerEvents="none" style={styles.counter}>
        <Text style={{ fontSize: 12, lineHeight: 24, fontWeight: '600', color: color.white }}>{`${idx + 1} / ${uris.length}`}</Text>
      </View>
      <View pointerEvents="none" style={styles.dots}>
        {uris.map((u, i) => (
          <View key={u} style={{ width: i === idx ? 14 : 5, height: 5, borderRadius: 3, backgroundColor: color.white, opacity: i === idx ? 1 : 0.45 }} />
        ))}
      </View>
      {rendering ? <RenderingTag /> : null}
    </View>
  );
}

export function EmptyHero({ width, height, state }: { width: number; height: number; state: PostState }) {
  return (
    <View style={{ width, height, borderRadius: radius.sheet, backgroundColor: color.grey1, alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: `inset 0 0 0 1px ${color.grey2}` }}>
      <Icon name={state === 'Recording' ? 'videocam' : 'image'} size={34} color={color.grey3} />
      <Text style={[text.meta, { textAlign: 'center', paddingHorizontal: 16 }]}>{state === 'Recording' ? 'Nothing sent yet' : 'Preview not ready yet'}</Text>
    </View>
  );
}

function StatusCard({ state, detail }: { state: PostState; detail: CreatorPostDetail }) {
  const copy = STATE_COPY[state];
  const t: Tone = stateTone[state];
  const failed = detail.submission?.renderStatus === 'failed';
  return (
    <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: tone[t].tint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={copy.icon} size={22} color={tone[t].fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={text.row}>{copy.head}</Text>
        <Text style={[text.body, { color: color.grey4 }]}>{copy.body}</Text>
        {failed && state === 'Waiting' ? <Text style={[text.meta, { color: color.amber, marginTop: 4 }]}>Your edit hit a snag on our side. Your team can still review it, and we will retry it.</Text> : null}
      </View>
    </Card>
  );
}

function NotesCard({ detail }: { detail: CreatorPostDetail }) {
  const latest = [...detail.events].reverse().find((e) => e.action === 'changes_requested' && e.note?.trim());
  if (!latest?.note) return null;
  const sections = parseChangesNote(latest.note);
  const who = latest.profiles?.full_name?.trim() || 'Your team';
  return (
    <Animated.View entering={FadeInDown.duration(240).easing(motion.tabEase)}>
      <Label style={{ marginTop: 8, marginBottom: 8, marginLeft: 4 }}>What to change</Label>
      <Card style={{ gap: 12, boxShadow: `inset 0 0 0 1.5px ${color.amberTint}` }}>
        {sections.map((s, i) => (
          <View key={i} style={{ gap: 2 }}>
            {s.label ? <Text style={[text.meta, { fontWeight: '700', color: color.amber }]}>{s.label}</Text> : null}
            <Text style={text.body}>{s.text}</Text>
          </View>
        ))}
        <Text style={text.meta}>{`${who} · ${shortDate(new Date(latest.created_at))}`}</Text>
      </Card>
    </Animated.View>
  );
}

function HistoryCard({ detail }: { detail: CreatorPostDetail }) {
  const comments = detail.events.filter((e) => e.action === 'comment' && e.note?.trim());
  if (comments.length === 0) return null;
  return (
    <>
      <Label style={{ marginTop: 8, marginBottom: 8, marginLeft: 4 }}>Comments</Label>
      <Card style={{ gap: 14 }}>
        {comments.map((e) => (
          <View key={e.id} style={{ gap: 2 }}>
            <Text style={[text.meta, { fontWeight: '600', color: color.ink }]}>{e.profiles?.full_name?.trim() || 'Your team'}</Text>
            <Text style={text.body}>{e.note}</Text>
            <Text style={text.meta}>{shortDate(new Date(e.created_at))}</Text>
          </View>
        ))}
      </Card>
    </>
  );
}

export function PostDetailScreen({ detail, error, refreshing, onRefresh, onRetry, onContinue, onStats, onDiscard }: PostDetailScreenProps) {
  const { width: W } = useWindowDimensions();
  const [sound, setSound] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const heroW = Math.min(240, W * 0.6);
  const heroH = (heroW * 16) / 9;

  const state = detail ? postStateOf(detail.assignment.status) : null;
  const discard = useCallback(async () => {
    setDiscarding(true);
    setDiscardError(null);
    try {
      await onDiscard();
      setConfirm(false);
    } catch (e) {
      setDiscardError(e instanceof Error ? e.message : 'Could not discard this post');
    } finally {
      setDiscarding(false);
    }
  }, [onDiscard]);

  if (!detail || !state) {
    return (
      <Screen back title="Post">
        {error ? (
          <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
            <Icon name="cloud_off" size={40} color={color.grey3} />
            <Text style={[text.card, { textAlign: 'center' }]}>{error === 'missing' ? 'This post is gone' : 'Could not load this post'}</Text>
            <Text style={[text.body, { color: color.grey4, textAlign: 'center' }]}>{error === 'missing' ? 'It was discarded or moved to another team.' : 'Check your connection and try again.'}</Text>
            {error !== 'missing' ? <Button pill label="Try again" icon="refresh" onPress={onRetry} /> : null}
          </Animated.View>
        ) : (
          <View style={{ paddingHorizontal: 20, alignItems: 'center', gap: 12, paddingTop: 8 }}>
            <Skeleton w={heroW} h={heroH} r={radius.sheet} />
            <Skeleton h={72} />
            <Skeleton h={72} />
          </View>
        )}
      </Screen>
    );
  }

  const title = detail.assignment.briefs?.title?.trim() || 'Post';
  const unsent = state === 'Recording';
  const canDiscard = unsent && !detail.submission;
  const footer =
    state === 'Recording' ? (
      <>
        {canDiscard ? <Button
            variant="quiet"
            label="Discard"
            onPress={() => {
              setDiscardError(null);
              setConfirm(true);
            }} style={{ flex: 0, paddingHorizontal: 22 }} /> : null}
        <Button icon="videocam" label="Continue" onPress={onContinue} />
      </>
    ) : state === 'Changes requested' ? (
      <Button icon="edit" label="Make changes" onPress={onContinue} />
    ) : state === 'Posted' ? (
      <Button icon="query_stats" label="See how it is doing" onPress={onStats} />
    ) : undefined;
  const audio = detail.submission?.audio ?? null;

  return (
    <Screen back title="Post" footer={footer}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.grey4} />}
      >
        <Animated.View entering={FadeIn.duration(220)} style={{ alignItems: 'center', paddingBottom: 16 }}>
          {detail.media.length === 0 ? (
            <EmptyHero width={heroW} height={heroH} state={state} />
          ) : detail.slideshow ? (
            <SlidesHero uris={detail.media} width={heroW} height={heroH} rendering={detail.rendering} />
          ) : (
            <VideoHero uri={detail.media[0]} width={heroW} height={heroH} rendering={detail.rendering} />
          )}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(60).duration(240).easing(motion.tabEase)} style={{ alignItems: 'center', gap: 8, paddingBottom: 16 }}>
          <Text style={[text.card, { textAlign: 'center' }]} numberOfLines={2}>{title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Chip small tone={stateTone[state]} label={state === 'Waiting' ? 'In review' : state} />
            <Chip small tone={detail.slideshow ? 'purple' : 'blue'} label={detail.slideshow ? 'Slideshow' : 'Reel'} />
            {detail.submission?.createdAt ? <Text style={text.meta}>{`Sent ${shortDate(new Date(detail.submission.createdAt))}`}</Text> : null}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(240).easing(motion.tabEase)}>
          <StatusCard state={state} detail={detail} />
          {state === 'Changes requested' ? <NotesCard detail={detail} /> : null}
          {audio ? (
            <>
              <Label style={{ marginTop: 8, marginBottom: 8, marginLeft: 4 }}>Sound</Label>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <AudioCover t={audio.track} size={48} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={text.row}>{audio.track.title}</Text>
                  <Text numberOfLines={1} style={text.meta}>{audio.track.artist}</Text>
                </View>
                <Button pill variant="secondary" label="Add on TikTok" onPress={() => setSound(true)} />
              </Card>
            </>
          ) : null}
          <HistoryCard detail={detail} />
        </Animated.View>
      </ScrollView>

      <Sheet open={sound} onClose={() => setSound(false)} title="Add the sound on TikTok">
        {audio ? <TikTokSoundCard audio={audio} tiktokUrl={detail.assignment.post_url} onDone={() => setSound(false)} /> : null}
      </Sheet>

      <Sheet
        open={confirm}
        onClose={() => (discarding ? undefined : setConfirm(false))}
        title="Discard this post?"
        footer={
          <>
            <Button variant="quiet" label="Keep it" disabled={discarding} onPress={() => setConfirm(false)} />
            <Button variant="ink" label={discarding ? 'Discarding' : 'Discard'} disabled={discarding} onPress={() => void discard()} />
          </>
        }
      >
        <Text style={[text.body, { color: color.grey4 }]}>Your clips and edits for this post are deleted. This cannot be undone.</Text>
        {discardError ? <Text style={[text.meta, { color: color.pink, marginTop: 10 }]}>{discardError}</Text> : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  playDisc: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: color.scrim, alignItems: 'center', justifyContent: 'center' },
  renderTag: { position: 'absolute', left: 10, right: 10, bottom: 12, height: 32, borderRadius: radius.pill, backgroundColor: color.scrim, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  counter: { position: 'absolute', top: 10, right: 10, height: 24, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: color.scrim },
  dots: { position: 'absolute', left: 0, right: 0, bottom: 10, flexDirection: 'row', justifyContent: 'center', gap: 5 },
});
