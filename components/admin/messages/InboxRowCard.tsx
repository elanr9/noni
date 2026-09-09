import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color } from '../../../theme/tokens';
import { Card } from '../shared';

export interface InboxRowCardProps {
  title: string;
  preview: string;
  timeLabel: string;
  unread: number;
  avatar: ReactElement;
  onPress: () => void;
}

export function InboxRowCard({
  title,
  preview,
  timeLabel,
  unread,
  avatar,
  onPress,
}: InboxRowCardProps) {
  const hasUnread = unread > 0;
  return (
    <Card pad={13} onPress={onPress} style={styles.row}>
      {avatar}
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {title}
        </Text>
        {preview.length > 0 ? (
          <Text
            numberOfLines={1}
            style={[
              styles.rowPreview,
              {
                fontWeight: hasUnread ? '700' : '600',
                color: hasUnread ? color.ink : color.slate400,
              },
            ]}
          >
            {preview}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowMeta}>
        {timeLabel.length > 0 ? (
          <Text
            style={[styles.rowTime, { color: hasUnread ? color.blue600 : color.slate400 }]}
          >
            {timeLabel}
          </Text>
        ) : null}
        {hasUnread ? (
          <View style={styles.unreadPill}>
            <Text style={styles.unreadText}>{unread}</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: color.ink,
  },
  rowPreview: {
    marginTop: 2,
    fontSize: 12.5,
  },
  rowMeta: {
    alignItems: 'flex-end',
    gap: 5,
  },
  rowTime: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  unreadPill: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: color.blue500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: {
    fontSize: 11,
    fontWeight: '700',
    color: color.white,
  },
});
