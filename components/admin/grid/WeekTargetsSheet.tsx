// Edit a draft week's lane targets in place. Counts only: stamped rows
// and the type split stay as they are, the lane headers just track the
// new denominators.
import { useEffect, useState, type JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, type } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/TextField';
import { Sheet } from '../shared';

function parseTarget(text: string): number {
  const n = Number.parseInt(text, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(99, n));
}

export interface WeekTargetsSheetProps {
  visible: boolean;
  videoTarget: number;
  slideshowTarget: number;
  saving: boolean;
  onClose: () => void;
  onSave: (videoTarget: number, slideshowTarget: number) => void;
}

export function WeekTargetsSheet({
  visible,
  videoTarget,
  slideshowTarget,
  saving,
  onClose,
  onSave,
}: WeekTargetsSheetProps): JSX.Element {
  const [videoText, setVideoText] = useState(String(videoTarget));
  const [slideshowText, setSlideshowText] = useState(String(slideshowTarget));

  useEffect(() => {
    if (visible) {
      setVideoText(String(videoTarget));
      setSlideshowText(String(slideshowTarget));
    }
  }, [visible, videoTarget, slideshowTarget]);

  const video = parseTarget(videoText);
  const slideshow = parseTarget(slideshowText);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      footer={
        <Button
          size="md"
          variant="primary"
          block
          disabled={saving || video + slideshow === 0}
          onPress={() => onSave(video, slideshow)}
        >
          {saving ? 'Saving…' : 'Save targets'}
        </Button>
      }
    >
      <Text style={styles.title}>Week targets</Text>
      <Text style={styles.note}>
        How many posts this week aims for in each lane. Existing posts stay
        exactly as they are.
      </Text>
      <View style={styles.row}>
        <View style={styles.field}>
          <Text style={styles.label}>Videos</Text>
          <TextField
            value={videoText}
            onChangeText={setVideoText}
            keyboardType="number-pad"
            maxLength={2}
            accessibilityLabel="Video target"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Slideshows</Text>
          <TextField
            value={slideshowText}
            onChangeText={setSlideshowText}
            keyboardType="number-pad"
            maxLength={2}
            accessibilityLabel="Slideshow target"
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  note: {
    marginTop: 6,
    marginBottom: 16,
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * 1.45,
    color: color.slate500,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  field: {
    flex: 1,
    gap: 6,
  },
  label: {
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.slate400,
  },
});
