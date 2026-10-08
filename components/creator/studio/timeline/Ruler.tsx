import { memo, type JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatClock } from '../../../../lib/video-edit';
import { color, type } from '../../../../theme/tokens';
import { RULER_H } from './layout';
import { msToPx } from './scale';

const LABEL_W = 44;

export const Ruler = memo(function Ruler(props: { totalMs: number; msPerPx: number }): JSX.Element {
  const { totalMs, msPerPx } = props;
  const pxPerSec = 1000 / msPerPx;
  const stepMs = pxPerSec >= 120 ? 1000 : pxPerSec >= 48 ? 2000 : 5000;
  const marks: JSX.Element[] = [];
  for (let t = 0; t <= totalMs; t += stepMs) {
    marks.push(
      <Text key={`l${t}`} style={[styles.label, { left: msToPx(t, msPerPx) - LABEL_W / 2 }]}>
        {formatClock(t)}
      </Text>,
    );
    const mid = t + stepMs / 2;
    if (mid < totalMs) {
      marks.push(<View key={`t${t}`} style={[styles.tick, { left: msToPx(mid, msPerPx) }]} />);
    }
  }
  return <View style={styles.ruler}>{marks}</View>;
});

const styles = StyleSheet.create({
  ruler: { height: RULER_H, width: '100%' },
  label: {
    position: 'absolute',
    top: 0,
    width: LABEL_W,
    textAlign: 'center',
    fontSize: type.size.micro,
    lineHeight: 12,
    fontWeight: type.weight.medium,
    color: color.whiteA60,
    fontVariant: ['tabular-nums'],
  },
  tick: { position: 'absolute', bottom: 2, width: 1, height: 4, backgroundColor: color.whiteA28 },
});
