import { Linking, StyleSheet, Text, View } from 'react-native';

import { borderWidth, color, radiusAdmin, type } from '../../../theme/tokens';
import { Icon, type IconName } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export interface LinkRowProps {
  icon: IconName;
  /** "Open on TikTok". */
  label: string;
  /** Handle without the @. */
  handle: string | null;
  url: string | null;
}

/** Admin handoff §4 — one live-post link per platform, with the handle. */
export function LinkRow({ icon, label, handle, url }: LinkRowProps) {
  const disabled = url === null;
  return (
    <PressableScale
      accessibilityRole="link"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        if (url !== null) void Linking.openURL(url);
      }}
      style={[styles.row, disabled && styles.rowDisabled]}
    >
      <View style={styles.iconCircle}>
        <Icon name={icon} size={15} color={color.blue700} />
      </View>
      <View style={styles.column}>
        <Text style={styles.label}>{label}</Text>
        <Text numberOfLines={1} style={styles.handle}>
          {handle !== null ? `@${handle}` : disabled ? 'No live post yet' : 'No handle yet'}
        </Text>
      </View>
      <Icon name="arrow-right" size={16} color={disabled ? color.slate300 : color.blue600} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  column: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  label: {
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  handle: {
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
});
