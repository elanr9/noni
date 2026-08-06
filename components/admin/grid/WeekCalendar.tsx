// Admin handoff §6 — the calendar view behind the Briefs toggle. One card
// per day of the drop week; compact task cells with status dot, title,
// format glyph and creator. Tapping a day opens a sheet with its posts.
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { AssignmentQueueItem } from '../../../lib/admin-api';
import type { TaskStatus } from '../../../lib/tasks';
import { color, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { FormatPill } from '../../ui/FormatPill';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { CreatorAvatar, Sheet } from '../shared';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const STATUS_DOT: Record<TaskStatus, string> = {
  assigned: color.blue300,
  recorded: color.blue500,
  submitted: color.amber,
  changes_requested: color.amber,
  approved: color.green,
  posted: color.green,
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  assigned: 'To do',
  recorded: 'Recorded',
  submitted: 'In review',
  changes_requested: 'Changes',
  approved: 'Approved',
  posted: 'Posted',
};

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function taskStatus(raw: string): TaskStatus {
  return raw in STATUS_DOT ? (raw as TaskStatus) : 'assigned';
}

function creatorName(a: AssignmentQueueItem): string {
  return a.profiles?.full_name?.trim() || 'Creator';
}

function shortName(a: AssignmentQueueItem): string {
  return creatorName(a).split(' ')[0];
}

type Day = {
  iso: string;
  name: (typeof DAY_NAMES)[number];
  date: number;
  items: AssignmentQueueItem[];
};

export interface WeekCalendarProps {
  /** Monday of the drop week. */
  weekStart: Date;
  assignments: AssignmentQueueItem[];
}

export function WeekCalendar({ weekStart, assignments }: WeekCalendarProps) {
  const [openIso, setOpenIso] = useState<string | null>(null);

  const days = useMemo<Day[]>(() => {
    const byIso = new Map<string, AssignmentQueueItem[]>();
    for (const a of assignments) {
      if (!a.scheduled_date) continue;
      const items = byIso.get(a.scheduled_date) ?? [];
      items.push(a);
      byIso.set(a.scheduled_date, items);
    }
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      const iso = isoDate(d);
      return {
        iso,
        name: DAY_NAMES[i],
        date: d.getDate(),
        items: byIso.get(iso) ?? [],
      };
    });
  }, [weekStart, assignments]);

  const openDay = days.find((d) => d.iso === openIso) ?? null;

  return (
    <View style={styles.stack}>
      {days.map((day) => (
        <PressableScale
          key={day.iso}
          accessibilityRole="button"
          accessibilityLabel={`${day.name} ${day.date}`}
          disabled={day.items.length === 0}
          onPress={() => setOpenIso(day.iso)}
          style={[styles.card, shadow.shadowCard]}
        >
          <View style={styles.dateCol}>
            <Text style={styles.dayName}>{day.name.toUpperCase()}</Text>
            <Text style={styles.dayDate}>{day.date}</Text>
          </View>
          <View style={styles.cells}>
            {day.items.length === 0 ? (
              <Text style={styles.rest}>Rest day</Text>
            ) : (
              day.items.map((item, i) => {
                const status = taskStatus(item.status);
                return (
                  <View
                    key={item.id}
                    style={[styles.cell, i > 0 && styles.cellDivider]}
                  >
                    <View
                      style={[styles.dot, { backgroundColor: STATUS_DOT[status] }]}
                    />
                    <Text style={styles.cellTitle} numberOfLines={1}>
                      {item.briefs.title}
                    </Text>
                    <Icon
                      name={item.briefs.format === 'photo_carousel' ? 'images' : 'video'}
                      size={13}
                      color={color.slate400}
                    />
                    <CreatorAvatar uri={null} name={creatorName(item)} size={16} />
                    <Text style={styles.cellCreator} numberOfLines={1}>
                      {shortName(item)}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </PressableScale>
      ))}

      <Sheet visible={openDay !== null} onClose={() => setOpenIso(null)}>
        {openDay !== null && (
          <View style={styles.sheetStack}>
            <Text style={styles.sheetTitle}>
              {openDay.name} {openDay.date}
            </Text>
            {openDay.items.map((item) => {
              const status = taskStatus(item.status);
              return (
                <View key={item.id} style={styles.sheetRow}>
                  <CreatorAvatar uri={null} name={creatorName(item)} size={28} />
                  <View style={styles.sheetBody}>
                    <Text style={styles.sheetRowTitle} numberOfLines={2}>
                      {item.briefs.title}
                    </Text>
                    <Text
                      style={[styles.sheetStatus, { color: STATUS_DOT[status] }]}
                    >
                      {STATUS_LABEL[status]}
                    </Text>
                  </View>
                  <FormatPill
                    format={
                      item.briefs.format === 'photo_carousel'
                        ? 'photo_carousel'
                        : 'video'
                    }
                    compact
                  />
                </View>
              );
            })}
          </View>
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
  },
  dateCol: {
    width: 44,
    paddingTop: 6,
    gap: 2,
  },
  dayName: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: type.tracking.label,
    color: color.slate400,
  },
  dayDate: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  cells: {
    flex: 1,
    justifyContent: 'center',
  },
  rest: {
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '600',
    color: color.slate400,
  },
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  cellDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radiusAdmin.pill,
  },
  cellTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: color.ink,
  },
  cellCreator: {
    maxWidth: 56,
    fontSize: 11,
    fontWeight: '600',
    color: color.slate400,
  },
  sheetStack: {
    gap: 12,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.offWhite,
  },
  sheetBody: {
    flex: 1,
    gap: 3,
  },
  sheetRowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: color.ink,
  },
  sheetStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
});
