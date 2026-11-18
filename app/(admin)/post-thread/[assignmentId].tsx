import { useCallback, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ChatScreen, type ChatRow } from '../../../components/shared/messages';
import { Button, Icon, Press, Sheet } from '../../../components/v2';
import { toast } from '../../../components/v2/Toast';
import { chatPostRoute } from '../../../lib/admin-messages-extras';
import { useAuth } from '../../../lib/auth';
import { toChatPost } from '../../../lib/chat-thread';
import { listPostThread, parseMessageMedia, sendMediaMessage, sendMessage, type ThreadMessage } from '../../../lib/messages-api';
import type { PostEvent, PostSummary } from '../../../lib/post-event-labels';
import { listPostEvents } from '../../../lib/post-events';
import { color, radius, text, type Tone } from '../../../theme/v2';

const POLL_MS = 10_000;

let localSeq = 0;
function localId(): string {
  localSeq += 1;
  return `local:${Date.now()}:${localSeq}`;
}

const EVENT_TONE: Record<string, Tone> = { assigned: 'grey', submitted: 'blue', sent_back: 'amber', approved: 'green', live: 'green' };

type Data = { summary: PostSummary | null; events: PostEvent[]; messages: ThreadMessage[] };

function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** One post, its whole life: every event and message about it, newest at the bottom. */
export default function PostThreadScreen() {
  const params = useLocalSearchParams<{ assignmentId: string }>();
  const assignmentId = param(params.assignmentId) ?? '';
  const router = useRouter();
  const { profile } = useAuth();
  const companyId = profile?.active_company_id ?? null;
  const meId = profile?.id ?? null;
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [local, setLocal] = useState<ChatRow[]>([]);
  const [attach, setAttach] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!companyId || !assignmentId) return;
    const mine = ++seq.current;
    try {
      const [{ events, summary }, messages] = await Promise.all([listPostEvents(companyId, assignmentId), listPostThread(companyId, assignmentId)]);
      if (mine !== seq.current) return;
      setData({ summary, events, messages });
      setFailed(false);
    } catch {
      if (mine === seq.current) setFailed(true);
    }
  }, [companyId, assignmentId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), POLL_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  const summary = data?.summary ?? null;

  const rows = useMemo<ChatRow[] | null>(() => {
    if (!data) return null;
    const out: ChatRow[] = data.messages.map((m) => {
      const { media, text: body } = parseMessageMedia(m.body);
      return {
        id: `m:${m.id}`,
        authorId: m.authorId,
        authorName: m.authorId === meId ? 'You' : m.authorName,
        mine: m.authorId === meId,
        text: body,
        at: m.createdAt,
        media: media ? { kind: media.media, path: media.url, bucket: 'videos', len: media.len ?? null } : null,
        post: null,
        eventLabel: null,
      };
    });
    for (const e of data.events) {
      if (e.kind === 'comment') continue;
      out.push({
        id: `e:${e.id}`,
        authorId: e.authorId,
        authorName: e.authorId === meId ? 'You' : e.authorId === null ? 'Noni' : e.authorName,
        mine: false,
        text: '',
        at: e.at,
        media: null,
        post: null,
        eventLabel: e.label,
        eventTone: EVENT_TONE[e.kind] ?? 'grey',
        notes: e.notes,
      });
    }
    out.sort((a, b) => a.at.localeCompare(b.at));
    return [...out, ...local];
  }, [data, local, meId]);

  const send = async (body: string, retryId?: string) => {
    if (!companyId || !meId || !summary) return;
    const id = retryId ?? localId();
    setLocal((l) => [...l.filter((x) => x.id !== id), { id, authorId: meId, authorName: 'You', mine: true, text: body, at: new Date().toISOString(), media: null, post: null, eventLabel: null, pending: true }]);
    try {
      await sendMessage({ companyId, creatorId: summary.creatorId, authorId: meId, body, assignmentId });
      await load();
      setLocal((l) => l.filter((x) => x.id !== id));
    } catch {
      setLocal((l) => l.map((x) => (x.id === id ? { ...x, pending: false, failed: true } : x)));
    }
  };

  const pick = async (camera: boolean) => {
    setAttach(false);
    if (!companyId || !meId || !summary) return;
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
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    const video = asset.type === 'video';
    const id = localId();
    setLocal((l) => [...l, { id, authorId: meId, authorName: 'You', mine: true, text: '', at: new Date().toISOString(), media: { kind: video ? 'video' : 'image', path: asset.uri, bucket: 'videos', len: null }, post: null, eventLabel: null, pending: true, localUri: asset.uri }]);
    try {
      await sendMediaMessage({ companyId, creatorId: summary.creatorId, authorId: meId, assignmentId, media: video ? 'video' : 'image', localUri: asset.uri, contentType: asset.mimeType ?? (video ? 'video/mp4' : 'image/jpeg'), durationMs: asset.duration });
      await load();
    } catch {
      toast.error('Could not send. Try again.', { label: 'Retry', onPress: () => void pick(camera) });
    } finally {
      setLocal((l) => l.filter((x) => x.id !== id));
    }
  };

  if (!companyId || !meId) return null;

  if (data && !summary) {
    return (
      <ChatScreen
        header={{ name: 'Post', meta: '' }}
        messages={[]}
        emptyText="This post is gone. It may have been removed."
        onBack={() => router.back()}
        onSend={() => undefined}
      />
    );
  }

  const waiting = data?.events.some((e) => e.waiting) ?? false;
  const formatLabel = summary?.format === 'photo_carousel' ? 'Slideshow' : 'Reel';
  const post = summary ? toChatPost(summary) : null;

  return (
    <>
      <ChatScreen
        header={{ name: summary?.title ?? 'Post', meta: summary ? `${summary.creatorName} · ${summary.typeLabel} · ${formatLabel}` : '' }}
        messages={rows}
        error={failed && !data}
        onReload={() => void load()}
        onBack={() => router.back()}
        onHeaderPress={post && post.status !== 'submitted' && post.status !== 'assigned' && post.status !== 'recorded' && post.status !== 'changes_requested' ? () => router.push(chatPostRoute(post)) : undefined}
        onSend={(body) => void send(body)}
        onRetry={(m) => void send(m.text, m.id)}
        onAttach={() => setAttach(true)}
        placeholder="Reply about this post"
        emptyText="Nothing about this post yet."
        above={
          waiting && summary ? (
            <Animated.View entering={FadeInDown.duration(220)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginBottom: 8, padding: 12, borderRadius: radius.card, backgroundColor: color.blueTint }}>
              <Icon name="inbox" size={20} color={color.blueDeep} />
              <Text style={[text.body, { flex: 1, fontWeight: '600' }]}>{`Take ${summary.attempt} is waiting on you`}</Text>
              <Button pill label="Review" onPress={() => router.push({ pathname: '/(admin)/review/[id]', params: { id: assignmentId } })} />
            </Animated.View>
          ) : null
        }
      />
      <Sheet open={attach} onClose={() => setAttach(false)} title="Attach">
        <AttachRow icon="photo_library" label="Photo or video" onPress={() => void pick(false)} />
        <AttachRow icon="photo_camera" label="Camera" onPress={() => void pick(true)} />
      </Sheet>
    </>
  );
}

function AttachRow({ icon, label, onPress }: { icon: 'photo_library' | 'photo_camera'; label: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 8 }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: color.blueTint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={24} color={color.blueDeep} />
      </View>
      <Text style={[text.row, { flex: 1 }]}>{label}</Text>
      <Icon name="chevron_right" size={22} color={color.grey3} />
    </Press>
  );
}
