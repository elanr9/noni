// Pick a kind for an empty slot (SSManager.jsx KindScreen): Handheld, Story
// or Freestyle, then the post type for that format. Freestyle saves at once.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MiniDeck } from '../../../components/admin/briefs/MiniDeck';
import { PostTypePeekSheet } from '../../../components/admin/briefs/PostTypePeekSheet';
import {
  editorHref,
  parseFormat,
  parseSlot,
  weekHref,
  type SlotParams,
} from '../../../components/admin/briefs/routes';
import { BriefHeader, KindChip } from '../../../components/shared/briefs';
import { Icon, type IconName } from '../../../components/ui/Icon';
import { addBriefToWeek, type BriefKind } from '../../../lib/briefs-api';
import {
  defaultMustHaves,
  KIND_ORDER,
  kindsFor,
  postTypesFor,
  slotLabel,
  type PostTypeCopy,
} from '../../../lib/brief-copy';
import { useCompany } from '../../../lib/company-context';
import { briefTone, color, radius, shadow, space, type as typeToken } from '../../../theme/tokens';

const REEL_ICONS: IconName[] = ['mic', 'layout-list', 'layout-grid', 'sparkles', 'message-circle', 'images', 'pencil'];
const SLIDESHOW_ICONS: IconName[] = ['layout-list', 'layout-grid', 'zap', 'circle-alert'];

export default function KindScreen() {
  const params = useLocalSearchParams<SlotParams>();
  const { active } = useCompany();
  const format = parseFormat(params.format);
  const slot = parseSlot(params.slot);
  const campaignId = params.campaignId ?? '';
  const briefId = params.briefId ?? '';
  const reel = format === 'reel';
  const KINDS = kindsFor(format);
  const [kind, setKind] = useState<BriefKind | null>(null);
  const [peek, setPeek] = useState<PostTypeCopy | null>(null);
  const [saving, setSaving] = useState(false);

  const slotParams: SlotParams = { campaignId, briefId, slot: String(slot), format, week: params.week };

  async function saveFreestyle() {
    if (saving || !briefId) return;
    setSaving(true);
    try {
      await addBriefToWeek(briefId, {
        kind: 'open',
        postTypeId: null,
        title: 'Freestyle',
        caption: '',
        searchTerm: '',
        hashtags: [],
        slides: [],
        story: null,
        open: { prompt: '', must: defaultMustHaves(active?.name ?? ''), min: 4, max: 10 },
        cta: { text: '', featureId: null },
        creatorNote: null,
      });
      router.dismissTo(weekHref(campaignId, slotLabel(slot), format));
    } finally {
      setSaving(false);
    }
  }

  function pickKind(k: BriefKind) {
    if (k === 'open') {
      void saveFreestyle();
      return;
    }
    setKind(k);
  }

  function continueWith(postType: PostTypeCopy) {
    if (!kind) return;
    setPeek(null);
    router.push(editorHref({ ...slotParams, kind, postTypeKey: postType.key }));
  }

  if (kind) {
    const types = postTypesFor(format);
    const icons = reel ? REEL_ICONS : SLIDESHOW_ICONS;
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <BriefHeader
          title="Kind of post"
          sub={`${KINDS[kind].name} \u00b7 Slot ${slotLabel(slot)}`}
          onBack={() => setKind(null)}
          right={<KindChip kind={kind} format={format} style={styles.headerChip} />}
        />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.grid}>
            {types.map((t, i) => {
              const tone = briefTone.postTypeTiles[i % briefTone.postTypeTiles.length];
              return (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  accessibilityLabel={t.name}
                  onPress={() => setPeek(t)}
                  style={({ pressed }) => [styles.tile, { backgroundColor: tone.bg }, pressed ? styles.pressed : null]}
                >
                  <View style={styles.tileIcon}>
                    <Icon name={icons[i % icons.length]} size={18} color={tone.fg} />
                  </View>
                  <Text style={[styles.tileName, { color: tone.fg }]}>{t.name}</Text>
                  <Text style={styles.tileLine}>{t.line}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        <PostTypePeekSheet postType={peek} kind={kind} format={format} onClose={() => setPeek(null)} onContinue={continueWith} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <BriefHeader
        title={reel ? 'New reel' : 'New slideshow'}
        sub={params.week ? `Slot ${slotLabel(slot)} \u00b7 Week ${params.week}` : `Slot ${slotLabel(slot)}`}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.h2}>What post type do you want to use?</Text>
        {KIND_ORDER.map((k) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityLabel={KINDS[k].name}
            disabled={saving}
            onPress={() => pickKind(k)}
            style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
          >
            <MiniDeck kind={k} />
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>{KINDS[k].name}</Text>
              <Text style={styles.rowLine}>{KINDS[k].line}</Text>
            </View>
            <Icon name="chevron-right" size={18} color={color.slate300} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.offWhite },
  content: { paddingHorizontal: space.gutter, paddingBottom: 40, gap: 12 },
  headerChip: { marginTop: 10 },
  h2: {
    marginTop: 4,
    marginBottom: 6,
    fontFamily: typeToken.font.display,
    fontWeight: '700',
    fontSize: 22,
    lineHeight: 22 * 1.25,
    letterSpacing: -0.4,
    color: color.ink,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 18,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.white,
    ...shadow.shadowCard,
  },
  pressed: { opacity: 0.85 },
  rowBody: { flex: 1, minWidth: 0, gap: 5 },
  rowName: { fontFamily: typeToken.font.display, fontWeight: '700', fontSize: 18, letterSpacing: -0.3, color: color.ink },
  rowLine: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 14, lineHeight: 14 * 1.4, color: color.slate500 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    flexBasis: '46%',
    flexGrow: 1,
    minHeight: 132,
    gap: 10,
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderRadius: radius.lg,
    alignItems: 'flex-start',
  },
  tileIcon: { width: 36, height: 36, borderRadius: 999, backgroundColor: color.whiteA75, alignItems: 'center', justifyContent: 'center' },
  tileName: { fontFamily: typeToken.font.display, fontWeight: '700', fontSize: 17, letterSpacing: -0.3 },
  tileLine: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 13, lineHeight: 13 * 1.35, color: color.ink, opacity: 0.7 },
});
