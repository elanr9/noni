// One pitched idea in the idea chat: format, post type, cover, spoken hook,
// the first three lines and the angle. A fresh pitch has Make it, More like
// this and an X. While it is written into a slot the actions give way to
// "Writing into slot 05"; once saved, "In slot 05" with Open and Undo.

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { ChatIdea } from '../../../lib/deck-ai';
import { ideaPostTypeName, ideaStateLabel, type IdeaState } from '../../../lib/idea-chat';
import { borderWidth, color, radius, shadow, type as typeToken } from '../../../theme/tokens';
import { FormatChip, KindChip, PostTypeChip } from '../../shared/briefs';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';

export function IdeaCard({
  idea,
  state,
  moreLocked,
  undoing,
  onMake,
  onMore,
  onDismiss,
  onOpen,
  onUndo,
}: {
  idea: ChatIdea;
  state: IdeaState | null;
  moreLocked: boolean;
  undoing: boolean;
  onMake: () => void;
  onMore: () => void;
  onDismiss: () => void;
  onOpen: () => void;
  onUndo: () => void;
}) {
  const typeName = ideaPostTypeName(idea);
  const longText = idea.postTypeId === 'longtext';
  const placed = state && state.status !== 'dismissed' ? state : null;
  // The kind it was made as, once made; the pitched kind before.
  const kind = placed?.kind ?? idea.kind;
  return (
    <View style={[styles.card, placed?.status === 'made' ? styles.cardMade : null]}>
      <View style={styles.top}>
        <View style={styles.chips}>
          <FormatChip format={idea.format} size="sm" toned withIcon />
          {typeName ? <PostTypeChip name={typeName} size="sm" /> : null}
          {kind === 'story' ? <KindChip kind="story" format={idea.format} size="sm" /> : null}
        </View>
        {placed ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Not for us"
            onPress={onDismiss}
            hitSlop={10}
            style={({ pressed }) => [styles.x, pressed ? styles.pressed : null]}
          >
            <Icon name="x" size={15} color={color.slate400} />
          </Pressable>
        )}
      </View>
      {/* Long text is one block: its opening lines, not the whole wall. */}
      <Text style={longText ? styles.coverLong : styles.cover} numberOfLines={longText ? 4 : undefined}>
        {idea.cover}
      </Text>
      {idea.say ? (
        <View style={styles.sayRow}>
          <Icon name="mic" size={14} color={color.slate400} />
          <Text style={styles.say}>{idea.say}</Text>
        </View>
      ) : null}
      {idea.preview.length ? (
        <View style={styles.preview}>
          {idea.preview.map((p, i) => (
            <View key={`${i}:${p}`} style={styles.previewRow}>
              <Text style={styles.previewNum}>{i + 1}</Text>
              <Text style={styles.previewText} numberOfLines={1}>
                {p}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {idea.angle ? <Text style={styles.angle}>{idea.angle}</Text> : null}

      {placed?.status === 'writing' ? (
        <Animated.View key="writing" entering={FadeIn.duration(180)} style={styles.status} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={color.blue500} />
          <Text style={styles.statusText}>{ideaStateLabel(placed)}</Text>
          <Text style={styles.statusKind}>{kind === 'story' ? 'Story' : 'Handheld'}</Text>
        </Animated.View>
      ) : placed?.status === 'made' ? (
        <Animated.View key="made" entering={FadeIn.duration(220)} style={styles.madeRow}>
          <View style={styles.madeLabel}>
            <Icon name="circle-check-big" size={18} color={color.green} />
            <Text style={styles.madeText}>{ideaStateLabel(placed)}</Text>
          </View>
          <Button variant="ghost" size="sm" icon="undo-2" disabled={undoing} onPress={onUndo} style={styles.undo}>
            {undoing ? 'Undoing' : 'Undo'}
          </Button>
          <Button variant="primary" size="sm" iconRight="arrow-right" disabled={undoing} onPress={onOpen} style={styles.open}>
            Open
          </Button>
        </Animated.View>
      ) : (
        <View style={styles.actions}>
          <Button variant="primary" size="sm" icon="sparkles" onPress={onMake} style={styles.action}>
            Make it
          </Button>
          <Button variant="tint" size="sm" icon="shuffle" disabled={moreLocked} onPress={onMore} style={styles.action}>
            More like this
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.border,
    backgroundColor: color.white,
    ...shadow.shadowCard,
  },
  cardMade: { borderColor: color.green },
  pressed: { opacity: 0.6 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  x: {
    width: 28,
    height: 28,
    marginTop: -4,
    marginRight: -6,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fillQuiet,
  },
  cover: { fontFamily: typeToken.font.display, fontWeight: '800', fontSize: 20, lineHeight: 20 * 1.2, letterSpacing: -0.4, color: color.ink },
  coverLong: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 15, lineHeight: 15 * 1.4, color: color.ink },
  sayRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  say: { flex: 1, fontFamily: typeToken.font.ui, fontWeight: '500', fontStyle: 'italic', fontSize: 13.5, lineHeight: 13.5 * 1.4, color: color.slate500 },
  preview: { gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.sm, backgroundColor: color.offWhite },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewNum: { width: 16, fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 12.5, color: color.slate400, fontVariant: ['tabular-nums'] },
  previewText: { flex: 1, fontFamily: typeToken.font.ui, fontWeight: '600', fontSize: 14, color: color.ink },
  angle: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 13.5, lineHeight: 13.5 * 1.4, color: color.slate500 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  action: { flex: 1, paddingHorizontal: 10 },
  status: {
    marginTop: 2,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: color.blue50,
  },
  statusText: { flex: 1, fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 14, color: color.blue700 },
  statusKind: { fontFamily: typeToken.font.ui, fontWeight: '600', fontSize: 12.5, color: color.slate500 },
  madeRow: { marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 6 },
  madeLabel: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  madeText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 15, color: color.green },
  undo: { paddingHorizontal: 12 },
  open: { paddingHorizontal: 18 },
});
