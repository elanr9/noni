import type { JSX } from 'react';
import { StyleSheet, View } from 'react-native';

import { color } from '../../../../theme/tokens';

/** Fixed centre line the strip scrolls under. */
export function PlayheadLine(props: { x: number; height: number }): JSX.Element {
  return <View pointerEvents="none" style={[styles.line, { left: props.x - 1, height: props.height }]} />;
}

const styles = StyleSheet.create({
  line: { position: 'absolute', top: 0, width: 2, borderRadius: 1, backgroundColor: color.white, zIndex: 10 },
});
