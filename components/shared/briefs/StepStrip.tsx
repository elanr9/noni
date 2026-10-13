// StepStrip from reference_ui/briefs/SSFlow.jsx. Steps are 32pt pills: the
// current one is filled (ink on light, white on dark) and shows its name, done
// steps show a green check and can be tapped to jump back, future steps show
// their number. With 5 or more steps the strip tightens and hides names.

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '../../ui/Icon';
import { briefTone, color, type as typeToken } from '../../../theme/tokens';

export type BriefStep = { id: string; name: string };

export interface StepStripProps {
  steps: BriefStep[];
  current: number;
  dark?: boolean;
  onJump?: (id: string) => void;
}

export function StepStrip({ steps, current, dark = false, onJump }: StepStripProps) {
  const tight = steps.length >= 5;
  const fg = dark ? color.white : color.ink;
  const dim = dark ? color.whiteA45 : color.slate400;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, { gap: tight ? 2 : 4 }]}
    >
      {steps.map((s, i) => {
        const done = i < current;
        const now = i === current;
        const showName = now || (done && steps.length <= 4);
        const canJump = done && Boolean(onJump);
        return (
          <View key={s.id} style={styles.item}>
            {i > 0 && !tight ? (
              <View
                style={[
                  styles.link,
                  {
                    backgroundColor:
                      done || now ? (dark ? color.whiteA45 : color.lineStrong) : dark ? color.whiteA16 : color.line,
                  },
                ]}
              />
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Step ${i + 1}, ${s.name}`}
              disabled={!canJump}
              onPress={canJump ? () => onJump?.(s.id) : undefined}
              hitSlop={6}
              style={[
                styles.pill,
                {
                  paddingLeft: now ? 8 : showName ? 6 : 4,
                  paddingRight: now ? 12 : showName ? 8 : 4,
                  backgroundColor: now ? (dark ? color.white : color.ink) : 'transparent',
                },
              ]}
            >
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: done
                      ? briefTone.done
                      : now
                        ? 'transparent'
                        : dark
                          ? color.whiteA16
                          : color.fillQuiet,
                  },
                ]}
              >
                {done ? (
                  <Icon name="check" size={11} color={color.white} />
                ) : (
                  <Text style={[styles.dotText, { color: now ? (dark ? color.ink : color.white) : dim }]}>{i + 1}</Text>
                )}
              </View>
              {showName ? (
                <Text style={[styles.name, { color: now ? (dark ? color.ink : color.white) : done ? fg : dim }]}>
                  {s.name}
                </Text>
              ) : null}
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  item: { flexDirection: 'row', alignItems: 'center' },
  link: { width: 6, height: 1.5, marginRight: 4 },
  pill: { height: 32, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999 },
  dot: { width: 18, height: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  dotText: { fontFamily: typeToken.font.ui, fontWeight: '800', fontSize: 10.5 },
  name: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 12.5 },
});
