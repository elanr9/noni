import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { useCompany } from '../../lib/company-context';
import { sideLabel } from '../../lib/companies-api';
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
  const { active, activeSide, summaryRows, elsewhereTotal, openSwitcher } = useCompany();
  if (!active) return null;

  const dualHere = summaryRows.filter((r) => r.companyId === active.companyId).length > 1;
  const side = sideLabel(activeSide);
  const label = elsewhereTotal
    ? `Campaign: ${active.name}, ${side}. ${elsewhereTotal} waiting elsewhere`
    : `Campaign: ${active.name}, ${side}. Caught up everywhere`;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={openSwitcher}
      style={[styles.pill, shadow.shadowCard, elsewhereTotal > 0 ? styles.waiting : null, style]}
    >
      <CompanyMark
        companyId={active.companyId}
        name={active.name}
        logoPath={active.logoPath}
        size={24}
      />
      <Text style={styles.name} numberOfLines={1}>
        {active.name}
      </Text>
      {dualHere && (
        <Text style={styles.side} numberOfLines={1}>
          {activeSide === 'creator' ? 'Creator' : 'Manager'}
        </Text>
      )}
      <Icon name="chevron-down" size={16} color={color.slate400} />
      {elsewhereTotal > 0 ? <WaitBadge count={elsewhereTotal} size={18} /> : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingLeft: 8,
    paddingRight: 10,
    borderRadius: radius.pill,
    backgroundColor: color.white,
    maxWidth: '100%',
    alignSelf: 'flex-start',
  },
  waiting: {
    paddingRight: 8,
  },
  name: {
    flexShrink: 1,
    marginLeft: 2,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: color.ink,
  },
  side: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '500',
    color: color.slate500,
  },
});
