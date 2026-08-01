import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, {
  ClipPath,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

import { color, motion, shadow } from '../../theme/tokens';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const W = 320;
const H = 120;
const pad = 10;

export interface AreaChartProps {
  series: number[];
}

/**
 * Hand-drawn SVG area chart per handoff §3.4 / §6.5. Remount (key change)
 * replays the 420ms left-to-right reveal and the delayed end-dot fade.
 */
export function AreaChart({ series }: AreaChartProps) {
  const reveal = useRef(new Animated.Value(0)).current;
  const dotOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(reveal, {
        toValue: W,
        duration: motion.slow,
        easing: motion.easeOut,
        useNativeDriver: false,
      }).start();
      Animated.timing(dotOpacity, {
        toValue: 1,
        duration: motion.base,
        delay: 200,
        easing: motion.easeOut,
        useNativeDriver: true,
      }).start();
    }, 20);
    return () => clearTimeout(timer);
  }, [reveal, dotOpacity]);

  if (series.length < 2) {
    return <View style={styles.container} />;
  }

  // Path math per §6.5, copied verbatim.
  const max = Math.max(...series);
  const min = Math.min(...series);
  const span = Math.max(1, max - min);
  const pts = series.map((v, i) => [
    pad + (i / (series.length - 1)) * (W - pad * 2),
    pad + (1 - (v - min) / span) * (H - pad * 2),
  ]);
  const line = pts
    .map((p, i) => {
      if (!i) return `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
      const q = pts[i - 1];
      const cx = (q[0] + p[0]) / 2;
      return `C${cx.toFixed(1)} ${q[1].toFixed(1)} ${cx.toFixed(1)} ${p[1].toFixed(1)} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    })
    .join(' ');
  const area = `${line} L${W - pad} ${H} L${pad} ${H} Z`;

  const [lastX, lastY] = pts[pts.length - 1];

  return (
    <View style={styles.container}>
      <Svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color.accent} stopOpacity="0.26" />
            <Stop offset="1" stopColor={color.accent} stopOpacity="0" />
          </LinearGradient>
          <ClipPath id="areaReveal">
            <AnimatedRect x={0} y={0} width={reveal} height={H} />
          </ClipPath>
        </Defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <Line
            key={f}
            x1={0}
            y1={H * f}
            x2={W}
            y2={H * f}
            stroke={color.line}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <G clipPath="url(#areaReveal)">
          <Path d={area} fill="url(#areaFill)" />
          <Path
            d={line}
            fill="none"
            stroke={color.accent}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </G>
      </Svg>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.dot,
          shadow.shadowAccent,
          {
            left: `${(lastX / W) * 100}%`,
            top: lastY,
            opacity: dotOpacity,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: H,
    alignSelf: 'stretch',
  },
  dot: {
    position: 'absolute',
    width: 11,
    height: 11,
    marginLeft: -5.5,
    marginTop: -5.5,
    borderRadius: 999,
    backgroundColor: color.accent,
    borderWidth: 2.5,
    borderColor: color.white,
  },
});
