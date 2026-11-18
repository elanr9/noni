import { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Animated, { FadeIn } from 'react-native-reanimated';

import { linkFrom } from '../../../../lib/brief-ai';
import { useKeyboardHeight } from '../../../../lib/keyboard';
import { color, radius, shadow } from '../../../../theme/v2';
import { Button, Icon, Press, tap } from '../../../v2';

export interface LinkDialogProps {
  open: boolean;
  /** The link already on the brief, if any. */
  link: string;
  onClose: () => void;
  onAdd: (link: string) => void;
  onRemove: () => void;
}

/** "Reference link": a centred white card over a 45% scrim with a Paste pill in the field. */
export function LinkDialog({ open, link, onClose, onAdd, onRemove }: LinkDialogProps) {
  const [draft, setDraft] = useState(link);
  const [hint, setHint] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  const keyboard = useKeyboardHeight();
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(link);
      setHint(null);
    }
  }
  if (!open) return null;
  const paste = async () => {
    tap();
    let t = '';
    try {
      t = (await Clipboard.getStringAsync()).trim();
    } catch {
      t = '';
    }
    const found = linkFrom(t);
    if (found) setDraft(found);
    else setHint('Nothing to paste. Copy a video link first.');
  };
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(160)} style={{ flex: 1, backgroundColor: 'rgba(16,24,40,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24, paddingBottom: 24 + keyboard }}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View style={{ width: '100%', backgroundColor: color.card, borderRadius: 22, padding: 18, gap: 12, ...shadow.float }}>
          <Text style={{ fontSize: 18, lineHeight: 24, fontWeight: '700', letterSpacing: -0.2, color: color.ink }}>Reference link</Text>
          <View style={{ justifyContent: 'center' }}>
            <TextInput
              autoFocus
              value={draft}
              onChangeText={(v) => {
                setDraft(v);
                setHint(null);
              }}
              placeholder="TikTok or Instagram link"
              placeholderTextColor={color.grey3}
              inputMode="url"
              autoCapitalize="none"
              autoCorrect={false}
              style={{ backgroundColor: color.grey1, borderRadius: 16, paddingVertical: 13, paddingLeft: 42, paddingRight: 84, fontSize: 16, lineHeight: 22, color: color.ink }}
            />
            <Icon name="link" size={20} color={color.grey3} style={{ position: 'absolute', left: 14 }} />
            <Press onPress={() => void paste()} haptic={false} style={{ position: 'absolute', right: 6, height: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: color.blue, justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: color.white }}>Paste</Text>
            </Press>
          </View>
          {hint ? <Text style={{ fontSize: 13, lineHeight: 18, color: color.amber }}>{hint}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              variant="quiet"
              label={link ? 'Remove' : 'Cancel'}
              onPress={() => {
                onRemove();
                onClose();
              }}
            />
            <Button
              label="Add"
              disabled={!/\S/.test(draft)}
              onPress={() => {
                const found = linkFrom(draft.trim());
                if (!found) {
                  setHint("That doesn't look like a link. Paste a TikTok, Instagram or YouTube URL.");
                  return;
                }
                onAdd(found);
                onClose();
              }}
            />
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}
