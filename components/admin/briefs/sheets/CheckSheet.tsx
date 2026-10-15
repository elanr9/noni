// Check with AI (write-deck mode "review"): a strict second read of the
// finished post. Score, one line verdict, and ready to apply fixes per slide.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';

import type { BriefSlide } from '../../../../lib/briefs-api';
import type { DeckFix, DeckReview } from '../../../../lib/deck-ai';
import { color, radius, type as typeToken } from '../../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { SkeletonCard } from '../../../ui/Skeleton';
import { Sheet } from '../../shared';

function tone(score: number) {
  if (score >= 80) return { fg: color.green, bg: color.greenSoft, word: 'Ready to ship' };
  if (score >= 60) return { fg: color.amber, bg: color.amberSoft, word: 'Close' };
  return { fg: color.danger, bg: color.dangerSoft, word: 'Needs work' };
}

function slideName(i: number, reel: boolean, roles: BriefSlide['role'][]) {
  if (i === 0) return reel ? 'Hook' : 'Cover';
  if (roles[i] === 'cta') return 'CTA';
  return `${reel ? 'Point' : 'Slide'} ${i}`;
}

export function CheckSheet({
  visible,
  review,
  reel,
  roles = [],
  applied = 0,
  loading = false,
  onApply,
  onRecheck,
  busy,
  onClose,
}: {
  visible: boolean;
  review: DeckReview | null;
  reel: boolean;
  /** Slide roles by deck index, so the CTA is named as such. */
  roles?: BriefSlide['role'][];
  /** Fixes applied from this review. */
  applied?: number;
  /** The read is running and nothing came back yet: show a skeleton. */
  loading?: boolean;
  onApply: (fix: DeckFix) => void;
  onRecheck: () => void;
  busy: boolean;
  onClose: () => void;
}) {
  if (!review) {
    if (!loading) return null;
    return (
      <Sheet
        visible={visible}
        onClose={onClose}
        pinnedTop={140}
        header={
          <View style={styles.head}>
            <SkeletonCard height={60} radius={999} style={styles.scoreSkel} />
            <View style={styles.headText}>
              <Text style={styles.word}>Checking</Text>
              <Text style={styles.verdict}>Reading it like a viewer</Text>
            </View>
          </View>
        }
      >
        <View style={styles.list}>
          {[0, 1, 2].map((k) => (
            <SkeletonCard key={k} height={reel ? 132 : 112} radius={radius.sm} />
          ))}
        </View>
      </Sheet>
    );
  }
  const t = tone(review.score);
  const left = review.fixes.length;
  // Every fix used: the old score no longer applies, so offer a fresh read.
  const fixed = left === 0 && applied > 0;
  const clear = left === 0 && !fixed;
  const name = (i: number) => slideName(i, reel, roles);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      pinnedTop={140}
      header={
        <View style={styles.head}>
          <View style={[styles.score, { backgroundColor: t.bg }]}>
            <Text style={[styles.scoreN, { color: t.fg }]}>{review.score}</Text>
          </View>
          <View style={styles.headText}>
            <Text style={[styles.word, { color: fixed ? color.blue500 : t.fg }]}>{fixed ? 'Fixes applied' : t.word}</Text>
            {fixed ? <Text style={styles.verdict}>Check again for a fresh score.</Text> : review.verdict ? <Text style={styles.verdict}>{review.verdict}</Text> : null}
          </View>
        </View>
      }
      footer={
        clear ? (
          <Button size="lg" block onPress={onClose}>
            Done
          </Button>
        ) : (
          <Button variant="outline" size="lg" block disabled={busy} onPress={onRecheck} icon="rotate-ccw">
            {busy ? 'Checking' : 'Check again'}
          </Button>
        )
      }
    >
      <View style={styles.list}>
        {clear ? <Text style={styles.empty}>Nothing to fix. Ship it.</Text> : null}
        {review.fixes.map((fix) => (
          <Animated.View key={`${fix.i}${fix.text}`} layout={LinearTransition.duration(220)} exiting={FadeOut.duration(180)} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.where}>{name(fix.i)}</Text>
              <Text style={styles.problem}>{fix.problem}</Text>
            </View>
            <Text style={styles.fix}>{fix.text}</Text>
            {reel && fix.shot ? <Text style={styles.shot}>{fix.shot}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={`Apply fix to ${name(fix.i)}`} onPress={() => onApply(fix)} style={({ pressed }) => [styles.apply, pressed ? styles.pressed : null]}>
              <Icon name="check" size={15} color={color.white} />
              <Text style={styles.applyText}>Use this</Text>
            </Pressable>
          </Animated.View>
        ))}
        {review.flags.length ? (
          <View style={styles.flags}>
            <Text style={styles.flagsTitle}>Also flagged</Text>
            {review.flags.slice(0, 5).map((f) => (
              <Text key={f} style={styles.flag}>{f.replace(/^\[(\d+)\]/, (_, n: string) => `${name(Number(n))}:`)}</Text>
            ))}
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 },
  score: { width: 60, height: 60, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  scoreN: { fontFamily: typeToken.font.display, fontWeight: '800', fontSize: 24, letterSpacing: -0.6 },
  headText: { flex: 1, gap: 2 },
  scoreSkel: { width: 60 },
  word: { fontFamily: typeToken.font.ui, fontWeight: '800', fontSize: 13, letterSpacing: 0.2, textTransform: 'uppercase' },
  verdict: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 15, lineHeight: 15 * 1.4, color: color.ink },
  list: { gap: 10 },
  empty: { fontFamily: typeToken.font.ui, fontWeight: '600', fontSize: 15, color: color.slate500 },
  card: { gap: 8, padding: 14, borderRadius: radius.sm, backgroundColor: color.white, borderWidth: 1, borderColor: color.border },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  where: { fontFamily: typeToken.font.ui, fontWeight: '800', fontSize: 12.5, color: color.blue500 },
  problem: { flex: 1, fontFamily: typeToken.font.ui, fontWeight: '600', fontSize: 13.5, color: color.slate500 },
  fix: { fontFamily: typeToken.font.ui, fontWeight: '600', fontSize: 15.5, lineHeight: 15.5 * 1.4, color: color.ink },
  shot: { fontFamily: typeToken.font.ui, fontWeight: '400', fontSize: 14, lineHeight: 14 * 1.4, color: color.slate500 },
  apply: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: color.blue500 },
  pressed: { opacity: 0.85 },
  applyText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 14, color: color.white },
  flags: { gap: 4, paddingTop: 6 },
  flagsTitle: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 12.5, color: color.slate400 },
  flag: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 13, lineHeight: 13 * 1.4, color: color.slate500 },
});
