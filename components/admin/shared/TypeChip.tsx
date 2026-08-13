import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { color } from '../../../theme/tokens';
import { Icon, type IconName } from '../../ui/Icon';

export type TypeChipTone = 'quiet' | 'warn' | 'good' | 'bad' | 'brand';

const TONES: Record<TypeChipTone, { bg: string; fg: string }> = {
  quiet: { bg: color.fillQuiet, fg: color.slate500 },
  warn: { bg: color.amberSoft, fg: color.amber },
  good: { bg: color.greenSoft, fg: color.green },
  bad: { bg: color.dangerSoft, fg: color.danger },
  brand: { bg: color.blue100, fg: color.blue700 },
};

export interface TypeChipProps {
  children: string;
  tone?: TypeChipTone;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}

/** Admin handoff — small status pill, 700 11px, soft tint recipe. */
export function TypeChip({ children, tone = 'quiet', icon, style }: TypeChipProps) {
  const { bg, fg } = TONES[tone];
  return (
    <View style={[styles.chip, { backgroundColor: bg }, style]}>
      {icon !== undefined && <Icon name={icon} size={11} color={fg} />}
      <Text numberOfLines={1} style={[styles.text, { color: fg }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
});
