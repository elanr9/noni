import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';

import {
  QUICK_REACTIONS,
  listAttachablePosts,
  loadMessageExtras,
  reactToMessage,
  sendReply,
  supportsReplies,
  type MessageExtras,
  type PostState,
} from '../../../lib/admin-messages-extras';
import {
  loadChatThread,
  markChatThreadRead,
  sendChatMedia,
  sendChatMessage,
  subscribeChatThread,
  toChatPost,
  type ChatMessage,
  type ChatPost,
  type ChatTarget,
} from '../../../lib/chat-thread';
import type { PostSummary } from '../../../lib/post-event-labels';
import { usePostFrame } from '../../../lib/v2-media';
import { color, radius, text } from '../../../theme/v2';
import { Chip, Icon, Press, Sheet, Skeleton, Thumb, type IconName } from '../../v2';
import { toast } from '../../v2/Toast';
import { ChatScreen, type ChatHeader, type ChatRow } from './ChatScreen';

/** Behind Realtime: a slow poll so a missed event never strands the thread. */
const POLL_MS = 15_000;

let localSeq = 0;
/** Id for an optimistic row. */
function localId(): string {
  localSeq += 1;
  return `local:${Date.now()}:${localSeq}`;
}

export interface ChatThreadProps {
  companyId: string;
  meId: string;
  target: ChatTarget;
  header: ChatHeader;
  onBack: () => void;
  onHeaderPress?: () => void;
  onOpenPost?: (post: ChatPost) => void;
  /** Real state pill and hint for post cards (campaign manager side). */
  describePost?: (post: ChatPost) => PostState;
  /** Attach this post to the first message sent (opened from a post). */
  initialPost?: { assignmentId: string; title: string } | null;
  placeholder?: string;
  showAuthors?: boolean;
  /** Creator threads on the manager side: the "A post" attach option. */
  allowPostAttach?: boolean;
  /** Manager chats: long press offers reply and reactions (copy is always there). */
  allowReactions?: boolean;
  emptyText?: string;
}

/** Loads, subscribes, marks read and sends optimistically for any ChatTarget. */
export function ChatThread({ companyId, meId, target, header, onBack, onHeaderPress, onOpenPost, describePost, initialPost = null, placeholder, showAuthors, allowPostAttach, allowReactions, emptyText }: ChatThreadProps) {
  const [messages, setMessages] = useState<ChatRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [extras, setExtras] = useState<Map<string, MessageExtras>>(() => new Map());
  const [pendingPost, setPendingPost] = useState(initialPost);
  const [attach, setAttach] = useState(false);
  const [picking, setPicking] = useState(false);
  const [actionFor, setActionFor] = useState<ChatMessage | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const local = useRef<ChatRow[]>([]);
  const lastOtherAt = useRef<string | null>(null);
  const seq = useRef(0);
  const targetKey = target.kind === 'creator' ? target.creatorId : target.chatId;
  const rich = !!allowReactions && supportsReplies(target);

  const merge = useCallback((server: ChatMessage[]) => {
    const pending = local.current.filter((p) => p.pending || p.failed);
    setMessages([...server, ...pending]);
  }, []);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const [rows, more] = await Promise.all([
        loadChatThread(companyId, meId, target),
        rich ? loadMessageExtras(target, meId).catch(() => null) : Promise.resolve(null),
      ]);
      if (mine !== seq.current) return;
      merge(rows);
      if (more) setExtras(more);
      setLoadError(false);
      const latestOther = rows.reduce<string | null>((acc, m) => (!m.mine && (!acc || m.at > acc) ? m.at : acc), null);
      if (latestOther !== lastOtherAt.current) {
        lastOtherAt.current = latestOther;
        markChatThreadRead({ companyId, meId, target }).catch(() => undefined);
      }
    } catch {
      // With rows on screen the poll retries quietly; with none, show Retry.
      if (mine === seq.current) setLoadError(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, meId, target.kind, targetKey, merge, rich]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), POLL_MS);
      const unsubscribe = subscribeChatThread(target, () => void load());
      return () => {
        clearInterval(timer);
        unsubscribe();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, target.kind, targetKey]),
  );

  useEffect(() => {
    local.current = messages ?? [];
  }, [messages]);

  const send = async (body: string, retryId?: string, attached?: { assignmentId: string; post: ChatPost | null } | null) => {
    const id = retryId ?? localId();
    const post = attached ?? (pendingPost ? { assignmentId: pendingPost.assignmentId, post: null } : null);
    const reply = replyTo;
    const row: ChatRow = { id, authorId: meId, authorName: 'You', mine: true, text: body, at: new Date().toISOString(), media: null, post: post?.post ?? null, eventLabel: null, pending: true };
    setMessages((m) => [...(m ?? []).filter((x) => x.id !== id), row]);
    if (!attached) setPendingPost(null);
    setReplyTo(null);
    try {
      if (reply && target.kind === 'manager') {
        await sendReply({ companyId, chatId: target.chatId, meId, text: body, replyToChatMessageId: reply.id });
      } else {
        await sendChatMessage({ companyId, meId, target, text: body, assignmentId: post?.assignmentId });
      }
      setMessages((m) => (m ?? []).filter((x) => x.id !== id));
      await load();
    } catch {
      setMessages((m) => (m ?? []).map((x) => (x.id === id ? { ...x, pending: false, failed: true } : x)));
    }
  };

  const sendPost = (summary: PostSummary) => {
    setPicking(false);
    const post = toChatPost(summary);
    void send('', undefined, { assignmentId: summary.assignmentId, post });
  };

  const pick = async (camera: boolean) => {
    setAttach(false);
    let result: ImagePicker.ImagePickerResult;
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          toast.error('Allow camera access in Settings to attach from here.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
      }
    } catch {
      toast.error('Could not open the picker. Try again.');
      return;
    }
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    const video = asset.type === 'video';
    const id = localId();
    const secs = asset.duration ? Math.round(asset.duration / 1000) : 0;
    const row: ChatRow = {
      id,
      authorId: meId,
      authorName: 'You',
      mine: true,
      text: '',
      at: new Date().toISOString(),
      media: { kind: video ? 'video' : 'image', path: asset.uri, bucket: 'videos', len: video && secs ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : null },
      post: null,
      eventLabel: null,
      pending: true,
      localUri: asset.uri,
    };
    setMessages((m) => [...(m ?? []), row]);
    try {
      await sendChatMedia({ companyId, meId, target, localUri: asset.uri, mime: asset.mimeType ?? (video ? 'video/mp4' : 'image/jpeg'), video, durationMs: asset.duration, caption: '' });
      setMessages((m) => (m ?? []).filter((x) => x.id !== id));
      await load();
    } catch (e) {
      setMessages((m) => (m ?? []).filter((x) => x.id !== id));
      toast.error(e instanceof Error ? `Could not send: ${e.message}` : 'Could not send. Try again.', { label: 'Retry', onPress: () => void pick(camera) });
    }
  };

  const react = async (m: ChatMessage, emoji: string) => {
    setActionFor(null);
    // Optimistic: flip my reaction locally, then reconcile on the next load.
    setExtras((prev) => {
      const next = new Map(prev);
      const cur = next.get(m.id) ?? { replyTo: null, reactions: [] };
      const had = cur.reactions.find((r) => r.emoji === emoji);
      const reactions = had
        ? cur.reactions.flatMap((r) => (r.emoji !== emoji ? [r] : r.mine ? (r.count > 1 ? [{ ...r, count: r.count - 1, mine: false }] : []) : [{ ...r, count: r.count + 1, mine: true }]))
        : [...cur.reactions, { emoji, count: 1, mine: true }];
      next.set(m.id, { ...cur, reactions });
      return next;
    });
    try {
      await reactToMessage(m.id, meId, emoji);
    } catch {
      toast.error('Could not react. Try again.');
    }
    void load();
  };

  const copy = async (m: ChatMessage) => {
    setActionFor(null);
    try {
      await Clipboard.setStringAsync(m.text);
      toast.success('Copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  const snippet = (m: ChatMessage) => m.text.trim() || (m.media ? (m.media.kind === 'image' ? 'Photo' : m.media.kind === 'voice' ? 'Voice note' : 'Video') : m.post?.title ?? 'Message');

  return (
    <>
      <ChatScreen
        header={header}
        messages={messages}
        error={loadError}
        onReload={() => {
          setLoadError(false);
          void load();
        }}
        onBack={onBack}
        onHeaderPress={onHeaderPress}
        onSend={(body) => void send(body)}
        onRetry={(m) => void send(m.text, m.id, m.post ? { assignmentId: m.post.assignmentId, post: m.post } : null)}
        onOpenPost={onOpenPost}
        describePost={describePost}
        onAttach={() => setAttach(true)}
        pendingPost={pendingPost ? { title: pendingPost.title, onClear: () => setPendingPost(null) } : null}
        placeholder={replyTo ? 'Reply' : placeholder}
        showAuthors={showAuthors}
        extras={rich ? extras : undefined}
        onLongPressMessage={(m) => setActionFor(m)}
        onToggleReaction={rich ? (m, emoji) => void react(m, emoji) : undefined}
        replyingTo={replyTo ? { authorName: replyTo.mine ? 'yourself' : replyTo.authorName, snippet: snippet(replyTo), onClear: () => setReplyTo(null) } : null}
        emptyText={emptyText}
      />
      <Sheet open={attach} onClose={() => setAttach(false)} title="Attach">
        {allowPostAttach && target.kind === 'creator' ? (
          <AttachRow
            icon="list_alt"
            label="A post"
            meta="Share one of this creator's posts"
            onPress={() => {
              setAttach(false);
              setPicking(true);
            }}
          />
        ) : null}
        <AttachRow icon="photo_library" label="Photo or video" meta="From your library" onPress={() => void pick(false)} />
        <AttachRow icon="photo_camera" label="Camera" meta="Take a photo or video" onPress={() => void pick(true)} />
      </Sheet>
      {allowPostAttach && target.kind === 'creator' ? (
        <PostPicker open={picking} onClose={() => setPicking(false)} companyId={companyId} creatorId={target.creatorId} onPick={sendPost} />
      ) : null}
      <Sheet open={actionFor !== null} onClose={() => setActionFor(null)}>
        {actionFor ? (
          <View>
            <Text numberOfLines={2} style={[text.meta, { marginBottom: 12 }]}>{`${actionFor.mine ? 'You' : actionFor.authorName}: ${snippet(actionFor)}`}</Text>
            {rich ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                {QUICK_REACTIONS.map((emoji) => {
                  const mine = extras.get(actionFor.id)?.reactions.find((r) => r.emoji === emoji)?.mine;
                  return (
                    <Press key={emoji} accessibilityRole="button" accessibilityLabel={`React ${emoji}`} onPress={() => void react(actionFor, emoji)} style={{ width: 48, height: 48, borderRadius: radius.pill, backgroundColor: mine ? color.blueTint : color.grey1, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 24 }}>{emoji}</Text>
                    </Press>
                  );
                })}
              </View>
            ) : null}
            {rich ? (
              <AttachRow
                icon="reply"
                label="Reply"
                meta="Quote this message"
                onPress={() => {
                  setReplyTo(actionFor);
                  setActionFor(null);
                }}
              />
            ) : null}
            {actionFor.text.trim() ? <AttachRow icon="content_copy" label="Copy" meta="Copy the text" onPress={() => void copy(actionFor)} /> : null}
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

function AttachRow({ icon, label, meta, onPress }: { icon: IconName; label: string; meta: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 8 }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: color.blueTint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={24} color={color.blueDeep} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={text.row}>{label}</Text>
        <Text style={text.meta}>{meta}</Text>
      </View>
      <Icon name="chevron_right" size={22} color={color.grey3} />
    </Press>
  );
}

const STATUS_LABEL: Record<string, { label: string; tone: 'blue' | 'amber' | 'green' | 'grey' }> = {
  assigned: { label: 'Assigned', tone: 'grey' },
  recorded: { label: 'Recording', tone: 'blue' },
  submitted: { label: 'Waiting on you', tone: 'blue' },
  changes_requested: { label: 'Changes requested', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  posted: { label: 'Live', tone: 'green' },
};

/** "A post": this creator's recent posts; picking one sends it as a card. */
function PostPicker({ open, onClose, companyId, creatorId, onPick }: { open: boolean; onClose: () => void; companyId: string; creatorId: string; onPick: (s: PostSummary) => void }) {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let live = true;
    listAttachablePosts(companyId, creatorId)
      .then((list) => {
        if (!live) return;
        setPosts(list);
        setFailed(false);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [open, companyId, creatorId, attempt]);

  return (
    <Sheet open={open} onClose={onClose} title="Share a post">
      {failed ? (
        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 16 }}>
          <Text style={[text.body, { color: color.grey4 }]}>Could not load posts.</Text>
          <Press accessibilityRole="button" onPress={() => {
            setFailed(false);
            setPosts(null);
            setAttempt((n) => n + 1);
          }} style={{ paddingHorizontal: 16, height: 36, borderRadius: radius.pill, backgroundColor: color.blueTint, justifyContent: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: color.blueDeep }}>Try again</Text>
          </Press>
        </View>
      ) : posts === null ? (
        <View style={{ gap: 8 }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} h={60} />)}
        </View>
      ) : posts.length === 0 ? (
        <Text style={[text.body, { color: color.grey4, textAlign: 'center', paddingVertical: 16 }]}>No posts with this creator yet. Assign a brief and it shows up here.</Text>
      ) : (
        posts.map((p, i) => <PickerRow key={p.assignmentId} post={p} last={i === posts.length - 1} onPress={() => onPick(p)} />)
      )}
    </Sheet>
  );
}

function PickerRow({ post, last, onPress }: { post: PostSummary; last: boolean; onPress: () => void }) {
  const frame = usePostFrame({ mediaPath: post.mediaPath, mediaFormat: post.format });
  const s = STATUS_LABEL[post.status] ?? STATUS_LABEL.assigned;
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={post.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: color.grey1 }}>
      <Thumb w={40} radius={8} post={{ frame, type: post.typeLabel, title: post.title, format: post.format === 'photo_carousel' ? 'Slideshow' : 'Reel' }} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text numberOfLines={1} style={text.row}>{post.title}</Text>
        <Chip small tone={s.tone} label={s.label} />
      </View>
      <Icon name="send" size={20} color={color.blue} />
    </Press>
  );
}
