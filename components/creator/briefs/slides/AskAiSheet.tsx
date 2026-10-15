// Ask AI for a Freestyle post: quick asks come back as cards you can apply.
// From SSFreestyle.jsx AiSheet, on brief-assist regenerate_field.
import { useRef, useState, type JSX } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { WeekBrief } from '../../../../lib/briefs-api';
import { color, radius, type as typeToken } from '../../../../theme/tokens';
import { Sheet } from '../../../admin/shared/Sheet';
import { Button } from '../../../ui/Button';
import { Icon, type IconName } from '../../../ui/Icon';
import { suggestAllLines, suggestHooks, suggestLine } from '../ai';

type AskKind = 'hook' | 'line' | 'all' | 'count';
/** target is the slide or clip the ask was made on, captured when asked. */
type Result = { kind: AskKind; title: string; items: string[]; target?: string };

export type AskAiSheetProps = {
  visible: boolean;
  brief: WeekBrief;
  /** Text of every own slide or clip, in order. */
  lines: string[];
  /** Index into lines of the slide on screen, or -1 when it is not the creator's. */
  lineIndex: number;
  /** Id of the slide on screen; handed back with Use so the text lands where it was asked. */
  targetId?: string;
  reel?: boolean;
  onApplyHook: (text: string) => void;
  onApplyLine: (text: string, targetId?: string) => void;
  onApplyAll: (items: string[]) => void;
  onAddSlides?: () => void;
  onCut?: () => void;
  onClose: () => void;
};

export function AskAiSheet(props: AskAiSheetProps): JSX.Element {
  const { visible, brief, lines, lineIndex, targetId, reel = false, onApplyHook, onApplyLine, onApplyAll, onAddSlides, onCut, onClose } = props;
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  // An answer belongs to the slide it was asked on: closing the sheet drops
  // it, and an ask still in flight when the sheet closes is ignored.
  const askSeq = useRef(0);
  const [openSeen, setOpenSeen] = useState(visible);
  if (openSeen !== visible) {
    setOpenSeen(visible);
    if (!visible) {
      setRes(null);
      setError(null);
      setBusy(false);
    }
  }
  const close = () => {
    askSeq.current += 1;
    onClose();
  };
  const hook = lines[0] ?? null;
  const own = lines.length;

  const ask = async (kind: AskKind) => {
    const seq = ++askSeq.current;
    const live = () => seq === askSeq.current;
    setBusy(true);
    setRes(null);
    setError(null);
    try {
      if (kind === 'hook') {
        const items = await suggestHooks(brief, lines);
        if (live()) setRes({ kind, title: reel ? 'Hooks' : 'Hooks for your cover', items });
      } else if (kind === 'line') {
        if (lineIndex < 0) return;
        const at = lineIndex;
        const target = targetId;
        const items = await suggestLine(brief, lines, hook, at);
        if (live()) setRes({ kind, title: reel ? 'Your line' : `Text for slide ${at + 1}`, items, ...(target ? { target } : {}) });
      } else if (kind === 'all') {
        const items = await suggestAllLines(brief, lines, hook);
        if (live()) setRes({ kind, title: 'Text for every slide', items });
      } else {
        const target = 6;
        setRes({
          kind,
          title: reel ? 'Length' : 'How many slides',
          items: [
            reel
              ? `You have ${own} clips. Short reels do best under 30 seconds.`
              : `You have ${own}. Recruiting tips do best at 6 to 8. Add ${Math.max(0, target - own)} more, one idea each.`,
          ],
        });
      }
    } catch (e) {
      if (live()) setError(e instanceof Error ? e.message : 'Could not ask right now.');
    } finally {
      if (live()) setBusy(false);
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
      onClose={close}
      header={
        <View style={styles.head}>
          <View style={styles.spark}>
            <Icon name="sparkles" size={18} color={color.white} />
          </View>
          <Text style={styles.title}>Ask AI</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={styles.close}>
            <Icon name="x" size={17} color={color.slate500} />
          </Pressable>
        </View>
      }
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsScroll}>
        {reel && onCut ? (
          <Pressable accessibilityRole="button" onPress={onCut} style={[styles.chip, styles.chipPrimary]}>
            <Icon name="zap" size={14} color={color.white} />
            <Text style={[styles.chipText, { color: color.white }]}>Cut the dead air</Text>
          </Pressable>
        ) : null}
        {chip('hook', reel ? 'Hook ideas' : 'Hook for the cover', 'zap')}
        {lineIndex >= 0 ? chip('line', reel ? 'Rewrite my line' : 'Text for this slide', 'pencil') : null}
        {reel ? null : chip('all', 'Text for all slides', 'layout-list')}
        {chip('count', reel ? 'Is it too long?' : 'How many slides?', 'images')}
      </ScrollView>
      <View style={styles.body}>
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={color.blue500} />
            <Text style={styles.busyText}>{reel ? 'Listening to your clips' : 'Looking at your slides'}</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {res ? (
          <>
            <Text style={styles.label}>{res.title}</Text>
            {res.items.map((t, k) => (
              <View key={`${k}-${t}`} style={styles.card}>
                {res.kind === 'all' ? (
                  <View style={styles.n}>
                    <Text style={styles.nText}>{k + 1}</Text>
                  </View>
                ) : null}
                <Text style={styles.cardText}>{t}</Text>
                {res.kind === 'hook' || res.kind === 'line' ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      if (res.kind === 'hook') onApplyHook(t);
                      else onApplyLine(t, res.target);
                      close();
                    }}
                    style={styles.use}
                  >
                    <Text style={styles.useText}>Use</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
            {res.kind === 'all' && res.items.length ? (
              <Button
                size="lg"
                block
                onPress={() => {
                  onApplyAll(res.items);
                  close();
                }}
                style={styles.cta}
              >
                Put these on my slides
              </Button>
            ) : null}
            {res.kind === 'count' && onAddSlides ? (
              <Button
                size="lg"
                block
                variant="outline"
                icon="image-plus"
                onPress={() => {
                  onAddSlides();
                  close();
                }}
                style={[styles.cta, styles.outline]}
              >
                Add more photos
              </Button>
            ) : null}
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
  n: { width: 22, height: 22, borderRadius: 999, backgroundColor: color.fillQuiet, alignItems: 'center', justifyContent: 'center' },
  nText: { fontFamily: typeToken.font.ui, fontSize: 11, fontWeight: '800', color: color.slate500 },
  cardText: { flex: 1, fontFamily: typeToken.font.ui, fontSize: 15, lineHeight: 20, fontWeight: '500', color: color.ink },
  use: { height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: color.blue500, justifyContent: 'center' },
  useText: { fontFamily: typeToken.font.ui, fontSize: 13, fontWeight: '700', color: color.white },
  cta: { height: 56 },
  outline: { backgroundColor: color.white, borderColor: color.border },
});
