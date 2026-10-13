// SChip from reference_ui/briefs/SSShared.jsx: pill, 700 12.5px, 4x10 padding.
// Kind, format and post type chips are thin wrappers so every surface agrees.

import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '../../ui/Icon';
import { briefTone, color, type as typeToken } from '../../../theme/tokens';
import type { BriefKind, BriefMediaFormat } from '../../../lib/briefs-api';
import { FORMAT_LABEL, kindsFor } from '../../../lib/brief-copy';

export type BriefChipTone = 'brand' | 'quiet' | 'amber' | 'green' | 'violet' | 'ink';
export type BriefChipSize = 'md' | 'sm' | 'lg';

const TONES: Record<BriefChipTone, { bg: string; fg: string }> = {
  brand: { bg: color.blue100, fg: color.blue700 },
  quiet: { bg: color.fillQuiet, fg: color.slate500 },
  amber: { bg: color.amberSoft, fg: color.amber },
  green: { bg: color.greenSoft, fg: color.green },
  violet: { bg: briefTone.kind.story.bg, fg: briefTone.kind.story.fg },
  ink: { bg: color.ink, fg: color.white },
};

const SIZES: Record<BriefChipSize, { height: number; font: number; padX: number; icon: number }> = {
  lg: { height: 30, font: 13, padX: 12, icon: 14 },
  md: { height: 24, font: 12.5, padX: 10, icon: 13 },
  sm: { height: 22, font: 11.5, padX: 8, icon: 12 },
};

export interface BriefChipProps {
  children: string;
  tone?: BriefChipTone;
  colors?: { bg: string; fg: string };
  icon?: IconName;
  size?: BriefChipSize;
  style?: StyleProp<ViewStyle>;
}

export function BriefChip({ children, tone = 'quiet', colors, icon, size = 'md', style }: BriefChipProps) {
  const c = colors ?? TONES[tone];
  const s = SIZES[size];
  return (
    <View style={[styles.chip, { backgroundColor: c.bg, height: s.height, paddingHorizontal: s.padX }, style]}>
      {icon ? <Icon name={icon} size={s.icon} color={c.fg} /> : null}
      <Text numberOfLines={1} style={[styles.label, { color: c.fg, fontSize: s.font }]}>
        {children}
      </Text>
    </View>
  );
}

export const KIND_CHIP_TONE: Record<BriefKind, BriefChipTone> = {
  handheld: 'brand',
  story: 'violet',
  open: 'amber',
};

export function KindChip({
  kind,
  format = 'slideshow',
  size,
  style,
}: {
  kind: BriefKind;
  format?: BriefMediaFormat;
  size?: BriefChipSize;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <BriefChip tone={KIND_CHIP_TONE[kind]} size={size} style={style}>
      {kindsFor(format)[kind].name}
    </BriefChip>
  );
}

export const FORMAT_ICON: Record<BriefMediaFormat, IconName> = { slideshow: 'images', reel: 'video' };

/** Format pill. toned = creator home tag colors; quiet = grey, as in the week slot rows. */
export function FormatChip({
  format,
  size,
  toned = false,
  withIcon = false,
  style,
}: {
  format: BriefMediaFormat;
  size?: BriefChipSize;
  toned?: boolean;
  withIcon?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <BriefChip
      tone="quiet"
      colors={toned ? briefTone.format[format] : undefined}
      icon={withIcon ? FORMAT_ICON[format] : undefined}
      size={size}
      style={style}
    >
      {FORMAT_LABEL[format]}
    </BriefChip>
  );
}

export function PostTypeChip({
  name,
  size,
  toned = false,
  style,
}: {
  name: string;
  size?: BriefChipSize;
  /** Green tone on the creator home card; quiet grey in week rows. */
  toned?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <BriefChip tone={toned ? 'green' : 'quiet'} size={size} style={style}>
      {name}
    </BriefChip>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    borderRadius: 999,
  },
  label: {
    fontFamily: typeToken.font.ui,
    fontWeight: '700',
  },
});
