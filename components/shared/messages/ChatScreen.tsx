import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { chatMediaUrl, type ChatMedia, type ChatMessage, type ChatPost } from '../../../lib/chat-thread';
import { useKeyboardHeight } from '../../../lib/keyboard';
import { usePostFrame } from '../../../lib/v2-media';
import { color, radius, shadow, text, type Tone } from '../../../theme/v2';
import { Avatar, Chip, Icon, Press, Skeleton, Thumb } from '../../v2';
import { HashDisc } from './InboxScreen';
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

export interface ChatScreenProps {
  header: ChatHeader;
  /** Null while loading. */
  messages: ChatMessage[] | null;
  onBack: () => void;
  onHeaderPress?: () => void;
  onSend: (text: string) => void;
  onRetry?: (m: ChatMessage) => void;
  onOpenPost?: (post: ChatPost) => void;
  onAttach?: () => void;
  /** Post the next message will carry, with a way to drop it. */
  pendingPost?: { title: string; onClear: () => void } | null;
  placeholder?: string;
  /** Extra chrome above the composer (e.g. a chip row). */
  above?: ReactNode;
  /** Show the author above a group from someone else (channels). */
  showAuthors?: boolean;
}

const BUBBLE_MAX = 280;

/** Pinned header and composer; only the thread scrolls. New rows scroll into view. */
export function ChatScreen({ header, messages, onBack, onHeaderPress, onSend, onRetry, onOpenPost, onAttach, pendingPost, placeholder = 'Message', above, showAuthors }: ChatScreenProps) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const first = useRef(true);
  const count = messages?.length ?? 0;

  useEffect(() => {
    if (messages === null) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: !first.current });
      first.current = false;
    }, 40);
    return () => clearTimeout(t);
  }, [count, messages, keyboard]);

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    onSend(body);
  };
  const canSend = draft.trim().length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top, paddingBottom: keyboard }}>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingLeft: 4, paddingRight: 8, backgroundColor: color.card, boxShadow: `0 1px 0 ${color.grey2}`, zIndex: 2 }}>
        <Press accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevron_left" size={32} color={color.ink} />
        </Press>
        <Press accessibilityRole="button" accessibilityLabel={header.name} onPress={onHeaderPress} disabled={!onHeaderPress} haptic={!!onHeaderPress} scaleTo={onHeaderPress ? undefined : 1} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {header.channel ? <HashDisc size={36} /> : <Avatar name={header.name} photo={header.photo} tone={header.tone ?? 'blue'} size={36} ring={false} online={header.online} />}
          <View style={{ minWidth: 0, flex: 1 }}>
            <Text numberOfLines={1} style={text.row}>{header.name}</Text>
            {header.meta ? <Text numberOfLines={1} style={text.meta}>{header.meta}</Text> : null}
          </View>
        </Press>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 20, paddingBottom: 12, gap: 4 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {messages === null ? (
          <>
            <Skeleton h={44} w={200} r={18} style={{ alignSelf: 'flex-start' }} />
            <Skeleton h={44} w={240} r={18} style={{ alignSelf: 'flex-end' }} />
            <Skeleton h={64} w={220} r={18} style={{ alignSelf: 'flex-start' }} />
          </>
        ) : messages.length === 0 ? (
          <Text style={[text.body, { color: color.grey4, textAlign: 'center', marginTop: 24 }]}>No messages yet.</Text>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const newGroup = !prev || prev.authorId !== m.authorId || prev.mine !== m.mine;
            const endGroup = !next || next.authorId !== m.authorId || next.mine !== m.mine;
            return (
              <View key={m.id} style={{ alignItems: m.mine ? 'flex-end' : 'flex-start', marginTop: i > 0 && newGroup ? 12 : 0, opacity: m.pending ? 0.6 : 1 }}>
                {showAuthors && newGroup && !m.mine ? <Text style={[text.meta, { marginBottom: 4, marginLeft: 4 }]}>{m.authorName}</Text> : null}
                {m.post ? <PostBubble post={m.post} label={m.eventLabel ?? `Take ${m.post.attempt}`} onPress={onOpenPost ? () => onOpenPost(m.post as ChatPost) : undefined} /> : null}
                {m.media ? <MediaBubble media={m.media} mine={m.mine} /> : null}
                {m.text ? (
                  <View
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
                    <Text style={[text.body, { color: m.mine ? color.white : color.ink }]}>{m.text}</Text>
                  </View>
                ) : null}
                {m.failed ? (
                  <Press onPress={onRetry ? () => onRetry(m) : undefined} accessibilityRole="button" style={{ marginTop: 4 }}>
                    <Text style={[text.meta, { color: color.amber, fontWeight: '600' }]}>Not sent. Tap to retry</Text>
                  </Press>
                ) : endGroup ? (
                  <Text style={[text.meta, { marginTop: 4 }]}>{m.pending ? 'now' : bubbleAt(m.at)}</Text>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      {above}
      {pendingPost ? (
        <View style={{ paddingHorizontal: 20, paddingBottom: 8, backgroundColor: color.card }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, height: 30, paddingLeft: 10, paddingRight: 4, borderRadius: radius.pill, backgroundColor: color.blueTint }}>
            <Icon name="movie" size={14} color={color.blueDeep} />
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: color.blueDeep, maxWidth: 220 }}>{pendingPost.title}</Text>
            <Press accessibilityRole="button" accessibilityLabel="Remove post" onPress={pendingPost.onClear} style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={16} color={color.blueDeep} />
            </Press>
          </View>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, paddingHorizontal: 20, paddingBottom: keyboard > 0 ? 8 : Math.max(insets.bottom, 16), backgroundColor: color.card, boxShadow: `0 -1px 0 ${color.grey2}` }}>
        <Press accessibilityRole="button" accessibilityLabel="Attach" onPress={onAttach} disabled={!onAttach} style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: color.blueTint, alignItems: 'center', justifyContent: 'center', opacity: onAttach ? 1 : 0.5 }}>
          <Icon name="add" size={24} weight={700} color={color.blueDeep} />
        </Press>
        <TextInput
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
    </View>
  );
}

/** A post travelling through the thread: thumb, title, state chip and "Tap to review". */
function PostBubble({ post, label, onPress }: { post: ChatPost; label: string; onPress?: () => void }) {
  const frame = usePostFrame({ mediaPath: post.mediaPath, mediaFormat: post.mediaFormat });
  return (
    <Press onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={post.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, marginBottom: 6, maxWidth: BUBBLE_MAX, backgroundColor: color.card, borderRadius: radius.card, ...shadow.card }}>
      <Thumb w={44} radius={8} post={{ frame, type: post.typeLabel, title: post.title, format: post.format }} />
      <View style={{ minWidth: 0, flex: 1 }}>
        <Text numberOfLines={1} style={text.row}>{post.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Chip tone="amber" small label={label} />
          {onPress ? <Text style={text.meta}>Tap to review</Text> : null}
        </View>
      </View>
    </Press>
  );
}

function MediaBubble({ media, mine }: { media: ChatMedia; mine: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void chatMediaUrl(media).then((u) => live && setUrl(u)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [media]);
  if (media.kind === 'image') {
    return (
      <View style={{ width: 200, height: 200, borderRadius: 18, borderBottomRightRadius: mine ? 6 : 18, borderBottomLeftRadius: mine ? 18 : 6, overflow: 'hidden', backgroundColor: color.grey2, marginBottom: 4 }}>
        {url ? <Image source={{ uri: url }} resizeMode="cover" style={{ width: 200, height: 200 }} /> : null}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: mine ? color.blue : color.card, marginBottom: 4, ...(mine ? {} : shadow.card) }}>
      <Icon name={media.kind === 'voice' ? 'graphic_eq' : 'play_arrow'} size={18} color={mine ? color.white : color.ink} />
      <Text style={[text.body, { color: mine ? color.white : color.ink, fontWeight: '600' }]}>{media.kind === 'voice' ? 'Voice note' : 'Video'}{media.len ? ` · ${media.len}` : ''}</Text>
    </View>
  );
}
