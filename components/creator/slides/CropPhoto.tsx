// The slide photo while the creator frames it on the stage: one finger pans
// the picture under the frame, two fingers zoom about the pinch. The live
// picture is an Animated transform on the native thread; the new window is
// committed once on release. Claims the touch on start so the slide pager
// never scrolls during a crop.
import { useEffect, useRef, useState, type JSX } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';

import { touchFocal } from './GestureItem';
import {
  panCrop,
  photoLayout,
  zoomCrop,
  type PhotoCrop,
  type SourceSize,
} from './photo-crop';

type Touch = { pageX: number; pageY: number };

function touchDistance(touches: readonly Touch[]): number {
  const a = touches[0];
  const b = touches[1];
  if (a === undefined || b === undefined) return 0;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

type Props = {
  uri: string;
  crop: PhotoCrop;
  source: SourceSize;
  frameAspect: number;
  stageWidth: number;
  stageHeight: number;
  onChange: (crop: PhotoCrop) => void;
  onLoad?: () => void;
};

function createCropGesture(initial: Props) {
  const translate = new Animated.ValueXY({ x: 0, y: 0 });
  const scale = new Animated.Value(1);
  for (const value of [translate.x, translate.y, scale]) {
    Animated.timing(value, { toValue: value === scale ? 1 : 0, duration: 0, useNativeDriver: true }).start();
  }

  let props = initial;
  let stageOrigin = { x: 0, y: 0 };
  let measure: (done: (o: { x: number; y: number }) => void) => void = () => undefined;
  let start = initial.crop;
  let live = initial.crop;
  let pinchStart = 0;
  let pinchBase = initial.crop;
  let panBase = { dx: 0, dy: 0 };
  let dragging = false;

  const show = (crop: PhotoCrop) => {
    const { stageWidth: w, stageHeight: h } = props;
    const base = photoLayout(props.crop, w, h);
    const next = photoLayout(crop, w, h);
    const s = next.width / base.width;
    translate.setValue({
      x: next.left + next.width / 2 - (base.left + base.width / 2),
      y: next.top + next.height / 2 - (base.top + base.height / 2),
    });
    scale.setValue(s);
  };

  const focalOf = (touches: readonly Touch[]) => {
    const f = touchFocal(touches);
    if (f === null) return { x: 0.5, y: 0.5 };
    return {
      x: (f.x - stageOrigin.x) / props.stageWidth,
      y: (f.y - stageOrigin.y) / props.stageHeight,
    };
  };

  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      dragging = true;
      start = props.crop;
      live = start;
      pinchStart = 0;
      panBase = { dx: 0, dy: 0 };
      measure((o) => {
        stageOrigin = o;
      });
    },
    onPanResponderMove: (evt: GestureResponderEvent, gs) => {
      const { stageWidth: w, stageHeight: h } = props;
      if (w <= 0 || h <= 0) return;
      const touches = evt.nativeEvent.touches;
      if (touches.length >= 2) {
        const dist = touchDistance(touches);
        if (pinchStart === 0) {
          pinchStart = dist;
          pinchBase = live;
          return;
        }
        if (dist <= 0) return;
        live = zoomCrop(
          pinchBase,
          props.source,
          props.frameAspect,
          dist / pinchStart,
          focalOf(touches),
        );
        show(live);
        return;
      }
      if (pinchStart !== 0) {
        // Second finger lifted: keep panning from where the pinch left off.
        pinchStart = 0;
        start = live;
        panBase = { dx: gs.dx, dy: gs.dy };
      }
      live = panCrop(start, (gs.dx - panBase.dx) / w, (gs.dy - panBase.dy) / h);
      show(live);
    },
    onPanResponderRelease: () => {
      dragging = false;
      if (live !== props.crop) props.onChange(live);
    },
    onPanResponderTerminate: () => {
      dragging = false;
      translate.setValue({ x: 0, y: 0 });
      scale.setValue(1);
    },
  });

  return {
    translate,
    scale,
    panHandlers: responder.panHandlers,
    setProps(next: Props) {
      props = next;
    },
    setMeasure(next: typeof measure) {
      measure = next;
    },
    /** Props carry the committed crop now; the live transform goes back to rest. */
    settle() {
      if (dragging) return;
      translate.setValue({ x: 0, y: 0 });
      scale.setValue(1);
    },
  };
}

export function CropPhoto(props: Props): JSX.Element {
  const { uri, crop, stageWidth, stageHeight, onLoad } = props;
  const layerRef = useRef<View>(null);
  const [gesture] = useState(() => createCropGesture(props));

  useEffect(() => {
    gesture.setProps(props);
  });

  useEffect(() => {
    gesture.setMeasure((done) => {
      layerRef.current?.measureInWindow((x, y) => done({ x, y }));
    });
  }, [gesture]);

  useEffect(() => {
    gesture.settle();
  }, [crop, stageWidth, stageHeight, gesture]);

  const layout = photoLayout(crop, stageWidth, stageHeight);

  return (
    <View ref={layerRef} style={StyleSheet.absoluteFill} {...gesture.panHandlers}>
      <Animated.Image
        source={{ uri }}
        onLoad={onLoad}
        resizeMode="stretch"
        style={[
          styles.photo,
          layout,
          {
            transform: [
              { translateX: gesture.translate.x },
              { translateY: gesture.translate.y },
              { scale: gesture.scale },
            ],
          },
        ]}
      />
      <View style={styles.gridV} pointerEvents="none" />
      <View style={[styles.gridV, styles.gridV2]} pointerEvents="none" />
      <View style={styles.gridH} pointerEvents="none" />
      <View style={[styles.gridH, styles.gridH2]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  photo: {
    position: 'absolute',
  },
  gridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '33.333%',
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.45)',
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
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  gridH2: {
    top: '66.666%',
  },
});
