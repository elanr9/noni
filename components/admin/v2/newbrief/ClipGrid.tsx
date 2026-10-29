import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';

import { clipLabel, clipOverlays, clipTexts, shortLabel, type BriefClip, type BriefType, type GsMedia } from '../../../../lib/brief-library';
import { color, motion, radius, shadow } from '../../../../theme/v2';
import { Icon, Press, tap } from '../../../v2';
import { ClipFrame } from './ClipFrame';

const GAP = 10;
const SLIDE = Easing.bezier(0.2, 0.8, 0.2, 1);

export interface ClipGridProps {
  clips: BriefClip[];
  type: BriefType;
  readOnly?: boolean;
  isGreen: boolean;
  fullGreen: boolean;
  /** Background for every clip when `fullGreen`. */
  gsAll: GsMedia | null;
  /** The AI is still writing this clip. */
  pending: (i: number) => boolean;
  /** The AI just landed this clip: pop the tile and reveal its text. */
  justFilled: (i: number) => boolean;
  onOpen: (id: string) => void;
  onAdd?: () => void;
  onReorder: (from: number, to: number) => void;
  onToggleGreen?: (id: string) => void;
  /** The list should stop scrolling while a tile is lifted. */
  onDragging?: (on: boolean) => void;
}

type DragSV = { dragIdx: SharedValue<number>; from: SharedValue<number>; over: SharedValue<number>; dx: SharedValue<number>; dy: SharedValue<number>; snap: SharedValue<number> };

/** 3 columns (2 for Long Text), gap 10. Long-press 260ms lifts a tile; others slide out of the way; drop snaps. */
export function ClipGrid({ clips, type, readOnly, isGreen, fullGreen, gsAll, pending, justFilled, onOpen, onAdd, onReorder, onToggleGreen, onDragging }: ClipGridProps) {
  const long = type === 'Long Text';
  const slides = type === 'Slideshow';
  const cols = long ? 2 : 3;
  const [W, setW] = useState(0);
  const [tileH, setTileH] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const tileW = W ? (W - GAP * (cols - 1)) / cols : 0;
  const frameH = (tileW * 12) / 9;
  const n = clips.length;

  const sv: DragSV = {
    dragIdx: useSharedValue(-1),
    from: useSharedValue(-1),
    over: useSharedValue(-1),
    dx: useSharedValue(0),
    dy: useSharedValue(0),
    snap: useSharedValue(0),
  };

  const begin = (i: number) => {
    tap();
    setDragging(i);
    onDragging?.(true);
  };
  const moved = () => tap();
  const end = (from: number, over: number) => {
    if (over >= 0 && over !== from) onReorder(from, over);
    setDragging(null);
    onDragging?.(false);
    setTimeout(() => sv.snap.set(0), 60);
  };

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
      {tileW
        ? clips.map((c, i) => (
            <Tile
              key={c.id}
              c={c}
              i={i}
              n={n}
              cols={cols}
              tileW={tileW}
              tileH={tileH || frameH + 36}
              frameH={frameH}
              sv={sv}
              label={clipLabel(i, type)}
              sub={slides ? c.onScreen || shortLabel(c.text) || 'Creator adds photo' : c.text || 'No script'}
              subEmpty={slides ? !(c.onScreen || c.text) : !c.text}
              green={isGreen && (fullGreen || c.green)}
              gs={c.gs || (fullGreen ? gsAll : null)}
              greenToggle={isGreen && !fullGreen && !readOnly}
              lifted={dragging === i}
              pending={pending(i)}
              justFilled={justFilled(i)}
              canDrag={!readOnly && !long}
              onLayoutHeight={i === 0 ? setTileH : undefined}
              onOpen={() => onOpen(c.id)}
              onToggleGreen={onToggleGreen ? () => onToggleGreen(c.id) : undefined}
              begin={begin}
              moved={moved}
              end={end}
            />
          ))
        : null}
      {tileW && !long && !readOnly && onAdd ? <AddTile i={n} cols={cols} tileW={tileW} tileH={tileH || frameH + 36} sv={sv} label={slides ? 'Add slide' : 'Add clip'} onPress={onAdd} /> : null}
    </View>
  );
}

/** Slots shift by one toward the lifted tile's old place. */
function shiftOf(i: number, from: number, over: number): number {
  'worklet';
  if (from < 0 || i === from) return 0;
  if (from < over && i > from && i <= over) return -1;
  if (from > over && i >= over && i < from) return 1;
  return 0;
}

function useSlotStyle(i: number, cols: number, tileW: number, tileH: number, sv: DragSV, pop?: SharedValue<number>) {
  return useAnimatedStyle(() => {
    const scaleBase = pop ? pop.get() : 1;
    if (sv.dragIdx.get() === i) {
      return { transform: [{ translateX: sv.dx.get() }, { translateY: sv.dy.get() }, { scale: 1.06 * scaleBase }], zIndex: 20, opacity: 0.96 };
    }
    const s = shiftOf(i, sv.from.get(), sv.over.get());
    let tx = 0, ty = 0;
    if (s) {
      const j = i + s;
      tx = ((j % cols) - (i % cols)) * (tileW + GAP);
      ty = (Math.floor(j / cols) - Math.floor(i / cols)) * (tileH + GAP);
    }
    const dur = sv.snap.get() ? 0 : 220;
    return { transform: [{ translateX: withTiming(tx, { duration: dur, easing: SLIDE }) }, { translateY: withTiming(ty, { duration: dur, easing: SLIDE }) }, { scale: scaleBase }], zIndex: 1, opacity: 1 };
  });
}

interface TileProps {
  c: BriefClip;
  i: number;
  n: number;
  cols: number;
  tileW: number;
  tileH: number;
  frameH: number;
  sv: DragSV;
  label: string;
  sub: string;
  subEmpty: boolean;
  green: boolean;
  gs: GsMedia | null;
  greenToggle: boolean;
  lifted: boolean;
  pending: boolean;
  justFilled: boolean;
  canDrag: boolean;
  onLayoutHeight?: (h: number) => void;
  onOpen: () => void;
  onToggleGreen?: () => void;
  begin: (i: number) => void;
  moved: () => void;
  end: (from: number, over: number) => void;
}

function Tile({ c, i, n, cols, tileW, tileH, frameH, sv, label, sub, subEmpty, green, gs, greenToggle, lifted, pending, justFilled, canDrag, onLayoutHeight, onOpen, onToggleGreen, begin, moved, end }: TileProps) {
  const pop = useSharedValue(1);
  useEffect(() => {
    if (!justFilled) return;
    pop.set(withSequence(withTiming(0.94, { duration: 0 }), withTiming(1.03, { duration: 336, easing: motion.spring }), withTiming(1, { duration: 224, easing: motion.tabEase })));
  }, [justFilled, pop]);
  const slot = useSlotStyle(i, cols, tileW, tileH, sv, pop);

  const pan = Gesture.Pan()
    .enabled(canDrag)
    .activateAfterLongPress(260)
    .shouldCancelWhenOutside(false)
    .onStart(() => {
      sv.dragIdx.set(i);
      sv.from.set(i);
      sv.over.set(i);
      sv.dx.set(0);
      sv.dy.set(0);
      runOnJS(begin)(i);
    })
    .onUpdate((e) => {
      sv.dx.set(e.translationX);
      sv.dy.set(e.translationY);
      const stepX = tileW + GAP, stepY = tileH + GAP;
      const cx = (i % cols) * stepX + tileW / 2 + e.translationX;
      const cy = Math.floor(i / cols) * stepY + tileH / 2 + e.translationY;
      const col = Math.min(cols - 1, Math.max(0, Math.floor(cx / stepX)));
      const row = Math.max(0, Math.floor(cy / stepY));
      let next = row * cols + col;
      if (next >= n) next = cy > Math.floor((n - 1) / cols) * stepY ? n - 1 : sv.over.get();
      if (next !== sv.over.get()) {
        sv.over.set(next);
        runOnJS(moved)();
      }
    })
    .onFinalize(() => {
      if (sv.dragIdx.get() !== i) return;
      const from = sv.from.get(), over = sv.over.get();
      sv.snap.set(1);
      sv.dragIdx.set(-1);
      sv.from.set(-1);
      sv.over.set(-1);
      sv.dx.set(0);
      sv.dy.set(0);
      runOnJS(end)(from, over);
    });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        onLayout={onLayoutHeight ? (e) => onLayoutHeight(e.nativeEvent.layout.height) : undefined}
        style={[{ width: tileW, borderRadius: radius.card, backgroundColor: color.card, overflow: 'hidden', boxShadow: lifted ? '0 18px 40px rgba(16,24,40,0.28)' : shadow.card.boxShadow }, slot]}
      >
        <Press onPress={onOpen} accessibilityRole="button" accessibilityLabel={label}>
          <ClipFrame width={tileW} height={frameH} texts={clipTexts(c)} overlays={clipOverlays(c)} green={green} gs={gs} cta={c.cta} pending={pending} revealKey={justFilled ? 'fill' : undefined}>
            {greenToggle && onToggleGreen ? (
              <Press
                accessibilityRole="switch"
                accessibilityLabel="Green screen"
                accessibilityState={{ checked: c.green }}
                onPress={onToggleGreen}
                style={{ position: 'absolute', right: 6, top: 6, width: 28, height: 28, borderRadius: radius.pill, backgroundColor: c.green ? color.white : 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.25)' }}
              >
                <Icon name="wallpaper" size={16} color={c.green ? '#000000' : color.white} />
              </Press>
            ) : null}
          </ClipFrame>
          <View style={{ paddingTop: 6, paddingHorizontal: 8, paddingBottom: 7 }}>
            <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 15, fontWeight: '700', color: color.ink }}>
              {label}
            </Text>
            <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 11, lineHeight: 14, color: subEmpty ? color.grey3 : color.grey4 }}>
              {sub}
            </Text>
          </View>
        </Press>
      </Animated.View>
    </GestureDetector>
  );
}

function AddTile({ i, cols, tileW, tileH, sv, label, onPress }: { i: number; cols: number; tileW: number; tileH: number; sv: DragSV; label: string; onPress: () => void }) {
  const slot = useSlotStyle(i, cols, tileW, tileH, sv);
  return (
    <Animated.View style={[{ width: tileW, height: tileH }, slot]}>
      <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1, borderRadius: radius.card, backgroundColor: color.blueTint, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(27,166,238,0.3)' }}>
          <Icon name="add" size={24} weight={700} color={color.white} />
        </View>
        <Text style={{ fontSize: 13, lineHeight: 16, fontWeight: '700', color: color.blueDeep }}>{label}</Text>
      </Press>
    </Animated.View>
  );
}
