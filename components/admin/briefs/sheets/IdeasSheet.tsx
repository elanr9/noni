// Cover ideas (write-deck mode "ideas"): six covers for this post type that
// do not repeat the week or the company's recent posts. Tap one and the AI
// writes the whole post around it; the manager edits from there.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { DeckIdea } from '../../../../lib/deck-ai';
import { color, radius, type as typeToken } from '../../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { SkeletonCard } from '../../../ui/Skeleton';
import { Icon } from '../../../ui/Icon';
import { Sheet } from '../../shared';

export function IdeasSheet({
  visible,
  ideas,
  busy,
  typeName,
  reel,
  onPick,
  onMore,
  onClose,
}: {
  visible: boolean;
  ideas: DeckIdea[] | null;
  busy: boolean;
  typeName: string | null;
  reel: boolean;
  onPick: (idea: DeckIdea) => void;
  onMore: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      pinnedTop={120}
      header={
        <View style={styles.head}>
          <Text style={styles.title}>{typeName ? `${typeName} ideas` : 'Ideas'}</Text>
          <Text style={styles.sub}>Pick one and AI writes the whole post. You edit from there.</Text>
        </View>
      }
      footer={
        <Button variant="outline" size="lg" block disabled={busy} onPress={onMore} icon="shuffle">
          Different ideas
        </Button>
      }
    >
      {busy || !ideas ? (
        <View style={styles.list}>
          <Text style={styles.loading}>Reading this week and your last posts so nothing repeats</Text>
          {[0, 1, 2, 3].map((k) => (
            <SkeletonCard key={k} height={reel ? 104 : 86} radius={radius.sm} />
          ))}
        </View>
      ) : ideas.length === 0 ? (
        <Text style={styles.loading}>No ideas cleared the bar this time. Try again.</Text>
      ) : (
        <View style={styles.list}>
          {ideas.map((idea, k) => (
            <Animated.View key={`${idea.cover}${k}`} entering={FadeInDown.duration(260).delay(k * 50)}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={idea.cover}
                onPress={() => onPick(idea)}
                style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
              >
                <View style={styles.row}>
                  <Text style={styles.cover}>{idea.cover}</Text>
                  {idea.count > 0 ? (
                    <View style={styles.count}>
                      <Text style={styles.countText}>{`${idea.count} ${reel ? 'points' : 'slides'}`}</Text>
                    </View>
                  ) : null}
                </View>
                {reel && idea.say ? (
                  <View style={styles.sayRow}>
                    <Icon name="mic" size={13} color={color.slate500} />
                    <Text style={styles.say}>{idea.say}</Text>
                  </View>
                ) : null}
                {idea.angle ? <Text style={styles.angle}>{idea.angle}</Text> : null}
              </Pressable>
            </Animated.View>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 },
  title: { fontFamily: typeToken.font.display, fontWeight: '700', fontSize: 22, letterSpacing: -0.4, color: color.ink },
  sub: { marginTop: 4, fontFamily: typeToken.font.ui, fontWeight: '400', fontSize: 14, color: color.slate500 },
  list: { gap: 10 },
  loading: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 14, color: color.slate500, marginBottom: 2 },
  card: { gap: 8, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.sm, backgroundColor: color.white, borderWidth: 1, borderColor: color.border },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cover: { flex: 1, fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 16.5, lineHeight: 16.5 * 1.3, letterSpacing: -0.2, color: color.ink },
  count: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: color.blue50 },
  countText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 12, color: color.blue500 },
  sayRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  say: { flex: 1, fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 14, lineHeight: 14 * 1.4, color: color.slate500 },
  angle: { fontFamily: typeToken.font.ui, fontWeight: '400', fontSize: 13, lineHeight: 13 * 1.45, color: color.slate500 },
});
