// Bottom sheet while the creator frames a photo on the stage: a TikTok and
// an Instagram view of the same photo, each framed on its own, then Done.
// The photo itself is moved on the stage, over the text that will sit on it.
import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SLIDE_PLATFORMS, type SlidePlatform } from '../../../lib/submissions';
import { color, radius, type } from '../../../theme/tokens';
import { PressableScale } from '../../ui/PressableScale';
import { PlatformLogo } from './PlatformLogo';

const PLATFORM_LABEL: Record<SlidePlatform, string> = {
  tiktok: 'Frame for TikTok',
  instagram: 'Frame for Instagram',
};

export function CropPanel(props: {
  platform: SlidePlatform;
  onPlatform: (platform: SlidePlatform) => void;
  onDone: () => void;
}): JSX.Element {
  const { platform, onPlatform, onDone } = props;
  return (
    <View style={styles.root}>
      <View style={styles.copy}>
        <Text style={styles.title}>Drag to move, pinch to zoom</Text>
        <Text style={styles.hint}>Frame it for both apps before you send it.</Text>
      </View>
      <View style={styles.chips}>
        {SLIDE_PLATFORMS.map((p) => {
          const active = p === platform;
          return (
            <PressableScale
              key={p}
              accessibilityRole="button"
              accessibilityLabel={PLATFORM_LABEL[p]}
              accessibilityState={{ selected: active }}
              onPress={() => onPlatform(p)}
              style={[styles.chip, active && styles.chipOn]}
            >
              <PlatformLogo platform={p} size={22} color={active ? color.white : color.ink} />
            </PressableScale>
          );
        })}
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
  chips: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    height: 44,
    width: 64,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.line,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: {
    backgroundColor: color.ink,
    borderColor: color.ink,
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
