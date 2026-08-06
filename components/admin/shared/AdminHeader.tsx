import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, radiusAdmin, type } from '../../../theme/tokens';

export interface AdminHeaderProps {
  title: string;
  /** e.g. "Week 14 · Aug 10–16" or the queue-load sentence. */
  subtitle?: string;
  /** Count pill next to the title, e.g. "8 waiting" / "All clear". */
  pill?: { label: string; tone: 'accent' | 'green' };
  /** Trailing controls, e.g. the grid/calendar toggle. */
  trailing?: ReactNode;
}

/** Admin handoff §1 — tab screen header, title 700 30px display. */
export function AdminHeader({ title, subtitle, pill, trailing }: AdminHeaderProps) {
  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {pill !== undefined && (
            <Text
              style={[
                styles.pill,
                pill.tone === 'green'
                  ? { backgroundColor: color.greenSoft, color: color.green }
                  : { backgroundColor: color.blue100, color: color.blue700 },
              ]}
            >
              {pill.label}
            </Text>
          )}
        </View>
        {trailing}
      </View>
      {subtitle !== undefined && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    paddingTop: 10,
    paddingBottom: 14,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radiusAdmin.pill,
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 15 * 1.45,
    color: color.slate500,
  },
});
