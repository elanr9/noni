// Side grips on the selected text box that change its wrap width. The drag
// maths and throttled live width come from slides/GestureItem; only the
// touch handling is gesture-handler here.
import { useLayoutEffect, useRef, type JSX, type MutableRefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { color } from '../../../../theme/tokens';
import type { WidthDrag } from '../../slides/GestureItem';

const HANDLE_HIT = 28;

function Handle(props: { side: -1 | 1; drag: MutableRefObject<WidthDrag> }): JSX.Element {
  const { side, drag } = props;
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onStart(() => drag.current.onStart())
    .onUpdate((e) => drag.current.onChange(2 * side * e.translationX))
    .onEnd((_e, success) => (success ? drag.current.onEnd() : drag.current.onCancel()));
  return (
    <GestureDetector gesture={pan}>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={side < 0 ? 'Left width handle' : 'Right width handle'}
        style={[styles.handleHit, side < 0 ? styles.handleLeft : styles.handleRight]}
      >
        <View style={styles.handlePill} />
      </View>
    </GestureDetector>
  );
}

export function WidthHandles(props: { visible: boolean; drag: WidthDrag }): JSX.Element | null {
  const dragRef = useRef(props.drag);
  useLayoutEffect(() => {
    dragRef.current = props.drag;
  });
  if (!props.visible) return null;
  return (
    <>
      <Handle side={-1} drag={dragRef} />
      <Handle side={1} drag={dragRef} />
    </>
  );
}

const styles = StyleSheet.create({
  handleHit: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: HANDLE_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleLeft: {
    left: -HANDLE_HIT / 2 - 6,
  },
  handleRight: {
    right: -HANDLE_HIT / 2 - 6,
  },
  handlePill: {
    width: 6,
    height: 26,
    borderRadius: 3,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.ink900,
  },
});
