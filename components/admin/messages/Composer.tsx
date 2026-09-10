import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatVoiceDuration } from '../../../lib/manager-messages-api';
import { borderWidth, color, radiusAdmin, shadow, space } from '../../../theme/tokens';
import { Icon, type IconName } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export type AttachTile = 'post' | 'photo' | 'camera';

export type ComposerProps = {
  placeholder: string;
  draft: string;
  onChangeDraft: (v: string) => void;
  canSend: boolean;
  sending: boolean;
  attachOpen: boolean;
  onToggleAttach: () => void;
  tiles: AttachTile[];
  onAttach: (tile: AttachTile) => void;
  onSend: () => void;
  reply?: { who: string; snippet: string } | null;
  onClearReply?: () => void;
  onSendVoice?: (localUri: string, durationMs: number) => Promise<void>;
  bottomInset?: number;
};

const TILE: Record<AttachTile, { icon: IconName; label: string }> = {
  post: { icon: 'layout-list', label: 'A post' },
  photo: { icon: 'images', label: 'Photo' },
  camera: { icon: 'camera', label: 'Camera' },
};

const GUT = space.gutterAdmin;

function useVoiceRecorder(
  sending: boolean,
  onSendVoice: ((localUri: string, durationMs: number) => Promise<void>) | undefined,
) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
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

  const toggle = async () => {
    if (sending || onSendVoice === undefined) return;
    if (recording) {
      setRecording(false);
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        const uri = recorder.uri;
        const durationMs = Date.now() - startedAt.current;
        if (uri) await onSendVoice(uri, durationMs);
      } catch (e) {
        Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again');
      }
      return;
    }
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Microphone needed', 'Allow microphone access to send a voice note.');
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
      setElapsedMs(0);
      setRecording(true);
    } catch (e) {
      Alert.alert('Could not record', e instanceof Error ? e.message : 'Try again');
    }
  };

  return { recording, elapsedMs, toggle };
}

/** Handoff 2.6 Composer: plus, pill input, blue send. Tiles and reply quote stack above the row. */
export function Composer({
  placeholder,
  draft,
  onChangeDraft,
  canSend,
  sending,
  attachOpen,
  onToggleAttach,
  tiles,
  onAttach,
  onSend,
  reply,
  onClearReply,
  onSendVoice,
  bottomInset,
}: ComposerProps) {
  const insets = useSafeAreaInsets();
  const voice = useVoiceRecorder(sending, onSendVoice);
  const paddingBottom = bottomInset ?? Math.max(insets.bottom, 26);
  const showMic = onSendVoice !== undefined && draft.trim().length === 0;
  const sendEnabled = canSend && !sending && !voice.recording;

  return (
    <View style={styles.wrap}>
      {attachOpen && tiles.length > 0 && (
        <View style={styles.tileRow}>
          {tiles.map((tile) => (
            <PressableScale
              key={tile}
              accessibilityRole="button"
              accessibilityLabel={TILE[tile].label}
              onPress={() => onAttach(tile)}
              style={styles.tile}
            >
              <Icon name={TILE[tile].icon} size={18} color={color.blue600} />
              <Text style={styles.tileLabel}>{TILE[tile].label}</Text>
            </PressableScale>
          ))}
        </View>
      )}
      <View style={[styles.bar, { paddingBottom }]}>
        {reply ? (
          <View style={styles.reply}>
            <View style={styles.replyBody}>
              <Text style={styles.replyWho}>{reply.who}</Text>
              <Text numberOfLines={1} style={styles.replySnippet}>
                {reply.snippet}
              </Text>
            </View>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Clear reply"
              onPress={onClearReply}
              hitSlop={14}
              style={styles.replyClear}
            >
              <Icon name="x" size={14} color={color.slate400} />
            </PressableScale>
          </View>
        ) : null}
        <View style={styles.row}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Attach a post or photo"
            accessibilityState={{ expanded: attachOpen }}
            onPress={onToggleAttach}
            style={[styles.round, styles.plus, attachOpen && styles.plusOpen]}
          >
            <Icon name="plus" size={20} color={attachOpen ? color.blue700 : color.slate500} />
          </PressableScale>
          <View style={[styles.pill, voice.recording && styles.pillRecording]}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={onChangeDraft}
              placeholder={voice.recording ? formatVoiceDuration(voice.elapsedMs) : placeholder}
              placeholderTextColor={voice.recording ? color.blue700 : color.slate400}
              editable={!voice.recording && !sending}
              multiline
            />
          </View>
          {showMic ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={voice.recording ? 'Stop and send voice note' : 'Record voice note'}
              disabled={sending}
              onPress={() => void voice.toggle()}
              style={[styles.round, styles.send, shadow.shadowAccent, voice.recording && styles.sendRecording]}
            >
              <Icon name={voice.recording ? 'send' : 'mic'} size={18} color={color.white} />
            </PressableScale>
          ) : (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Send"
              disabled={!sendEnabled}
              onPress={onSend}
              style={[styles.round, styles.send, shadow.shadowAccent, !sendEnabled && styles.sendDisabled]}
            >
              <Icon name="send" size={18} color={color.white} />
            </PressableScale>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: color.white,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 10,
    paddingHorizontal: GUT,
    borderTopWidth: borderWidth.hair,
    borderTopColor: color.line,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.blue50,
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: color.blue700,
  },
  bar: {
    paddingTop: 10,
    paddingHorizontal: GUT,
    borderTopWidth: borderWidth.hair,
    borderTopColor: color.line,
    gap: 8,
  },
  reply: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  replyBody: {
    flex: 1,
    minWidth: 0,
    borderLeftWidth: 2,
    borderLeftColor: color.blue300,
    paddingLeft: 8,
  },
  replyWho: {
    fontSize: 12,
    fontWeight: '700',
    color: color.blue700,
  },
  replySnippet: {
    marginTop: 1,
    fontSize: 12.5,
    fontWeight: '500',
    color: color.slate500,
  },
  replyClear: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: radiusAdmin.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: {
    backgroundColor: color.fillQuiet,
  },
  plusOpen: {
    backgroundColor: color.blue100,
  },
  pill: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
    paddingHorizontal: 15,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  pillRecording: {
    backgroundColor: color.blue100,
  },
  input: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 20,
    color: color.ink,
    padding: 0,
    margin: 0,
  },
  send: {
    backgroundColor: color.blue500,
  },
  sendRecording: {
    backgroundColor: color.blue700,
  },
  sendDisabled: {
    opacity: 0.4,
  },
});
