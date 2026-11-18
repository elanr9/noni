// Dark footer under the canvas (SSFlow.jsx CanvasFooter): a row the editor
// fills (slide dots, count pill), then the step strip and the Next button.
// The canvas pads the home indicator inset under it.

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, type as typeToken } from '../../../../theme/tokens';
import { StepStrip, type BriefStep } from '../../../shared/briefs';
import { Icon } from '../../../ui/Icon';

export function CanvasFooter({
  steps,
  current,
  onJump,
  onNext,
  nextLabel,
  nextOk,
  disabled = false,
  children,
}: {
  steps: BriefStep[];
  current: number;
  onJump: (id: string) => void;
  onNext: () => void;
  nextLabel: string;
  nextOk: boolean;
  /** AI is writing: nothing here may change the deck until it lands. */
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      {children ? (
        <View style={[styles.top, disabled ? styles.dim : null]} pointerEvents={disabled ? 'none' : 'auto'}>
          {children}
        </View>
      ) : null}
      <View style={styles.row}>
        <View style={[styles.strip, disabled ? styles.dim : null]} pointerEvents={disabled ? 'none' : 'auto'}>
          <StepStrip steps={steps} current={current} dark onJump={disabled ? undefined : onJump} />
        </View>
        <NextButton label={nextLabel} ok={nextOk && !disabled} onPress={onNext} />
      </View>
    </View>
  );
}

export function NextButton({ label, ok, onPress, icon = 'arrow-right' }: { label: string; ok: boolean; onPress: () => void; icon?: 'arrow-right' | 'check' }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !ok }}
      disabled={!ok}
      onPress={onPress}
      style={({ pressed }) => [styles.next, { backgroundColor: ok ? color.blue500 : color.whiteA16 }, pressed ? styles.pressed : null]}
    >
      <Text style={[styles.nextText, { color: ok ? color.white : color.whiteA45 }]}>{label}</Text>
      <Icon name={icon} size={16} color={ok ? color.white : color.whiteA45} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0, alignSelf: 'stretch', justifyContent: 'center', gap: 6, paddingHorizontal: 14, paddingTop: 2, paddingBottom: 4, overflow: 'hidden' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  strip: { flex: 1, minWidth: 0 },
  next: { height: 44, paddingLeft: 18, paddingRight: 16, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6 },
  nextText: { fontFamily: typeToken.font.ui, fontWeight: typeToken.weight.bold, fontSize: typeToken.size.bodySm },
  pressed: { opacity: 0.85 },
  dim: { opacity: 0.45 },
});
