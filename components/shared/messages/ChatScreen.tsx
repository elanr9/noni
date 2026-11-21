import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, TextInput, View,
  type ScrollViewInstance, type TextInputInstance,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MessageExtras, PostState } from '../../../lib/admin-messages-extras';
import { chatMediaUrl, type ChatMedia, type ChatMessage, type ChatPost } from '../../../lib/chat-thread';
import { useKeyboardHeight } from '../../../lib/keyboard';
import { usePostFrame } from '../../../lib/v2-media';
import { color, motion, radius, shadow, text, type Tone } from '../../../theme/v2';
import { Avatar, Button, Chip, Icon, Press, Skeleton, Thumb } from '../../v2';
import { HashDisc } from './InboxScreen';
import { MediaViewer } from './MediaViewer';
import { bubbleAt } from './model';

export type ChatHeader = {
  name: string;
  /** Second line: handle, role or head count. Never presence. */
  meta: string;
  photo?: string | null;
  tone?: Tone;
  online?: boolean;
  /** Channel: a "#" disc instead of an avatar. */
  channel?: boolean;
};

/**
 * A thread row; `localUri` marks an attachment still uploading. A row with an
 * event label and no post draws as a centred event pill, its notes under it.
 */
export type ChatRow = ChatMessage & { localUri?: string; notes?: { label: string; text: string }[]; eventTone?: Tone };

export interface ChatScreenProps {
  header: ChatHeader;
  /** Null while loading. */
  messages: ChatRow[] | null;
  /** The first load failed: an error card with Retry replaces the skeletons. */
  error?: boolean;
  onReload?: () => void;
  onBack: () => void;
  onHeaderPress?: () => void;
  onSend: (text: string) => void;
  onRetry?: (m: ChatMessage) => void;
  onOpenPost?: (post: ChatPost) => void;
  /** Pill label, tone and hint for a post card. Without it the event label shows in amber. */
  describePost?: (post: ChatPost) => PostState;
  onAttach?: () => void;
  /** Post the next message will carry, with a way to drop it. */
  pendingPost?: { title: string; onClear: () => void } | null;
  placeholder?: string;
  /** Extra chrome above the composer (e.g. a chip row). */
  above?: ReactNode;
  /** Show the author above a group from someone else (channels). */
  showAuthors?: boolean;
  /** Reply quotes and reactions by message id. */
  extras?: Map<string, MessageExtras>;
  /** Long press: open the message actions sheet. */
  onLongPressMessage?: (m: ChatMessage) => void;
  /** Tap a reaction pill to toggle it. */
  onToggleReaction?: (m: ChatMessage, emoji: string) => void;
  /** The message the next send replies to. */
  replyingTo?: { authorName: string; snippet: string; onClear: () => void } | null;
  /** Shown when the thread has no messages. */
  emptyText?: string;
}

const BUBBLE_MAX = 280;

/** Pinned header and composer; only the thread scrolls. New rows scroll into view. */
export function ChatScreen({ header, messages, error, onReload, onBack, onHeaderPress, onSend, onRetry, onOpenPost, describePost, onAttach, pendingPost, placeholder = 'Message', above, showAuthors, extras, onLongPressMessage, onToggleReaction, replyingTo, emptyText = 'No messages yet. Say hi.' }: ChatScreenProps) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const [draft, setDraft] = useState('');
  const [viewing, setViewing] = useState<{ media: ChatMedia; url: string | null } | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const inputRef = useRef<TextInputInstance>(null);
  const first = useRef(true);
  /** After the first scroll, new rows animate in. */
  const [settled, setSettled] = useState(false);
  const count = messages?.length ?? 0;

  useEffect(() => {
    if (messages === null) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: !first.current });
      first.current = false;
      setSettled(true);
    }, 40);
    return () => clearTimeout(t);
  }, [count, messages, keyboard]);

  useEffect(() => {
    if (replyingTo) inputRef.current?.focus();
  }, [replyingTo]);

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    onSend(body);
  };
  const canSend = draft.trim().length > 0;

  const openMedia = (media: ChatMedia, url: string | null) => {
    setViewing({ media, url });
    if (url) return;
    void chatMediaUrl(media)
      .then((u) => setViewing((v) => (v && v.media === media ? { media, url: u } : v)))
      .catch(() => setViewing(null));
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingBottom: keyboard }}>
      <View style={{ height: 56 + insets.top, paddingTop: insets.top, flexDirection: 'row', alignItems: 'center', paddingLeft: 4, paddingRight: 8, backgroundColor: color.card, boxShadow: `0 1px 0 ${color.grey2}`, zIndex: 2 }}>
        <Press accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevron_left" size={32} color={color.ink} />
        </Press>
        <Press accessibilityRole="button" accessibilityLabel={header.name} onPress={onHeaderPress} disabled={!onHeaderPress} haptic={!!onHeaderPress} scaleTo={onHeaderPress ? undefined : 1} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {header.channel ? <HashDisc size={36} /> : <Avatar name={header.name} photo={header.photo} tone={header.tone ?? 'blue'} size={36} ring={false} online={header.online} />}
          <View style={{ minWidth: 0, flex: 1 }}>
            <Text numberOfLines={1} style={text.row}>{header.name}</Text>
            {header.meta ? <Text numberOfLines={1} style={text.meta}>{header.meta}</Text> : null}
          </View>
          {onHeaderPress ? <Icon name="chevron_right" size={22} color={color.grey3} /> : null}
        </Press>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 20, paddingBottom: 12, gap: 4, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {messages === null ? (
          error ? (
            <Animated.View entering={FadeIn.duration(motion.tabIn)} style={{ alignItems: 'center', gap: 12, marginTop: 40, paddingHorizontal: 24 }}>
              <Icon name="cloud_off" size={36} color={color.grey3} />
              <Text style={[text.row, { textAlign: 'center' }]}>Could not load this chat</Text>
              <Text style={[text.body, { color: color.grey4, textAlign: 'center' }]}>Check your connection and try again.</Text>
              {onReload ? <Button pill variant="secondary" icon="refresh" label="Try again" onPress={onReload} /> : null}
            </Animated.View>
          ) : (
            <>
              <Skeleton h={44} w={200} r={18} style={{ alignSelf: 'flex-start' }} />
              <Skeleton h={44} w={240} r={18} style={{ alignSelf: 'flex-end' }} />
              <Skeleton h={64} w={220} r={18} style={{ alignSelf: 'flex-start' }} />
            </>
          )
        ) : messages.length === 0 ? (
          <Animated.View entering={FadeIn.duration(motion.tabIn)} style={{ alignItems: 'center', gap: 8, marginTop: 40, paddingHorizontal: 24 }}>
            <Icon name="chat_bubble" size={36} color={color.grey3} />
            <Text style={[text.body, { color: color.grey4, textAlign: 'center' }]}>{emptyText}</Text>
          </Animated.View>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const newGroup = !prev || prev.authorId !== m.authorId || prev.mine !== m.mine;
            const endGroup = !next || next.authorId !== m.authorId || next.mine !== m.mine;
            if (m.eventLabel && !m.post) {
              return <EventRow key={m.id} label={m.eventLabel} tone={m.eventTone ?? 'grey'} notes={m.notes} at={m.at} author={m.authorName} />;
            }
            const extra = extras?.get(m.id);
            const longPress = onLongPressMessage && !m.pending && !m.failed && !m.id.startsWith('e:') ? () => onLongPressMessage(m) : undefined;
            return (
              <Animated.View
                key={m.id}
                entering={settled ? FadeInDown.duration(motion.tabInShort) : undefined}
                layout={LinearTransition.duration(motion.tabInShort)}
                style={{ alignItems: m.mine ? 'flex-end' : 'flex-start', marginTop: i > 0 && newGroup ? 12 : 0, opacity: m.pending ? 0.6 : 1 }}
              >
                {showAuthors && newGroup && !m.mine ? <Text style={[text.meta, { marginBottom: 4, marginLeft: 4 }]}>{m.authorName}</Text> : null}
                {m.post ? <PostBubble post={m.post} eventLabel={m.eventLabel} describe={describePost} onPress={onOpenPost ? () => onOpenPost(m.post as ChatPost) : undefined} /> : null}
                {m.media ? <MediaBubble media={m.media} localUri={m.localUri} mine={m.mine} uploading={!!m.pending} onOpen={openMedia} onLongPress={longPress} /> : null}
                {m.text ? (
                  <Press
                    onLongPress={longPress}
                    delayLongPress={300}
                    disabled={!longPress}
                    haptic={false}
                    accessibilityHint={longPress ? 'Long press for reply, react and copy' : undefined}
                    style={{
                      maxWidth: BUBBLE_MAX,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: 18,
                      borderBottomRightRadius: m.mine ? 6 : 18,
                      borderBottomLeftRadius: m.mine ? 18 : 6,
                      backgroundColor: m.mine ? color.blue : color.card,
                      ...(m.mine ? {} : shadow.card),
                    }}
                  >
                    {extra?.replyTo ? (
                      <View style={{ borderLeftWidth: 2, borderLeftColor: m.mine ? color.white : color.blue, paddingLeft: 8, marginBottom: 6, opacity: 0.85 }}>
                        <Text numberOfLines={1} style={[text.meta, { fontWeight: '700', color: m.mine ? color.white : color.blueDeep }]}>{extra.replyTo.authorName}</Text>
                        <Text numberOfLines={2} style={[text.meta, { color: m.mine ? color.white : color.grey4 }]}>{extra.replyTo.snippet}</Text>
                      </View>
                    ) : null}
                    <Text selectable={!longPress} style={[text.body, { color: m.mine ? color.white : color.ink }]}>{m.text}</Text>
                  </Press>
                ) : null}
                {extra && extra.reactions.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4, justifyContent: m.mine ? 'flex-end' : 'flex-start', maxWidth: BUBBLE_MAX }}>
                    {extra.reactions.map((r) => (
                      <Press
                        key={r.emoji}
                        accessibilityRole="button"
                        accessibilityLabel={`${r.emoji} ${r.count}`}
                        onPress={onToggleReaction ? () => onToggleReaction(m, r.emoji) : undefined}
                        disabled={!onToggleReaction}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: r.mine ? color.blueTint : color.card, borderWidth: 1, borderColor: r.mine ? color.blue : color.grey2 }}
                      >
                        <Text style={{ fontSize: 14 }}>{r.emoji}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: r.mine ? color.blueDeep : color.grey4 }}>{r.count}</Text>
                      </Press>
                    ))}
                  </View>
                ) : null}
                {m.failed ? (
                  <Press onPress={onRetry ? () => onRetry(m) : undefined} accessibilityRole="button" style={{ marginTop: 4 }}>
                    <Text style={[text.meta, { color: color.amber, fontWeight: '600' }]}>Not sent. Tap to retry</Text>
                  </Press>
                ) : endGroup ? (
                  <Text style={[text.meta, { marginTop: 4 }]}>{m.pending ? (m.localUri ? 'Sending...' : 'now') : bubbleAt(m.at)}</Text>
                ) : null}
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      {above}
      {replyingTo ? (
        <Animated.View entering={FadeInDown.duration(motion.tabInShort)} exiting={FadeOut.duration(motion.press * 2)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: color.card, boxShadow: `0 -1px 0 ${color.grey2}` }}>
          <Icon name="reply" size={20} color={color.blue} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[text.meta, { color: color.blueDeep, fontWeight: '700' }]}>Replying to {replyingTo.authorName}</Text>
            <Text numberOfLines={1} style={text.meta}>{replyingTo.snippet}</Text>
          </View>
          <Press accessibilityRole="button" accessibilityLabel="Cancel reply" onPress={replyingTo.onClear} style={{ width: 32, height: 32, borderRadius: radius.pill, backgroundColor: color.grey1, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" size={18} color={color.grey4} />
          </Press>
        </Animated.View>
      ) : null}
      {pendingPost ? (
        <Animated.View entering={FadeInDown.duration(motion.tabInShort)} exiting={FadeOut.duration(motion.press * 2)} style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8, backgroundColor: color.card }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, height: 30, paddingLeft: 10, paddingRight: 4, borderRadius: radius.pill, backgroundColor: color.blueTint }}>
            <Icon name="movie" size={14} color={color.blueDeep} />
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: color.blueDeep, maxWidth: 220 }}>{pendingPost.title}</Text>
            <Press accessibilityRole="button" accessibilityLabel="Remove post" onPress={pendingPost.onClear} style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={16} color={color.blueDeep} />
            </Press>
          </View>
        </Animated.View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, paddingHorizontal: 20, paddingBottom: keyboard > 0 ? 8 : Math.max(insets.bottom, 16), backgroundColor: color.card, boxShadow: replyingTo || pendingPost ? undefined : `0 -1px 0 ${color.grey2}` }}>
        <Press accessibilityRole="button" accessibilityLabel="Attach" onPress={onAttach} disabled={!onAttach} style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: color.blueTint, alignItems: 'center', justifyContent: 'center', opacity: onAttach ? 1 : 0.5 }}>
          <Icon name="add" size={24} weight={700} color={color.blueDeep} />
        </Press>
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={color.grey3}
          onSubmitEditing={send}
          returnKeyType="send"
          blurOnSubmit={false}
          style={{ flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: color.grey1, paddingHorizontal: 16, fontSize: 15, color: color.ink }}
        />
        <Press accessibilityRole="button" accessibilityLabel="Send" onPress={send} disabled={!canSend} haptic={canSend} style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: canSend ? color.blue : color.grey2, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="arrow_upward" size={24} weight={700} color={color.white} />
        </Press>
      </View>
      <MediaViewer media={viewing?.media ?? null} url={viewing?.url ?? null} onClose={() => setViewing(null)} />
    </View>
  );
}

/** A post travelling through the thread: thumb, title, its real state and where a tap goes. */
function PostBubble({ post, eventLabel, describe, onPress }: { post: ChatPost; eventLabel: string | null; describe?: (post: ChatPost) => PostState; onPress?: () => void }) {
  const frame = usePostFrame({ mediaPath: post.mediaPath, mediaFormat: post.mediaFormat });
  const state = describe ? describe(post) : null;
  const chipLabel = state?.label ?? eventLabel ?? `Take ${post.attempt}`;
  return (
    <Press onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={`${post.title}, ${chipLabel}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, marginBottom: 6, maxWidth: BUBBLE_MAX, backgroundColor: color.card, borderRadius: radius.card, ...shadow.card }}>
      <Thumb w={44} radius={8} post={{ frame, type: post.typeLabel, title: post.title, format: post.format }} />
      <View style={{ minWidth: 0, flex: 1 }}>
        {state && eventLabel ? <Text numberOfLines={1} style={[text.meta, { fontSize: 12 }]}>{eventLabel}</Text> : null}
        <Text numberOfLines={1} style={text.row}>{post.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Chip tone={state?.tone ?? 'amber'} small label={chipLabel} />
          {onPress && state?.hint ? <Text numberOfLines={1} style={[text.meta, { flexShrink: 1 }]}>{state.hint}</Text> : null}
        </View>
      </View>
      {onPress ? <Icon name="chevron_right" size={20} color={color.grey3} /> : null}
    </Press>
  );
}

function MediaBubble({ media, localUri, mine, uploading, onOpen, onLongPress }: { media: ChatMedia; localUri?: string; mine: boolean; uploading: boolean; onOpen: (media: ChatMedia, url: string | null) => void; onLongPress?: () => void }) {
  const [url, setUrl] = useState<string | null>(localUri ?? null);
  useEffect(() => {
    if (localUri) return;
    let live = true;
    void chatMediaUrl(media).then((u) => live && setUrl(u)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [media, localUri]);
  const corners = { borderRadius: 18, borderBottomRightRadius: mine ? 6 : 18, borderBottomLeftRadius: mine ? 18 : 6 };
  const open = uploading ? undefined : () => onOpen(media, url);
  if (media.kind === 'image') {
    return (
      <Press onPress={open} onLongPress={onLongPress} disabled={uploading} accessibilityRole="imagebutton" accessibilityLabel="Photo, tap to open" style={{ width: 200, height: 200, ...corners, overflow: 'hidden', backgroundColor: color.grey2, marginBottom: 4 }}>
        {url ? <Image source={{ uri: url }} resizeMode="cover" style={{ width: 200, height: 200 }} /> : <Skeleton h={200} w={200} r={0} />}
        {uploading ? <UploadingVeil /> : null}
      </Press>
    );
  }
  const voice = media.kind === 'voice';
  const fg = mine ? color.white : color.ink;
  return (
    <Press onPress={open} onLongPress={onLongPress} disabled={uploading} accessibilityRole="button" accessibilityLabel={voice ? 'Play voice note' : 'Play video'} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingLeft: 6, paddingRight: 16, borderRadius: radius.pill, backgroundColor: mine ? color.blue : color.card, marginBottom: 4, ...(mine ? {} : shadow.card) }}>
      <View style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: mine ? color.white : color.blueTint, alignItems: 'center', justifyContent: 'center' }}>
        {uploading ? <ActivityIndicator size="small" color={color.blue} /> : <Icon name="play_arrow" size={22} color={mine ? color.blue : color.blueDeep} />}
      </View>
      {voice ? <Icon name="graphic_eq" size={20} color={fg} /> : <Icon name="videocam" size={20} color={fg} />}
      <Text style={[text.body, { color: fg, fontWeight: '600' }]}>{voice ? 'Voice note' : 'Video'}{media.len ? ` · ${media.len}` : ''}</Text>
    </Press>
  );
}

/** A post event inside a thread: tone pill, who and when, then any notes. */
function EventRow({ label, tone, notes, at, author }: { label: string; tone: Tone; notes?: { label: string; text: string }[]; at: string; author: string }) {
  return (
    <Animated.View entering={FadeIn.duration(motion.tabInShort)} style={{ alignItems: 'center', marginVertical: 10, gap: 6 }}>
      <Chip tone={tone} small label={label} />
      <Text style={[text.meta, { fontSize: 12 }]}>{`${author} · ${bubbleAt(at)}`}</Text>
      {notes && notes.length > 0 ? (
        <View style={{ alignSelf: 'stretch', gap: 6, marginTop: 2 }}>
          {notes.map((n, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10, padding: 10, borderRadius: 12, backgroundColor: color.card, borderLeftWidth: 3, borderLeftColor: color.amber, ...shadow.card }}>
              <Text style={{ fontSize: 12, lineHeight: 18, fontWeight: '700', color: color.amber, minWidth: 56 }}>{n.label}</Text>
              <Text style={[text.body, { flex: 1, fontSize: 14 }]}>{n.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}

function UploadingVeil() {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: color.scrim }}>
      <ActivityIndicator color={color.white} />
    </View>
  );
}
