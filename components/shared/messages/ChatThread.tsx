import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Text } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';

import {
  loadChatThread,
  markChatThreadRead,
  sendChatMedia,
  sendChatMessage,
  subscribeChatThread,
  type ChatMessage,
  type ChatPost,
  type ChatTarget,
} from '../../../lib/chat-thread';
import { color, text } from '../../../theme/v2';
import { Icon, Press, Sheet } from '../../v2';
import { ChatScreen, type ChatHeader } from './ChatScreen';

/** Behind Realtime: a slow poll so a missed event never strands the thread. */
const POLL_MS = 15_000;

export interface ChatThreadProps {
  companyId: string;
  meId: string;
  target: ChatTarget;
  header: ChatHeader;
  onBack: () => void;
  onHeaderPress?: () => void;
  onOpenPost?: (post: ChatPost) => void;
  /** Attach this post to the first message sent (opened from a post). */
  initialPost?: { assignmentId: string; title: string } | null;
  placeholder?: string;
  showAuthors?: boolean;
}

/** Loads, subscribes, marks read and sends optimistically for any ChatTarget. */
export function ChatThread({ companyId, meId, target, header, onBack, onHeaderPress, onOpenPost, initialPost = null, placeholder, showAuthors }: ChatThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [pendingPost, setPendingPost] = useState(initialPost);
  const [attach, setAttach] = useState(false);
  const local = useRef<ChatMessage[]>([]);
  const lastOtherAt = useRef<string | null>(null);
  const seq = useRef(0);
  const targetKey = target.kind === 'creator' ? target.creatorId : target.chatId;

  const merge = useCallback((server: ChatMessage[]) => {
    const pending = local.current.filter((p) => p.pending || p.failed);
    setMessages([...server, ...pending]);
  }, []);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const rows = await loadChatThread(companyId, meId, target);
      if (mine !== seq.current) return;
      merge(rows);
      const latestOther = rows.reduce<string | null>((acc, m) => (!m.mine && (!acc || m.at > acc) ? m.at : acc), null);
      if (latestOther !== lastOtherAt.current) {
        lastOtherAt.current = latestOther;
        markChatThreadRead({ companyId, meId, target }).catch(() => undefined);
      }
    } catch {
      // Keep what is on screen; the poll retries.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, meId, target.kind, targetKey, merge]);

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

  const send = async (body: string, retryId?: string) => {
    const id = retryId ?? `local:${Date.now()}`;
    const post = pendingPost;
    const row: ChatMessage = { id, authorId: meId, authorName: 'You', mine: true, text: body, at: new Date().toISOString(), media: null, post: null, eventLabel: null, pending: true };
    setMessages((m) => [...(m ?? []).filter((x) => x.id !== id), row]);
    setPendingPost(null);
    try {
      await sendChatMessage({ companyId, meId, target, text: body, assignmentId: post?.assignmentId });
      setMessages((m) => (m ?? []).filter((x) => x.id !== id));
      await load();
    } catch {
      setMessages((m) => (m ?? []).map((x) => (x.id === id ? { ...x, pending: false, failed: true } : x)));
    }
  };

  const pick = async (camera: boolean) => {
    setAttach(false);
    let result: ImagePicker.ImagePickerResult;
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera needed', 'Allow camera access to attach from here.');
        return;
      }
      result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    } else {
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
    }
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    const video = asset.type === 'video';
    try {
      await sendChatMedia({ companyId, meId, target, localUri: asset.uri, mime: asset.mimeType ?? (video ? 'video/mp4' : 'image/jpeg'), video, durationMs: asset.duration, caption: '' });
      await load();
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again');
    }
  };

  return (
    <>
      <ChatScreen
        header={header}
        messages={messages}
        onBack={onBack}
        onHeaderPress={onHeaderPress}
        onSend={(body) => void send(body)}
        onRetry={(m) => void send(m.text, m.id)}
        onOpenPost={onOpenPost}
        onAttach={() => setAttach(true)}
        pendingPost={pendingPost ? { title: pendingPost.title, onClear: () => setPendingPost(null) } : null}
        placeholder={placeholder}
        showAuthors={showAuthors}
      />
      <Sheet open={attach} onClose={() => setAttach(false)} title="Attach">
        <AttachRow icon="photo_library" label="Photo or video" meta="From your library" onPress={() => void pick(false)} />
        <AttachRow icon="photo_camera" label="Camera" meta="Take a photo" onPress={() => void pick(true)} />
      </Sheet>
    </>
  );
}

function AttachRow({ icon, label, meta, onPress }: { icon: 'photo_library' | 'photo_camera'; label: string; meta: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 8 }}>
      <Icon name={icon} size={24} color={color.blueDeep} style={{ width: 44, height: 44, lineHeight: 44, borderRadius: 14, backgroundColor: color.blueTint, textAlign: 'center' }} />
      <Text style={{ flex: 1 }}>
        <Text style={text.row}>{label}</Text>
        {'\n'}
        <Text style={text.meta}>{meta}</Text>
      </Text>
      <Icon name="chevron_right" size={22} color={color.grey3} />
    </Press>
  );
}
