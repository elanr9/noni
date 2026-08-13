import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { color, type } from '../theme/tokens';
import { Button } from './ui/Button';
import { SheetShell } from './ui/SheetShell';

export interface FormatInfo {
  /** post_types.key */
  key: string;
  /** post_types.label, e.g. "Numbered list". */
  label: string;
}

const FORMAT_COPY: Record<string, { description: string; example: string }> = {
  numbered_list: {
    description:
      'A video that counts through a set of quick points, like "5 things every beginner gets wrong." The countdown keeps people watching to the end.',
    example: '"3 filming mistakes that ruin your highlight videos"',
  },
  talking_head: {
    description:
      'You on camera, talking straight to the viewer. One clear take on a single idea, like you are explaining it to a friend.',
    example: '"Here is why most game footage never gets watched"',
  },
  explainer: {
    description:
      'A short video that breaks down one topic step by step, so someone new to it walks away actually understanding it.',
    example: '"How recruiters actually watch your highlight tape"',
  },
  contrast: {
    description:
      'A video built on two sides: before and after, myth versus truth, or the wrong way versus the right way. The tension between the two is the hook.',
    example: '"Raw phone clip vs the same play edited: watch the difference"',
  },
  replay_bait: {
    description:
      'One short, satisfying clip designed to loop. No script or structure, just a moment people want to watch twice.',
    example: '"A one-handed catch that syncs perfectly with the beat drop"',
  },
  numbered_tips: {
    description:
      'A photo carousel where each slide is one tip. Viewers swipe through the list at their own pace and often save it for later.',
    example: '"5 tips for filming from the sideline, one per slide"',
  },
  how_to: {
    description:
      'A photo carousel that walks through a task with one step per slide, so the viewer can follow along and come back to it.',
    example: '"How to build a recruiting profile in 6 slides"',
  },
  getting_started: {
    description:
      'A photo carousel for total beginners. Each slide covers one first step, so getting into the topic feels easy instead of overwhelming.',
    example: '"New to filming games? Start with these 4 slides"',
  },
};

/** Bottom sheet explaining a post format in plain language, closed by "Got it". */
export function FormatInfoSheet({
  format,
  onClose,
}: {
  format: FormatInfo | null;
  onClose: () => void;
}) {
  // Keep the last format so content stays put while the sheet animates closed.
  const [shown, setShown] = useState<FormatInfo | null>(format);
  useEffect(() => {
    if (format) setShown(format);
  }, [format]);

  if (!shown) return null;

  const copy = FORMAT_COPY[shown.key];
  const description = copy?.description ?? `${shown.label} is one of your post formats.`;

  return (
    <SheetShell visible={format !== null} onClose={onClose}>
      <Text style={styles.title}>{shown.label}</Text>
      <Text style={[styles.body, !copy && styles.bodyOnly]}>{description}</Text>
      {copy ? (
        <Text style={styles.example}>Example: {copy.example}</Text>
      ) : null}
      <Button block size="lg" onPress={onClose}>
        Got it
      </Button>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: type.size.cardLg,
    fontWeight: '800',
    color: color.ink,
    letterSpacing: -0.3,
  },
  body: {
    marginTop: 10,
    fontSize: type.size.body,
    lineHeight: 24,
    fontWeight: '500',
    color: color.slate500,
  },
  bodyOnly: {
    marginBottom: 24,
  },
  example: {
    marginTop: 12,
    marginBottom: 24,
    fontSize: type.size.body,
    lineHeight: 22,
    fontWeight: '600',
    fontStyle: 'italic',
    color: color.ink,
  },
});
