// Text tools while editing a box (SSCanvas.jsx editing toolbar): font and
// color panels, the Aa / color / background / align / delete bar, and the
// vertical width slider on the left edge of the canvas.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInLeft, runOnJS, ZoomIn } from 'react-native-reanimated';

import { briefTone, color, type as typeToken } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { clamp, FONTS, SWATCHES, type FontKey, type ResolvedTextStyle, type TextBg } from './layout';

export type ToolPanel = 'font' | 'color' | null;

const NEXT_BG: Record<TextBg, TextBg> = { outline: 'box', box: 'none', none: 'outline' };
const NEXT_ALIGN: Record<ResolvedTextStyle['align'], ResolvedTextStyle['align']> = { center: 'left', left: 'right', right: 'center' };

export function TextToolbar({
  ts,
  panel,
  setPanel,
  onChange,
  onDelete,
  bottomInset = 0,
  children,
}: {
  ts: ResolvedTextStyle;
  panel: ToolPanel;
  setPanel: (p: ToolPanel) => void;
  onChange: (patch: Partial<ResolvedTextStyle>) => void;
  onDelete?: () => void;
  /** Lifts the bar above the keyboard. */
  bottomInset?: number;
  /** Buttons stacked above the toolbar (Generate with AI, Pick a feature). */
  children?: React.ReactNode;
}) {
  return (
    <Animated.View entering={FadeIn.duration(260)} style={[styles.wrap, { bottom: bottomInset }]} pointerEvents="box-none">
      {children ? <View style={styles.stack}>{children}</View> : null}
      {panel === 'font' ? (
        <Animated.View entering={ZoomIn.duration(180)} style={styles.panel}>
          {(Object.keys(FONTS) as FontKey[]).map((k) => (
            <Pressable
              key={k}
              accessibilityRole="button"
              onPress={() => onChange({ font: k })}
              style={[styles.fontBtn, { backgroundColor: ts.font === k ? color.white : color.scrim }]}
            >
              <Text
                style={{
                  fontFamily: FONTS[k].family,
                  fontWeight: FONTS[k].weight,
                  fontStyle: FONTS[k].italic ? 'italic' : 'normal',
                  fontSize: 14,
                  color: ts.font === k ? color.ink : color.white,
                }}
              >
                {FONTS[k].label}
              </Text>
            </Pressable>
          ))}
        </Animated.View>
      ) : null}
      {panel === 'color' ? (
        <Animated.View entering={ZoomIn.duration(180)} style={[styles.panel, { gap: 9 }]}>
          {SWATCHES.map((c) => (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityLabel={c}
              onPress={() => onChange({ color: c })}
              hitSlop={6}
              style={[styles.swatch, { backgroundColor: c }, ts.color === c ? styles.swatchOn : null]}
            />
          ))}
        </Animated.View>
      ) : null}
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Font" onPress={() => setPanel(panel === 'font' ? null : 'font')} style={[styles.tool, panel === 'font' ? styles.toolOn : null]}>
          <Text style={styles.aa}>Aa</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Color" onPress={() => setPanel(panel === 'color' ? null : 'color')} style={[styles.tool, panel === 'color' ? styles.toolOn : null]}>
          <View style={styles.wheel}>
            {briefTone.confetti.map((c, i) => (
              <View key={c} style={[styles.wheelSlice, { backgroundColor: c, transform: [{ rotate: `${i * 72}deg` }] }]} />
            ))}
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Text background" onPress={() => onChange({ bg: NEXT_BG[ts.bg] })} style={styles.tool}>
          <View style={[styles.bgGlyph, { backgroundColor: ts.bg === 'box' ? color.white : 'transparent' }]}>
            <Text style={[styles.bgA, { color: ts.bg === 'box' ? color.ink : color.white }]}>A</Text>
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
  const [startValue, setStartValue] = useState(value);
  const pan = Gesture.Pan()
    .onBegin(() => {
      runOnJS(setStartValue)(value);
    })
    .onChange((e) => {
      runOnJS(onChange)(clamp(startValue - (e.translationY / length) * 0.65, 0.3, 0.95));
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
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, paddingBottom: 14, alignItems: 'center', gap: 10 },
  stack: { alignItems: 'center', gap: 10, marginBottom: 8 },
  panel: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  fontBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, minHeight: 44, justifyContent: 'center' },
  swatch: { width: 30, height: 30, borderRadius: 999, borderWidth: 2.5, borderColor: color.white },
  swatchOn: { borderColor: color.blue500 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6, borderRadius: 16, backgroundColor: color.inkA55 },
  tool: { width: 46, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  toolOn: { backgroundColor: color.whiteA28 },
  aa: { fontFamily: typeToken.font.display, fontWeight: '800', fontSize: 17, color: color.white },
  wheel: { width: 22, height: 22, borderRadius: 999, overflow: 'hidden', borderWidth: 2, borderColor: color.white, backgroundColor: color.blue500 },
  wheelSlice: { position: 'absolute', width: 11, height: 11, left: 9, top: -2, transformOrigin: 'bottom left' },
  bgGlyph: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: color.white, alignItems: 'center', justifyContent: 'center' },
  bgA: { fontFamily: typeToken.font.display, fontWeight: '800', fontSize: 13 },
  alignTool: { gap: 3, paddingHorizontal: 11 },
  slider: { position: 'absolute', left: 10, width: 36, alignItems: 'center', justifyContent: 'center' },
  sliderHit: { width: 36, flex: 1, alignItems: 'center' },
  track: { position: 'absolute', top: 0, bottom: 0, width: 3, borderRadius: 2, backgroundColor: color.whiteA45 },
  thumb: { position: 'absolute', width: 18, height: 18, borderRadius: 999, backgroundColor: color.white },
});
