import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Audio } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatVoiceDuration } from '../../../lib/manager-messages-api';
import { color, radiusAdmin, shadow } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export type AttachKind = 'photos' | 'camera';

const ATTACH: { kind: AttachKind; label: string; icon: 'images' | 'camera' }[] = [
  { kind: 'photos', label: 'Photos', icon: 'images' },
  { kind: 'camera', label: 'Camera', icon: 'camera' },
];

export function Composer({
  placeholder,
  draft,
  onChangeDraft,
  canSend,
  sending,
  attachOpen,
  onToggleAttach,
  onAttach,
  onSend,
  reply,
  onClearReply,
  onSendVoice,
}: {
  placeholder: string;
  draft: string;
  onChangeDraft: (value: string) => void;
  canSend: boolean;
  sending: boolean;
  attachOpen: boolean;
  onToggleAttach: () => void;
  onAttach: (kind: AttachKind) => void;
  onSend: () => void;
  reply: { who: string; snippet: string } | null;
  onClearReply: () => void;
  onSendVoice: (localUri: string, durationMs: number) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const recordingRef = useRef<Audio.Recording | null>(null);
  const startedAt = useRef(0);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startedAt.current);
    }, 250);
    return () => clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    return () => {
      const active = recordingRef.current;
      if (active) {
        void active.stopAndUnloadAsync().catch(() => undefined);
        recordingRef.current = null;
      }
    };
  }, []);

  const toggleMic = async () => {
    if (sending) return;
    if (recording) {
      const active = recordingRef.current;
      recordingRef.current = null;
      setRecording(false);
      if (!active) return;
      try {
        await active.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });
        const uri = active.getURI();
        const durationMs = Date.now() - startedAt.current;
        if (uri) await onSendVoice(uri, durationMs);
      } catch (e) {
        Alert.alert(
          'Could not send',
          e instanceof Error ? e.message : 'Try again',
        );
      }
      return;
    }

    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Microphone needed',
        'Allow microphone access to send a voice note.',
      );
      return;
    }
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const created = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = created.recording;
      startedAt.current = Date.now();
      setElapsedMs(0);
      setRecording(true);
    } catch (e) {
      Alert.alert(
        'Could not record',
        e instanceof Error ? e.message : 'Try again',
      );
    }
  };

  const sendEnabled = canSend && !sending && !recording;

  return (
    <View
      style={[
        styles.wrap,
        { paddingBottom: Math.max(insets.bottom, 24) },
      ]}
    >
      {reply ? (
        <View style={styles.replyBar}>
          <View style={styles.replyBarBody}>
            <Text style={styles.replyWho}>{reply.who}</Text>
            <Text numberOfLines={1} style={styles.replySnippet}>
              {reply.snippet}
            </Text>
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Clear reply"
            onPress={onClearReply}
            hitSlop={12}
            style={styles.replyClear}
          >
            <Icon name="x" size={14} color={color.slate400} />
          </PressableScale>
        </View>
      ) : null}
      {attachOpen ? (
        <View style={styles.attachRow}>
          {ATTACH.map((tile) => (
            <PressableScale
              key={tile.kind}
              accessibilityRole="button"
              accessibilityLabel={tile.label}
              onPress={() => onAttach(tile.kind)}
              style={styles.attachTile}
            >
              <Icon name={tile.icon} size={18} color={color.blue600} />
              <Text style={styles.attachLabel}>{tile.label}</Text>
            </PressableScale>
          ))}
        </View>
      ) : null}
      <View style={styles.row}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Add attachment"
          accessibilityState={{ expanded: attachOpen }}
          onPress={onToggleAttach}
          hitSlop={8}
          style={[styles.round, shadow.shadowCard]}
        >
          <Icon name="plus" size={18} color={color.slate500} />
        </PressableScale>
        <View style={[styles.pill, shadow.shadowCard]}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={onChangeDraft}
            placeholder={
              recording ? formatVoiceDuration(elapsedMs) : placeholder
            }
            placeholderTextColor={color.slate400}
            editable={!recording && !sending}
          />
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Record voice note"
            onPress={() => void toggleMic()}
            hitSlop={8}
            style={[styles.mic, recording && styles.micActive]}
          >
            <Icon
              name="mic"
              size={15}
              color={recording ? color.blue700 : color.slate500}
            />
          </PressableScale>
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!sendEnabled}
          onPress={onSend}
          hitSlop={8}
          style={[
            styles.round,
            styles.send,
            shadow.shadowAccent,
            !sendEnabled && styles.sendDisabled,
          ]}
        >
          <Icon name="send" size={17} color={color.white} />
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
    backgroundColor: color.offWhite,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: color.white,
    ...shadow.shadowCard,
  },
  replyBarBody: {
    flex: 1,
    minWidth: 0,
    borderLeftWidth: 3,
    borderLeftColor: color.blue300,
    paddingLeft: 8,
  },
  replyWho: {
    fontSize: 11.5,
    fontWeight: '700',
    color: color.blue700,
  },
  replySnippet: {
    marginTop: 1,
    fontSize: 12.5,
    fontWeight: '400',
    color: color.slate500,
  },
  replyClear: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachRow: {
    flexDirection: 'row',
    gap: 8,
  },
  attachTile: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.blue50,
  },
  attachLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: color.blue700,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  round: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flex: 1,
    height: 44,
    minWidth: 0,
    borderRadius: 999,
    backgroundColor: color.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 6,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '400',
    color: color.ink,
    paddingVertical: 0,
  },
  mic: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micActive: {
    backgroundColor: color.blue100,
  },
  send: {
    backgroundColor: color.blue500,
  },
  sendDisabled: {
    opacity: 0.4,
  },
});
