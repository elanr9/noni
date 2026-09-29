// Horizontal paging track: one finger drags the whole row of slides 1:1,
// release springs to the nearest page with the finger's velocity. The
// translate lives on the native animated thread; React only hears about
// the settled page. Targets are refreshed after every render via setPage.
import { Animated, PanResponder, type PanResponderGestureState } from 'react-native';

const CLAIM_DX = 8;
const PAGE_FLICK_VELOCITY = 0.4;
const PAGE_DRAG_SHARE = 0.25;
const EDGE_RESISTANCE = 0.35;
const MAX_VELOCITY = 3000;

export type Pager = {
  translateX: Animated.Value;
  panHandlers: ReturnType<typeof PanResponder.create>['panHandlers'];
  setPage(next: {
    index: number;
    count: number;
    width: number;
    enabled: boolean;
    onSettle: (index: number) => void;
  }): void;
  /** Springs the track to a page; fires onSettle when it lands. */
  goTo(index: number, velocity?: number): void;
  /** Places the track on the current page without animating (layout changes). */
  jump(): void;
};

export function createPager(): Pager {
  const translateX = new Animated.Value(0);
  Animated.timing(translateX, { toValue: 0, duration: 0, useNativeDriver: true }).start();

  let onSettle: (index: number) => void = () => undefined;
  let index = 0;
  let count = 1;
  let width = 0;
  let enabled = false;
  let base = 0;

  const offsetFor = (i: number) => -i * width;
  const clampIndex = (i: number) => Math.max(0, Math.min(count - 1, i));

  const goTo = (next: number, velocity = 0) => {
    const target = clampIndex(next);
    const changed = target !== index;
    index = target;
    Animated.spring(translateX, {
      toValue: offsetFor(target),
      velocity,
      useNativeDriver: true,
      bounciness: 0,
      speed: 18,
    }).start();
    if (changed) onSettle(target);
  };

  const onMove = (_evt: unknown, gs: PanResponderGestureState) => {
    if (width <= 0) return;
    const min = offsetFor(count - 1);
    let next = base + gs.dx;
    if (next > 0) next = next * EDGE_RESISTANCE;
    else if (next < min) next = min + (next - min) * EDGE_RESISTANCE;
    translateX.setValue(next);
  };

  const onRelease = (_evt: unknown, gs: PanResponderGestureState) => {
    if (width <= 0) return;
    const flick = Math.abs(gs.vx) > PAGE_FLICK_VELOCITY;
    const farEnough = Math.abs(gs.dx) > width * PAGE_DRAG_SHARE;
    const direction = gs.dx < 0 ? 1 : -1;
    const step = flick || farEnough ? direction : 0;
    // PanResponder reports px/ms; the spring wants px/s.
    goTo(index + step, Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, gs.vx * 1000)));
  };

  const responder = PanResponder.create({
    // Bubble phase only: an item that claimed the touch on start keeps it,
    // so the pager only ever sees one finger swiping on the bare photo.
    onMoveShouldSetPanResponder: (_evt, gs) =>
      enabled &&
      gs.numberActiveTouches === 1 &&
      Math.abs(gs.dx) > CLAIM_DX &&
      Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      translateX.stopAnimation();
      base = offsetFor(index);
    },
    onPanResponderMove: onMove,
    onPanResponderRelease: onRelease,
    onPanResponderTerminate: () => goTo(index),
  });

  return {
    translateX,
    panHandlers: responder.panHandlers,
    setPage(next) {
      const widthChanged = next.width !== width;
      index = clampIndex(next.index);
      count = Math.max(1, next.count);
      width = next.width;
      enabled = next.enabled;
      onSettle = next.onSettle;
      if (widthChanged) translateX.setValue(offsetFor(index));
    },
    goTo,
    jump() {
      translateX.setValue(offsetFor(index));
    },
  };
}
