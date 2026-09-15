import { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useCompany } from '../../lib/company-context';
import type { CompanyStatus } from '../../lib/companies-api';
import { color, radiusAdmin, space } from '../../theme/tokens';
import { SectionLabel } from '../admin/shared/SectionLabel';
import { Sheet } from '../admin/shared/Sheet';
import { Icon } from '../ui/Icon';
import { CompanyMark } from './CompanyMark';
import { WAIT_RED, WaitBadge } from './WaitBadge';

type RowProps = {
  row: CompanyStatus;
  current: boolean;
  last: boolean;
  onPress: () => void;
};

function CompanyRow({ row, current, last, onPress }: RowProps) {
  const waiting = row.waiting > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.name}. ${row.line}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowBorder,
        pressed && styles.rowPressed,
      ]}
    >
      <CompanyMark companyId={row.companyId} name={row.name} logoPath={row.logoPath} size={42} />
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>
          {row.name}
        </Text>
        <View style={styles.lineRow}>
          {waiting && <View style={styles.dot} />}
          <Text style={[styles.line, waiting && styles.lineWaiting]} numberOfLines={1}>
            {row.line}
          </Text>
        </View>
      </View>
      {current ? (
        <View style={styles.currentCheck}>
          <Icon name="check" size={15} color={color.white} strokeWidth={2.5} />
        </View>
      ) : (
        <WaitBadge count={row.waiting} size={22} />
      )}
    </Pressable>
  );
}

/** Switcher. Current company first, the rest by what is waiting. */
export function CampaignSheet() {
  const { active, summary, summaryRows, elsewhereTotal, switcherOpen, closeSwitcher, switchTo } =
    useCompany();
  const pending = useRef<string | null>(null);

  const activeId = active?.companyId ?? null;
  const current: CompanyStatus | null =
    activeId && summary[activeId]
      ? summary[activeId]
      : active
        ? {
            companyId: active.companyId,
            name: active.name,
            logoPath: active.logoPath,
            role: active.role,
            isActive: true,
            waiting: 0,
            line: 'Caught up',
            fix: 0,
            unread: 0,
            shoot: 0,
            review: 0,
            briefDue: false,
          }
        : null;
  const others = summaryRows
    .filter((s) => s.companyId !== activeId)
    .sort((a, b) => b.waiting - a.waiting);

  const subtitle = elsewhereTotal
    ? `${elsewhereTotal} ${elsewhereTotal === 1 ? 'thing' : 'things'} waiting on you in other campaigns.`
    : 'Caught up everywhere.';

  const pick = useCallback(
    (companyId: string) => {
      pending.current = companyId === activeId ? null : companyId;
      closeSwitcher();
    },
    [activeId, closeSwitcher],
  );

  const onClosed = useCallback(() => {
    const next = pending.current;
    pending.current = null;
    if (next) void switchTo(next);
  }, [switchTo]);

  return (
    <Sheet
      visible={switcherOpen}
      onClose={closeSwitcher}
      onClosed={onClosed}
      header={
        <View style={styles.header}>
          <Text style={styles.title}>Campaigns</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      }
    >
      {current && (
        <View style={styles.card}>
          <CompanyRow row={current} current last onPress={() => pick(current.companyId)} />
        </View>
      )}
      {others.length > 0 && (
        <View style={styles.section}>
          <SectionLabel style={styles.sectionLabel}>Other campaigns</SectionLabel>
          <View style={styles.card}>
            {others.map((row, i) => (
              <CompanyRow
                key={row.companyId}
                row={row}
                current={false}
                last={i === others.length - 1}
                onPress={() => pick(row.companyId)}
              />
            ))}
          </View>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 14,
    paddingBottom: 10,
    paddingHorizontal: space.gutter,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: color.ink,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: color.slate500,
  },
  card: {
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
    overflow: 'hidden',
  },
  section: {
    marginTop: 14,
    marginBottom: 6,
  },
  sectionLabel: {
    paddingHorizontal: 2,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  rowPressed: {
    backgroundColor: color.fillQuiet,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowName: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: color.ink,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: WAIT_RED,
  },
  line: {
    flexShrink: 1,
    fontSize: 13.5,
    fontWeight: '500',
    color: color.slate500,
  },
  lineWaiting: {
    color: WAIT_RED,
  },
  currentCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: color.blue500,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
