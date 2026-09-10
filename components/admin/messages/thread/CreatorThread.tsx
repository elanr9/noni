import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { useKeyboardPadding } from '../../../../lib/keyboard';
import {
  listThread,
  markCreatorThreadRead,
  sendMessage,
  type ThreadMessage,
} from '../../../../lib/messages-api';
import { assignedLabel, type PostEvent, type PostSummary } from '../../../../lib/post-event-labels';
import {
  listCreatorPostEvents,
  listPostSummaries,
  startOfCurrentWeekIso,
} from '../../../../lib/post-events';
import { borderWidth, color, radiusAdmin, space } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { PressableScale } from '../../../ui/PressableScale';
import { MuteButton } from '../../chat/MuteButton';
import { Avatar, PushHeader, SkeletonCard } from '../../shared';
import { Composer, type AttachTile } from '../Composer';
import { PostCard } from '../PostCard';
import type { PostEventCardKind } from '../PostEventPill';
import { PostPickerSheet } from '../PostPickerSheet';
import { pickMediaAsset, sendPickedMedia } from './attachMedia';
import { eventEntry, latestCreatorMessageAt, messageEntry, type ThreadEntry } from './threadEntries';
import { ThreadItemView } from './ThreadItemView';
import { buildThreadItems } from './threadRows';

const POLL_MS = 5000;
const TILES: AttachTile[] = ['post', 'photo', 'camera'];

type ThreadData = {
  messages: ThreadMessage[];
  events: PostEvent[];
  summaries: Map<string, PostSummary>;
};

export type CreatorThreadProps = {
  companyId: string;
  creatorId: string;
  meId: string;
  creatorName: string;
  handle: string | null;
  muted: boolean;
  onToggleMute: () => void;
  initialAssignmentId?: string;
};

function headerSubtitle(handle: string | null, summaries: Map<string, PostSummary>): string {
  const weekStart = startOfCurrentWeekIso();
  let inReview = 0;
  let liveThisWeek = 0;
  for (const s of summaries.values()) {
    if (s.status === 'submitted') inReview += 1;
    if (s.status === 'posted' && s.scheduledDate >= weekStart) liveThisWeek += 1;
  }
  const parts = [`${inReview} posts in review`, `${liveThisWeek} live this week`];
  if (handle !== null) parts.unshift(`@${handle}`);
  return parts.join(' \u00b7 ');
}

function latestCardEvents(events: PostEvent[]): Map<string, PostEvent> {
  const latest = new Map<string, PostEvent>();
  for (const e of events) {
    if (e.kind === 'comment') continue;
    const prev = latest.get(e.assignmentId);
    if (prev === undefined || e.at > prev.at) latest.set(e.assignmentId, e);
  }
  return latest;
}

async function loadThread(companyId: string, creatorId: string): Promise<ThreadData> {
  const [messages, { events, summaries }] = await Promise.all([
    listThread(companyId, creatorId),
    listCreatorPostEvents(companyId, creatorId, startOfCurrentWeekIso()),
  ]);
  const missing = messages.flatMap((m) => {
    const id = m.postRef?.assignmentId;
    return id !== undefined && id !== null && !summaries.has(id) ? [id] : [];
  });
  if (missing.length > 0) {
    for (const [id, summary] of await listPostSummaries(companyId, missing)) summaries.set(id, summary);
  }
  return { messages, events, summaries };
}

export function CreatorThread({
  companyId,
  creatorId,
  meId,
  creatorName,
  handle,
  muted,
  onToggleMute,
  initialAssignmentId,
}: CreatorThreadProps) {
  const keyboardPadding = useKeyboardPadding();
  const [data, setData] = useState<ThreadData | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PostSummary | null>(null);
  const [sending, setSending] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const rowY = useRef(new Map<string, number>());
  const didInitialScroll = useRef(false);
  const didPreselect = useRef(false);
  const lastCreatorMsgAt = useRef<string | null | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const next = await loadThread(companyId, creatorId);
      setData(next);
      const latest = latestCreatorMessageAt(next.messages);
      if (lastCreatorMsgAt.current === undefined || latest !== lastCreatorMsgAt.current) {
        lastCreatorMsgAt.current = latest;
        markCreatorThreadRead({ companyId, creatorId, profileId: meId }).catch(() => undefined);
      }
      if (!didPreselect.current && initialAssignmentId !== undefined) {
        didPreselect.current = true;
        const summary = next.summaries.get(initialAssignmentId);
        if (summary !== undefined) setPending(summary);
      }
    } catch {
      // Poll retries; keep what is on screen.
    }
  }, [companyId, creatorId, meId, initialAssignmentId]);

  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(() => void load(), POLL_MS);
      void load();
      return () => clearInterval(timer);
    }, [load]),
  );

  const items = useMemo(() => {
    if (data === null) return [];
    const entries: ThreadEntry[] = [
      ...data.messages.map((m) => messageEntry(m, meId)),
      ...data.events.map((e) => eventEntry(e, creatorId)),
    ];
    return buildThreadItems(entries);
  }, [data, meId, creatorId]);

  const latestEvents = useMemo(() => latestCardEvents(data?.events ?? []), [data]);

  useEffect(() => {
    if (data === null || didInitialScroll.current) return;
    didInitialScroll.current = true;
    const target =
      initialAssignmentId !== undefined
        ? [...items].reverse().find((row) => {
            if (row.type !== 'row') return false;
            const e = row.item;
            return e.kind === 'event'
              ? e.event.assignmentId === initialAssignmentId
              : e.message.postRef?.assignmentId === initialAssignmentId;
          })
        : undefined;
    setTimeout(() => {
      if (target !== undefined) {
        const y = rowY.current.get(target.id);
        if (y !== undefined) {
          scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: false });
          return;
        }
      }
      scrollRef.current?.scrollToEnd({ animated: false });
    }, 120);
  }, [data, items, initialAssignmentId]);

  const scrollToEndSoon = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const send = async () => {
    const body = draft.trim();
    if (body.length === 0 || sending) return;
    setSending(true);
    try {
      await sendMessage({
        companyId,
        creatorId,
        authorId: meId,
        body,
        assignmentId: pending?.assignmentId,
      });
      setDraft('');
      setPending(null);
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
    if (tile === 'post') {
      setPickerOpen(true);
      return;
    }
    const asset = await pickMediaAsset(tile);
    if (asset === null || sending) return;
    setSending(true);
    try {
      await sendPickedMedia({ companyId, creatorId, authorId: meId, asset, caption: draft });
      setDraft('');
      await load();
      scrollToEndSoon();
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSending(false);
    }
  };

  const openPost = (assignmentId: string) =>
    router.push({ pathname: '/(admin)/post-thread/[assignmentId]', params: { assignmentId } });
  const openReview = (assignmentId: string) =>
    router.push({ pathname: '/(admin)/review/[id]', params: { id: assignmentId } });

  const renderEvent = (event: PostEvent) => {
    const summary = data?.summaries.get(event.assignmentId);
    if (summary === undefined || event.kind === 'comment') return null;
    return (
      <PostCard
        summary={summary}
        kind={event.kind}
        label={event.label}
        notes={event.notes}
        waiting={event.waiting}
        onOpen={() => openPost(event.assignmentId)}
        onReview={() => openReview(event.assignmentId)}
      />
    );
  };

  const renderPostRef = (message: ThreadMessage) => {
    const assignmentId = message.postRef?.assignmentId;
    if (assignmentId === undefined || assignmentId === null) return null;
    const summary = data?.summaries.get(assignmentId);
    if (summary === undefined) return null;
    const latest = latestEvents.get(assignmentId);
    const kind: PostEventCardKind = latest !== undefined && latest.kind !== 'comment' ? latest.kind : 'assigned';
    return (
      <PostCard
        summary={summary}
        kind={kind}
        label={latest?.label ?? assignedLabel(summary.scheduledDate)}
        onOpen={() => openPost(assignmentId)}
        onReview={() => openReview(assignmentId)}
      />
    );
  };

  const firstName = creatorName.split(' ')[0] || creatorName;

  return (
    <View style={[styles.flex, { paddingBottom: keyboardPadding }]}>
      <View style={styles.header}>
        <PushHeader
          title={creatorName}
          subtitle={headerSubtitle(handle, data?.summaries ?? new Map())}
          onBack={() => router.back()}
          trailing={
            <View style={styles.trailing}>
              <MuteButton muted={muted} onToggle={onToggleMute} />
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Open profile"
                hitSlop={5}
                onPress={() =>
                  router.push({ pathname: '/(admin)/creator/[id]', params: { id: creatorId } })
                }
              >
                <Avatar name={creatorName} size={34} />
              </PressableScale>
            </View>
          }
        />
      </View>

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
        ) : items.length === 0 ? (
          <Text style={styles.empty}>No messages yet. Say hello.</Text>
        ) : (
          items.map((item) => (
            <View key={item.id} onLayout={(e) => rowY.current.set(item.id, e.nativeEvent.layout.y)}>
              <ThreadItemView item={item} renderEvent={renderEvent} renderPostRef={renderPostRef} />
            </View>
          ))
        )}
      </ScrollView>

      {pending !== null && (
        <View style={styles.pendingWrap}>
          <View style={styles.pending}>
            <Icon name="layout-list" size={14} color={color.blue700} />
            <Text numberOfLines={1} style={styles.pendingTitle}>
              {pending.title}
            </Text>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Remove post"
              onPress={() => setPending(null)}
              hitSlop={15}
            >
              <Icon name="x" size={14} color={color.blue700} />
            </PressableScale>
          </View>
        </View>
      )}

      <Composer
        placeholder={`Message ${firstName}`}
        draft={draft}
        onChangeDraft={setDraft}
        canSend={draft.trim().length > 0}
        sending={sending}
        attachOpen={attachOpen}
        onToggleAttach={() => setAttachOpen((open) => !open)}
        tiles={TILES}
        onAttach={(tile) => void attach(tile)}
        onSend={() => void send()}
      />

      <PostPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        companyId={companyId}
        creatorId={creatorId}
        onPick={(summary) => {
          setPending(summary);
          setPickerOpen(false);
        }}
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
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  empty: {
    marginTop: 24,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: color.slate500,
  },
  pendingWrap: {
    paddingHorizontal: space.gutterAdmin,
    paddingBottom: 8,
    backgroundColor: color.white,
  },
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue100,
  },
  pendingTitle: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: color.blue700,
  },
});
