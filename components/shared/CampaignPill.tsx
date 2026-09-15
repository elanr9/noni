import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useCompany } from '../../lib/company-context';
import { color, radius, shadow } from '../../theme/tokens';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { CompanyMark } from './CompanyMark';
import { WaitBadge } from './WaitBadge';

export interface CampaignPillProps {
  style?: StyleProp<ViewStyle>;
}

/** Active company top-left; the badge carries every other company's state. */
export function CampaignPill({ style }: CampaignPillProps) {
  const { active, elsewhereTotal, openSwitcher } = useCompany();
  if (!active) return null;

  const label = elsewhereTotal
    ? `Campaign: ${active.name}. ${elsewhereTotal} waiting in other campaigns`
    : `Campaign: ${active.name}. Caught up everywhere`;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={openSwitcher}
      style={[styles.pill, shadow.shadowCard, style]}
    >
      <CompanyMark
        companyId={active.companyId}
        name={active.name}
        logoPath={active.logoPath}
        size={22}
      />
      <Text style={styles.name} numberOfLines={1}>
        {active.name}
      </Text>
      <Icon name="chevrons-up-down" size={15} color={color.slate400} />
      <View style={styles.divider} />
      <WaitBadge count={elsewhereTotal} size={20} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 34,
    paddingLeft: 6,
    paddingRight: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.white,
    maxWidth: '100%',
    alignSelf: 'flex-start',
  },
  name: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: color.ink,
  },
  divider: {
    width: 1,
    height: 18,
    backgroundColor: color.line,
  },
});
