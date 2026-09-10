import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MuteButton } from '../../../components/admin/chat/MuteButton';
import { Composer, type AttachTile } from '../../../components/admin/messages';
import { ManagerThread } from '../../../components/admin/messages/channel/ManagerThread';
import { MembersSheet } from '../../../components/admin/messages/channel/MembersSheet';
import { useVoicePlayer } from '../../../components/admin/messages/channel/useVoicePlayer';
import { EmptyState, PushHeader } from '../../../components/admin/shared';
import { useAuth } from '../../../lib/auth';
import { listTeam, type TeamMember } from '../../../lib/inbox-api';
import { useKeyboardPadding } from '../../../lib/keyboard';
import {
  addChannelMembers,
  firstNameOf,
  getManagerChat,
  isChatMuted,
  leaveChannel,
  listChannelMembers,
  listManagerMessages,
  markChatRead,
  sendManagerMessage,
  setChannelAllCreators,
  setChatMuted,
  toggleReaction,
  uploadManagerChatMedia,
  type ChannelMember,
  type ManagerChatInfo,
  type ManagerMessage,
} from '../../../lib/manager-messages-api';
import type { PostSummary } from '../../../lib/post-event-labels';
import { listPostSummaries } from '../../../lib/post-events';
import { borderWidth, color, space } from '../../../theme/tokens';

const POLL_MS = 5000;
const TILES: AttachTile[] = ['photo', 'camera'];

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

function param(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

function membersLabel(count: number): string {
  return count === 1 ? '1 member' : `${count} members`;
}

function replySnippet(message: ManagerMessage): string {
  if (message.mediaKind === 'voice') return 'Voice note';
  const body = message.body.trim();
  if (body.length > 0) return body;
  if (message.forwardLabel) return message.forwardLabel;
  if (message.mediaKind === 'image') return 'Photo';
  if (message.mediaKind === 'video') return 'Video';
  return '';
}

export default function ManagerChatScreen() {
  const { chatId: chatIdParam } = useLocalSearchParams<{ chatId: string }>();
  const chatId = param(chatIdParam);
  const { profile } = useAuth();
  const keyboardPadding = useKeyboardPadding();
  const scrollRef = useRef<ScrollView | null>(null);
  const summaryIdsRef = useRef<Set<string>>(new Set());
  const voice = useVoicePlayer();
  const stopVoice = voice.stop;

  const [chat, setChat] = useState<ManagerChatInfo | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [messages, setMessages] = useState<ManagerMessage[]>([]);
  const [summaries, setSummaries] = useState<Map<string, PostSummary>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ManagerMessage | null>(null);
  const [muted, setMuted] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [membersBusy, setMembersBusy] = useState(false);

  useEffect(() => {
    if (!profile || !chatId) return;
    let cancelled = false;
    void isChatMuted(chatId, profile.id)
      .then((value) => {
        if (!cancelled) setMuted(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profile, chatId]);

  const toggleMuted = async () => {
    if (!profile || !chatId) return;
    const next = !muted;
    setMuted(next);
    try {
      await setChatMuted({
        chatId,
        profileId: profile.id,
        companyId: profile.company_id,
        muted: next,
      });
    } catch (e) {
      setMuted(!next);
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again');
    }
  };

  const companyId = profile?.company_id ?? null;
  const loadSummaries = useCallback(async (rows: ManagerMessage[]) => {
    if (companyId === null) return;
    const known = summaryIdsRef.current;
    const missing = rows
      .map((m) => m.postRef?.assignmentId ?? null)
      .filter((id): id is string => id !== null && !known.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => known.add(id));
    const fetched = await listPostSummaries(companyId, missing);
    setSummaries((prev) => new Map([...prev, ...fetched]));
  }, [companyId]);

  const hasLoaded = useRef(false);
  const load = useCallback(async () => {
    if (!profile || !chatId) return;
    try {
      const [info, rows, people] = await Promise.all([
        getManagerChat(profile.company_id, profile.id, chatId),
        listManagerMessages(chatId),
        listTeam(profile.company_id),
      ]);
      setChat(info);
      setMessages(rows);
      setTeam(people);
      hasLoaded.current = true;
      await loadSummaries(rows);
      void markChatRead(chatId, profile.id);
    } catch (e) {
      if (!hasLoaded.current) Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again');
    } finally {
      setLoading(false);
    }
  }, [profile, chatId, loadSummaries]);

  const loadMembers = useCallback(async () => {
    if (!chatId || !chat) return;
    try {
      if (chat.kind === 'channel') {
        setMembers(await listChannelMembers(chatId));
      } else {
        setMembers(team.map((t) => ({ id: t.id, name: t.name, role: t.role })));
      }
    } catch (e) {
      Alert.alert('Could not load members', e instanceof Error ? e.message : 'Try again');
    }
  }, [chatId, chat, team]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), POLL_MS);
      return () => {
        clearInterval(timer);
        stopVoice();
      };
    }, [load, stopVoice]),
  );

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80);
    return () => clearTimeout(t);
  }, [loading, messages.length]);

  const sendText = async () => {
    const body = draft.trim();
    if (!profile || !chatId || body.length === 0 || sending) return;
    setSending(true);
    try {
      await sendManagerMessage({
        companyId: profile.company_id,
        chatId,
        authorId: profile.id,
        body,
        replyToId: replyTo?.id ?? null,
      });
      setDraft('');
      setReplyTo(null);
      await load();
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSending(false);
    }
  };

  const sendMedia = async (
    localUri: string,
    mime: string,
    ext: string,
    mediaKind: 'image' | 'video' | 'voice',
    extra?: { durationMs?: number; caption?: string },
  ) => {
    if (!profile || !chatId) return;
    setSending(true);
    try {
      const mediaPath = await uploadManagerChatMedia({
        companyId: profile.company_id,
        localUri,
        mime,
        ext,
      });
      await sendManagerMessage({
        companyId: profile.company_id,
        chatId,
        authorId: profile.id,
        body: extra?.caption ?? '',
        replyToId: replyTo?.id ?? null,
        mediaKind,
        mediaPath,
        voiceDurationMs: extra?.durationMs ?? null,
      });
      setDraft('');
      setReplyTo(null);
      setAttachOpen(false);
      await load();
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSending(false);
    }
  };

  const attach = async (tile: AttachTile) => {
    setAttachOpen(false);
    let result: ImagePicker.ImagePickerResult;
    if (tile === 'photo') {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.85,
      });
    } else if (tile === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera needed', 'Allow camera access to attach from here.');
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });
    } else {
      return;
    }
    const asset = result.canceled ? null : result.assets[0];
    if (!asset || sending) return;
    const isVideo = asset.type === 'video';
    const mime = asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg');
    const ext = MIME_EXT[mime] ?? (isVideo ? 'mp4' : 'jpg');
    await sendMedia(asset.uri, mime, ext, isVideo ? 'video' : 'image', {
      caption: draft.trim() || undefined,
    });
  };

  const sendVoice = async (localUri: string, durationMs: number) => {
    await sendMedia(localUri, 'audio/mp4', 'm4a', 'voice', { durationMs });
  };

  const react = async (message: ManagerMessage, emoji: string) => {
    if (!profile) return;
    try {
      await toggleReaction(message.id, profile.id, emoji);
      await load();
    } catch (e) {
      Alert.alert('Could not react', e instanceof Error ? e.message : 'Try again');
    }
  };

  const showActions = (message: ManagerMessage) => {
    const body = message.body.trim();
    Alert.alert(message.authorId === profile?.id ? 'You' : message.authorName, undefined, [
      { text: 'Reply', onPress: () => setReplyTo(message) },
      { text: 'React \u2764', onPress: () => void react(message, 'heart') },
      ...(body.length > 0
        ? [{ text: 'Copy', onPress: () => void Clipboard.setStringAsync(body) }]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const openMembers = () => {
    setMembersOpen(true);
    void loadMembers();
  };

  const runMembersChange = async (change: () => Promise<void>) => {
    setMembersBusy(true);
    try {
      await change();
      await load();
      await loadMembers();
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again');
    } finally {
      setMembersBusy(false);
    }
  };

  const leave = async () => {
    if (!profile || !chatId) return;
    setMembersBusy(true);
    try {
      await leaveChannel(chatId, profile.id);
      setMembersOpen(false);
      router.back();
    } catch (e) {
      Alert.alert('Could not leave', e instanceof Error ? e.message : 'Try again');
    } finally {
      setMembersBusy(false);
    }
  };

  if (!profile || !chatId) return null;

  if (!loading && chat === null) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        <EmptyState
          title="Chat not found"
          body="This conversation is not available."
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  const isDm = chat?.kind === 'dm';
  const other = isDm ? team.find((t) => t.id === chat?.otherId) : undefined;
  const title = isDm ? (chat?.otherName ?? 'Messages') : (chat?.title ?? 'Messages');
  const subtitle = isDm ? (other?.roleLabel ?? 'Campaign manager') : membersLabel(chat?.memberCount ?? 0);
  const placeholder = isDm ? `Message ${firstNameOf(title)}` : `Message ${title}`;
  const teamIds = new Set(team.map((t) => t.id));

  const header = (
    <PushHeader
      title={title}
      subtitle={subtitle}
      onBack={() => router.back()}
      trailing={<MuteButton muted={muted} onToggle={() => void toggleMuted()} />}
    />
  );

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.fill, { paddingBottom: keyboardPadding }]}>
        <View style={styles.headerWrap}>
          {isDm || chat === null ? (
            header
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Members" onPress={openMembers}>
              {header}
            </Pressable>
          )}
        </View>
        <ManagerThread
          scrollRef={scrollRef}
          loading={loading}
          messages={messages}
          meId={profile.id}
          teamIds={teamIds}
          summaries={summaries}
          playingId={voice.playingId}
          onPlayVoice={(m) => void voice.toggle(m)}
          onToggleReaction={(m, emoji) => void react(m, emoji)}
          onLongPress={showActions}
          onOpenPost={(assignmentId) => router.push(`/(admin)/post-thread/${assignmentId}`)}
        />
        <Composer
          placeholder={placeholder}
          draft={draft}
          onChangeDraft={setDraft}
          canSend={draft.trim().length > 0}
          sending={sending}
          attachOpen={attachOpen}
          onToggleAttach={() => setAttachOpen((open) => !open)}
          tiles={TILES}
          onAttach={(tile) => void attach(tile)}
          onSend={() => void sendText()}
          reply={
            replyTo
              ? {
                  who: replyTo.authorId === profile.id ? 'You' : firstNameOf(replyTo.authorName),
                  snippet: replySnippet(replyTo),
                }
              : null
          }
          onClearReply={() => setReplyTo(null)}
          onSendVoice={sendVoice}
        />
      </View>
      {chat !== null && !isDm && (
        <MembersSheet
          visible={membersOpen}
          onClose={() => setMembersOpen(false)}
          chat={chat}
          meId={profile.id}
          members={members}
          team={team}
          busy={membersBusy}
          onToggleAllCreators={(next) =>
            void runMembersChange(() => setChannelAllCreators(chatId, next))
          }
          onAddMembers={(ids) => runMembersChange(() => addChannelMembers(chatId, ids))}
          onLeave={() => void leave()}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.white,
  },
  fill: {
    flex: 1,
  },
  headerWrap: {
    paddingHorizontal: space.gutterAdmin,
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
  },
});
