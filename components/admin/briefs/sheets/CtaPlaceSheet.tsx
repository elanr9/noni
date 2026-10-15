// CTA position: where the product plug sits in the post. Locked right after
// the hook, locked at the very end, or the creator decides. Story and
// Handheld get the same three; one tap applies and closes.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CtaPlaceOption } from '../../../../lib/brief-copy';
import { color, radius, shadow, type as typeToken } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { Sheet } from '../../shared';

export function CtaPlaceSheet<K extends string>({
  visible,
  options,
  current,
  onPick,
  onClose,
}: {
  visible: boolean;
  options: CtaPlaceOption<K>[];
  current: K;
  onPick: (key: K) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.body}>
        <Text style={styles.title}>Where does the CTA go?</Text>
        <View style={styles.list}>
          {options.map((o) => {
            const on = o.key === current;
            return (
              <Pressable
                key={o.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={o.label}
                onPress={() => {
                  onClose();
                  if (!on) onPick(o.key);
                }}
                style={({ pressed }) => [styles.row, on ? styles.rowOn : null, pressed ? styles.pressed : null]}
              >
                <View style={styles.text}>
                  <Text style={styles.label}>{o.label}</Text>
                  <Text style={styles.line}>{o.line}</Text>
                </View>
                <View style={[styles.radio, on ? styles.radioOn : null]}>{on ? <Icon name="check" size={13} color={color.white} /> : null}</View>
              </Pressable>
            );
          })}
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
  rowOn: { borderWidth: 2, borderColor: color.blue500, margin: -1 },
  pressed: { opacity: 0.85 },
  text: { flex: 1, minWidth: 0, gap: 3 },
  label: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 16, letterSpacing: -0.2, color: color.ink },
  line: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 13, lineHeight: 13 * 1.35, color: color.slate500 },
  radio: { width: 22, height: 22, borderRadius: 999, borderWidth: 1.5, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderWidth: 0, backgroundColor: color.blue500 },
});
