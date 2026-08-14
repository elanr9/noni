// On-screen text style editor. The admin picks how overlay text looks on the
// finished video: box, outline, or plain, plus text and accent colors. The
// dark canvas previews the exact look; what is saved here is what the render
// pass burns in and what creators see live while recording.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  TikTokSans_700Bold,
  useFonts,
} from '@expo-google-fonts/tiktok-sans';

import type { TextOverlay, TextOverlayMode } from '../../../lib/briefs-api';
import { color, radiusAdmin } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { PressableScale } from '../../ui/PressableScale';
import { Segmented, Sheet } from '../shared';

const MODES: Array<{ value: TextOverlayMode; label: string }> = [
  { value: 'box', label: 'Box' },
  { value: 'outline', label: 'Outline' },
  { value: 'plain', label: 'Plain' },
];

// TikTok's official text background palette, plus white and black, so a
// picked color reads exactly like a native TikTok caption.
const SWATCHES = [
  '#FFFFFF',
  '#000000',
  '#EA403F',
  '#FF933D',
  '#F2CD46',
  '#78C25E',
  '#3496F0',
  '#5756D4',
  '#F7D7E9',
  '#EB4C89',
];

const SAMPLE = 'Your hook goes here\nand the next line';

export interface TextStyleSheetProps {
  visible: boolean;
  initial: TextOverlay;
  saving: boolean;
  onClose: () => void;
  onSave: (overlay: TextOverlay) => void;
}

export function TextStyleSheet({
  visible,
  initial,
  saving,
  onClose,
  onSave,
}: TextStyleSheetProps) {
  const [fontLoaded] = useFonts({ TikTokSans_700Bold });
  const [mode, setMode] = useState<TextOverlayMode>(initial.mode);
  const [textColor, setTextColor] = useState(initial.text_color);
  const [accentColor, setAccentColor] = useState(initial.accent_color);

  useEffect(() => {
    if (!visible) return;
    setMode(initial.mode);
    setTextColor(initial.text_color);
    setAccentColor(initial.accent_color);
  }, [visible, initial]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      footer={
        <Button
          size="lg"
          variant="primary"
          block
          disabled={saving}
          onPress={() =>
            onSave({
              enabled: true,
              mode,
              text_color: textColor,
              accent_color: accentColor,
            })
          }
        >
          {saving ? 'Saving…' : 'Save style'}
        </Button>
      }
    >
      <Text style={styles.title}>Text style</Text>
      <Text style={styles.subtitle}>
        How the talking point text looks on the finished video.
      </Text>

      <View style={styles.canvas}>
        <Text
          style={[
            styles.sample,
            { fontFamily: fontLoaded ? 'TikTokSans_700Bold' : undefined },
            mode === 'box'
              ? {
                  color: textColor,
                  backgroundColor: accentColor,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 14,
                  overflow: 'hidden',
                }
              : mode === 'outline'
                ? {
                    color: textColor,
                    textShadowColor: accentColor,
                    textShadowOffset: { width: 0, height: 0 },
                    textShadowRadius: 3,
                  }
                : {
                    color: textColor,
                    textShadowColor: 'rgba(0,0,0,0.65)',
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 4,
                  },
          ]}
        >
          {SAMPLE}
        </Text>
      </View>

      <Text style={styles.label}>Style</Text>
      <Segmented
        options={MODES.map((m) => ({ label: m.label }))}
        value={MODES.findIndex((m) => m.value === mode)}
        onChange={(i) => setMode(MODES[i].value)}
      />

      <Text style={styles.label}>Text color</Text>
      <SwatchRow value={textColor} onChange={setTextColor} />

      {mode !== 'plain' ? (
        <>
          <Text style={styles.label}>
            {mode === 'box' ? 'Box color' : 'Outline color'}
          </Text>
          <SwatchRow value={accentColor} onChange={setAccentColor} />
        </>
      ) : null}
    </Sheet>
  );
}

function SwatchRow(props: { value: string; onChange: (hex: string) => void }) {
  return (
    <View style={styles.swatchRow}>
      {SWATCHES.map((hex) => {
        const active = hex.toUpperCase() === props.value.toUpperCase();
        return (
          <PressableScale
            key={hex}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => props.onChange(hex)}
            style={[
              styles.swatch,
              { backgroundColor: hex },
              active && styles.swatchActive,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: color.ink,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 13 * 1.45,
    color: color.slate400,
  },
  canvas: {
    height: 150,
    borderRadius: radiusAdmin.lg,
    backgroundColor: '#16181d',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  sample: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  label: {
    marginTop: 16,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '700',
    color: color.slate500,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: color.lineStrong,
  },
  swatchActive: {
    borderWidth: 3,
    borderColor: color.blue500,
  },
});
