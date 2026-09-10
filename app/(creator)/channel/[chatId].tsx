import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MuteButton } from '../../../components/admin/chat/MuteButton';
import { Composer, type AttachTile } from '../../../components/admin/messages';
import { ManagerThread } from '../../../components/admin/messages/channel/ManagerThread';
import { useVoicePlayer } from '../../../components/admin/messages/channel/useVoicePlayer';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { useAuth } from '../../../lib/auth';
import { listTeam } from '../../../lib/inbox-api';
import { useKeyboardPadding } from '../../../lib/keyboard';
import {
  firstNameOf,
  getManagerChat,
  isChatMuted,
  listManagerMessages,
  markChatRead,
  sendManagerMessage,
  setChatMuted,
  toggleReaction,
  uploadManagerChatMedia,
  type ManagerChatInfo,
  type ManagerMessage,
} from '../../../lib/manager-messages-api';
import type { PostSummary } from '../../../lib/post-event-labels';
import { borderWidth, color, radius, space, type } from '../../../theme/tokens';

const POLL_MS = 5000;
const TILES: AttachTile[] = ['photo', 'camera'];
const NO_SUMMARIES = new Map<string, PostSummary>();

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

function replySnippet(message: ManagerMessage): string {
  if (message.mediaKind === 'voice') return 'Voice note';
  const body = message.body.trim();
  if (body.length > 0) return body;
  if (message.forwardLabel) return message.forwardLabel;
  if (message.mediaKind === 'image') return 'Photo';
  if (message.mediaKind === 'video') return 'Video';
  return '';
}

/** A company channel the creator was let into (all_creators). */
export default function CreatorChannelScreen() {
  const { chatId: chatIdParam } = useLocalSearchParams<{ chatId: string }>();
  const chatId = param(chatIdParam);
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const keyboardPadding = useKeyboardPadding();
  const scrollRef = useRef<ScrollView | null>(null);
  const voice = useVoicePlayer();
  const stopVoice = voice.stop;

  const [chat, setChat] = useState<ManagerChatInfo | null>(null);
  const [teamIds, setTeamIds] = useState<Set<string>>(() => new Set());
  const [messages, setMessages] = useState<ManagerMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ManagerMessage | null>(null);
  const [muted, setMuted] = useState(false);

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

  const hasLoaded = useRef(false);
  const load = useCallback(async () => {
    if (!profile || !chatId) return;
    try {
      const [info, rows, team] = await Promise.all([
        getManagerChat(profile.company_id, profile.id, chatId),
        listManagerMessages(chatId),
        listTeam(profile.company_id),
      ]);
      setChat(info);
      setMessages(rows);
      setTeamIds(new Set(team.map((t) => t.id)));
      hasLoaded.current = true;
    } catch (e) {
      if (!hasLoaded.current) Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again');
    } finally {
      setLoading(false);
    }
  }, [profile, chatId]);

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

  const profileId = profile?.id;
  useEffect(() => {
    if (loading || !chatId || profileId === undefined) return;
    void markChatRead(chatId, profileId).catch(() => undefined);
  }, [loading, messages.length, chatId, profileId]);

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
        chatId,
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

  if (!profile || !chatId) return null;

  if (!loading && chat === null) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <EmptyState
          title="Channel not found"
          body="This channel is not available to you anymore."
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const title = chat?.title ?? 'Channel';
  const members = chat?.memberCount ?? 0;
  const subtitle = chat?.allCreators
    ? 'Everyone on the team and all creators'
    : members === 1
      ? '1 member'
      : `${members} members`;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={[styles.fill, { paddingBottom: keyboardPadding }]}>
        <View style={styles.header}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.backBtn}
            onPress={() => router.back()}
          >
            <Icon name="chevron-left" size={22} color={color.ink} />
          </PressableScale>
          <View style={styles.hashAvatar}>
            <Text style={styles.hashText}>#</Text>
          </View>
          <View style={styles.headerText}>
            <Text numberOfLines={1} style={styles.headerTitle}>
              {title}
            </Text>
            <Text numberOfLines={1} style={styles.headerSub}>
              {subtitle}
            </Text>
          </View>
          <MuteButton muted={muted} onToggle={() => void toggleMuted()} />
        </View>
        <ManagerThread
          scrollRef={scrollRef}
          loading={loading}
          messages={messages}
          meId={profile.id}
          teamIds={teamIds}
          summaries={NO_SUMMARIES}
          playingId={voice.playingId}
          onPlayVoice={(m) => void voice.toggle(m)}
          onToggleReaction={(m, emoji) => void react(m, emoji)}
          onLongPress={showActions}
          onOpenPost={() => undefined}
        />
        <Composer
          placeholder={`Message ${title}`}
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.offWhite,
  },
  fill: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space.gutter,
    paddingTop: space[2],
    paddingBottom: space[3],
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
    backgroundColor: color.offWhite,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hashAvatar: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hashText: {
    fontSize: type.size.body,
    fontWeight: type.weight.heavy,
    color: color.slate500,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  headerTitle: {
    fontSize: type.size.action,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  headerSub: {
    fontSize: type.size.chip,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
});
