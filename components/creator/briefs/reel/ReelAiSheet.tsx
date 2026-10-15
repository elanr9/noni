// Ask AI in the reel editor. Same look as AskAiSheet; reel rules: "Rewrite
// my line" shows only while one of the creator's own clips is selected and
// writes that clip's text, and hook ideas are on screen cover text.
import { useState, type JSX } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { WeekBrief } from '../../../../lib/briefs-api';
import { color, radius, type as typeToken } from '../../../../theme/tokens';
import { Sheet } from '../../../admin/shared/Sheet';
import { Icon, type IconName } from '../../../ui/Icon';
import type { ReelPlanItem } from './plan';
import { reelHooks, reelLine } from './reelAi';

type AskKind = 'hook' | 'line' | 'count';
type Result = { kind: AskKind; title: string; items: string[] };

export type ReelAiSheetProps = {
  visible: boolean;
  brief: WeekBrief;
  items: ReelPlanItem[];
  /** The selected clip when it is one of the creator's own lines, else null. */
  lineItem: ReelPlanItem | null;
  onApplyHook: (text: string) => void;
  onApplyLine: (item: ReelPlanItem, text: string) => void;
  onCut: () => void;
  onClose: () => void;
};

export function ReelAiSheet(props: ReelAiSheetProps): JSX.Element {
  const { visible, brief, items, lineItem, onApplyHook, onApplyLine, onCut, onClose } = props;
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasCover = items.some((p) => p.role === 'cover');
  const clips = items.filter((p) => p.blockIds.length > 0).length;

  const ask = async (kind: AskKind) => {
    setBusy(true);
    setRes(null);
    setError(null);
    try {
      if (kind === 'hook') setRes({ kind, title: 'Hooks', items: await reelHooks(brief, items) });
      else if (kind === 'line' && lineItem) setRes({ kind, title: 'Your line', items: await reelLine(brief, items, lineItem.id) });
      else setRes({ kind, title: 'Length', items: [`You have ${clips} clips. Short reels do best under 30 seconds.`] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not ask right now.');
    } finally {
      setBusy(false);
    }
  };

  const chip = (k: AskKind, label: string, icon: IconName) => (
    <Pressable key={k} accessibilityRole="button" disabled={busy} onPress={() => void ask(k)} style={styles.chip}>
      <Icon name={icon} size={14} color={color.blue500} />
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      header={
        <View style={styles.head}>
          <View style={styles.spark}>
            <Icon name="sparkles" size={18} color={color.white} />
          </View>
          <Text style={styles.title}>Ask AI</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
            <Icon name="x" size={17} color={color.slate500} />
          </Pressable>
        </View>
      }
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsScroll}>
        <Pressable accessibilityRole="button" onPress={onCut} style={[styles.chip, styles.chipPrimary]}>
          <Icon name="zap" size={14} color={color.white} />
          <Text style={[styles.chipText, { color: color.white }]}>Cut the dead air</Text>
        </Pressable>
        {hasCover ? chip('hook', 'Hook ideas', 'zap') : null}
        {lineItem ? chip('line', 'Rewrite my line', 'pencil') : null}
        {chip('count', 'Is it too long?', 'images')}
      </ScrollView>
      <View style={styles.body}>
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={color.blue500} />
            <Text style={styles.busyText}>Listening to your clips</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {res ? (
          <>
            <Text style={styles.label}>{res.title}</Text>
            {res.items.length === 0 ? <Text style={styles.cardText}>Nothing came back. Try again.</Text> : null}
            {res.items.map((t, k) => (
              <View key={`${k}-${t}`} style={styles.card}>
                <Text style={styles.cardText}>{t}</Text>
                {res.kind === 'hook' || (res.kind === 'line' && lineItem) ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      if (res.kind === 'hook') onApplyHook(t);
                      else if (lineItem) onApplyLine(lineItem, t);
                      onClose();
                    }}
                    style={styles.use}
                  >
                    <Text style={styles.useText}>Use</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  spark: { width: 36, height: 36, borderRadius: 999, backgroundColor: color.blue500, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: typeToken.font.display, fontSize: 18, fontWeight: '700', letterSpacing: -0.3, color: color.ink },
  close: { width: 44, height: 44, borderRadius: 999, backgroundColor: color.fillQuiet, alignItems: 'center', justifyContent: 'center' },
  chipsScroll: { flexGrow: 0 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  chip: { height: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: color.border, backgroundColor: color.white, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipPrimary: { backgroundColor: color.blue500, borderColor: color.blue500 },
  chipText: { fontFamily: typeToken.font.ui, fontSize: 13.5, fontWeight: '600', color: color.ink },
  body: { paddingHorizontal: 20, gap: 8, paddingBottom: 20 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: color.blue50 },
  busyText: { fontFamily: typeToken.font.ui, fontSize: 14, fontWeight: '600', color: color.blue700 },
  error: { fontFamily: typeToken.font.ui, fontSize: 14, color: color.danger },
  label: { fontFamily: typeToken.font.ui, fontSize: 12, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: color.slate500 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: color.white, borderWidth: 1, borderColor: color.border },
  cardText: { flex: 1, fontFamily: typeToken.font.ui, fontSize: 15, lineHeight: 20, fontWeight: '500', color: color.ink },
  use: { height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: color.blue500, justifyContent: 'center' },
  useText: { fontFamily: typeToken.font.ui, fontSize: 13, fontWeight: '700', color: color.white },
});
