import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color } from '../../../theme/tokens';
import { Avatar } from '../shared';

export type MsgRowProps = {
  authorName: string;
  tone: 'brand' | 'quiet';
  timeLabel: string;
  collapsed: boolean;
  avatarUri?: string | null;
  onLongPress?: () => void;
  children: ReactNode;
};

const AVATAR = 34;

/** Handoff 2.4: left-aligned Slack rhythm, header collapses for same-author runs. */
export function MsgRow({
  authorName,
  tone,
  timeLabel,
  collapsed,
  avatarUri,
  onLongPress,
  children,
}: MsgRowProps) {
  return (
    <Pressable
      onLongPress={onLongPress}
      disabled={onLongPress === undefined}
      style={[styles.row, collapsed ? styles.rowCollapsed : styles.rowFull]}
    >
      <View style={styles.avatarCol}>
        {!collapsed && <Avatar name={authorName} uri={avatarUri} size={AVATAR} tone={tone} />}
      </View>
      <View style={styles.body}>
        {!collapsed && (
          <View style={styles.header}>
            <Text style={styles.name}>{authorName}</Text>
            <Text style={styles.time}>{timeLabel}</Text>
          </View>
        )}
        {children}
      </View>
    </Pressable>
  );
}

export function MsgBody({ text }: { text: string }) {
  return <Text style={styles.msgBody}>{text}</Text>;
}

export function msgTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hour12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  rowFull: {
    paddingTop: 10,
  },
  rowCollapsed: {
    paddingTop: 2,
  },
  avatarCol: {
    width: AVATAR,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 7,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: color.ink,
  },
  time: {
    fontSize: 11,
    fontWeight: '600',
    color: color.slate400,
  },
  msgBody: {
    marginTop: 2,
    fontSize: 14.5,
    lineHeight: 14.5 * 1.45,
    fontWeight: '400',
    color: color.ink,
  },
});
