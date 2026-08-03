import { StyleSheet, Text, View } from 'react-native';

import type { ScriptLine } from '../../lib/admin-review-types';
import { color, radius, type } from '../../theme/tokens';
import { PressableScale } from '../ui/PressableScale';

export interface ScriptLineListProps {
  lines: ScriptLine[];
  positionSec: number;
  /** Without timings the lines render as plain paragraphs — no timestamps, no highlight, no seek (contract §6.3). */
  hasTimings: boolean;
  onSeek: (sec: number) => void;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Script list for Review 1f (README §5.2): the delivered line follows playback. */
export function ScriptLineList({ lines, positionSec, hasTimings, onSeek }: ScriptLineListProps) {
  let currentIndex = -1;
  if (hasTimings) {
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].at <= positionSec) currentIndex = i;
    }
  }

  return (
    <View style={styles.list}>
      {lines.map((line, index) => {
        if (!hasTimings) {
          return (
            <View key={index} style={styles.row}>
              <Text style={styles.bodyIdle}>{line.text}</Text>
            </View>
          );
        }
        const current = index === currentIndex;
        return (
          <PressableScale
            key={index}
            accessibilityRole="button"
            onPress={() => onSeek(line.at)}
            hitSlop={{ top: 1, bottom: 1 }}
            style={[styles.row, current && styles.rowCurrent]}
          >
            <Text style={[styles.timestamp, current && styles.timestampCurrent]}>
              {formatTime(line.at)}
            </Text>
            <Text style={[styles.bodyIdle, current && styles.bodyCurrent]}>{line.text}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.cell,
  },
  rowCurrent: {
    backgroundColor: color.blue100,
  },
  timestamp: {
    minWidth: 30,
    fontSize: type.size.label,
    fontWeight: '700',
    lineHeight: 22,
    color: color.slate300,
  },
  timestampCurrent: {
    color: color.blue600,
  },
  bodyIdle: {
    flex: 1,
    fontSize: type.size.bodySm,
    lineHeight: 22,
    fontWeight: '400',
    color: color.slate500,
  },
  bodyCurrent: {
    fontWeight: '700',
    color: color.ink,
  },
});
