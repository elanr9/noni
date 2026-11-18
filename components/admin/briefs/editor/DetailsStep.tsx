// Details step (SSManager.jsx HandheldEditor details): Fill with AI, the
// caption, hashtags as chips with a 5 count, and the search phrase. The
// pinned bar previews as the creator or goes to Review.

import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, radius, type as typeToken } from '../../../../theme/tokens';
import { BriefHeader, StepStrip, type BriefStep } from '../../../shared/briefs';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { SectionLabel } from '../../shared';
import { TagField } from './TagField';

export function DetailsStep({
  steps,
  current,
  onJump,
  onBack,
  caption,
  setCaption,
  tags,
  setTags,
  search,
  setSearch,
  busy,
  locked = false,
  onFill,
  checking,
  onCheck,
  onPreview,
  onReview,
}: {
  steps: BriefStep[];
  current: number;
  onJump: (id: string) => void;
  onBack: () => void;
  caption: string;
  setCaption: (v: string) => void;
  tags: string[];
  setTags: (v: string[]) => void;
  search: string;
  setSearch: (v: string) => void;
  busy: boolean;
  /** Any AI call is running; Fill and Check share one busy slot. */
  locked?: boolean;
  onFill: () => void;
  checking: boolean;
  onCheck: () => void;
  onPreview: () => void;
  onReview: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fill, { paddingTop: insets.top }]}>
      <BriefHeader
        title="Details"
        onBack={onBack}
        right={
          <View style={styles.strip}>
            <StepStrip steps={steps} current={current} onJump={onJump} />
          </View>
        }
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" disabled={busy || locked} onPress={onFill} style={({ pressed }) => [styles.fillBtn, pressed ? styles.pressed : null]}>
          {busy ? <ActivityIndicator size="small" color={color.blue500} /> : <Icon name="sparkles" size={20} color={color.ink} />}
          <Text style={styles.fillText}>{busy ? 'Writing' : 'Fill with AI'}</Text>
        </Pressable>
        <View style={styles.section}>
          <SectionLabel>Caption</SectionLabel>
          <View style={styles.field}>
            <TextInput multiline value={caption} onChangeText={setCaption} placeholder="Under the post" placeholderTextColor={color.slate400} style={styles.input} />
          </View>
        </View>
        <View style={styles.section}>
          <SectionLabel right={<Text style={styles.count}>{`${tags.length} / 5`}</Text>}>Hashtags</SectionLabel>
          <TagField tags={tags} onChange={setTags} />
        </View>
        <View style={styles.section}>
          <SectionLabel>Search phrase</SectionLabel>
          <View style={styles.field}>
            <Icon name="search" size={18} color={color.slate400} />
            <TextInput value={search} onChangeText={setSearch} placeholder="What they type into TikTok" placeholderTextColor={color.slate400} style={styles.input} />
          </View>
        </View>
        <Pressable accessibilityRole="button" disabled={checking || locked} onPress={onCheck} style={({ pressed }) => [styles.checkBtn, pressed ? styles.pressed : null]}>
          {checking ? <ActivityIndicator size="small" color={color.blue500} /> : <Icon name="circle-check-big" size={20} color={color.blue500} />}
          <View style={styles.checkText}>
            <Text style={styles.checkTitle}>{checking ? 'Reading it like a viewer' : 'Check the post with AI'}</Text>
            <Text style={styles.checkSub}>A strict second read with fixes you can apply in one tap</Text>
          </View>
        </Pressable>
      </ScrollView>
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 34) }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Preview as creator" onPress={onPreview} style={styles.eye}>
          <Icon name="eye" size={22} color={color.ink} />
        </Pressable>
        <Button size="lg" style={styles.grow} disabled={!caption.trim()} onPress={onReview}>
          Review the post
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: color.offWhite },
  strip: { maxWidth: 220 },
  content: { paddingHorizontal: 24, paddingTop: 6, paddingBottom: 130, gap: 22 },
  fillBtn: { height: 56, borderRadius: 999, backgroundColor: color.white, borderWidth: 1, borderColor: color.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  pressed: { opacity: 0.85 },
  fillText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 17, letterSpacing: -0.2, color: color.ink },
  section: { gap: 10 },
  checkBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 18, borderRadius: radius.sm, backgroundColor: color.blue50 },
  checkText: { flex: 1, gap: 2 },
  checkTitle: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 16, color: color.ink },
  checkSub: { fontFamily: typeToken.font.ui, fontWeight: '400', fontSize: 13, color: color.slate500 },
  field: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 13, paddingHorizontal: 16, borderRadius: radius.sm, backgroundColor: color.white, borderWidth: 1, borderColor: color.border },
  input: { flex: 1, padding: 0, fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 16, lineHeight: 16 * 1.45, color: color.ink },
  count: { fontFamily: typeToken.font.ui, fontWeight: '600', fontSize: 12.5, color: color.slate400 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 24, paddingTop: 14, backgroundColor: color.offWhite },
  eye: { width: 56, height: 56, borderRadius: 999, borderWidth: 1, borderColor: color.border, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
});
