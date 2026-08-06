import { useCallback, useMemo, useRef, useState, type JSX } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FeatureEditSheet, type ClaimStatus } from '../../components/admin/FeatureEditSheet';
import { ClaimCard } from '../../components/admin/insights/ClaimCard';
import { SectionLabel, Segmented, SkeletonCard } from '../../components/admin/shared';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../lib/auth';
import {
  FEATURE_INGEST_MAX_IMAGES,
  addManualProductFeature,
  approveProductFeature,
  getProductType,
  ingestFeatures,
  listProductFeatures,
  rejectProductFeature,
  setProductType,
  updateProductFeature,
  uploadFeatureScreenshot,
  type IngestFeaturesResult,
  type ProductFeature,
  type ProductFeatureInput,
  type ProductType,
} from '../../lib/admin-api';
import { supabase } from '../../lib/supabase';
import {
  borderWidth,
  color,
  radiusAdmin,
  ringFocus,
  space,
  type,
} from '../../theme/tokens';

const PRODUCT_TYPE_OPTIONS = [{ label: 'Software' }, { label: 'Physical' }];

const EMPTY_FORM: ProductFeatureInput = {
  name: '',
  what_it_does: '',
  claim: '',
};

type Progress =
  | { kind: 'upload'; done: number; total: number }
  | { kind: 'analyze' };

function formatIngestResult(r: IngestFeaturesResult): string {
  if (r.inserted === 0) {
    const bits: string[] = ['No new features.'];
    if (r.skipped_existing > 0) {
      bits.push(`${r.skipped_existing} already existed.`);
    }
    if (r.dropped_over_cap > 0) {
      bits.push(
        `${r.dropped_over_cap} more were dropped over the per-run cap, run again to pick up the rest.`,
      );
    }
    if (r.skipped_existing === 0 && r.dropped_over_cap === 0) {
      bits.push('Nothing usable came back from what you sent.');
    }
    return bits.join(' ');
  }

  const bits: string[] = [
    `${r.inserted} feature${r.inserted === 1 ? '' : 's'} found.`,
  ];
  if (r.skipped_existing > 0) {
    bits.push(`${r.skipped_existing} already existed.`);
  }
  if (r.dropped_over_cap > 0) {
    bits.push(
      `${r.dropped_over_cap} more were dropped over the per-run cap, run again to pick up the rest.`,
    );
  }
  return bits.join(' ');
}

/** Rejected rows stay client-readable for the quiet do-not-claim cards;
 * listProductFeatures filters them out. */
async function listRejectedFeatures(): Promise<ProductFeature[]> {
  const { data, error } = await supabase
    .from('product_features')
    .select('*')
    .eq('rejected', true)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export default function FeaturesScreen(): JSX.Element {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const pendingY = useRef(0);

  const [rows, setRows] = useState<ProductFeature[]>([]);
  const [rejectedRows, setRejectedRows] = useState<ProductFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sheetMode, setSheetMode] = useState<'add' | 'edit' | null>(null);
  const [editing, setEditing] = useState<ProductFeature | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);

  const [pageUrl, setPageUrl] = useState('');
  const [urlFocused, setUrlFocused] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  // Survives app blur while this screen stays mounted; cleared only after a successful analyze.
  const [heldPaths, setHeldPaths] = useState<string[]>([]);
  const [ingestFailed, setIngestFailed] = useState(false);
  const [productType, setProductTypeState] = useState<ProductType>('software');
  const [typeBusy, setTypeBusy] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const [features, rejected, type] = await Promise.all([
        listProductFeatures(),
        listRejectedFeatures(),
        getProductType(profile.company_id),
      ]);
      setRows(features);
      setRejectedRows(rejected);
      setProductTypeState(type);
    } catch (e) {
      Alert.alert(
        'Could not load',
        e instanceof Error ? e.message : 'Unknown error',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const pending = useMemo(() => rows.filter((r) => !r.approved), [rows]);
  const approved = useMemo(() => rows.filter((r) => r.approved), [rows]);
  const running = progress !== null;

  const sheetInitial = useMemo<ProductFeatureInput>(() => {
    if (sheetMode === 'edit' && editing) {
      return {
        name: editing.name,
        what_it_does: editing.what_it_does,
        claim: editing.claim,
      };
    }
    return EMPTY_FORM;
  }, [sheetMode, editing]);

  function scrollToPending() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, pendingY.current - 12), animated: true });
    });
  }

  async function applyProductType(next: ProductType) {
    if (!profile) return;
    setTypeBusy(true);
    try {
      await setProductType(profile.company_id, next);
      setProductTypeState(next);
    } catch (e) {
      Alert.alert(
        'Could not save',
        e instanceof Error ? e.message : 'Unknown error',
      );
    } finally {
      setTypeBusy(false);
    }
  }

  function onProductTypeChange(index: number) {
    const next: ProductType = index === 1 ? 'physical' : 'software';
    if (next === productType || typeBusy || running) return;

    if (rows.length > 0) {
      Alert.alert(
        'Change product type?',
        'Existing features were extracted under the previous setting. New runs will use the new type. Reject mismatched rows by hand.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Change', onPress: () => void applyProductType(next) },
        ],
      );
      return;
    }

    void applyProductType(next);
  }

  async function runAnalyze(imageUrls?: string[], url?: string) {
    if (!profile) return;
    setProgress({ kind: 'analyze' });
    setIngestFailed(false);
    try {
      const result = await ingestFeatures({
        companyId: profile.company_id,
        imageUrls,
        pageUrl: url,
      });
      if (imageUrls && imageUrls.length > 0) {
        setHeldPaths([]);
      }
      Alert.alert('Ingest complete', formatIngestResult(result));
      await load();
      scrollToPending();
    } catch (e) {
      if (imageUrls && imageUrls.length > 0) {
        setHeldPaths(imageUrls);
        setIngestFailed(true);
      }
      Alert.alert(
        'Analyze failed',
        e instanceof Error ? e.message : 'Unknown error',
      );
    } finally {
      setProgress(null);
    }
  }

  async function uploadUris(uris: string[]): Promise<{
    paths: string[];
    failures: string[];
  }> {
    if (!profile) return { paths: [], failures: [] };
    const paths: string[] = [];
    const failures: string[] = [];
    const total = uris.length;
    setProgress({ kind: 'upload', done: 0, total });

    for (let i = 0; i < uris.length; i += 2) {
      const pair = uris.slice(i, i + 2);
      const settled = await Promise.all(
        pair.map(async (uri, pairIdx) => {
          const label = `Image ${i + pairIdx + 1}`;
          try {
            const path = await uploadFeatureScreenshot(profile.company_id, uri);
            return { ok: true as const, path, label };
          } catch {
            return { ok: false as const, label };
          } finally {
            setProgress((prev) => {
              const done = (prev?.kind === 'upload' ? prev.done : 0) + 1;
              return { kind: 'upload', done, total };
            });
          }
        }),
      );
      for (const r of settled) {
        if (r.ok) paths.push(r.path);
        else failures.push(r.label);
      }
    }
    return { paths, failures };
  }

  async function onPickScreenshots() {
    if (!profile || running) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos needed', 'Allow photo library access to upload screenshots.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: FEATURE_INGEST_MAX_IMAGES,
      quality: 1,
    });
    if (picked.canceled || picked.assets.length === 0) return;

    const uris = picked.assets.map((a) => a.uri);
    const { paths, failures } = await uploadUris(uris);

    if (failures.length > 0) {
      Alert.alert(
        'Some uploads failed',
        `${failures.join(', ')} failed.${paths.length > 0 ? ' Analyzing the ones that made it.' : ''}`,
      );
    }
    if (paths.length === 0) {
      setProgress(null);
      setIngestFailed(false);
      return;
    }

    setHeldPaths(paths);
    await runAnalyze(paths);
  }

  async function onRetryAnalyze() {
    if (heldPaths.length === 0 || running) return;
    await runAnalyze(heldPaths);
  }

  async function onIngestPage() {
    const url = pageUrl.trim();
    if (!profile || !url || running) return;
    setProgress({ kind: 'analyze' });
    setIngestFailed(false);
    try {
      const result = await ingestFeatures({
        companyId: profile.company_id,
        pageUrl: url,
      });
      setPageUrl('');
      Alert.alert('Ingest complete', formatIngestResult(result));
      await load();
      scrollToPending();
    } catch (e) {
      Alert.alert(
        'Analyze failed',
        e instanceof Error ? e.message : 'Unknown error',
      );
    } finally {
      setProgress(null);
    }
  }

  async function onSave(values: ProductFeatureInput, status: ClaimStatus) {
    if (!profile) return;
    setSheetBusy(true);
    try {
      if (sheetMode === 'add') {
        // Manual claims land approved; the toggle can park one as rejected.
        const row = await addManualProductFeature(profile.company_id, values);
        if (status === 'rejected') await rejectProductFeature(row.id);
      } else if (sheetMode === 'edit' && editing) {
        await updateProductFeature(editing.id, values);
        if (status === 'approved' && !editing.approved) {
          await approveProductFeature(editing.id);
        } else if (status === 'rejected' && !editing.rejected) {
          await rejectProductFeature(editing.id);
        }
      }
      setSheetMode(null);
      setEditing(null);
      await load();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSheetBusy(false);
    }
  }

  async function onApprove(id: string) {
    setBusyId(id);
    try {
      await approveProductFeature(id);
      await load();
    } catch (e) {
      Alert.alert('Could not approve', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusyId(null);
    }
  }

  function onReject(row: ProductFeature) {
    const run = async () => {
      setBusyId(row.id);
      try {
        await rejectProductFeature(row.id);
        await load();
      } catch (e) {
        Alert.alert('Could not reject', e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setBusyId(null);
      }
    };

    if (row.approved) {
      Alert.alert(
        'Reject this claim?',
        'Briefs can only use approved claims. Rejecting removes it from the bank. This cannot be undone from a rescan.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reject', style: 'destructive', onPress: () => void run() },
        ],
      );
      return;
    }
    void run();
  }

  function openEdit(row: ProductFeature) {
    setEditing(row);
    setSheetMode('edit');
  }

  const progressLabel =
    progress?.kind === 'upload'
      ? `Uploading ${progress.done} of ${progress.total}…`
      : progress?.kind === 'analyze'
        ? 'Analyzing…'
        : null;

  const nothingYet = rows.length === 0 && rejectedRows.length === 0;

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
          Approved claims are the only product points the plug can trace to.
          The model phrases them; it does not invent capability.
        </Text>

        <Button
          size="md"
          variant="primary"
          block
          icon="plus"
          disabled={running}
          onPress={() => {
            setEditing(null);
            setSheetMode('add');
          }}
        >
          Add a claim
        </Button>

        {loading ? (
          <View style={styles.rows}>
            <SkeletonCard height={120} radius={radiusAdmin.lg} />
            <SkeletonCard height={120} radius={radiusAdmin.lg} />
          </View>
        ) : nothingYet ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyTitle}>No claims yet</Text>
            <Text style={styles.emptyBody}>
              A claim is one concrete thing a creator can say about the
              product on camera. Name it, say what it does, then write the
              line.
            </Text>
            <View style={styles.example}>
              <Text style={styles.exampleLabel}>Example</Text>
              <Text style={styles.exampleName}>Bulk coach emails</Text>
              <Text style={styles.exampleWhat}>
                Sends a separate personalized email to every coach on the
                user's school list in one action
              </Text>
              <Text style={styles.exampleClaim}>
                “You hit send once and it goes out to fifty coaches, all
                different emails”
              </Text>
            </View>
          </View>
        ) : (
          <>
            <View
              onLayout={(e) => {
                pendingY.current = e.nativeEvent.layout.y;
              }}
            >
              {pending.length > 0 && (
                <>
                  <SectionLabel style={styles.section}>Pending</SectionLabel>
                  <View style={styles.rows}>
                    {pending.map((row) => (
                      <ClaimCard
                        key={row.id}
                        row={row}
                        state="pending"
                        busy={busyId === row.id}
                        onApprove={() => void onApprove(row.id)}
                        onEdit={() => openEdit(row)}
                        onReject={() => onReject(row)}
                      />
                    ))}
                  </View>
                </>
              )}
            </View>

            <SectionLabel style={styles.section}>Approved</SectionLabel>
            {approved.length === 0 ? (
              <Text style={styles.empty}>None approved yet.</Text>
            ) : (
              <View style={styles.rows}>
                {approved.map((row) => (
                  <ClaimCard
                    key={row.id}
                    row={row}
                    state="approved"
                    busy={busyId === row.id}
                    onEdit={() => openEdit(row)}
                    onReject={() => onReject(row)}
                  />
                ))}
              </View>
            )}

            {rejectedRows.length > 0 && (
              <>
                <SectionLabel style={styles.section}>Rejected</SectionLabel>
                <View style={styles.rows}>
                  {rejectedRows.map((row) => (
                    <ClaimCard key={row.id} row={row} state="rejected" />
                  ))}
                </View>
              </>
            )}
          </>
        )}

        <SectionLabel style={styles.section}>Import from your product</SectionLabel>

        <Text style={styles.label}>Product type</Text>
        <Segmented
          options={PRODUCT_TYPE_OPTIONS}
          value={productType === 'physical' ? 1 : 0}
          onChange={onProductTypeChange}
        />

        <Button
          size="md"
          variant="outline"
          block
          disabled={running}
          onPress={() => void onPickScreenshots()}
          style={styles.uploadBtn}
        >
          {`Upload screenshots (up to ${FEATURE_INGEST_MAX_IMAGES})`}
        </Button>

        <Text style={styles.label}>Or paste a product page URL</Text>
        <View style={[styles.urlRing, urlFocused && ringFocus]}>
          <TextInput
            value={pageUrl}
            onChangeText={setPageUrl}
            onFocus={() => setUrlFocused(true)}
            onBlur={() => setUrlFocused(false)}
            placeholder="https://…"
            placeholderTextColor={color.slate400}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!running}
            style={styles.urlField}
          />
        </View>
        <Button
          size="md"
          variant="outline"
          block
          disabled={running || !pageUrl.trim()}
          onPress={() => void onIngestPage()}
        >
          Analyze page
        </Button>

        {progressLabel ? <Text style={styles.progress}>{progressLabel}</Text> : null}

        {ingestFailed && heldPaths.length > 0 && !running ? (
          <Button
            size="md"
            variant="primary"
            block
            onPress={() => void onRetryAnalyze()}
          >
            {`Retry analyze (${heldPaths.length} uploaded)`}
          </Button>
        ) : null}
      </ScrollView>

      <FeatureEditSheet
        visible={sheetMode !== null}
        mode={sheetMode === 'edit' ? 'edit' : 'add'}
        initial={sheetInitial}
        initialStatus={editing !== null && editing.rejected ? 'rejected' : 'approved'}
        busy={sheetBusy}
        onClose={() => {
          if (sheetBusy) return;
          setSheetMode(null);
          setEditing(null);
        }}
        onSave={(values, status) => void onSave(values, status)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.offWhite,
  },
  content: {
    paddingHorizontal: space.gutterAdmin,
    paddingTop: 12,
    gap: 10,
  },
  subtitle: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
    lineHeight: type.size.bodySm * type.leading.body,
    marginBottom: 4,
  },
  label: {
    marginTop: 4,
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate500,
  },
  uploadBtn: {
    marginTop: 8,
  },
  urlRing: {
    borderRadius: radiusAdmin.md,
  },
  urlField: {
    borderWidth: borderWidth.field,
    borderColor: color.lineStrong,
    borderRadius: radiusAdmin.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: type.size.body,
    fontWeight: '600',
    color: color.ink,
    backgroundColor: color.white,
  },
  progress: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
    paddingVertical: 4,
  },
  section: {
    marginTop: 18,
    marginBottom: 8,
  },
  rows: {
    gap: 10,
  },
  empty: {
    fontSize: type.size.bodySm,
    color: color.slate500,
    fontWeight: '600',
  },
  emptyBlock: {
    marginTop: 8,
    padding: 16,
    borderRadius: radiusAdmin.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    backgroundColor: color.white,
    gap: 10,
  },
  emptyTitle: {
    fontSize: type.size.body,
    fontWeight: '700',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  emptyBody: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
    lineHeight: type.size.bodySm * type.leading.body,
  },
  example: {
    marginTop: 4,
    padding: 12,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.fillQuiet,
    gap: 4,
  },
  exampleLabel: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate400,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  exampleName: {
    fontSize: type.size.body,
    fontWeight: '700',
    color: color.ink,
  },
  exampleWhat: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
    lineHeight: type.size.bodySm * type.leading.snug,
  },
  exampleClaim: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.ink,
    lineHeight: type.size.bodySm * type.leading.snug,
    fontStyle: 'italic',
  },
});
