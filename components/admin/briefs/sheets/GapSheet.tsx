// Creator's slides (SSManager.jsx gapOpen sheet): how many slides the
// creator fills between the cover and the CTA, min to max.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, radius, type as typeToken } from '../../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { Sheet } from '../../shared';
import type { Gap } from '../editor/useBriefEditor';

function StepButton({ label, icon, onPress }: { label: string; icon: 'chevron-down' | 'chevron-up'; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6} onPress={onPress} style={styles.btn}>
      <Icon name={icon} size={15} color={color.ink} />
    </Pressable>
  );
}

export function Stepper({ value, onChange, min = 1, max = 20 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const bump = (d: number) => onChange(Math.min(max, Math.max(min, value + d)));
  return (
    <View style={styles.stepper}>
      <StepButton label="Fewer" icon="chevron-down" onPress={() => bump(-1)} />
      <Text style={styles.value}>{value}</Text>
      <StepButton label="More" icon="chevron-up" onPress={() => bump(1)} />
    </View>
  );
}

export function GapSheet({ visible, gap, setGap, onClose, reel }: { visible: boolean; gap: Gap; setGap: (g: Gap) => void; onClose: () => void; reel: boolean }) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      footer={
        <Button size="lg" block onPress={onClose}>
          Done
        </Button>
      }
    >
      <View style={styles.body}>
        <Text style={styles.title}>{reel ? "Creator's clips" : "Creator's slides"}</Text>
        <View style={styles.card}>
          <Stepper value={gap.min} onChange={(v) => setGap({ ...gap, min: Math.min(v, gap.max) })} min={1} max={18} />
          <Text style={styles.to}>to</Text>
          <Stepper value={gap.max} onChange={(v) => setGap({ ...gap, max: Math.max(v, gap.min) })} min={1} max={18} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14, paddingTop: 10 },
  title: { fontFamily: typeToken.font.display, fontWeight: '700', fontSize: 22, letterSpacing: -0.4, color: color.ink },
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.sm, backgroundColor: color.white, borderWidth: 1, borderColor: color.border },
  to: { fontFamily: typeToken.font.ui, fontWeight: '600', fontSize: 14, color: color.slate500 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { width: 44, height: 44, borderRadius: 999, borderWidth: 1, borderColor: color.border, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 22, textAlign: 'center', fontFamily: typeToken.font.ui, fontWeight: '800', fontSize: 16, color: color.ink },
});
