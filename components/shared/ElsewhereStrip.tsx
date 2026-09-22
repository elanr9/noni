import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useCompany } from '../../lib/company-context';
import { sideForRole, sideLabel } from '../../lib/companies-api';
import { color, radiusAdmin } from '../../theme/tokens';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { CompanyMark } from './CompanyMark';
import { WAIT_RED, WAIT_RED_SOFT, WAIT_RED_TINT } from './WaitBadge';

export interface ElsewhereStripProps {
  style?: StyleProp<ViewStyle>;
}

/** Under the header when another company needs you. Renders nothing otherwise. */
export function ElsewhereStrip({ style }: ElsewhereStripProps) {
  const { active, elsewhere, switchToSide, openSwitcher, switching } = useCompany();
  if (elsewhere.length === 0) return null;
  const first = elsewhere[0];
  const firstSide = sideForRole(first.role);
  const sameCompany = first.companyId === active?.companyId;
  const rest = elsewhere.length - 1;
  const line = rest
    ? `${first.line} · ${rest} more ${rest === 1 ? 'place' : 'places'}`
    : first.line;
  const title = sameCompany
    ? `${sideLabel(firstSide)} side needs you`
    : `${first.name} needs you`;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${line}. Switch`}
      disabled={switching}
      onPress={() => void switchToSide(first.companyId, firstSide)}
      style={[styles.strip, style]}
    >
      <View style={styles.markWrap}>
        <CompanyMark
          companyId={first.companyId}
          name={first.name}
          logoPath={first.logoPath}
          size={30}
        />
        <View style={styles.markDot} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.line} numberOfLines={1}>
          {line}
        </Text>
      </View>
      {rest > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="All campaigns"
          hitSlop={6}
          onPress={openSwitcher}
          style={styles.all}
        >
          <Text style={styles.allText}>All</Text>
        </Pressable>
      )}
      <View style={styles.switchPill}>
        <Text style={styles.switchText}>Switch</Text>
        <Icon name="arrow-right" size={13} color={color.white} strokeWidth={2.5} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: radiusAdmin.md,
    borderWidth: 1,
    borderColor: WAIT_RED_SOFT,
    backgroundColor: WAIT_RED_TINT,
  },
  markWrap: {
    position: 'relative',
  },
  markDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: WAIT_RED,
    borderWidth: 2,
    borderColor: WAIT_RED_TINT,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
    color: color.ink,
  },
  line: {
    fontSize: 13,
    fontWeight: '500',
    color: color.slate500,
  },
  all: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  allText: {
    fontSize: 13,
    fontWeight: '700',
    color: color.slate500,
  },
  switchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingLeft: 12,
    paddingRight: 11,
    borderRadius: 999,
    backgroundColor: color.ink,
  },
  switchText: {
    fontSize: 13,
    fontWeight: '700',
    color: color.white,
  },
});
