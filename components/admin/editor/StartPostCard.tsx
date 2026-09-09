// Empty post opener. Three ways in, one card; replaces the form until the
// manager fills the post with AI or chooses to start blank.
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { color, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { PressableScale } from '../../ui/PressableScale';

export interface StartPostCardProps {
  family: 'video' | 'photo_carousel';
  typeLabel: string;
  busy: boolean;
  busyLabel: string | null;
  onWriteFromIdea: (text: string) => void;
  onOpenLibrary: () => void;
  onStartBlank: () => void;
  onRewriteFromThisWeek?: () => void;
}

export function StartPostCard({
  family,
  typeLabel,
  busy,
  busyLabel,
  onWriteFromIdea,
  onOpenLibrary,
  onStartBlank,
  onRewriteFromThisWeek,
}: StartPostCardProps) {
  const [idea, setIdea] = useState('');
  const trimmed = idea.trim();
  const formatWord = family === 'photo_carousel' ? 'slideshow' : 'video';

  return (
    <View style={[styles.card, shadow.shadowCard]}>
      <View style={styles.header}>
        <Text style={styles.heading}>
          Start this {typeLabel.toLowerCase()} {formatWord}
        </Text>
        <Text style={styles.lede}>
          Three ways in. AI fills the whole post: text in place, screenshots
          from your feature library, subtitles on for video.
        </Text>
      </View>

      <Option title="Write from an idea">
        <TextInput
          multiline
          value={idea}
          onChangeText={setIdea}
          editable={!busy}
          placeholder="What is this post about? An idea, a title, a hook."
          placeholderTextColor={color.slate400}
          style={styles.input}
        />
        {busy ? (
          <View style={styles.busyPill}>
            <ActivityIndicator size="small" color={color.white} />
            <Text style={styles.busyText}>{busyLabel ?? 'Writing'}</Text>
          </View>
        ) : (
          <Button
            size="md"
            variant="primary"
            block
            disabled={trimmed.length === 0}
            onPress={() => onWriteFromIdea(trimmed)}
          >
            Write it with AI
          </Button>
        )}
      </Option>

      <Option title="Start from the library">
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Start from the library"
          disabled={busy}
          onPress={onOpenLibrary}
          style={[styles.libraryBlock, busy && styles.dimmed]}
        >
          <Text style={styles.libraryTitle}>Open the library</Text>
          <Text style={styles.librarySub}>
            Product features, references, our top posts, saved ideas.
          </Text>
        </PressableScale>
      </Option>

      <Option title="Start blank">
        <Button size="md" variant="ghost" disabled={busy} onPress={onStartBlank}>
          Start blank, no AI
        </Button>
      </Option>

      {onRewriteFromThisWeek ? (
        <PressableScale
          accessibilityRole="button"
          disabled={busy}
          onPress={onRewriteFromThisWeek}
          style={styles.linkWrap}
        >
          <Text style={styles.link}>Rewrite a finished post from this week</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

function Option({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.option}>
      <Text style={styles.optionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 22,
    padding: 18,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
  },
  header: { gap: 6 },
  heading: {
    fontSize: type.size.cardLg,
    fontWeight: '700',
    lineHeight: type.size.cardLg * 1.3,
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  lede: {
    fontSize: type.size.meta,
    lineHeight: type.size.meta * 1.45,
    color: color.slate500,
  },
  option: { gap: 10 },
  optionTitle: {
    fontSize: type.size.label,
    fontWeight: '700',
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
  },
  input: {
    minHeight: 84,
    padding: 14,
    borderRadius: radiusAdmin.md,
    borderWidth: 1.5,
    borderColor: color.borderStrong,
    backgroundColor: color.offWhite,
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * 1.4,
    color: color.ink,
    textAlignVertical: 'top',
  },
  busyPill: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.accent,
  },
  busyText: { color: color.white, fontSize: 15, fontWeight: '700' },
  libraryBlock: {
    gap: 4,
    padding: 14,
    borderRadius: radiusAdmin.md,
    borderWidth: 1.5,
    borderColor: color.borderStrong,
  },
  dimmed: { opacity: 0.35 },
  libraryTitle: { fontSize: 15, fontWeight: '700', color: color.ink },
  librarySub: {
    fontSize: type.size.chip,
    lineHeight: type.size.chip * 1.4,
    color: color.slate500,
  },
  linkWrap: { alignSelf: 'center', paddingVertical: 4 },
  link: { fontSize: type.size.chip, fontWeight: '700', color: color.blue600 },
});
