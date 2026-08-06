import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

import { SERIES_METRICS, type CompanyDay, type SeriesMetricKey } from '../../lib/analytics-api';
import { formatMetric } from '../../lib/analytics';
import { formatCents } from '../../lib/wallet-api';
import { color, motion, radiusAdmin, type } from '../../theme/tokens';

const CHART_HEIGHT = 220;
const LINE_TOP = 12;
const LINE_BOTTOM = 64;
const BAR_BAND = 40;
const BAR_BOTTOM = 18;

const AnimatedRect = Animated.createAnimatedComponent(Rect);

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
 * Admin handoff §11 — the one chart: posting activity as blue-200 bars and
 * the metric as a blue-500 2.5px line with a 22%→0 area gradient, one axis,
 * last point dotted, 420ms draw. Tap a day to inspect it.
 */
export function TimeSeriesChart({
  days,
  metric,
  money,
  selectedIndex,
  onSelectDay,
}: TimeSeriesChartProps) {
  const [width, setWidth] = useState(0);
  const draw = useRef(new Animated.Value(0)).current;

  const metricLabel =
    SERIES_METRICS.find((m) => m.key === metric)?.label ?? 'Metric';

  useEffect(() => {
    if (width === 0) return;
    draw.setValue(0);
    Animated.timing(draw, {
      toValue: 1,
      duration: motion.slow,
      easing: motion.easeOut,
      useNativeDriver: false,
    }).start();
  }, [width, metric, days, draw]);

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

  const drawWidth = draw.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(1, width)],
  });

  const formatValue = (v: number): string =>
    money ? formatCents(v) : formatMetric(v);

  return (
    <View>
      <View style={styles.axisRow}>
        <Text style={styles.axisLabel}>{formatValue(maxValue)}</Text>
      </View>
      <View
        style={styles.canvas}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {width > 0 && n > 0 ? (
          <Svg width={width} height={CHART_HEIGHT}>
            <Defs>
              {/* 22% -> 0 area gradient under the metric line. */}
              <LinearGradient id="noniSeriesArea" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color.blue500} stopOpacity="0.22" />
                <Stop offset="1" stopColor={color.blue500} stopOpacity="0" />
              </LinearGradient>
              <ClipPath id="noniSeriesDraw">
                <AnimatedRect x={0} y={0} width={drawWidth} height={CHART_HEIGHT} />
              </ClipPath>
            </Defs>

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
                  fill={i === selectedIndex ? color.blue500 : color.blue200}
                />
              ) : null,
            )}

            <G clipPath="url(#noniSeriesDraw)">
              <Path d={areaPath} fill="url(#noniSeriesArea)" />
              <Path d={linePath} stroke={color.blue500} strokeWidth={2.5} fill="none" />
              <Circle
                cx={xFor(n - 1)}
                cy={yFor(values[n - 1])}
                r={4}
                fill={color.blue500}
                stroke={color.white}
                strokeWidth={2}
              />
            </G>

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
                  fill={color.blue500}
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

      {/* Legend names both series. */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: color.blue500 }]} />
          <Text style={styles.legendText}>{metricLabel}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBar, { backgroundColor: color.blue200 }]} />
          <Text style={styles.legendText}>Posts per day</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    height: CHART_HEIGHT,
    borderRadius: radiusAdmin.md,
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
  legend: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendLine: {
    width: 14,
    height: 2.5,
    borderRadius: radiusAdmin.pill,
  },
  legendBar: {
    width: 8,
    height: 10,
    borderRadius: 2,
  },
  legendText: {
    fontSize: type.size.micro11,
    fontWeight: '600',
    color: color.slate500,
  },
});
