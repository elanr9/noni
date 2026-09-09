// Per-post subtitles toggle. When on, the render pass burns auto-transcribed
// captions onto the reel: two lines at the bottom, talking-head style.
import { StyleSheet, Switch, Text, View } from 'react-native';

import { color, radiusAdmin, shadow } from '../../../theme/tokens';

export interface SubtitlesCardProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

export function SubtitlesCard({ value, onChange }: SubtitlesCardProps) {
  return (
    <View style={[styles.card, shadow.shadowCard]}>
      <View style={styles.copy}>
        <Text style={styles.title}>Burn in subtitles</Text>
        <Text style={styles.hint}>
          Auto transcribed from the creator's voice. Two lines at the bottom of
          the reel.
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: color.ink }}
        accessibilityLabel="Burn in subtitles"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 16 * 1.4,
    color: color.ink,
  },
  hint: {
    fontSize: 13,
    lineHeight: 13 * 1.4,
    color: color.slate500,
  },
});
