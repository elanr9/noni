// How many points (SSFlow.jsx CountSheet): a big stepper, 2 to 10.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, radius, type as typeToken } from '../../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { Sheet } from '../../shared';

export function CountSheet({ visible, value, onDone, onClose }: { visible: boolean; value: number; onDone: (n: number) => void; onClose: () => void }) {
  const [n, setN] = useState(value);
  const [seenVisible, setSeenVisible] = useState(visible);
  if (seenVisible !== visible) {
    setSeenVisible(visible);
    if (visible) setN(value);
  }
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      footer={
        <Button
          size="lg"
          block
          onPress={() => {
            onClose();
            onDone(n);
          }}
        >
          {`Create ${n} ${n === 1 ? 'point' : 'points'}`}
        </Button>
      }
    >
      <View style={styles.body}>
        <Text style={styles.title}>How many points?</Text>
        <View style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityLabel="Fewer" onPress={() => setN(Math.max(2, n - 1))} style={styles.btn}>
            <Text style={styles.btnText}>{'\u2212'}</Text>
          </Pressable>
          <Text style={styles.n}>{n}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="More" onPress={() => setN(Math.min(10, n + 1))} style={styles.btn}>
            <Text style={styles.btnText}>+</Text>
          </Pressable>
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 18, paddingTop: 10 },
  title: { fontFamily: typeToken.font.display, fontWeight: '700', fontSize: 22, letterSpacing: -0.4, color: color.ink },
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, paddingVertical: 18, paddingHorizontal: 16, borderRadius: radius.lg, backgroundColor: color.white, borderWidth: 1, borderColor: color.border },
  btn: { width: 48, height: 48, borderRadius: 999, borderWidth: 1, borderColor: color.border, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: typeToken.font.ui, fontWeight: '600', fontSize: 24, color: color.ink },
  n: { minWidth: 56, textAlign: 'center', fontFamily: typeToken.font.display, fontWeight: '800', fontSize: 40, letterSpacing: -1, color: color.ink },
});
