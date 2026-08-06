import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import type { CompanyDay, SeriesMetricKey } from '../../lib/analytics-api';
import { formatMetric } from '../../lib/analytics';
import { formatCents } from '../../lib/wallet-api';
import { color, radius, type } from '../../theme/tokens';

const CHART_HEIGHT = 220;
const LINE_TOP = 12;
const LINE_BOTTOM = 64;
const BAR_BAND = 40;
const BAR_BOTTOM = 18;

export interface TimeSeriesChartProps {
  days: CompanyDay[];
  metric: SeriesMetricKey;
  money: boolean;
  selectedIndex: number | null;
  onSelectDay: (index: number) => void;
}

function shortDay(day: string): string {
  const [, month, date] = day.split('-');
  return `${Number(month)}/${Number(date)}`;
}

/**
 * The primary analytics view: the selected metric as a line, posting activity
 * as bars along the bottom of the same axis. Tap a day to inspect it.
 */
export function TimeSeriesChart({
  days,
  metric,
  money,
  selectedIndex,
  onSelectDay,
}: TimeSeriesChartProps) {
  const [width, setWidth] = useState(0);

  const values = days.map((d) => d.metrics[metric]);
  const maxValue = Math.max(1, ...values);
  const maxPosted = Math.max(1, ...days.map((d) => d.posted));
  const n = days.length;
  const step = n > 1 ? width / (n - 1) : width;
  const slot = n > 0 ? width / n : width;

  const yFor = (value: number): number =>
    CHART_HEIGHT -
    LINE_BOTTOM -
    (value / maxValue) * (CHART_HEIGHT - LINE_BOTTOM - LINE_TOP);
  const xFor = (index: number): number => (n > 1 ? index * step : width / 2);

  const linePath = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`)
    .join(' ');
  const areaPath =
    `${linePath} L ${xFor(n - 1).toFixed(1)} ${CHART_HEIGHT - LINE_BOTTOM} ` +
    `L 0 ${CHART_HEIGHT - LINE_BOTTOM} Z`;

  const formatValue = (v: number): string =>
    money ? formatCents(v) : formatMetric(v);

  return (
    <View>
      <View style={styles.axisRow}>
        <Text style={styles.axisLabel}>{formatValue(maxValue)}</Text>
        <Text style={styles.axisLabel}>posts / day</Text>
      </View>
      <View
        style={styles.canvas}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {width > 0 && n > 0 ? (
          <Svg width={width} height={CHART_HEIGHT}>
            <Line
              x1={0}
              y1={CHART_HEIGHT - LINE_BOTTOM}
              x2={width}
              y2={CHART_HEIGHT - LINE_BOTTOM}
              stroke={color.line}
              strokeWidth={1}
            />
            {days.map((d, i) =>
              d.posted > 0 ? (
                <Rect
                  key={d.day}
                  x={i * slot + slot * 0.25}
                  width={slot * 0.5}
                  y={
                    CHART_HEIGHT -
                    BAR_BOTTOM -
                    (d.posted / maxPosted) * BAR_BAND
                  }
                  height={(d.posted / maxPosted) * BAR_BAND}
                  rx={Math.min(3, slot * 0.2)}
                  fill={i === selectedIndex ? color.accent : color.accentTint}
                />
              ) : null,
            )}
            <Path d={areaPath} fill={color.blue100} />
            <Path d={linePath} stroke={color.accent} strokeWidth={2.5} fill="none" />
            {selectedIndex !== null ? (
              <>
                <Line
                  x1={xFor(selectedIndex)}
                  y1={LINE_TOP}
                  x2={xFor(selectedIndex)}
                  y2={CHART_HEIGHT - BAR_BOTTOM}
                  stroke={color.slate400}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <Circle
                  cx={xFor(selectedIndex)}
                  cy={yFor(values[selectedIndex])}
                  r={5}
                  fill={color.accent}
                  stroke={color.white}
                  strokeWidth={2}
                />
              </>
            ) : null}
          </Svg>
        ) : null}
        <Pressable
          accessibilityLabel="Select a day on the chart"
          style={StyleSheet.absoluteFill}
          onPress={(e) => {
            if (width === 0 || n === 0) return;
            const index = Math.min(
              n - 1,
              Math.max(0, Math.round(e.nativeEvent.locationX / slot - 0.5)),
            );
            onSelectDay(index);
          }}
        />
      </View>
      <View style={styles.axisRow}>
        <Text style={styles.axisLabel}>{n > 0 ? shortDay(days[0].day) : ''}</Text>
        <Text style={styles.axisLabel}>
          {n > 0 ? shortDay(days[n - 1].day) : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    height: CHART_HEIGHT,
    borderRadius: radius.md,
    backgroundColor: color.white,
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  axisLabel: {
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.slate400,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
  },
});
