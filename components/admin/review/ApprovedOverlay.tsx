import { StyleSheet, Text, View } from 'react-native';

import type { ContentFormat } from '../../../lib/admin-review-types';
import { color, radiusAdmin, type } from '../../../theme/tokens';
import { ConfirmationTakeover } from '../shared';
import { Icon, type IconName } from '../../ui/Icon';

export interface ApprovedOverlayProps {
  title: string;
  format: ContentFormat;
  /** Creator first name, e.g. "Fabri". */
  creatorShort: string;
  onNext: () => void;
}

/**
 * Admin handoff §3 approved takeover — the last human touch. The three
 * automatic steps differ by format.
 */
export function ApprovedOverlay({ title, format, creatorShort, onNext }: ApprovedOverlayProps) {
  const steps: Array<[IconName, string]> =
    format === 'video'
      ? [
          ['zap', 'Clips stitched and overlays burned in'],
          ['share-2', 'Posted to TikTok and Instagram at the slot time'],
          ['trending-up', 'Views and revenue tracked from the first hour'],
        ]
      : [
          ['zap', 'Slides assembled with their overlay text'],
          ['share-2', 'Posted with auto-add music on TikTok, silent on Instagram'],
          ['music-2', `${creatorShort} adds the song, then it comes back for one tap`],
        ];

  return (
    <ConfirmationTakeover
      icon="check"
      tone="good"
      title="Approved"
      body={`${title} is out of your hands. Noni takes it from here.`}
      actionLabel="Next in queue"
      onAction={onNext}
      onBack={onNext}
    >
      <View style={styles.steps}>
        {steps.map(([icon, text]) => (
          <View key={text} style={styles.stepRow}>
            <Icon name={icon} size={18} color={color.blue600} />
            <Text style={styles.stepText}>{text}</Text>
          </View>
        ))}
      </View>
    </ConfirmationTakeover>
  );
}

const styles = StyleSheet.create({
  steps: {
    gap: 8,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.offWhite,
  },
  stepText: {
    flex: 1,
    fontSize: type.size.meta,
    lineHeight: type.size.meta * 1.35,
    fontWeight: type.weight.semibold,
    color: color.ink,
  },
});
