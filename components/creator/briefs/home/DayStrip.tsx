// M T W T F S S for the current week (America/New_York), today in ink with
// one dot per post, other days one quiet dot. From SSCreator.jsx CreatorHome.
import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, radius, type as typeToken } from '../../../../theme/tokens';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** The seven YYYY-MM-DD keys of the week holding todayKey, Monday first. */
export function weekKeys(todayKey: string): string[] {
  const [y, m, d] = todayKey.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() - ((base.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    return day.toISOString().slice(0, 10);
  });
}

export function DayStrip({ todayKey, todayCount }: { todayKey: string; todayCount: number }): JSX.Element {
  const keys = weekKeys(todayKey);
  return (
    <View style={styles.row}>
      {keys.map((key, i) => {
        const on = key === todayKey;
        const num = Number(key.slice(8, 10));
        return (
          <View key={key} style={[styles.day, on ? styles.dayOn : styles.dayOff]}>
            <Text style={[styles.letter, { color: on ? color.whiteA75 : color.slate400 }]}>{LETTERS[i]}</Text>
            <Text style={[styles.num, { color: on ? color.white : color.ink }]}>{num}</Text>
            <View style={styles.dots}>
              {on ? (
                Array.from({ length: Math.max(0, todayCount) }, (_, k) => <View key={k} style={[styles.dot, styles.dotOn]} />)
              ) : (
                <View style={[styles.dot, styles.dotOff]} />
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, alignItems: 'center', gap: 4, paddingTop: 7, paddingBottom: 6, borderRadius: radius.md, borderWidth: 1 },
  dayOn: { backgroundColor: color.ink, borderColor: color.ink },
  dayOff: { backgroundColor: color.white, borderColor: color.border },
  letter: { fontFamily: typeToken.font.ui, fontSize: 11, fontWeight: '600' },
  num: { fontFamily: typeToken.font.display, fontSize: 16, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 3, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 999 },
  dotOn: { backgroundColor: color.whiteA90 },
  dotOff: { backgroundColor: color.lineStrong },
});
