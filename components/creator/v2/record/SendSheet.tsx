// The send step after the editor: name the post, then watch it go. Clips
// still uploading finish first (a real count and bar), then the edit saves
// and the post goes to review. The sheet cannot be dismissed mid-send.
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { color, motion, radius, text } from '../../../../theme/v2';
import { Button, Field, Icon, Sheet } from '../../../v2';

export type SendPhase = 'idle' | 'uploading' | 'saving' | 'sending';

export interface SendSheetProps {
  open: boolean;
  onClose: () => void;
  /** Free posts get a name here; brief posts keep the brief's title and hide the field. */
  nameable: boolean;
  name: string;
  onName: (v: string) => void;
  phase: SendPhase;
  /** Clips uploaded so far and in all, for the bar. */
  uploaded: number;
  total: number;
  /** Uploads that failed; the sheet offers a retry. */
  failed: number;
  error: string | null;
  onSend: () => void;
  onRetryUploads: () => void;
}

function Bar({ value }: { value: number }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.set(withTiming(Math.max(0.04, Math.min(1, value)), { duration: motion.push, easing: motion.ease }));
  }, [value, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  return (
    <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: color.grey1, overflow: 'hidden' }}>
      <Animated.View style={[{ height: 6, borderRadius: radius.pill, backgroundColor: color.blue }, style]} />
    </View>
  );
}

export function SendSheet({ open, onClose, nameable, name, onName, phase, uploaded, total, failed, error, onSend, onRetryUploads }: SendSheetProps) {
  const busy = phase !== 'idle';
  const step =
    phase === 'uploading'
      ? failed > 0
        ? 'An upload stopped'
        : total > 0
          ? `Uploading clips, ${Math.min(uploaded + 1, total)} of ${total}`
          : 'Uploading clips'
      : phase === 'saving'
        ? 'Saving your edit'
        : 'Sending for review';
  const progress = phase === 'uploading' ? (total > 0 ? uploaded / total : 0.1) * 0.7 : phase === 'saving' ? 0.8 : phase === 'sending' ? 0.92 : 0;
  const nameOk = !nameable || name.trim().length > 0;
  return (
    <Sheet
      open={open}
      onClose={() => (busy ? undefined : onClose())}
      title={busy ? 'Sending' : 'Send for review'}
      footer={
        busy ? (
          failed > 0 ? <Button icon="refresh" label="Try the upload again" onPress={onRetryUploads} /> : null
        ) : (
          <Button icon="send" label="Send for review" disabled={!nameOk} onPress={onSend} />
        )
      }
    >
      {busy ? (
        <Animated.View key="progress" entering={FadeIn.duration(180)} style={{ gap: 12, paddingTop: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {failed > 0 ? <Icon name="cloud_off" size={20} color={color.amber} /> : <ActivityIndicator color={color.blue} />}
            <Text style={text.row}>{step}</Text>
          </View>
          <Bar value={progress} />
          <Text style={text.meta}>{failed > 0 ? 'Check your connection, then try again. Nothing is lost.' : 'Keep Noni open until this finishes.'}</Text>
        </Animated.View>
      ) : (
        <Animated.View key="form" entering={FadeInDown.duration(220).easing(motion.tabEase)}>
          {nameable ? (
            <Field label="Name your post" value={name} onChange={onName} placeholder="What is this post about?" maxLength={120} autoFocus={!name} returnKeyType="send" onSubmitEditing={() => nameOk && onSend()} />
          ) : null}
          <Text style={[text.body, { color: color.grey4 }]}>Your team reviews it before it goes live. You get a notification when they reply.</Text>
          {error ? (
            <Animated.View entering={FadeIn.duration(160)} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 12, padding: 12, borderRadius: radius.option, backgroundColor: color.pinkTint }}>
              <Icon name="error" size={18} color={color.pink} />
              <Text style={[text.meta, { flex: 1, color: color.ink }]}>{error}</Text>
            </Animated.View>
          ) : null}
        </Animated.View>
      )}
    </Sheet>
  );
}
