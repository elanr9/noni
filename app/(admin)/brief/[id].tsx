// The brief editor for one week slot. id is the slot's brief row; the kind
// and post type come from the row when it is filled, else from the kind
// picker's params. Freestyle is a single screen; Handheld and Story edit the
// post itself on the canvas. Opened without a campaignId (a Library post that
// belongs to no week) it saves back to the same brief and goes back.
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BriefEditor } from '../../../components/admin/briefs/editor/BriefEditor';
import { OpenEditor } from '../../../components/admin/briefs/OpenEditor';
import {
  parseFormat,
  parseKind,
  parseSlot,
  weekHref,
  type EditorParams,
} from '../../../components/admin/briefs/routes';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import {
  addBriefToWeek,
  getWeekBrief,
  type WeekBrief,
  type WeekBriefInput,
} from '../../../lib/briefs-api';
import { defaultMustHaves, postTypeByKey, slotLabel } from '../../../lib/brief-copy';
import { useCompany } from '../../../lib/company-context';
import { parseIdeaParams } from '../../../lib/idea-chat';
import { listLibraryFeatures, type LibraryFeature } from '../../../lib/library-api';
import { color, space } from '../../../theme/tokens';

export default function BriefEditorScreen() {
  const params = useLocalSearchParams<EditorParams & { id: string }>();
  const { active } = useCompany();
  const briefId = params.id ?? '';
  const campaignId = params.campaignId ?? '';
  const slot = parseSlot(params.slot);
  // A Library post lives outside any week: save returns to where it was opened.
  const inWeek = campaignId.length > 0;
  const leave = useCallback(
    (fmt: ReturnType<typeof parseFormat>) => {
      if (inWeek) router.dismissTo(weekHref(campaignId, slotLabel(slot), fmt));
      else router.back();
    },
    [inWeek, campaignId, slot],
  );
  const [brief, setBrief] = useState<WeekBrief | null | undefined>(undefined);
  const [features, setFeatures] = useState<LibraryFeature[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!briefId) return;
    try {
      const [row, list] = await Promise.all([
        getWeekBrief(briefId),
        active ? listLibraryFeatures(active.companyId).catch(() => []) : Promise.resolve([]),
      ]);
      setLoadError(false);
      setBrief(row);
      setFeatures(list);
    } catch {
      setLoadError(true);
    }
  }, [briefId, active]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const format = brief?.format ?? parseFormat(params.format);
  const kind = brief?.kind ?? parseKind(params.kind) ?? 'handheld';
  const postType = postTypeByKey(brief?.postTypeKey ?? params.postTypeKey);
  // Opened from the idea chat's "Make it": the editor writes the post from it.
  const { ideaCover, ideaSay, ideaCount, ideaAngle } = params;
  const initialIdea = useMemo(
    () => parseIdeaParams({ ideaCover, ideaSay, ideaCount, ideaAngle }),
    [ideaCover, ideaSay, ideaCount, ideaAngle],
  );

  async function save(input: WeekBriefInput) {
    if (saving) return;
    setSaving(true);
    try {
      await addBriefToWeek(briefId, input);
      leave(format);
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (brief === undefined && loadError) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <EmptyState
          icon="circle-alert"
          title="Could not load this post"
          body="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => {
            setLoadError(false);
            void load();
          }}
          style={styles.empty}
        />
      </SafeAreaView>
    );
  }

  if (brief === undefined) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.skeleton}>
          <SkeletonCard height={44} />
          <SkeletonCard height={320} />
        </View>
      </SafeAreaView>
    );
  }

  if (kind === 'open') {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <OpenEditor
          format={format}
          slot={slot}
          week={params.week}
          saving={saving}
          onBack={() => router.back()}
          onSave={() =>
            void save({
              kind: 'open',
              postTypeId: null,
              title: 'Freestyle',
              caption: brief?.caption ?? '',
              searchTerm: brief?.searchTerm ?? '',
              hashtags: brief?.hashtags ?? [],
              slides: [],
              story: null,
              open: brief?.open ?? { prompt: '', must: defaultMustHaves(active?.name ?? '') },
              cta: brief?.cta ?? { text: '', featureId: null },
              creatorNote: brief?.creatorNote ?? null,
            })
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.dark}>
      <BriefEditor
        briefId={briefId}
        companyId={active?.companyId ?? ''}
        companyName={active?.name ?? ''}
        brief={brief}
        format={format}
        kind={kind}
        postType={postType}
        features={features}
        initialIdea={initialIdea}
        onBack={() => router.back()}
        onSaved={() => leave(format)}
        saveLabel={inWeek ? undefined : 'Save'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.offWhite },
  dark: { flex: 1, backgroundColor: color.ink900 },
  skeleton: { gap: 12, paddingHorizontal: space.gutter, paddingTop: 8 },
  empty: { marginTop: 60 },
});
