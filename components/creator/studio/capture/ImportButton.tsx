import { useState, type JSX } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import type { MediaAsset } from '../../../../lib/edit-document';
import { type } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { PressableScale } from '../../../ui/PressableScale';
import { CHROME_BG, CHROME_BORDER, WHITE } from './constants';
import { pickedAsset } from './media-assets';

const BUTTON = 44;

export type ImportButtonProps = {
  onAsset(asset: MediaAsset): void;
  disabled: boolean;
};

export function ImportButton({ onAsset, disabled }: ImportButtonProps): JSX.Element {
  const [permission, requestPermission] = ImagePicker.useMediaLibraryPermissions();
  const [busy, setBusy] = useState(false);

  async function pick() {
    if (busy) return;
    setBusy(true);
    try {
      // Passthrough needs library access to hand back the original file;
      // asking up front avoids a second prompt after selection.
      if (!permission?.granted) await requestPermission();
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        orderedSelection: true,
        selectionLimit: 0,
      });
      if (result.canceled) return;
      for (const picked of result.assets) onAsset(await pickedAsset(picked));
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="Import from library"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={() => void pick()}
      style={[styles.item, disabled && styles.itemDisabled]}
    >
      <View style={styles.circle}>
        {busy ? <ActivityIndicator color={WHITE} /> : <Icon name="images" size={22} color={WHITE} />}
      </View>
      <Text style={styles.label}>Upload</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  item: {
    alignItems: 'center',
    gap: 4,
  },
  itemDisabled: {
    opacity: 0.4,
  },
  circle: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: 12,
    backgroundColor: CHROME_BG,
    borderWidth: 1,
    borderColor: CHROME_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.semibold,
    color: WHITE,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
