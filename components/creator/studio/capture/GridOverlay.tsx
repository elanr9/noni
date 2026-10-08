import type { JSX } from 'react';
import { StyleSheet, View } from 'react-native';

const LINE = 'rgba(255,255,255,0.4)';

export function GridOverlay(): JSX.Element {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.vertical, { left: '33.333%' }]} />
      <View style={[styles.vertical, { left: '66.666%' }]} />
      <View style={[styles.horizontal, { top: '33.333%' }]} />
      <View style={[styles.horizontal, { top: '66.666%' }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  vertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: LINE,
  },
  horizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: LINE,
  },
});
