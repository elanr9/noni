// Full screen intro before the CTA step (SSFlow.jsx CtaIntro): a bouncing
// zap badge, the title, three rows that rise in, and "Let's go".

import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, radius, shadow, type as typeToken } from '../../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { Icon, type IconName } from '../../../ui/Icon';

export const CTA_INTRO_ROWS: [IconName, string][] = [
  ['pencil', "Write one line, in the creator's voice, that sells Inkbound."],
  ['images', 'Add a screenshot of the feature the post is about.'],
  ['arrow-left-right', 'Slide order and CTA spot get shuffled for every creator.'],
];

export function CtaIntro({
  onGo,
  onBack,
  title = 'Time for your call to action slide!',
  sub = 'This is what makes it a "UGC" post!',
  rows = CTA_INTRO_ROWS,
  go = "Let's go",
  companyName,
}: {
  onGo: () => void;
  onBack: () => void;
  title?: string;
  sub?: string;
  rows?: [IconName, string][];
  go?: string;
  companyName?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View entering={FadeInUp.duration(240)} style={[StyleSheet.absoluteFill, styles.root]}>
      <LinearGradient colors={[color.blue100, color.offWhite]} locations={[0, 0.55]} style={StyleSheet.absoluteFill} />
      <View style={{ height: insets.top }} />
      <View style={styles.backRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.back}>
          <Icon name="chevron-left" size={22} color={color.ink} />
        </Pressable>
      </View>
      <View style={styles.body}>
        <View style={styles.hero}>
          <Animated.View entering={ZoomIn.duration(620).springify()} style={styles.badge}>
            <View style={styles.badgeHalo} />
            <View style={[styles.badgeDisc, shadow.shadowAccent]} />
            <Icon name="zap" size={44} color={color.white} />
            <View style={styles.sparkle}>
              <Icon name="sparkles" size={22} color={color.blue500} />
            </View>
          </Animated.View>
          <Animated.View entering={FadeInUp.duration(360).delay(160)} style={styles.titles}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.sub}>{sub}</Text>
          </Animated.View>
        </View>
        <View style={styles.card}>
          {rows.map(([ic, l], i) => (
            <Animated.View key={l} entering={FadeInUp.duration(360).delay(260 + i * 90)} style={styles.row}>
              <View style={styles.rowIcon}>
                <Icon name={ic} size={18} color={color.blue500} />
              </View>
              <Text style={styles.rowText}>{companyName ? l.replace('Inkbound', companyName) : l}</Text>
            </Animated.View>
          ))}
        </View>
      </View>
      <Animated.View entering={FadeIn.duration(360).delay(560)} style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 28) }]}>
        <Button size="lg" block onPress={onGo}>
          {go}
        </Button>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 80, backgroundColor: color.offWhite },
  backRow: { paddingTop: 6, paddingHorizontal: 12 },
  back: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, justifyContent: 'center', gap: 28, paddingHorizontal: 28, paddingBottom: 24 },
  hero: { alignItems: 'center', gap: 22 },
  badge: { width: 128, height: 128, alignItems: 'center', justifyContent: 'center' },
  badgeHalo: { position: 'absolute', width: 128, height: 128, borderRadius: 999, backgroundColor: color.blue500, opacity: 0.12 },
  badgeDisc: { position: 'absolute', width: 92, height: 92, borderRadius: 999, backgroundColor: color.blue500 },
  sparkle: { position: 'absolute', top: 6, right: 10 },
  titles: { gap: 8, alignItems: 'center' },
  title: { textAlign: 'center', fontFamily: typeToken.font.display, fontWeight: '800', fontSize: 30, lineHeight: 33, letterSpacing: -0.8, color: color.ink },
  sub: { textAlign: 'center', fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 16, lineHeight: 16 * 1.4, color: color.slate500 },
  card: { gap: 14, paddingVertical: 20, paddingHorizontal: 18, borderRadius: radius.xl, backgroundColor: color.whiteA75, borderWidth: 1, borderColor: color.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowIcon: { width: 40, height: 40, borderRadius: 999, backgroundColor: color.white, borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, fontFamily: typeToken.font.ui, fontWeight: '600', fontSize: 16, lineHeight: 16 * 1.3, color: color.ink },
  footer: { paddingHorizontal: 24 },
});
