import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, radiusAdmin, type } from '../../../../theme/tokens';
import { Avatar, Thumb } from '../../shared';
import { usePostThumb } from '../../creator/useVideoThumb';

export interface InboxRowProps {
  lead: ReactNode;
  title: string;
  /** Rendered after the title on the same line, e.g. a role label. */
  titleSuffix?: string;
  sub: ReactNode;
  time: string;
  unread: number;
  last: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}

/** One inbox row: lead, title + time, second line, unread pill. */
export function InboxRow({
  lead,
  title,
  titleSuffix,
  sub,
  time,
  unread,
  last,
  onPress,
  accessibilityLabel,
}: InboxRowProps) {
  const hasUnread = unread > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && styles.divider,
        pressed && styles.pressed,
      ]}
    >
      {lead}
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
            {titleSuffix !== undefined && <Text style={styles.suffix}>{`  ${titleSuffix}`}</Text>}
          </Text>
          <Text style={[styles.time, hasUnread && styles.timeUnread]}>{time}</Text>
        </View>
        <View style={styles.subRow}>
          {typeof sub === 'string' ? (
            <Text numberOfLines={1} style={[styles.sub, hasUnread && styles.subUnread]}>
              {sub}
            </Text>
          ) : (
            sub
          )}
        </View>
      </View>
      {hasUnread && (
        <View style={styles.pill}>
          <Text style={styles.pillText}>{unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Second line of a queue row: creator in ink, then type and length, optional Take pill. */
export function QueueSubline({
  creatorShort,
  typeLabel,
  lengthLabel,
  attempt,
}: {
  creatorShort: string;
  typeLabel: string;
  lengthLabel: string;
  attempt: number;
}) {
  return (
    <View style={styles.queueSub}>
      <Text numberOfLines={1} style={[styles.sub, styles.queueText]}>
        <Text style={styles.queueCreator}>{creatorShort}</Text>
        {` \u00b7 ${typeLabel} \u00b7 ${lengthLabel}`}
      </Text>
      {attempt > 1 && (
        <View style={styles.take}>
          <Text style={styles.takeText}>{`Take ${attempt}`}</Text>
        </View>
      )}
    </View>
  );
}

export function QueueThumb({
  mediaPath,
  format,
}: {
  mediaPath: string | null;
  format: 'video' | 'photo_carousel';
}) {
  const uri = usePostThumb(mediaPath, format);
  return <Thumb uri={uri} format={format} width={36} height={48} radius={8} />;
}

export function PersonLead({
  name,
  tone,
  online,
}: {
  name: string;
  tone: 'brand' | 'quiet';
  online: boolean;
}) {
  return (
    <View style={styles.lead}>
      <Avatar name={name} size={40} tone={tone} />
      {online && (
        <View style={styles.onlineRing}>
          <View style={styles.onlineDot} />
        </View>
      )}
    </View>
  );
}

export function ChannelLead() {
  return (
    <View style={styles.hash}>
      <Text style={styles.hashText}>#</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  pressed: {
    backgroundColor: color.offWhite,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 14.5,
    fontWeight: type.weight.bold,
    letterSpacing: -0.2,
    color: color.ink,
  },
  suffix: {
    fontSize: 10.5,
    fontWeight: type.weight.bold,
    letterSpacing: 0,
    color: color.slate400,
  },
  time: {
    fontSize: 11.5,
    fontWeight: type.weight.semibold,
    color: color.slate400,
  },
  timeUnread: {
    color: color.blue700,
  },
  subRow: {
    marginTop: 2,
  },
  sub: {
    fontSize: type.size.chip,
    fontWeight: type.weight.medium,
    color: color.slate400,
  },
  subUnread: {
    fontWeight: type.weight.semibold,
    color: color.ink,
  },
  pill: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
    color: color.white,
  },
  queueSub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  queueText: {
    flexShrink: 1,
  },
  queueCreator: {
    fontWeight: type.weight.semibold,
    color: color.ink,
  },
  take: {
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.amberSoft,
  },
  takeText: {
    fontSize: type.size.micro,
    fontWeight: type.weight.bold,
    color: color.amber,
  },
  lead: {
    width: 40,
    height: 40,
  },
  onlineRing: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: color.green,
  },
  hash: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hashText: {
    fontSize: type.size.card,
    fontWeight: type.weight.bold,
    color: color.slate500,
  },
});
