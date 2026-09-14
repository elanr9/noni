import { createContext, useContext, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color } from '../../../theme/tokens';
import { Avatar } from '../shared';

export type MsgRowProps = {
  authorName: string;
  tone: 'brand' | 'quiet';
  timeLabel: string;
  collapsed: boolean;
  /** My own message: right aligned, filled bubble, no avatar or name. */
  mine?: boolean;
  avatarUri?: string | null;
  onLongPress?: () => void;
  children: ReactNode;
};

const AVATAR = 30;
const BUBBLE_MAX = '82%';

/** Lets bubble children (body text, quotes, reaction pills) pick ink or white. */
const MsgSideContext = createContext<{ mine: boolean }>({ mine: false });
export const useMsgSide = () => useContext(MsgSideContext);

/** Chat bubbles: theirs on the left with an avatar per run, mine on the right in blue. */
export function MsgRow({
  authorName,
  tone,
  timeLabel,
  collapsed,
  mine = false,
  avatarUri,
  onLongPress,
  children,
}: MsgRowProps) {
  return (
    <MsgSideContext.Provider value={{ mine }}>
      <View style={[styles.row, collapsed ? styles.rowCollapsed : styles.rowFull, mine && styles.rowMine]}>
        {!mine && (
          <View style={styles.avatarCol}>
            {!collapsed && <Avatar name={authorName} uri={avatarUri} size={AVATAR} tone={tone} />}
          </View>
        )}
        <View style={[styles.stack, mine && styles.stackMine]}>
          {!collapsed && (
            <View style={[styles.meta, mine && styles.metaMine]}>
              {!mine && <Text style={styles.name}>{authorName}</Text>}
              <Text style={styles.time}>{timeLabel}</Text>
            </View>
          )}
          <Pressable
            onLongPress={onLongPress}
            disabled={onLongPress === undefined}
            style={({ pressed }) => [
              styles.bubble,
              mine ? styles.bubbleMine : styles.bubbleTheirs,
              collapsed && (mine ? styles.bubbleMineRun : styles.bubbleTheirsRun),
              pressed && onLongPress !== undefined && styles.bubblePressed,
            ]}
          >
            {children}
          </Pressable>
        </View>
      </View>
    </MsgSideContext.Provider>
  );
}

export function MsgBody({ text }: { text: string }) {
  const { mine } = useMsgSide();
  return <Text style={[styles.msgBody, mine && styles.msgBodyMine]}>{text}</Text>;
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
    alignItems: 'flex-end',
    gap: 8,
  },
  rowMine: {
    justifyContent: 'flex-end',
  },
  rowFull: {
    paddingTop: 14,
  },
  rowCollapsed: {
    paddingTop: 3,
  },
  avatarCol: {
    width: AVATAR,
    alignSelf: 'flex-start',
    paddingTop: 18,
  },
  stack: {
    maxWidth: BUBBLE_MAX,
    alignItems: 'flex-start',
  },
  stackMine: {
    alignItems: 'flex-end',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  metaMine: {
    justifyContent: 'flex-end',
  },
  name: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.1,
    color: color.slate500,
  },
  time: {
    fontSize: 11,
    fontWeight: '500',
    color: color.slate400,
  },
  bubble: {
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 18,
  },
  bubbleTheirs: {
    backgroundColor: color.fillQuiet,
    borderBottomLeftRadius: 6,
  },
  bubbleTheirsRun: {
    borderTopLeftRadius: 6,
  },
  bubbleMine: {
    backgroundColor: color.blue500,
    borderBottomRightRadius: 6,
  },
  bubbleMineRun: {
    borderTopRightRadius: 6,
  },
  bubblePressed: {
    opacity: 0.85,
  },
  msgBody: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '400',
    color: color.ink,
  },
  msgBodyMine: {
    color: color.white,
  },
});
