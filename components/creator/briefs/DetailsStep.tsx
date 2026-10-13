// Caption step for Story and Freestyle posts: caption, hashtags, search
// phrase, Fill with AI. From SSCreator.jsx phase details and SSManager
// TagField.
import { useState, type JSX } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { WeekBrief } from '../../../lib/briefs-api';
import { color, radius, type as typeToken } from '../../../theme/tokens';
import { BriefHeader } from '../../shared/briefs';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { fillCaption, fillSearchPhrase } from './ai';
import { hashtagList } from './model';

const MAX_TAGS = 5;

export type DetailsStepProps = {
  brief: WeekBrief;
  /** The creator's lines, for the AI fill. */
  lines: string[];
  caption: string;
  tags: string;
  search: string;
  onChange: (next: { caption: string; tags: string; search: string }) => void;
  onBack: () => void;
  onReview: () => void;
};

function Section({ label, right, children }: { label: string; right?: JSX.Element | null; children: JSX.Element }): JSX.Element {
  return (
    <View style={styles.section}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function DetailsStep({ brief, lines, caption, tags, search, onChange, onBack, onReview }: DetailsStepProps): JSX.Element {
  const insets = useSafeAreaInsets();
  const reel = brief.format === 'reel';
  const [busy, setBusy] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const tagList = hashtagList(tags);
  const set = (patch: Partial<{ caption: string; tags: string; search: string }>) => onChange({ caption, tags, search, ...patch });

  const fill = async () => {
    setBusy(true);
    try {
      const hook = lines[0] ?? null;
      const [cap, phrase] = await Promise.all([fillCaption(brief, lines, hook), fillSearchPhrase(brief, lines, hook)]);
      onChange({
        caption: cap.caption || caption,
        tags: cap.hashtags.length ? cap.hashtags.slice(0, MAX_TAGS).map((t) => `#${t.replace(/^#/, '')}`).join(' ') : tags,
        search: phrase || search,
      });
    } catch {
      // The fields stay as they were; the creator keeps typing.
    } finally {
      setBusy(false);
    }
  };

  const commitTag = () => {
    const clean = tagDraft.trim().replace(/^#/, '').replace(/\s+/g, '');
    setTagDraft('');
    if (!clean || tagList.length >= MAX_TAGS || tagList.includes(clean)) return;
    set({ tags: [...tagList, clean].map((t) => `#${t}`).join(' ') });
  };
  const removeTag = (t: string) => set({ tags: tagList.filter((x) => x !== t).map((x) => `#${x}`).join(' ') });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.root, { paddingTop: insets.top }]}>
      <BriefHeader onBack={onBack} title="Caption" sub="Last step before review" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Button variant="outline" size="lg" icon={busy ? undefined : 'sparkles'} disabled={busy} onPress={() => void fill()} style={styles.fill}>
          {busy ? (reel ? 'Listening to your clips' : 'Reading your slides') : 'Fill with AI'}
        </Button>
        <Section label="Caption">
          <View style={styles.field}>
            <TextInput
              multiline
              value={caption}
              onChangeText={(v) => set({ caption: v })}
              placeholder="Under the post"
              placeholderTextColor={color.slate400}
              style={styles.input}
            />
          </View>
        </Section>
        <Section label="Hashtags" right={<Text style={styles.count}>{tagList.length} / {MAX_TAGS}</Text>}>
          <View style={[styles.field, styles.tagField]}>
            {tagList.map((t) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>#{t}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove #${t}`} hitSlop={10} onPress={() => removeTag(t)}>
                  <Icon name="x" size={12} color={color.blue700} />
                </Pressable>
              </View>
            ))}
            {tagList.length < MAX_TAGS ? (
              <TextInput
                value={tagDraft}
                onChangeText={(v) => {
                  if (/[\s,]$/.test(v)) {
                    setTagDraft(v.trim());
                    commitTag();
                  } else setTagDraft(v);
                }}
                onSubmitEditing={commitTag}
                onBlur={commitTag}
                blurOnSubmit={false}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={tagList.length ? '' : '#hashtag'}
                placeholderTextColor={color.slate400}
                style={[styles.input, styles.tagInput]}
              />
            ) : null}
          </View>
        </Section>
        <Section label="Search phrase">
          <View style={[styles.field, styles.row]}>
            <Icon name="search" size={18} color={color.slate400} />
            <TextInput
              value={search}
              onChangeText={(v) => set({ search: v })}
              placeholder="What they type into TikTok"
              placeholderTextColor={color.slate400}
              style={[styles.input, styles.flex]}
            />
          </View>
        </Section>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(34, insets.bottom + 14) }]}>
        <Button size="lg" block icon="eye" disabled={!caption.trim()} onPress={onReview} style={styles.review}>
          {reel ? 'Review the reel' : 'Review the post'}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.offWhite },
  body: { paddingHorizontal: 24, paddingBottom: 140, gap: 18 },
  fill: { alignSelf: 'flex-start', height: 56, backgroundColor: color.white, borderColor: color.border },
  section: { gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { flex: 1, fontFamily: typeToken.font.ui, fontSize: 12, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: color.slate500 },
  count: { fontFamily: typeToken.font.ui, fontSize: 12.5, fontWeight: '600', color: color.slate400 },
  field: { paddingVertical: 13, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: color.white, borderWidth: 1, borderColor: color.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  input: { fontFamily: typeToken.font.ui, fontSize: 16, lineHeight: 22, fontWeight: '500', color: color.ink, padding: 0, minHeight: 22 },
  tagField: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 10, borderRadius: 999, backgroundColor: color.blue100 },
  tagText: { fontFamily: typeToken.font.ui, fontSize: 13, fontWeight: '700', color: color.blue700 },
  tagInput: { minWidth: 90, flexGrow: 1 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 14, backgroundColor: color.offWhite },
  review: { height: 56 },
});
