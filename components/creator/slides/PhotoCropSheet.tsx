// Instagram style crop for one slide photo: the picture fills a frame at the
// post's aspect, one finger pans, two fingers zoom, Done cuts that window
// out of the original. Every slide of a post shares one aspect, so the
// ratio is only a choice while cropping the first photo.
import { useEffect, useMemo, useRef, useState, type JSX, type MutableRefObject } from 'react';
import {
  Animated,
  Image,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  SLIDE_ASPECTS,
  SLIDE_ASPECT_RATIO,
  type SlideAspect,
} from '../../../lib/submissions';
import { color, radius, space, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { clamp } from './frame';

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
/** Crops wider than this are downscaled; 2x the 1080 bake keeps text crisp. */
const MAX_OUTPUT_WIDTH = 2160;
const HEADER_HEIGHT = 56;
const FOOTER_HEIGHT = 96;

type Size = { width: number; height: number };
/** Committed pan and zoom; the Animated values mirror these. */
type Viewport = { zoom: number; x: number; y: number };
type Layout = { frame: Size; source: Size | null };
type Touch = { pageX: number; pageY: number };

export type CropResult = { uri: string; mimeType: string; aspect: SlideAspect };

function imageSize(uri: string): Promise<Size> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => reject(new Error('Could not read this photo.')),
    );
  });
}

function touchDistance(touches: readonly Touch[]): number {
  const a = touches[0];
  const b = touches[1];
  if (a === undefined || b === undefined) return 0;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/** Scale that makes the source cover the frame at zoom 1. */
function coverScale(source: Size, frame: Size): number {
  return Math.max(frame.width / source.width, frame.height / source.height);
}

/** Largest offset that still keeps the frame fully covered. */
function maxOffset(source: Size, frame: Size, zoom: number): { x: number; y: number } {
  const s = coverScale(source, frame) * zoom;
  return {
    x: Math.max(0, (source.width * s - frame.width) / 2),
    y: Math.max(0, (source.height * s - frame.height) / 2),
  };
}

/** Pan to (x, y), clamped so the frame stays covered, and push it to the Animated value. */
function moveView(
  view: Viewport,
  layout: Layout,
  offset: Animated.ValueXY,
  x: number,
  y: number,
): void {
  if (!layout.source) return;
  const limit = maxOffset(layout.source, layout.frame, view.zoom);
  view.x = clamp(x, -limit.x, limit.x);
  view.y = clamp(y, -limit.y, limit.y);
  offset.setValue({ x: view.x, y: view.y });
}

function AspectChip(props: {
  aspect: SlideAspect;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}): JSX.Element {
  const { aspect, active, disabled, onPress } = props;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Crop to ${aspect}`}
      accessibilityState={{ selected: active, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[styles.chip, active && styles.chipOn, disabled && !active && styles.chipOff]}
    >
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{aspect}</Text>
    </PressableScale>
  );
}

type Gesture = {
  startZoom: number;
  startX: number;
  startY: number;
  startDist: number;
  pinching: boolean;
  panBaseDx: number;
  panBaseDy: number;
};

/** The crop window: one finger pans, two fingers zoom about the frame centre. */
function CropFrame(props: {
  sourceUri: string;
  source: Size | null;
  frame: Size;
  view: MutableRefObject<Viewport>;
  layout: MutableRefObject<Layout>;
  zoom: Animated.Value;
  offset: Animated.ValueXY;
}): JSX.Element {
  const { sourceUri, source, frame, view: current, layout, zoom, offset } = props;

  const [responder] = useState(() => {
    const g: Gesture = {
      startZoom: 1,
      startX: 0,
      startY: 0,
      startDist: 0,
      pinching: false,
      panBaseDx: 0,
      panBaseDy: 0,
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        g.startZoom = current.current.zoom;
        g.startX = current.current.x;
        g.startY = current.current.y;
        g.pinching = false;
        g.panBaseDx = 0;
        g.panBaseDy = 0;
      },
      onPanResponderMove: (e, state) => {
        const view = current.current;
        const touches = e.nativeEvent.touches;
        if (touches.length >= 2) {
          const dist = touchDistance(touches);
          if (!g.pinching) {
            g.pinching = true;
            g.startDist = dist;
            g.startZoom = view.zoom;
            g.startX = view.x;
            g.startY = view.y;
          }
          if (g.startDist > 0) {
            const nextZoom = clamp((g.startZoom * dist) / g.startDist, MIN_ZOOM, MAX_ZOOM);
            const ratioChange = nextZoom / g.startZoom;
            view.zoom = nextZoom;
            zoom.setValue(nextZoom);
            moveView(view, layout.current, offset, g.startX * ratioChange, g.startY * ratioChange);
          }
          return;
        }
        if (g.pinching) {
          g.pinching = false;
          g.startX = view.x;
          g.startY = view.y;
          g.panBaseDx = state.dx;
          g.panBaseDy = state.dy;
        }
        moveView(
          view,
          layout.current,
          offset,
          g.startX + state.dx - g.panBaseDx,
          g.startY + state.dy - g.panBaseDy,
        );
      },
    });
  });

  const baseScale = source ? coverScale(source, frame) : 1;

  return (
    <View
      style={[styles.frame, { width: frame.width, height: frame.height }]}
      {...responder.panHandlers}
    >
      {source ? (
        <Animated.Image
          source={{ uri: sourceUri }}
          style={[
            styles.image,
            {
              width: source.width * baseScale,
              height: source.height * baseScale,
              transform: [{ translateX: offset.x }, { translateY: offset.y }, { scale: zoom }],
            },
          ]}
          resizeMode="cover"
        />
      ) : null}
      <View style={styles.gridV} pointerEvents="none" />
      <View style={[styles.gridV, styles.gridV2]} pointerEvents="none" />
      <View style={styles.gridH} pointerEvents="none" />
      <View style={[styles.gridH, styles.gridH2]} pointerEvents="none" />
    </View>
  );
}

function CropEditor(props: {
  sourceUri: string;
  initialAspect: SlideAspect;
  aspectLocked: boolean;
  onCancel: () => void;
  onDone: (result: CropResult) => void;
  onError: (message: string) => void;
}): JSX.Element {
  const { sourceUri, initialAspect, aspectLocked, onCancel, onDone, onError } = props;
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [aspect, setAspect] = useState<SlideAspect>(initialAspect);
  const [source, setSource] = useState<Size | null>(null);
  const [saving, setSaving] = useState(false);

  const zoom = useMemo(() => new Animated.Value(1), []);
  const offset = useMemo(() => new Animated.ValueXY({ x: 0, y: 0 }), []);
  const current = useRef<Viewport>({ zoom: 1, x: 0, y: 0 });

  const stageHeight =
    window.height - insets.top - insets.bottom - HEADER_HEIGHT - FOOTER_HEIGHT;
  const ratio = SLIDE_ASPECT_RATIO[aspect];
  const frame = useMemo<Size>(
    () =>
      window.width / ratio <= stageHeight
        ? { width: window.width, height: window.width / ratio }
        : { width: stageHeight * ratio, height: stageHeight },
    [window.width, ratio, stageHeight],
  );

  /** Latest layout for the gesture handlers, which outlive any one render. */
  const layout = useRef<Layout>({ frame, source: null });
  useEffect(() => {
    layout.current = { frame, source };
  }, [frame, source]);

  useEffect(() => {
    let cancelled = false;
    imageSize(sourceUri)
      .then((size) => {
        if (!cancelled) setSource(size);
      })
      .catch((e: unknown) => {
        if (!cancelled) onError(e instanceof Error ? e.message : 'Could not read this photo.');
      });
    return () => {
      cancelled = true;
    };
  }, [sourceUri, onError]);

  function changeAspect(next: SlideAspect) {
    if (next === aspect) return;
    setAspect(next);
    current.current = { zoom: 1, x: 0, y: 0 };
    zoom.setValue(1);
    offset.setValue({ x: 0, y: 0 });
  }

  async function finish() {
    if (!source || saving) return;
    setSaving(true);
    try {
      const view = current.current;
      const s = coverScale(source, frame) * view.zoom;
      const cropWidth = frame.width / s;
      const cropHeight = frame.height / s;
      const originX = clamp(
        source.width / 2 - view.x / s - cropWidth / 2,
        0,
        source.width - cropWidth,
      );
      const originY = clamp(
        source.height / 2 - view.y / s - cropHeight / 2,
        0,
        source.height - cropHeight,
      );
      const actions: ImageManipulator.Action[] = [
        {
          crop: {
            originX: Math.round(originX),
            originY: Math.round(originY),
            width: Math.floor(cropWidth),
            height: Math.floor(cropHeight),
          },
        },
      ];
      if (cropWidth > MAX_OUTPUT_WIDTH) {
        actions.push({ resize: { width: MAX_OUTPUT_WIDTH } });
      }
      const result = await ImageManipulator.manipulateAsync(sourceUri, actions, {
        compress: 0.92,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      onDone({ uri: result.uri, mimeType: 'image/jpeg', aspect });
    } catch (e) {
      setSaving(false);
      onError(e instanceof Error ? e.message : 'Could not crop this photo.');
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Cancel crop"
          onPress={onCancel}
          disabled={saving}
          style={styles.headerBtn}
        >
          <Icon name="x" size={22} color={color.white} />
        </PressableScale>
        <Text style={styles.title}>Crop</Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Use this crop"
          onPress={() => void finish()}
          disabled={saving || !source}
          style={styles.headerBtn}
        >
          <Text style={[styles.done, (saving || !source) && styles.doneOff]}>
            {saving ? 'Saving' : 'Done'}
          </Text>
        </PressableScale>
      </View>

      <View style={[styles.stage, { height: stageHeight }]}>
        <CropFrame
          sourceUri={sourceUri}
          source={source}
          frame={frame}
          view={current}
          layout={layout}
          zoom={zoom}
          offset={offset}
        />
      </View>

      <View style={styles.footer}>
        <View style={styles.chips}>
          {SLIDE_ASPECTS.map((a) => (
            <AspectChip
              key={a}
              aspect={a}
              active={a === aspect}
              disabled={aspectLocked || saving}
              onPress={() => changeAspect(a)}
            />
          ))}
        </View>
        <Text style={styles.hint}>
          {aspectLocked
            ? 'Every slide in this post shares one size.'
            : 'Drag to move, pinch to zoom. Every slide will use this size.'}
        </Text>
      </View>
    </View>
  );
}

export function PhotoCropSheet(props: {
  visible: boolean;
  sourceUri: string | null;
  /** The post's aspect, or the default to start from. */
  aspect: SlideAspect;
  /** Other slides already share this aspect, so it cannot change here. */
  aspectLocked: boolean;
  onCancel: () => void;
  onDone: (result: CropResult) => void;
  onError: (message: string) => void;
}): JSX.Element {
  const { visible, sourceUri, aspect, aspectLocked, onCancel, onDone, onError } = props;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
    >
      {sourceUri ? (
        <CropEditor
          key={sourceUri}
          sourceUri={sourceUri}
          initialAspect={aspect}
          aspectLocked={aspectLocked}
          onCancel={onCancel}
          onDone={onDone}
          onError={onError}
        />
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.ink,
  },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[3],
  },
  headerBtn: {
    minWidth: 56,
    height: 40,
    justifyContent: 'center',
  },
  title: {
    color: color.white,
    fontSize: type.size.body,
    fontWeight: type.weight.bold,
  },
  done: {
    color: color.white,
    fontSize: type.size.body,
    fontWeight: type.weight.bold,
    textAlign: 'right',
  },
  doneOff: {
    opacity: 0.45,
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    overflow: 'hidden',
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    position: 'absolute',
  },
  gridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '33.333%',
    width: StyleSheet.hairlineWidth,
    backgroundColor: color.whiteA45,
  },
  gridV2: {
    left: '66.666%',
  },
  gridH: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '33.333%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.whiteA45,
  },
  gridH2: {
    top: '66.666%',
  },
  footer: {
    height: FOOTER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
  },
  chips: {
    flexDirection: 'row',
    gap: space[2],
  },
  chip: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA16,
    justifyContent: 'center',
  },
  chipOn: {
    backgroundColor: color.white,
  },
  chipOff: {
    opacity: 0.4,
  },
  chipText: {
    color: color.white,
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
  },
  chipTextOn: {
    color: color.ink,
  },
  hint: {
    color: color.whiteA60,
    fontSize: type.size.label,
  },
});
