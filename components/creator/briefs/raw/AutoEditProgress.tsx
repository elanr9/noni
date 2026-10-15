// The wait while Edit my video runs: four steps, the current one spinning,
// done ones checked. Uploading is real (takes left to upload); the rest
// follow the one server call on a clock, since it does them all at once.
import type { JSX } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, type as typeToken } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';

export const AUTO_STEPS = ['Uploading your clips', 'Listening to what you said', 'Cutting dead air and retakes', 'Adding headers and captions'] as const;

export type AutoEditProgressProps = {
  step: number;
  /** Under the uploading step, e.g. "2 of 3". */
  detail?: string | null;
  onBack: () => void;
};

export function AutoEditProgress({ step, detail, onBack }: AutoEditProgressProps): JSX.Element {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 24 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to camera" onPress={onBack} style={styles.back}>
        <Icon name="chevron-left" size={22} color={color.white} />
      </Pressable>
      <View style={styles.center}>
        <View style={styles.badge}>
          <Icon name="sparkles" size={26} color={color.white} />
        </View>
        <Text style={styles.title}>Editing your video</Text>
        <View style={styles.steps}>
          {AUTO_STEPS.map((label, k) => {
            const done = k < step;
            const now = k === step;
            return (
              <View key={label} style={styles.row}>
                <View style={[styles.dot, done && styles.dotDone]}>
                  {done ? <Icon name="check" size={14} color={color.ink} strokeWidth={3} /> : now ? <ActivityIndicator size="small" color={color.white} /> : null}
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.label, !done && !now && styles.labelLater]}>{label}</Text>
                  {now && k === 0 && detail ? <Text style={styles.detail}>{detail}</Text> : null}
                </View>
              </View>
            );
          })}
        </View>
      </View>
      <Text style={styles.foot}>Usually about 15 seconds. You can change anything after.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink900, paddingHorizontal: 24 },
  back: { width: 44, height: 44, borderRadius: 999, backgroundColor: color.whiteA16, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, justifyContent: 'center', gap: 22 },
  badge: { width: 56, height: 56, borderRadius: 18, backgroundColor: color.blue500, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: typeToken.font.display, fontSize: 28, lineHeight: 32, fontWeight: '800', letterSpacing: -0.6, color: color.white },
  steps: { gap: 16, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dot: { width: 28, height: 28, borderRadius: 999, borderWidth: 1.5, borderColor: color.whiteA28, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: color.white, borderColor: color.white },
  rowText: { flex: 1, gap: 2 },
  label: { fontFamily: typeToken.font.ui, fontSize: 16, fontWeight: '700', color: color.white },
  labelLater: { color: color.whiteA45 },
  detail: { fontFamily: typeToken.font.ui, fontSize: 13, fontWeight: '600', color: color.whiteA60 },
  foot: { fontFamily: typeToken.font.ui, fontSize: 13, fontWeight: '600', color: color.whiteA45, textAlign: 'center' },
});
