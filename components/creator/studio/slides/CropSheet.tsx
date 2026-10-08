import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { SlidePlatform } from '../../../../lib/submissions';
import { color, radius, type } from '../../../../theme/tokens';
import { PressableScale } from '../../../ui/PressableScale';
import { CropPanel } from '../../slides/CropPanel';

/** Framing controls: both platform chips for 9:16 posts, a plain Done otherwise. */
export function CropSheet(props: {
  platforms: readonly SlidePlatform[];
  platform: SlidePlatform;
  onPlatform: (platform: SlidePlatform) => void;
  onDone: () => void;
}): JSX.Element {
  const { platforms, platform, onPlatform, onDone } = props;
  if (platforms.length > 1) {
    return <CropPanel platform={platform} onPlatform={onPlatform} onDone={onDone} />;
  }
  return (
    <View style={styles.root}>
      <View style={styles.copy}>
        <Text style={styles.title}>Drag to move, pinch to zoom</Text>
        <Text style={styles.hint}>Frame the photo the way it should post.</Text>
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Done framing"
        onPress={onDone}
        style={styles.done}
      >
        <Text style={styles.doneText}>Done</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 14,
  },
  copy: {
    gap: 2,
  },
  title: {
    color: color.ink,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
  },
  hint: {
    color: color.slate500,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
  },
  done: {
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    color: color.white,
    fontSize: type.size.action,
    fontWeight: type.weight.heavy,
  },
});
