// Media on a clip: the Library's screen recording (or screenshot for a
// slideshow), a picture from the camera roll, and clearing what is on the
// slide. Same card rows as the CTA position sheet; one tap acts and closes.

import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { briefTone, color, radius, shadow, type as typeToken } from '../../../../theme/tokens';
import { Icon, type IconName } from '../../../ui/Icon';
import { Sheet } from '../../shared';

type Row = { key: 'library' | 'roll' | 'remove'; icon: IconName; label: string; line: string; danger?: boolean };

export function MediaMenuSheet({
  visible,
  reel,
  hasInset,
  onLibrary,
  onRoll,
  onRemove,
  onClose,
}: {
  visible: boolean;
  reel: boolean;
  hasInset: boolean;
  onLibrary: () => void;
  onRoll: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const thing = reel ? 'screen recording' : 'screenshot';
  const rows: Row[] = [
    { key: 'library', icon: reel ? 'smartphone' : 'image', label: reel ? 'Screen recording' : 'Screenshot', line: `From the Library, pops up over the clip` },
    { key: 'roll', icon: 'images', label: 'Camera roll', line: 'A picture from your phone, placed as a sticker' },
    ...(hasInset ? [{ key: 'remove' as const, icon: 'trash-2' as const, label: `Remove the ${thing}`, line: 'The clip stays, the media goes', danger: true }] : []),
  ];
  const act = { library: onLibrary, roll: onRoll, remove: onRemove };
  // The pick runs once this sheet is gone: the next one is a Modal too, and
  // iOS will not open a second while the first is still dismissing.
  const pending = useRef<Row['key'] | null>(null);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onClosed={() => {
        const k = pending.current;
        pending.current = null;
        // A beat for the Modal to leave before the next one comes up.
        if (k) setTimeout(() => act[k](), 120);
      }}
    >
      <View style={styles.body}>
        <Text style={styles.title}>Add to this clip</Text>
        <View style={styles.list}>
          {rows.map((r) => (
            <Pressable
              key={r.key}
              accessibilityRole="button"
              accessibilityLabel={r.label}
              onPress={() => {
                pending.current = r.key;
                onClose();
              }}
              style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
            >
              <View style={[styles.iconWrap, { backgroundColor: r.danger ? color.dangerSoft : briefTone.format.reel.bg }]}>
                <Icon name={r.icon} size={18} color={r.danger ? color.danger : briefTone.format.reel.fg} />
              </View>
              <View style={styles.text}>
                <Text style={[styles.label, r.danger ? { color: color.danger } : null]}>{r.label}</Text>
                <Text style={styles.line}>{r.line}</Text>
              </View>
              <Icon name="chevron-right" size={18} color={color.slate300} />
            </Pressable>
          ))}
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14, paddingTop: 10, paddingBottom: 8 },
  title: { fontFamily: typeToken.font.display, fontWeight: '700', fontSize: 22, letterSpacing: -0.4, color: color.ink },
  list: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, backgroundColor: color.white, ...shadow.shadowCard },
  pressed: { opacity: 0.85 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: 3 },
  label: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 16, letterSpacing: -0.2, color: color.ink },
  line: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 13, lineHeight: 13 * 1.35, color: color.slate500 },
});
