// Body of the "When it shows" tool: the slot's transcript with the word at
// the cue highlighted, tap a word to snap the cue there, plus a reset (text
// goes back to the whole clip, the screenshot back to the AI suggestion).
import { memo, useCallback, useEffect, useRef, type JSX } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import type { TranscriptWord } from '../../../lib/video-edit';
import { color, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

/** Index of the word playing at `sourceMs`, or the last word that started before it. */
export function wordIndexAt(words: TranscriptWord[], sourceMs: number): number {
  let hit = -1;
  for (let i = 0; i < words.length; i++) {
    if (words[i].s <= sourceMs) hit = i;
    else break;
  }
  return hit;
}

const WORD_H = 30;
const WORD_GAP = 4;

const WordChip = memo(function WordChip(props: {
  word: TranscriptWord;
  on: boolean;
  onPick: (word: TranscriptWord) => void;
}): JSX.Element {
  const { word, on, onPick } = props;
  const press = useCallback(() => onPick(word), [onPick, word]);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Show at "${word.w}"`}
      accessibilityState={{ selected: on }}
      onPress={press}
      style={[styles.word, on && styles.wordOn]}
    >
      <Text style={[styles.wordText, on && styles.wordTextOn]}>{word.w}</Text>
    </PressableScale>
  );
});

function wordKey(word: TranscriptWord, index: number): string {
  return `${word.s}-${index}`;
}

export function CuePanel(props: {
  words: TranscriptWord[];
  sourceMs: number;
  kindLabel: string;
  pending: boolean;
  canReset: boolean;
  resetLabel: string;
  onPickWord: (word: TranscriptWord) => void;
  onReset: () => void;
}): JSX.Element {
  const { words, sourceMs, kindLabel, pending, canReset, resetLabel, onPickWord, onReset } = props;
  const active = wordIndexAt(words, sourceMs);
  const listRef = useRef<FlatList<TranscriptWord>>(null);

  useEffect(() => {
    if (active < 0 || active >= words.length) return;
    listRef.current?.scrollToIndex({ index: active, animated: true, viewPosition: 0.3 });
  }, [active, words.length]);

  const renderWord = useCallback(
    ({ item, index }: { item: TranscriptWord; index: number }) => (
      <WordChip word={item} on={index === active} onPick={onPickWord} />
    ),
    [active, onPickWord],
  );

  return (
    <View style={styles.wrap}>
      {pending ? (
        <View style={styles.empty}>
          <ActivityIndicator color={color.whiteA60} />
          <Text style={styles.emptyText}>Listening to this clip</Text>
        </View>
      ) : words.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            No transcript for this clip yet. Drag the marker to set when it shows.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          horizontal
          data={words}
          extraData={active}
          keyExtractor={wordKey}
          renderItem={renderWord}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.words}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={24}
          windowSize={5}
          removeClippedSubviews
          onScrollToIndexFailed={() => undefined}
        />
      )}
      <View style={styles.row}>
        <Text style={styles.caption} numberOfLines={1}>
          {kindLabel}
        </Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={resetLabel}
          onPress={onReset}
          disabled={!canReset || pending}
          style={[styles.resetBtn, (!canReset || pending) && styles.resetOff]}
        >
          <Icon name="rotate-ccw" size={14} color={color.white} />
          <Text style={styles.resetText}>{resetLabel}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  words: {
    alignItems: 'center',
    gap: WORD_GAP,
    paddingHorizontal: 2,
    minHeight: 36,
  },
  word: {
    paddingHorizontal: 8,
    height: WORD_H,
    borderRadius: 8,
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
  },
  wordOn: { backgroundColor: color.accent },
  wordText: {
    color: color.whiteA75,
    fontSize: type.size.chip,
    fontWeight: type.weight.medium,
  },
  wordTextOn: { color: color.white, fontWeight: type.weight.bold },
  empty: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  emptyText: {
    flex: 1,
    color: color.whiteA60,
    fontSize: type.size.label,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  caption: {
    flex: 1,
    color: color.whiteA60,
    fontSize: type.size.label,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#1C1C1E',
  },
  resetOff: { opacity: 0.4 },
  resetText: {
    color: color.white,
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
  },
});
