import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MockThreadEntry } from '../../lib/admin-review-types';
import { color, radius, type } from '../../theme/tokens';

/** Changes-requested thread (README §5.4). Chronological, oldest first. */
export function ThreadTab({ entries }: { entries: MockThreadEntry[] }): JSX.Element {
  const latestCreatorIndex = entries.reduce(
    (latest, entry, index) => (entry.author === 'creator' ? index : latest),
    -1,
  );

  return (
    <View style={styles.list}>
      {entries.map((entry, index) => {
        if (entry.author === 'admin') {
          return (
            <View key={index} style={styles.entry}>
              <View style={[styles.header, styles.headerRight]}>
                <Text style={styles.headerMuted}>{entry.headerMuted}</Text>
                <Text style={styles.headerBold}>{entry.headerBold}</Text>
              </View>
              <View style={[styles.bubble, styles.bubbleAdmin]}>
                <Text style={styles.bodyInkMedium}>{entry.body}</Text>
              </View>
            </View>
          );
        }

        const latest = index === latestCreatorIndex;
        return (
          <View key={index} style={styles.entry}>
            <View style={styles.header}>
              <View style={styles.avatar}>
                <Text style={styles.avatarInitial}>{entry.headerBold.charAt(0)}</Text>
              </View>
              <Text style={styles.headerBold}>{entry.headerBold}</Text>
              <Text style={styles.headerMuted}>{entry.headerMuted}</Text>
            </View>
            <View style={[styles.bubble, latest ? styles.bubbleCreatorLatest : styles.bubbleCreator]}>
              <Text style={latest ? styles.bodyInkMedium : styles.bodyMuted}>{entry.body}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 14,
  },
  entry: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  headerRight: {
    justifyContent: 'flex-end',
  },
  headerBold: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  headerMuted: {
    fontSize: type.size.chip,
    fontWeight: type.weight.regular,
    color: color.slate400,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: type.size.micro,
    fontWeight: type.weight.heavy,
    color: color.blue700,
  },
  bubble: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  bubbleCreator: {
    backgroundColor: color.offWhite,
  },
  bubbleCreatorLatest: {
    backgroundColor: color.blue100,
  },
  bubbleAdmin: {
    backgroundColor: color.amberSoft,
  },
  bodyMuted: {
    fontSize: type.size.bodySm,
    lineHeight: 22,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
  bodyInkMedium: {
    fontSize: type.size.bodySm,
    lineHeight: 22,
    fontWeight: '500',
    color: color.ink,
  },
});
