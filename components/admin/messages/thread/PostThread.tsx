import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { useKeyboardPadding } from '../../../../lib/keyboard';
import { listPostThread, sendMessage, type ThreadMessage } from '../../../../lib/messages-api';
import type { PostEvent, PostSummary } from '../../../../lib/post-event-labels';
import { listPostEvents } from '../../../../lib/post-events';
import { borderWidth, color, radiusAdmin, space } from '../../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { usePostThumb } from '../../creator/useVideoThumb';
import { EmptyState, PushHeader, SkeletonCard, Thumb } from '../../shared';
import { Composer, type AttachTile } from '../Composer';
import { NoteRows, PostEventPill } from '../PostEventPill';
import { pickMediaAsset, sendPickedMedia } from './attachMedia';
import { eventEntry, messageEntry, type ThreadEntry } from './threadEntries';
import { ThreadItemView } from './ThreadItemView';
import { buildThreadItems } from './threadRows';

const POLL_MS = 5000;
const TILES: AttachTile[] = ['photo', 'camera'];

type PostThreadData = {
  summary: PostSummary | null;
  events: PostEvent[];
  messages: ThreadMessage[];
};

export type PostThreadProps = {
  companyId: string;
  assignmentId: string;
  meId: string;
};

async function loadPostThread(companyId: string, assignmentId: string): Promise<PostThreadData> {
  const [{ events, summary }, messages] = await Promise.all([
    listPostEvents(companyId, assignmentId),
    listPostThread(companyId, assignmentId),
  ]);
  return { summary, events, messages };
}

function renderEvent(event: PostEvent) {
  if (event.kind === 'comment') return null;
  return (
    <View style={styles.event}>
      <PostEventPill kind={event.kind} label={event.label} size="thread" />
      {event.kind === 'sent_back' && event.notes !== undefined && event.notes.length > 0 && (
        <View style={styles.notes}>
          <NoteRows notes={event.notes} variant="thread" />
        </View>
      )}
    </View>
  );
}

export function PostThread({ companyId, assignmentId, meId }: PostThreadProps) {
  const keyboardPadding = useKeyboardPadding();
  const [data, setData] = useState<PostThreadData | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const didInitialScroll = useRef(false);

  const summary = data?.summary ?? null;
  const thumb = usePostThumb(summary?.mediaPath ?? null, summary?.format ?? 'video');

  const load = useCallback(async () => {
    try {
      setData(await loadPostThread(companyId, assignmentId));
    } catch {
      // Poll retries; keep what is on screen.
    }
  }, [companyId, assignmentId]);

  useEffect(() => {
    void Promise.resolve().then(load);
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const items = useMemo(() => {
    if (data === null || data.summary === null) return [];
    const creatorId = data.summary.creatorId;
    const entries: ThreadEntry[] = [
      ...data.messages.map((m) => messageEntry(m, meId)),
      ...data.events.map((e) => eventEntry(e, creatorId)),
    ];
    return buildThreadItems(entries);
  }, [data, meId]);

  useEffect(() => {
    if (data === null || didInitialScroll.current) return;
    didInitialScroll.current = true;
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 120);
  }, [data]);

  const scrollToEndSoon = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const send = async () => {
    const body = draft.trim();
    if (body.length === 0 || sending || summary === null) return;
    setSending(true);
    try {
      await sendMessage({
        companyId,
        creatorId: summary.creatorId,
        authorId: meId,
        body,
        assignmentId,
      });
      setDraft('');
      await load();
      scrollToEndSoon();
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSending(false);
    }
  };

  const attach = async (tile: AttachTile) => {
    setAttachOpen(false);
    if (tile === 'post' || summary === null) return;
    const asset = await pickMediaAsset(tile);
    if (asset === null || sending) return;
    setSending(true);
    try {
      await sendPickedMedia({
        companyId,
        creatorId: summary.creatorId,
        authorId: meId,
        asset,
        caption: draft,
        assignmentId,
      });
      setDraft('');
      await load();
      scrollToEndSoon();
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSending(false);
    }
  };

  if (data !== null && summary === null) {
    return (
      <View style={styles.flex}>
        <View style={styles.header}>
          <PushHeader title="Post" onBack={() => router.back()} />
        </View>
        <EmptyState
          title="Post not found"
          body="This post may have been removed."
          actionLabel="Go back"
          onAction={() => router.back()}
          style={styles.notFound}
        />
      </View>
    );
  }

  const waiting = data?.events.some((e) => e.waiting) ?? false;
  const formatLabel = summary?.format === 'photo_carousel' ? 'Slideshow' : 'Reel';

  return (
    <View style={[styles.flex, { paddingBottom: keyboardPadding }]}>
      <View style={styles.header}>
        <PushHeader
          title={summary?.title ?? ''}
          subtitle={
            summary !== null
              ? `${summary.creatorName} \u00b7 ${summary.typeLabel} \u00b7 ${formatLabel}`
              : undefined
          }
          onBack={() => router.back()}
          trailing={
            summary !== null ? (
              <Thumb uri={thumb} format={summary.format} width={34} height={46} radius={radiusAdmin.sm} />
            ) : undefined
          }
        />
      </View>

      {waiting && summary !== null && (
        <View style={styles.banner}>
          <Icon name="inbox" size={16} color={color.blue600} />
          <Text style={styles.bannerText}>{`Take ${summary.attempt} is waiting on you`}</Text>
          <Button
            size="sm"
            variant="primary"
            onPress={() =>
              router.push({ pathname: '/(admin)/review/[id]', params: { id: assignmentId } })
            }
          >
            Review
          </Button>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {data === null ? (
          <View style={styles.skeletons}>
            <SkeletonCard height={56} />
            <SkeletonCard height={56} />
            <SkeletonCard height={56} />
          </View>
        ) : (
          items.map((item) => <ThreadItemView key={item.id} item={item} renderEvent={renderEvent} />)
        )}
      </ScrollView>

      <Composer
        placeholder="Reply about this post"
        draft={draft}
        onChangeDraft={setDraft}
        canSend={draft.trim().length > 0 && summary !== null}
        sending={sending}
        attachOpen={attachOpen}
        onToggleAttach={() => setAttachOpen((open) => !open)}
        tiles={TILES}
        onAttach={(tile) => void attach(tile)}
        onSend={() => void send()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    paddingTop: 4,
    paddingHorizontal: space.gutterAdmin,
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
    backgroundColor: color.white,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    marginHorizontal: space.gutterAdmin,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.blue50,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: color.ink,
  },
  list: {
    paddingTop: 4,
    paddingHorizontal: space.gutterAdmin,
    paddingBottom: 16,
  },
  skeletons: {
    gap: 10,
    paddingTop: 10,
  },
  event: {
    marginTop: 4,
  },
  notes: {
    marginTop: 6,
  },
  notFound: {
    marginTop: 40,
  },
});
