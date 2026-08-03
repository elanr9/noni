import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BacklogSheet } from '../../../components/admin/BacklogSheet';
import {
  BriefEditSheet,
  dayLabels,
  type BriefEditValues,
} from '../../../components/admin/BriefEditSheet';
import { Button } from '../../../components/ui/Button';
import { FormatPill } from '../../../components/ui/FormatPill';
import { PressableScale } from '../../../components/ui/PressableScale';
import { useAuth } from '../../../lib/auth';
import {
  addBriefToCampaign,
  createBrief,
  createCampaign,
  getLatestCampaign,
  ingestBrief,
  listBacklogBriefs,
  listCampaignBriefs,
  publishCampaign,
  removeBriefFromCampaign,
  setPinnedDay,
  updateBrief,
  type Brief,
  type BriefDraft,
  type Campaign,
  type CampaignBriefItem,
} from '../../../lib/briefs-api';
import { borderWidth, color, radius, ringFocus, shadow, type } from '../../../theme/tokens';

const TARGET_BRIEFS = 30;

function nextSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() + (((7 - d.getDay()) % 7) || 7));
  return d.toISOString().slice(0, 10);
}

function formatDropDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

const EMPTY_VALUES: BriefEditValues = {
  title: '',
  format: 'video',
  hook: '',
  script: '',
  caption: '',
  whyItWorks: '',
  pinnedDay: null,
};

type SheetState =
  | { mode: 'create'; draft: BriefDraft | null }
  | { mode: 'edit'; item: CampaignBriefItem };

export default function CreateScreen() {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [items, setItems] = useState<CampaignBriefItem[]>([]);
  const [backlog, setBacklog] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [url, setUrl] = useState('');
  const [urlFocused, setUrlFocused] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [saving, setSaving] = useState(false);
  const [backlogVisible, setBacklogVisible] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      const latest = await getLatestCampaign();
      setCampaign(latest);
      const [campaignItems, backlogBriefs] = await Promise.all([
        latest ? listCampaignBriefs(latest.id) : Promise.resolve([]),
        listBacklogBriefs(latest?.status === 'draft' ? latest.id : undefined),
      ]);
      setItems(campaignItems);
      setBacklog(backlogBriefs);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const editable = campaign?.status === 'draft';
  const labels = useMemo(() => dayLabels(campaign?.drop_date ?? null), [campaign]);

  async function startCampaign() {
    if (!profile) return;
    setStarting(true);
    try {
      const drop = nextSunday();
      await createCampaign({
        companyId: profile.company_id,
        name: `Week of ${formatDropDate(drop)}`,
        dropDate: drop,
      });
      await load();
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setStarting(false);
    }
  }

  async function draftFromLink() {
    const link = url.trim();
    if (!link) return;
    setIngesting(true);
    try {
      const draft = await ingestBrief(link);
      setUrl('');
      setSheet({ mode: 'create', draft });
    } catch (e) {
      Alert.alert('Could not draft', e instanceof Error ? e.message : 'Try again');
    } finally {
      setIngesting(false);
    }
  }

  async function saveSheet(values: BriefEditValues) {
    if (!profile || !campaign || !sheet) return;
    setSaving(true);
    try {
      if (sheet.mode === 'create') {
        const brief = await createBrief({
          companyId: profile.company_id,
          createdBy: profile.id,
          input: {
            title: values.title,
            format: values.format,
            hook: values.hook || null,
            script: values.script || null,
            caption: values.caption || null,
            why_it_works: values.whyItWorks || null,
            example_url: sheet.draft?.example_url ?? null,
            example_transcript: sheet.draft?.example_transcript ?? null,
          },
        });
        await addBriefToCampaign({
          campaignId: campaign.id,
          briefId: brief.id,
          companyId: profile.company_id,
          pinnedDay: values.pinnedDay,
        });
      } else {
        await updateBrief(sheet.item.brief_id, {
          title: values.title,
          format: values.format,
          hook: values.hook || null,
          script: values.script || null,
          caption: values.caption || null,
          why_it_works: values.whyItWorks || null,
        });
        if (values.pinnedDay !== sheet.item.pinned_day) {
          await setPinnedDay(campaign.id, sheet.item.brief_id, values.pinnedDay);
        }
      }
      setSheet(null);
      await load();
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSaving(false);
    }
  }

  async function removeFromCampaign() {
    if (!campaign || sheet?.mode !== 'edit') return;
    try {
      await removeBriefFromCampaign(campaign.id, sheet.item.brief_id);
      setSheet(null);
      await load();
    } catch (e) {
      Alert.alert('Remove failed', e instanceof Error ? e.message : 'Try again');
    }
  }

  async function addFromBacklog(brief: Brief) {
    if (!profile || !campaign) return;
    setAddingId(brief.id);
    try {
      await addBriefToCampaign({
        campaignId: campaign.id,
        briefId: brief.id,
        companyId: profile.company_id,
      });
      await load();
    } catch (e) {
      Alert.alert('Add failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setAddingId(null);
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
        'Campaign is live',
        `${result.assignments_written} assignments across ${result.creators} creators. Notifications are on the way.`,
      );
      await load();
    } catch (e) {
      Alert.alert('Publish failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setPublishing(false);
    }
  }

  const briefValues = useMemo<BriefEditValues>(() => {
    if (sheet?.mode === 'create' && sheet.draft) {
      return {
        title: sheet.draft.title,
        format: sheet.draft.format,
        hook: sheet.draft.hook,
        script: sheet.draft.script,
        caption: sheet.draft.caption,
        whyItWorks: sheet.draft.why_it_works,
        pinnedDay: null,
      };
    }
    if (sheet?.mode === 'edit') {
      const b = sheet.item.briefs;
      return {
        title: b.title,
        format: b.format === 'photo_carousel' ? 'photo_carousel' : 'video',
        hook: b.hook ?? '',
        script: b.script ?? '',
        caption: b.caption ?? '',
        whyItWorks: b.why_it_works ?? '',
        pinnedDay: sheet.item.pinned_day,
      };
    }
    return EMPTY_VALUES;
  }, [sheet]);

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 6, paddingBottom: 116 },
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
        <Text style={styles.h1}>Create</Text>
        <Text style={styles.subtitle}>
          {campaign
            ? `${campaign.name} · drops ${formatDropDate(campaign.drop_date)}`
            : 'Author the week, publish once, done.'}
        </Text>

        {!loading && (!campaign || campaign.status === 'published') ? (
          <View style={styles.startCard}>
            {campaign ? (
              <Text style={styles.startNote}>
                Last campaign published with {items.length} briefs. Creators have
                their week.
              </Text>
            ) : (
              <Text style={styles.startNote}>
                A campaign is one week of briefs shared by the whole roster.
              </Text>
            )}
            <Button
              size="md"
              variant="primary"
              icon="plus"
              disabled={starting}
              onPress={() => void startCampaign()}
            >
              {starting ? 'Starting…' : 'Start next week'}
            </Button>
          </View>
        ) : null}

        {editable ? (
          <>
            <View style={styles.pasteCard}>
              <Text style={styles.label}>Paste a TikTok or Instagram link</Text>
              <View style={[styles.urlRing, urlFocused && ringFocus]}>
                <TextInput
                  value={url}
                  onChangeText={setUrl}
                  onFocus={() => setUrlFocused(true)}
                  onBlur={() => setUrlFocused(false)}
                  placeholder="https://www.tiktok.com/@…"
                  placeholderTextColor={color.slate400}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={styles.urlField}
                />
              </View>
              <Button
                size="md"
                variant="primary"
                icon="sparkles"
                block
                disabled={ingesting || !url.trim()}
                onPress={() => void draftFromLink()}
              >
                {ingesting ? 'Watching the post…' : 'Draft brief'}
              </Button>
              <View style={styles.secondaryRow}>
                <Button
                  size="sm"
                  variant="tint"
                  onPress={() => setSheet({ mode: 'create', draft: null })}
                >
                  Write from scratch
                </Button>
                <Button
                  size="sm"
                  variant="tint"
                  onPress={() => setBacklogVisible(true)}
                >
                  {`Backlog (${backlog.length})`}
                </Button>
              </View>
            </View>

            <View style={styles.gridHeader}>
              <Text style={styles.gridTitle}>
                {items.length} of {TARGET_BRIEFS} briefs
              </Text>
              {items.length > 0 ? (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={publishing}
                  onPress={confirmPublish}
                >
                  {publishing ? 'Publishing…' : 'Publish'}
                </Button>
              ) : null}
            </View>
          </>
        ) : null}

        {campaign ? (
          <View style={styles.grid}>
            {items.map((item) => {
              const brief = item.briefs;
              return (
                <PressableScale
                  key={item.brief_id}
                  accessibilityRole="button"
                  disabled={!editable}
                  onPress={() => setSheet({ mode: 'edit', item })}
                  style={styles.card}
                >
                  <View style={styles.cardTop}>
                    <FormatPill
                      compact
                      format={
                        brief.format === 'photo_carousel' ? 'photo_carousel' : 'video'
                      }
                    />
                    {item.pinned_day !== null ? (
                      <View style={styles.pinChip}>
                        <Text style={styles.pinChipText}>
                          {labels[item.pinned_day]}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {brief.title}
                  </Text>
                  {brief.hook ? (
                    <Text style={styles.cardHook} numberOfLines={2}>
                      {brief.hook}
                    </Text>
                  ) : null}
                </PressableScale>
              );
            })}
            {editable && items.length === 0 ? (
              <Text style={styles.emptyGrid}>
                No briefs yet. Paste a link above or pull from the backlog.
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <BriefEditSheet
        visible={sheet !== null}
        mode={sheet?.mode ?? 'create'}
        initial={briefValues}
        dropDate={campaign?.drop_date ?? null}
        exampleUrl={
          sheet?.mode === 'create'
            ? sheet.draft?.example_url ?? null
            : sheet?.item.briefs.example_url ?? null
        }
        busy={saving}
        onClose={() => setSheet(null)}
        onSave={(values) => void saveSheet(values)}
        onRemove={sheet?.mode === 'edit' ? () => void removeFromCampaign() : undefined}
      />

      <BacklogSheet
        visible={backlogVisible}
        briefs={backlog}
        addingId={addingId}
        onAdd={(brief) => void addFromBacklog(brief)}
        onClose={() => setBacklogVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
  content: { paddingHorizontal: 20 },
  h1: {
    fontSize: type.size.title,
    fontWeight: '800',
    color: color.ink,
    letterSpacing: type.tracking.title,
  },
  subtitle: {
    marginTop: 4,
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
    ...shadow.shadowCard,
  },
  startNote: {
    fontSize: type.size.bodySm,
    color: color.slate500,
    lineHeight: type.size.bodySm * type.leading.body,
  },
  pasteCard: {
    gap: 10,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: color.white,
    marginBottom: 16,
    ...shadow.shadowCard,
  },
  label: {
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.slate400,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
  },
  urlRing: { borderRadius: radius.sm },
  urlField: {
    borderWidth: borderWidth.field,
    borderColor: color.lineStrong,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: type.size.body,
    color: color.ink,
    backgroundColor: color.white,
  },
  secondaryRow: { flexDirection: 'row', gap: 8 },
  gridHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  gridTitle: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.slate500,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  card: {
    width: '48.5%',
    padding: 12,
    gap: 6,
    borderRadius: radius.md,
    backgroundColor: color.white,
    ...shadow.shadowCard,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  pinChip: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
  },
  pinChipText: {
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.blue700,
  },
  cardTitle: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
  },
  cardHook: {
    fontSize: type.size.meta,
    color: color.slate500,
  },
  emptyGrid: {
    width: '100%',
    paddingVertical: 32,
    textAlign: 'center',
    fontSize: type.size.bodySm,
    color: color.slate400,
  },
});
