import { useState, type JSX } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';

import type { MediaAsset } from '../../../../lib/edit-document';
import { color, radius, type } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { PressableScale } from '../../../ui/PressableScale';
import { pickPhotoAssets } from './slide-edits';

export function AddPhotosButton(props: {
  /** Slots left before MAX_SLIDES; zero disables the button. */
  remaining: number;
  onAdd: (assets: MediaAsset[]) => void;
  variant: 'hero' | 'chip';
  chipSize?: { width: number; height: number };
}): JSX.Element {
  const { remaining, onAdd, variant, chipSize } = props;
  const [picking, setPicking] = useState(false);
  const disabled = picking || remaining <= 0;

  async function pick() {
    if (disabled) return;
    setPicking(true);
    try {
      const assets = await pickPhotoAssets(remaining);
      if (assets.length > 0) onAdd(assets);
    } catch (e) {
      Alert.alert('Could not open your photos', e instanceof Error ? e.message : undefined);
    } finally {
      setPicking(false);
    }
  }

  if (variant === 'chip') {
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Add photos"
        onPress={() => void pick()}
        disabled={disabled}
        style={[styles.chip, chipSize, disabled && styles.off]}
      >
        <Icon name="plus" size={18} color={color.white} />
      </PressableScale>
    );
  }

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="Add photos"
      onPress={() => void pick()}
      disabled={disabled}
      style={[styles.hero, disabled && styles.off]}
    >
      <Icon name="image-plus" size={18} color={color.white} />
      <Text style={styles.heroText}>Add photos</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    paddingHorizontal: 28,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
  },
  heroText: {
    color: color.white,
    fontSize: type.size.action,
    fontWeight: type.weight.heavy,
  },
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.whiteA45,
  },
  off: {
    opacity: 0.4,
  },
});
