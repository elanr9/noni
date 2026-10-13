// Freestyle brief (SSManager.jsx OpenEditor): the slot header, "Empty post"
// and Add to week. The creator makes whatever they want.

import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BriefMediaFormat } from '../../../lib/briefs-api';
import { FORMAT_LABEL, slotLabel } from '../../../lib/brief-copy';
import { color, space, type as typeToken } from '../../../theme/tokens';
import { BriefHeader, KindChip } from '../../shared/briefs';
import { Button } from '../../ui/Button';

export function OpenEditor({
  format,
  slot,
  week,
  saving,
  onBack,
  onSave,
}: {
  format: BriefMediaFormat;
  slot: number;
  week: string | undefined;
  saving: boolean;
  onBack: () => void;
  onSave: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.fill}>
      <BriefHeader
        title={`${FORMAT_LABEL[format]} ${slotLabel(slot)}`}
        sub={week ? `Week ${week}` : undefined}
        onBack={onBack}
        right={<KindChip kind="open" format={format} style={styles.headerChip} />}
      />
      <View style={styles.center}>
        <Text style={styles.title}>Empty post</Text>
        <Text style={styles.line}>The creator makes whatever they want.</Text>
      </View>
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 34) }]}>
        <Button size="lg" block disabled={saving} onPress={onSave}>
          Add to week
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  headerChip: { marginTop: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: space.gutter, paddingVertical: 40 },
  title: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 20, color: color.ink, textAlign: 'center' },
  line: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 15, color: color.slate500, textAlign: 'center' },
  bar: { paddingHorizontal: space.gutter, paddingTop: 14 },
});
