import { useState } from 'react';
import { Modal, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { GsMedia, StText } from '../../../../lib/brief-library';
import { useKeyboardHeight } from '../../../../lib/keyboard';
import { color, radius } from '../../../../theme/v2';
import { Icon, Press } from '../../../v2';
import { ClipFrame } from './ClipFrame';

const ED = { bg: '#0F0F12', chip: '#26262D' };

export interface TextOnScreenEditorProps {
  open: boolean;
  title: string;
  /** The text being edited; its position and style are kept. */
  text: StText;
  green?: boolean;
  gs?: GsMedia | null;
  onChange: (t: StText) => void;
  onDone: () => void;
}

/**
 * One-clip on-screen text editor: the 9:16 frame with the text drawn in place, and the
 * text typed below it. The full creator editor (fonts, colours, drag) mounts here in Stage E.
 */
export function TextOnScreenEditor({ open, title, text, green, gs, onChange, onDone }: TextOnScreenEditorProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const [draft, setDraft] = useState(text.text);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(text.text);
  }
  if (!open) return null;
  const avail = height - insets.top - 52 - 180 - keyboard - insets.bottom;
  const fw = Math.max(120, Math.min(width - 80, (avail * 9) / 16));
  const fh = (fw * 16) / 9;
  const cur = { ...text, text: draft };
  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onDone}>
      <View style={{ flex: 1, backgroundColor: ED.bg, paddingTop: insets.top, paddingBottom: keyboard ? keyboard : insets.bottom }}>
        <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingLeft: 4, paddingRight: 8 }}>
          <Press accessibilityLabel="Back" onPress={onDone} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chevron_left" size={32} color={color.white} />
          </Press>
          <Text numberOfLines={1} style={{ flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '700', color: color.white }}>
            {title}
          </Text>
          <Press accessibilityRole="button" onPress={onDone} style={{ height: 44, paddingHorizontal: 12, justifyContent: 'center' }}>
            <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', color: color.blue }}>Done</Text>
          </Press>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 }}>
          <ClipFrame width={fw} height={fh} radius={14} texts={draft.trim() ? [cur] : []} green={green} gs={gs} />
        </View>
        <View style={{ marginHorizontal: 16, backgroundColor: ED.chip, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 6 }}>
          <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Text on screen</Text>
          <TextInput
            autoFocus
            multiline
            value={draft}
            onChangeText={(t) => {
              setDraft(t);
              onChange({ ...text, text: t });
            }}
            placeholder="Type what shows on screen"
            placeholderTextColor="rgba(255,255,255,0.4)"
            style={{ minHeight: 72, maxHeight: 140, fontSize: 17, lineHeight: 23, fontWeight: '600', color: color.white, padding: 0 }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: color.blue }} />
            <Text style={{ fontSize: 12, lineHeight: 16, color: 'rgba(255,255,255,0.55)' }}>TikTok classic, centred. Blank line for a new paragraph.</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
