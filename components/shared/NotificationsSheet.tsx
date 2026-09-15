import { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { CompanyNotification } from '../../lib/companies-api';
import { useCompany } from '../../lib/company-context';
import { color, radiusAdmin, space } from '../../theme/tokens';
import { Sheet } from '../admin/shared/Sheet';
import { Icon } from '../ui/Icon';
import { CompanyMark } from './CompanyMark';
import { WAIT_RED } from './WaitBadge';

const MESSAGE_EVENTS = new Set(['message', 'manager_message']);

function rowText(n: CompanyNotification): string {
  if (MESSAGE_EVENTS.has(n.event) && n.title && n.body) return `${n.title}: ${n.body}`;
  return n.body || n.title;
}

function whenLabel(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const sameDay = at.toDateString() === now.toDateString();
  if (sameDay) {
    return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (at.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const days = (now.getTime() - at.getTime()) / 86_400_000;
  if (days < 7) return at.toLocaleDateString(undefined, { weekday: 'short' });
  return at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type RowProps = {
  n: CompanyNotification;
  here: boolean;
  last: boolean;
  onPress: () => void;
};

function NotificationRow({ n, here, last, onPress }: RowProps) {
  const quiet = n.readAt !== null;
  const meta = `${n.companyName}${here ? '' : ' · switches you there'} · ${whenLabel(n.createdAt)}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${rowText(n)}. ${meta}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && styles.rowPressed]}
    >
      <View style={styles.markWrap}>
        <CompanyMark
          companyId={n.companyId}
          name={n.companyName}
          logoPath={n.companyLogoPath}
          size={36}
        />
        {!quiet && <View style={styles.markDot} />}
      </View>
      <View style={styles.text}>
        <Text style={[styles.body, quiet && styles.bodyQuiet]} numberOfLines={2}>
          {rowText(n)}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Icon name="chevron-right" size={16} color={color.slate300} />
    </Pressable>
  );
}

/** Every row is stamped with its company. Tapping switches and opens the item. */
export function NotificationsSheet() {
  const { height } = useWindowDimensions();
  const { active, notifications, notificationsOpen, closeNotifications, openNotification } =
    useCompany();
  const pending = useRef<CompanyNotification | null>(null);
  const activeId = active?.companyId ?? null;

  const pick = useCallback(
    (n: CompanyNotification) => {
      pending.current = n;
      closeNotifications();
    },
    [closeNotifications],
  );

  const onClosed = useCallback(() => {
    const next = pending.current;
    pending.current = null;
    if (next) void openNotification(next);
  }, [openNotification]);

  return (
    <Sheet
      visible={notificationsOpen}
      onClose={closeNotifications}
      onClosed={onClosed}
      pinnedTop={Math.round(height * 0.28)}
      header={
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Notifications</Text>
            <Text style={styles.subtitle}>All campaigns</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={6}
            onPress={closeNotifications}
            style={styles.close}
          >
            <Icon name="x" size={18} color={color.slate500} />
          </Pressable>
        </View>
      }
    >
      {notifications.length > 0 && (
        <View style={styles.card}>
          {notifications.map((n, i) => (
            <NotificationRow
              key={n.id}
              n={n}
              here={n.companyId === activeId}
              last={i === notifications.length - 1}
              onPress={() => pick(n)}
            />
          ))}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 14,
    paddingBottom: 10,
    paddingHorizontal: space.gutter,
  },
  headerText: {
    flex: 1,
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
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  rowPressed: {
    backgroundColor: color.fillQuiet,
  },
  markWrap: {
    position: 'relative',
    marginTop: 1,
  },
  markDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: WAIT_RED,
    borderWidth: 2,
    borderColor: color.white,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  body: {
    fontSize: 14.5,
    lineHeight: 14.5 * 1.3,
    fontWeight: '700',
    letterSpacing: -0.1,
    color: color.ink,
  },
  bodyQuiet: {
    fontWeight: '500',
  },
  meta: {
    fontSize: 12.5,
    fontWeight: '600',
    color: color.slate400,
  },
});
