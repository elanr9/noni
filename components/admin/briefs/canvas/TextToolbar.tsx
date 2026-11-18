// Text tools while editing a box: the Aa / color / background / align / delete
// bar and, above it, the color rows. One font (TikTok Sans). On a box the
// letter color and the box color are picked separately.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInLeft, runOnJS, useSharedValue, ZoomIn } from 'react-native-reanimated';

import { briefTone, color, type as typeToken } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { SWATCHES, type ResolvedTextStyle, type TextBg } from './layout';

export type ToolPanel = 'color' | null;

const NEXT_BG: Record<TextBg, TextBg> = { outline: 'box', box: 'none', none: 'outline' };
const NEXT_ALIGN: Record<ResolvedTextStyle['align'], ResolvedTextStyle['align']> = { center: 'left', left: 'right', right: 'center' };

function SwatchRow({ label, value, onPick }: { label: string | null; value: string; onPick: (c: string) => void }) {
  return (
    <View style={styles.swatchRow}>
      {label ? <Text style={styles.rowLabel}>{label}</Text> : null}
      <View style={styles.swatches}>
        {SWATCHES.map((c) => (
          <Pressable
            key={c}
            accessibilityRole="button"
            accessibilityLabel={c}
            onPress={() => onPick(c)}
            hitSlop={6}
            style={[styles.swatch, { backgroundColor: c }, value === c ? styles.swatchOn : null]}
          />
        ))}
      </View>
    </View>
  );
}

export function TextToolbar({
  ts,
  panel,
  setPanel,
  onChange,
  onTextColor,
  selection = false,
  onDelete,
  bottomInset = 0,
  children,
}: {
  ts: ResolvedTextStyle;
  panel: ToolPanel;
  setPanel: (p: ToolPanel) => void;
  onChange: (patch: Partial<ResolvedTextStyle>) => void;
  /** Letter color pick; colors only the selected words when there is a selection. Defaults to onChange. */
  onTextColor?: (c: string) => void;
  /** Words are selected in the input, so the letter swatches color just them. */
  selection?: boolean;
  onDelete?: () => void;
  /** Lifts the bar above the keyboard. */
  bottomInset?: number;
  /** Buttons stacked above the toolbar (Generate with AI, Pick a feature). */
  children?: React.ReactNode;
}) {
  const box = ts.bg === 'box';
  return (
    <Animated.View entering={FadeIn.duration(260)} style={[styles.wrap, { bottom: bottomInset }]} pointerEvents="box-none">
      {children ? <View style={styles.stack}>{children}</View> : null}
      {panel === 'color' ? (
        <Animated.View entering={ZoomIn.duration(180)} style={styles.panel}>
          <SwatchRow
            label={selection ? 'Words' : box ? 'Text' : null}
            value={selection ? '' : ts.color}
            onPick={(c) => (onTextColor ? onTextColor(c) : onChange({ color: c }))}
          />
          {box ? <SwatchRow label="Box" value={ts.boxColor} onPick={(c) => onChange({ boxColor: c })} /> : null}
        </Animated.View>
      ) : null}
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Text style" onPress={() => onChange({ bg: NEXT_BG[ts.bg] })} style={styles.tool}>
          <View style={[styles.bgGlyph, { backgroundColor: box ? color.white : 'transparent', borderColor: ts.bg === 'none' ? color.whiteA45 : color.white }]}>
            <Text style={[styles.bgA, { color: box ? color.ink : color.white }]}>Aa</Text>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Colors" onPress={() => setPanel(panel === 'color' ? null : 'color')} style={[styles.tool, panel === 'color' ? styles.toolOn : null]}>
          <View style={styles.wheel}>
            {briefTone.confetti.map((c, i) => (
              <View key={c} style={[styles.wheelSlice, { backgroundColor: c, transform: [{ rotate: `${i * 72}deg` }] }]} />
            ))}
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Align"
          onPress={() => onChange({ align: NEXT_ALIGN[ts.align] })}
          style={[styles.tool, styles.alignTool, { alignItems: ts.align === 'left' ? 'flex-start' : ts.align === 'right' ? 'flex-end' : 'center' }]}
        >
          {[22, 14, 18].map((w, i) => (
            <View key={i} style={{ width: w, height: 2.5, borderRadius: 2, backgroundColor: color.white }} />
          ))}
        </Pressable>
        {onDelete ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Delete text" onPress={onDelete} style={styles.tool}>
            <Icon name="trash-2" size={18} color={color.white} />
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

/** Vertical slider for the text box width, 0.3 to 0.95 of the frame. */
export function WidthSlider({ value, H, onChange }: { value: number; H: number; onChange: (w: number) => void }) {
  const length = H * 0.36;
  // The drag runs on the UI thread, so everything it touches is a shared
  // value or inline math; onChange hops back to JS.
  const start = useSharedValue(value);
  const pan = Gesture.Pan()
    .onBegin(() => {
      start.value = value;
    })
    .onChange((e) => {
      const next = start.value - (e.translationY / length) * 0.65;
      const clamped = next < 0.3 ? 0.3 : next > 0.95 ? 0.95 : next;
      runOnJS(onChange)(clamped);
    });
  const t = (value - 0.3) / 0.65;
  return (
    <Animated.View entering={FadeInLeft.duration(260).delay(60)} style={[styles.slider, { top: H * 0.26, height: length }]}>
      <GestureDetector gesture={pan}>
        <View style={styles.sliderHit}>
          <View style={styles.track} />
          <View style={[styles.thumb, { top: (1 - t) * (length - 18) }]} />
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingBottom: 12, alignItems: 'center', gap: 10 },
  stack: { alignItems: 'center', gap: 10, marginBottom: 6 },
  panel: { gap: 8, alignItems: 'center' },
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabel: { width: 34, fontFamily: typeToken.font.ui, fontWeight: typeToken.weight.semibold, fontSize: typeToken.size.label, color: color.whiteA60 },
  swatches: { flexDirection: 'row', gap: 9, flexWrap: 'wrap', justifyContent: 'center' },
  swatch: { width: 30, height: 30, borderRadius: 999, borderWidth: 2.5, borderColor: color.white },
  swatchOn: { borderColor: color.blue500 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6, borderRadius: 16, backgroundColor: color.inkA55 },
  tool: { width: 46, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  toolOn: { backgroundColor: color.whiteA28 },
  aa: { fontFamily: typeToken.font.display, fontWeight: '800', fontSize: 17, color: color.white },
  wheel: { width: 22, height: 22, borderRadius: 999, overflow: 'hidden', borderWidth: 2, borderColor: color.white, backgroundColor: color.blue500 },
  wheelSlice: { position: 'absolute', width: 11, height: 11, left: 9, top: -2, transformOrigin: 'bottom left' },
  bgGlyph: { minWidth: 30, height: 24, paddingHorizontal: 4, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  bgA: { fontFamily: typeToken.font.display, fontWeight: '800', fontSize: 12 },
  alignTool: { gap: 3, paddingHorizontal: 11 },
  slider: { position: 'absolute', left: 10, width: 36, alignItems: 'center', justifyContent: 'center' },
  sliderHit: { width: 36, flex: 1, alignItems: 'center' },
  track: { position: 'absolute', top: 0, bottom: 0, width: 3, borderRadius: 2, backgroundColor: color.whiteA45 },
  thumb: { position: 'absolute', width: 18, height: 18, borderRadius: 999, backgroundColor: color.white },
});
