import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';

import {
  ChatBubble,
  ChatDivider,
  PostRef,
  UploadThumbs,
  VoiceNote,
} from '../../../components/admin/messages/ChatBubble';
import {
  Composer,
  type AttachKind,
} from '../../../components/admin/messages/Composer';
import {
  AdminScreen,
  AvatarStack,
  CreatorAvatar,
  PushHeader,
  SkeletonCard,
} from '../../../components/admin/shared';
import { useAuth } from '../../../lib/auth';
import { listCampaignManagers } from '../../../lib/briefs-api';
import {
  bubbleTimeLabel,
  firstNameOf,
  formatVoiceDuration,
  getManagerChat,
  listManagerMessages,
  managerChatMeta,
  markChatRead,
  sendManagerMessage,
  signedChatUrl,
  toggleReaction,
  uploadManagerChatMedia,
  type ManagerChatInfo,
  type ManagerMessage,
} from '../../../lib/manager-messages-api';
import { color, space } from '../../../theme/tokens';

const POLL_MS = 5000;

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
};

function param(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

export default function ManagerChatScreen() {
  const { chatId: chatIdParam } = useLocalSearchParams<{ chatId: string }>();
  const chatId = param(chatIdParam);
  const { profile } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const [chat, setChat] = useState<ManagerChatInfo | null>(null);
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const [messages, setMessages] = useState<ManagerMessage[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ManagerMessage | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile || !chatId) return;
    try {
      const [info, rows, people] = await Promise.all([
        getManagerChat(profile.company_id, profile.id, chatId),
        listManagerMessages(chatId),
        listCampaignManagers(profile.company_id),
      ]);
      setChat(info);
      setMessages(rows);
      setManagers(people);
      const paths = [
        ...new Set(
          rows
            .map((m) => m.mediaPath)
            .filter((p): p is string => typeof p === 'string' && p.length > 0),
        ),
      ];
      if (paths.length > 0) {
        const signed = await Promise.all(
          paths.map(async (path) => {
            try {
              return [path, await signedChatUrl(path)] as const;
            } catch {
              return [path, ''] as const;
            }
          }),
        );
        setMediaUrls(Object.fromEntries(signed.filter(([, url]) => url.length > 0)));
      }
    } catch (e) {
      Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again');
    } finally {
      setLoading(false);
    }
  }, [profile, chatId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      if (chatId && profile) void markChatRead(chatId, profile.id);
      const timer = setInterval(() => void load(), POLL_MS);
      return () => {
        clearInterval(timer);
        void soundRef.current?.unloadAsync();
        soundRef.current = null;
        setPlayingId(null);
      };
    }, [load, chatId, profile]),
  );

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(
      () => scrollRef.current?.scrollToEnd({ animated: false }),
      80,
    );
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
      if (chatId) void markChatRead(chatId, profile.id);
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
      void markChatRead(chatId, profile.id);
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSending(false);
    }
  };

  const attach = async (kind: AttachKind) => {
    setAttachOpen(false);
    let result: ImagePicker.ImagePickerResult;
    if (kind === 'photos') {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.85,
      });
    } else {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera needed', 'Allow camera access to attach from here.');
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });
    }
    const asset = result.canceled ? null : result.assets[0];
    if (!asset || sending) return;
    const isVideo = asset.type === 'video';
    const mime =
      asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg');
    const ext = MIME_EXT[mime] ?? (isVideo ? 'mp4' : 'jpg');
    await sendMedia(asset.uri, mime, ext, isVideo ? 'video' : 'image', {
      caption: draft.trim() || undefined,
    });
  };

  const sendVoice = async (localUri: string, durationMs: number) => {
    await sendMedia(localUri, 'audio/mp4', 'm4a', 'voice', { durationMs });
  };

  const playVoice = async (message: ManagerMessage) => {
    if (!message.mediaPath) return;
    if (playingId === message.id) {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
      soundRef.current = null;
      setPlayingId(null);
      return;
    }
    const uri = mediaUrls[message.mediaPath];
    if (!uri) return;
    try {
      await soundRef.current?.unloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      const { sound } = await Audio.Sound.createAsync({ uri });
      soundRef.current = sound;
      setPlayingId(message.id);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingId(null);
          void sound.unloadAsync();
          soundRef.current = null;
        }
      });
      await sound.playAsync();
    } catch (e) {
      setPlayingId(null);
      Alert.alert('Could not play', e instanceof Error ? e.message : 'Try again');
    }
  };

  const heart = async (message: ManagerMessage) => {
    if (!profile) return;
    try {
      await toggleReaction(message.id, profile.id, 'heart');
      await load();
    } catch (e) {
      Alert.alert(
        'Could not react',
        e instanceof Error ? e.message : 'Try again',
      );
    }
  };

  if (!profile || !chatId) return null;

  const title = chat?.title ?? 'Messages';
  const isBrief = chat?.kind === 'brief';
  const otherName = chat?.otherName ?? title;
  const placeholder = isBrief
    ? `Message ${title}`
    : `Message ${firstNameOf(otherName)}`;
  const subtitle = isBrief
    ? managerChatMeta(profile.id, managers)
    : 'Campaign manager';
  const trailing = isBrief ? (
    <AvatarStack
      people={managers.map((m) => ({
        id: m.id,
        name: m.name,
        me: m.id === profile.id,
      }))}
      size={26}
    />
  ) : (
    <CreatorAvatar name={otherName} size={32} />
  );

  return (
    <AdminScreen scroll={false} contentStyle={styles.fill}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.headerPad}>
          <PushHeader
            title={title}
            subtitle={subtitle}
            onBack={() => router.back()}
            trailing={trailing}
          />
        </View>
        <ScrollView
          ref={scrollRef}
          style={styles.fill}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.skeletons}>
              <SkeletonCard height={56} radius={18} style={styles.skThem} />
              <SkeletonCard height={56} radius={18} style={styles.skMe} />
              <SkeletonCard height={56} radius={18} style={styles.skThem} />
            </View>
          ) : (
            <>
              {isBrief ? (
                <ChatDivider>
                  Every manager on the account is in this chat
                </ChatDivider>
              ) : (
                <ChatDivider>Today</ChatDivider>
              )}
              {messages.map((m) => {
                const me = m.authorId === profile.id;
                const who = me ? 'You' : firstNameOf(m.authorName);
                const heartCount =
                  m.reactions.find((r) => r.emoji === 'heart')?.count ?? 0;
                return (
                  <ChatBubble
                    key={m.id}
                    who={who}
                    time={bubbleTimeLabel(m.createdAt)}
                    me={me}
                    quote={
                      m.replyTo
                        ? [
                            firstNameOf(m.replyTo.authorName),
                            m.replyTo.snippet,
                          ]
                        : undefined
                    }
                    forward={m.forwardLabel ?? undefined}
                    reactions={
                      heartCount > 0
                        ? [{ icon: 'heart', count: heartCount }]
                        : undefined
                    }
                    onPress={() => setReplyTo(m)}
                    onLongPress={() => void heart(m)}
                  >
                    <MessageBody
                      message={m}
                      me={me}
                      mediaUrls={mediaUrls}
                      playing={playingId === m.id}
                      onPlayVoice={() => void playVoice(m)}
                    />
                  </ChatBubble>
                );
              })}
            </>
          )}
        </ScrollView>
        <Composer
          placeholder={placeholder}
          draft={draft}
          onChangeDraft={setDraft}
          canSend={draft.trim().length > 0}
          sending={sending}
          attachOpen={attachOpen}
          onToggleAttach={() => setAttachOpen((open) => !open)}
          onAttach={(kind) => void attach(kind)}
          onSend={() => void sendText()}
          reply={
            replyTo
              ? {
                  who: firstNameOf(
                    replyTo.authorId === profile.id
                      ? 'You'
                      : replyTo.authorName,
                  ),
                  snippet:
                    replyTo.mediaKind === 'voice'
                      ? 'Voice note'
                      : replyTo.body.trim() ||
                        replyTo.forwardLabel ||
                        (replyTo.mediaKind === 'image'
                          ? 'Photo'
                          : replyTo.mediaKind === 'video'
                            ? 'Video'
                            : ''),
                }
              : null
          }
          onClearReply={() => setReplyTo(null)}
          onSendVoice={sendVoice}
        />
      </KeyboardAvoidingView>
    </AdminScreen>
  );
}

function MessageBody({
  message,
  me,
  mediaUrls,
  playing,
  onPlayVoice,
}: {
  message: ManagerMessage;
  me: boolean;
  mediaUrls: Record<string, string>;
  playing: boolean;
  onPlayVoice: () => void;
}) {
  const uri = message.mediaPath ? mediaUrls[message.mediaPath] : undefined;
  return (
    <View style={styles.bodyStack}>
      {message.postRef ? (
        <PostRef
          me={me}
          label={message.postRef.title}
          onPress={
            message.postRef.briefId
              ? () => router.push(`/(admin)/post/${message.postRef?.briefId}`)
              : undefined
          }
        />
      ) : null}
      {message.mediaKind === 'voice' ? (
        <VoiceNote
          me={me}
          duration={formatVoiceDuration(message.voiceDurationMs ?? 0)}
          playing={playing}
          onPress={onPlayVoice}
        />
      ) : null}
      {message.mediaKind === 'image' || message.mediaKind === 'video' ? (
        <UploadThumbs
          me={me}
          uri={uri}
          video={message.mediaKind === 'video'}
          caption={message.body.trim() || undefined}
        />
      ) : null}
      {message.mediaKind == null && message.body.trim().length > 0 ? (
        <Text style={[styles.bodyText, me ? styles.bodyMe : styles.bodyThem]}>
          {message.body}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  headerPad: {
    paddingHorizontal: space.gutterAdmin,
  },
  thread: {
    paddingHorizontal: space.gutterAdmin,
    paddingTop: 10,
    paddingBottom: 100,
    gap: 15,
  },
  skeletons: {
    gap: 15,
  },
  skThem: {
    width: '62%',
    alignSelf: 'flex-start',
  },
  skMe: {
    width: '62%',
    alignSelf: 'flex-end',
  },
  bodyStack: {
    gap: 8,
  },
  bodyText: {
    fontSize: 14.5,
    lineHeight: 21,
    fontWeight: '400',
  },
  bodyMe: {
    color: color.white,
  },
  bodyThem: {
    color: color.ink,
  },
});
