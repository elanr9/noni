// One week's stamped posts grid. Filling happens in the post editor.
// Legacy briefs (null post_type_id) open in the old sheet.
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BriefEditSheet,
  type BriefEditValues,
} from '../../../components/admin/BriefEditSheet';
import { PostRow } from '../../../components/admin/grid/PostRow';
import { Button } from '../../../components/ui/Button';
import { PressableScale } from '../../../components/ui/PressableScale';
import {
  briefRowState,
  getCampaign,
  listCampaignBriefs,
  parseHookOptions,
  parseTalkingPoints,
  publishCampaign,
  removeBriefFromCampaign,
  updateBrief,
  type BriefFormat,
  type Campaign,
  type CampaignBriefItem,
} from '../../../lib/briefs-api';
import { supabase } from '../../../lib/supabase';
import { color, radius, type } from '../../../theme/tokens';

type Family = 'video' | 'photo_carousel';

function formatDropDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function familyOf(item: CampaignBriefItem): Family {
  const raw = item.briefs.post_types?.family ?? item.briefs.format;
  return raw === 'photo_carousel' ? 'photo_carousel' : 'video';
}

function padHooks(options: string[]): string[] {
  return [options[0] ?? '', options[1] ?? ''];
}

export default function WeekDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [items, setItems] = useState<CampaignBriefItem[]>([]);
  const [hashtagBank, setHashtagBank] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [side, setSide] = useState<Family>('video');
  const [legacyItem, setLegacyItem] = useState<CampaignBriefItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const latest = await getCampaign(id);
      setCampaign(latest);
      const [campaignItems, { data: brand }] = await Promise.all([
        latest ? listCampaignBriefs(latest.id) : Promise.resolve([]),
        supabase.from('brand_profiles').select('hashtag_bank').maybeSingle(),
      ]);
      setItems(campaignItems);
      setHashtagBank(brand?.hashtag_bank ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const editable = campaign?.status === 'draft';
  const hasStampedPosts = items.some((i) => i.briefs.post_type_id !== null);
  const needsWeekSetup =
    campaign?.status === 'draft' && !hasStampedPosts;

  const rows = useMemo(
    () =>
      items.map((item) => ({
        item,
        family: familyOf(item),
        state: briefRowState(item.briefs, item.briefs.post_types),
      })),
    [items],
  );

  const videoRows = rows.filter((r) => r.family === 'video');
  const slideshowRows = rows.filter((r) => r.family === 'photo_carousel');
  const filledCount = (list: typeof rows) =>
    list.filter((r) => r.state === 'filled' || r.state === 'complete').length;

  const typeSplit = useMemo(
    () =>
      campaign && campaign.type_split && typeof campaign.type_split === 'object'
        ? (campaign.type_split as Record<string, number>)
        : {},
    [campaign],
  );
  const splitChips = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const row of rows) {
      const t = row.item.briefs.post_types;
      if (!t || t.family !== side) continue;
      const entry = counts.get(t.key) ?? { label: t.label, count: 0 };
      entry.count += 1;
      counts.set(t.key, entry);
    }
    for (const [key, pool] of Object.entries(typeSplit)) {
      if (pool > 0 && !counts.has(key)) {
        const anyRow = items.find((i) => i.briefs.post_types?.key === key);
        if (anyRow?.briefs.post_types?.family === side) {
          counts.set(key, { label: anyRow.briefs.post_types.label, count: 0 });
        }
      }
    }
    return [...counts.entries()].map(([key, entry]) => ({
      key,
      label: entry.label,
      count: entry.count,
      pool: typeSplit[key] ?? 0,
    }));
  }, [rows, typeSplit, side, items]);

  const activeRows = side === 'video' ? videoRows : slideshowRows;

  const reviewedCount = rows.filter((r) =>
    r.item.briefs.post_type_id === null
      ? Boolean(r.item.briefs.hook?.trim() || r.item.briefs.script?.trim())
      : r.state === 'complete',
  ).length;
  const publishReady = rows.length > 0 && reviewedCount === rows.length;
  const videoTarget = campaign?.video_target ?? 20;
  const slideshowTarget = campaign?.slideshow_target ?? 10;

  function openRow(item: CampaignBriefItem) {
    if (item.briefs.post_type_id === null) {
      setLegacyItem(item);
      return;
    }
    router.push(`/(admin)/post/${item.brief_id}`);
  }

  const legacyValues = useMemo<BriefEditValues>(() => {
    const b = legacyItem?.briefs;
    if (!b) {
      return {
        title: '',
        format: 'video',
        hook: '',
        hookOptions: ['', ''],
        chosenHookIndex: 0,
        talkingPoints: [],
        hashtags: [],
        searchQuery: '',
        script: '',
        caption: '',
        whyItWorks: '',
        targetWords: 380,
      };
    }
    const points = parseTalkingPoints(b.talking_points);
    const options = parseHookOptions(b.hook_options);
    const legacy = points.length === 0 && Boolean(b.script?.trim());
    const hookOptions = padHooks(options);
    const chosenIndex = b.hook ? hookOptions.indexOf(b.hook) : 0;
    return {
      title: b.title,
      format: (b.format === 'photo_carousel'
        ? 'photo_carousel'
        : 'video') as BriefFormat,
      hook: legacy ? (b.hook ?? '') : '',
      hookOptions,
      chosenHookIndex: chosenIndex >= 0 ? chosenIndex : 0,
      talkingPoints: points,
      hashtags: b.hashtags,
      searchQuery: b.search_phrase ?? '',
      script: b.script ?? '',
      caption: b.caption ?? '',
      whyItWorks: b.why_it_works ?? '',
      targetWords: b.target_words,
    };
  }, [legacyItem]);

  async function saveLegacy(values: BriefEditValues) {
    if (!legacyItem) return;
    setSaving(true);
    try {
      const legacy =
        values.talkingPoints.length === 0 && values.script.trim().length > 0;
      const chosenHook = legacy
        ? values.hook.trim() || null
        : values.hookOptions[values.chosenHookIndex]?.trim() || null;
      await updateBrief(legacyItem.brief_id, {
        title: values.title,
        format: values.format,
        hook: chosenHook,
        hook_options: legacy ? [] : values.hookOptions,
        talking_points: values.talkingPoints,
        hashtags: values.hashtags,
        search_phrase: values.searchQuery.trim() || null,
        point_count: legacy ? null : values.talkingPoints.length,
        target_words: values.targetWords,
        script: values.script || null,
        caption: values.caption || null,
        why_it_works: values.whyItWorks || null,
      });
      setLegacyItem(null);
      await load();
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSaving(false);
    }
  }

  async function removeLegacyFromCampaign() {
    if (!campaign || !legacyItem) return;
    try {
      await removeBriefFromCampaign(campaign.id, legacyItem.brief_id);
      setLegacyItem(null);
      await load();
    } catch (e) {
      Alert.alert('Remove failed', e instanceof Error ? e.message : 'Try again');
    }
  }

  function confirmPublish() {
    if (!campaign) return;
    Alert.alert(
      'Publish this campaign?',
      `Every creator gets their week from these ${items.length} briefs, dropping ${formatDropDate(campaign.drop_date)}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Publish', onPress: () => void publish() },
      ],
    );
  }

  async function publish() {
    if (!campaign) return;
    setPublishing(true);
    try {
      const result = await publishCampaign(campaign.id);
      Alert.alert(
        result.scheduled ? 'Campaign scheduled' : 'Campaign is live',
        result.scheduled
          ? `${result.assignments_written} assignments across ${result.creators} creators. Creators get the push Sunday at 8PM Eastern.`
          : `${result.assignments_written} assignments across ${result.creators} creators. Notifications are on the way.`,
      );
      await load();
    } catch (e) {
      Alert.alert('Publish failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      >
        <Text style={styles.subtitle}>
          {campaign
            ? `Drops ${formatDropDate(campaign.drop_date)}`
            : loading
              ? 'Loading…'
              : 'Week not found'}
        </Text>

        {!loading && needsWeekSetup ? (
          <View style={styles.startCard}>
            <Text style={styles.startNote}>
              This week has no stamped posts yet. Run week setup for the empty
              Videos and Slideshows grid.
            </Text>
            <Button
              size="md"
              variant="primary"
              icon="plus"
              onPress={() => router.push('/(admin)/week-setup')}
            >
              Start week
            </Button>
          </View>
        ) : null}

        {campaign ? (
          <>
            <View style={styles.switcher}>
              {(
                [
                  {
                    key: 'video' as Family,
                    label: `Videos ${filledCount(videoRows)}/${videoTarget}`,
                  },
                  {
                    key: 'photo_carousel' as Family,
                    label: `Slideshows ${filledCount(slideshowRows)}/${slideshowTarget}`,
                  },
                ]
              ).map((option) => {
                const selected = side === option.key;
                return (
                  <PressableScale
                    key={option.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setSide(option.key)}
                    style={[styles.switchBtn, selected && styles.switchBtnOn]}
                  >
                    <Text
                      style={[
                        styles.switchText,
                        selected && styles.switchTextOn,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>

            {splitChips.length > 0 ? (
              <View style={styles.splitRow}>
                {splitChips.map((chip) => {
                  const drifted = chip.count !== chip.pool;
                  return (
                    <View
                      key={chip.key}
                      style={[styles.splitChip, drifted && styles.splitChipOff]}
                    >
                      <Text
                        style={[
                          styles.splitText,
                          drifted && styles.splitTextOff,
                        ]}
                      >
                        {chip.label} {chip.count}/{chip.pool}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.rows}>
              {activeRows.map((row) => (
                <PostRow
                  key={row.item.brief_id}
                  brief={row.item.briefs}
                  state={row.state}
                  disabled={!editable}
                  onPress={() => openRow(row.item)}
                />
              ))}
              {activeRows.length === 0 && !loading ? (
                <Text style={styles.emptyGrid}>
                  {editable
                    ? 'No posts on this side yet.'
                    : 'Nothing here for this week.'}
                </Text>
              ) : null}
            </View>

            {editable && items.length > 0 ? (
              <View style={styles.footerRow}>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={publishing || !publishReady}
                  onPress={confirmPublish}
                >
                  {publishing
                    ? 'Publishing…'
                    : publishReady
                      ? 'Publish'
                      : `Publish ${reviewedCount}/${rows.length} reviewed`}
                </Button>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <BriefEditSheet
        visible={legacyItem !== null}
        mode="edit"
        initial={legacyValues}
        hashtagBank={hashtagBank}
        warnings={[]}
        exampleUrl={legacyItem?.briefs.example_url ?? null}
        busy={saving}
        onClose={() => setLegacyItem(null)}
        onSave={(values) => void saveLegacy(values)}
        onRemove={() => void removeLegacyFromCampaign()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  subtitle: {
    marginBottom: 16,
    fontSize: type.size.bodySm,
    color: color.slate400,
  },
  startCard: {
    gap: 12,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: color.white,
    marginBottom: 16,
  },
  startNote: {
    fontSize: type.size.bodySm,
    color: color.slate500,
    lineHeight: type.size.bodySm * type.leading.body,
  },
  switcher: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  switchBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
    backgroundColor: color.fillQuiet,
  },
  switchBtnOn: { backgroundColor: color.blue100 },
  switchText: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.slate500,
  },
  switchTextOn: { color: color.blue700 },
  splitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  splitChip: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
  },
  splitChipOff: { backgroundColor: color.amberSoft },
  splitText: {
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.slate500,
  },
  splitTextOff: { color: color.amber },
  rows: { gap: 10 },
  emptyGrid: {
    paddingVertical: 32,
    textAlign: 'center',
    fontSize: type.size.bodySm,
    color: color.slate400,
  },
  footerRow: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
});
