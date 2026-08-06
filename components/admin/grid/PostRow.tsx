import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { BriefRowState, BriefWithType } from '../../../lib/briefs-api';
import { color, radius, type } from '../../../theme/tokens';
import { Icon, type IconName } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

type StatusVisual = {
  label: string;
  accent: string;
  chipBg: string;
  chipFg: string;
  icon: IconName;
};

const STATUS: Record<BriefRowState, StatusVisual> = {
  empty: {
    label: 'To do',
    accent: color.slate300,
    chipBg: color.fillQuiet,
    chipFg: color.slate500,
    icon: 'clock',
  },
  partial: {
    label: 'In progress',
    accent: color.amber,
    chipBg: color.amberSoft,
    chipFg: color.amber,
    icon: 'circle-alert',
  },
  filled: {
    label: 'Ready',
    accent: color.blue500,
    chipBg: color.blue100,
    chipFg: color.blue700,
    icon: 'check',
  },
  complete: {
    label: 'Reviewed',
    accent: color.green,
    chipBg: color.greenSoft,
    chipFg: color.green,
    icon: 'circle-check-big',
  },
};

/**
 * One row per post. Status is always visible: accent bar + chip so empty
 * and worked rows read differently while scrolling.
 */
export function PostRow(props: {
  brief: BriefWithType;
  state: BriefRowState;
  disabled?: boolean;
  onPress: () => void;
}): JSX.Element {
  const { brief, state, disabled = false, onPress } = props;
  const postType = brief.post_types;
  const familyLabel =
    (postType?.family ?? brief.format) === 'photo_carousel'
      ? 'Slideshow'
      : 'Video';
  const typeLabel = postType?.label ?? 'Legacy brief';
  const killed = state === 'empty' && Boolean(brief.kill_reason);
  const visual = killed
    ? {
        label: 'Killed',
        accent: color.danger,
        chipBg: color.dangerSoft,
        chipFg: color.danger,
        icon: 'x' as IconName,
      }
    : STATUS[state];
  const headline = killed
    ? brief.search_phrase
      ? `"${brief.search_phrase}"`
      : typeLabel
    : state === 'empty'
      ? brief.search_phrase
        ? `"${brief.search_phrase}"`
        : 'No search phrase yet'
      : brief.title;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${typeLabel}, ${visual.label}`}
      disabled={disabled}
      onPress={onPress}
      style={styles.row}
    >
      <View style={[styles.accent, { backgroundColor: visual.accent }]} />
      <View style={styles.body}>
        <View style={styles.topLine}>
          <Text style={styles.meta} numberOfLines={1}>
            {typeLabel} · {familyLabel}
          </Text>
          <View style={[styles.chip, { backgroundColor: visual.chipBg }]}>
            <Icon name={visual.icon} size={11} color={visual.chipFg} />
            <Text style={[styles.chipText, { color: visual.chipFg }]}>
              {visual.label}
            </Text>
          </View>
        </View>
        <Text
          style={[styles.headline, state === 'empty' && !killed && styles.headlineEmpty]}
          numberOfLines={2}
        >
          {headline}
        </Text>
        {killed ? (
          <Text style={styles.kill} numberOfLines={2}>
            {brief.kill_reason}
          </Text>
        ) : state !== 'empty' && brief.hook ? (
          <Text style={styles.hook} numberOfLines={1}>
            {brief.hook}
          </Text>
        ) : state === 'empty' ? (
          <Text style={styles.hint}>Tap to fill</Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: radius.md,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
    overflow: 'hidden',
  },
  accent: {
    width: 4,
  },
  body: {
    flex: 1,
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  meta: {
    flexShrink: 1,
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.slate400,
    letterSpacing: 0.2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
  },
  chipText: {
    fontSize: type.size.micro,
    fontWeight: '800',
  },
  headline: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
    lineHeight: type.size.bodySm * 1.35,
  },
  headlineEmpty: {
    fontWeight: '600',
    color: color.slate500,
  },
  hook: {
    fontSize: type.size.meta,
    color: color.slate500,
  },
  hint: {
    fontSize: type.size.meta,
    color: color.slate400,
  },
  kill: {
    fontSize: type.size.meta,
    fontWeight: '600',
    color: color.danger,
  },
});
