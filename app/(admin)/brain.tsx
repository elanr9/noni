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

import { SectionLabel, SkeletonCard } from '../../components/admin/shared';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { PressableScale } from '../../components/ui/PressableScale';
import { useAuth } from '../../lib/auth';
import {
  addSourceAccount,
  cleanupBrandDoc,
  getSourcingTerms,
  listBrandDocs,
  listSourceAccounts,
  removeSourcingTerm,
  saveBrandDoc,
  setSourceAccountStatus,
  type BrandDoc,
  type BrandDocKind,
  type SourceAccount,
  type SourcingTerm,
} from '../../lib/admin-api';
import {
  borderWidth,
  color,
  radiusAdmin,
  shadow,
  space,
  type,
} from '../../theme/tokens';

/** Only Product and Audience have a cleanup path in brand-ingest. */
type CleanableKind = 'product_truth' | 'audience_niche';

const DOCS: Array<{ kind: BrandDocKind; label: string; hint: string }> = [
  {
    kind: 'product_truth',
    label: 'Product',
    hint: 'What the product does, who pays, killer features, natural plug angles, banned claims.',
  },
  {
    kind: 'audience_niche',
    label: 'Audience',
    hint: 'Who the audience is, their pains and dreams, niche boundaries, accounts they follow, their language.',
  },
  {
    kind: 'voice',
    label: 'Voice',
    hint: 'How posts sound: pacing, phrases the brand leans on, phrases it never says.',
  },
  {
    kind: 'learnings',
    label: 'Learnings',
    hint: 'What performed and why. The generator reads this before writing anything new.',
  },
];

function wordCount(content: string): number {
  const trimmed = content.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

function updatedLabel(doc: BrandDoc | undefined): string {
  if (!doc?.updated_at) return 'Not written yet';
  return `Updated ${new Date(doc.updated_at).toLocaleDateString()}`;
}

export default function BrainScreen() {
  const { profile } = useAuth();
  const [docs, setDocs] = useState<BrandDoc[]>([]);
  const [accounts, setAccounts] = useState<SourceAccount[]>([]);
  const [terms, setTerms] = useState<SourcingTerm[]>([]);
  const [editingKind, setEditingKind] = useState<BrandDocKind | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [newHandle, setNewHandle] = useState('');
  const [newPlatform, setNewPlatform] = useState<'tiktok' | 'instagram'>('tiktok');

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const [d, a, t] = await Promise.all([
        listBrandDocs(),
        listSourceAccounts(),
        getSourcingTerms(profile.company_id),
      ]);
      setDocs(d);
      setAccounts(a);
      setTerms(t);
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

  const editingDoc = DOCS.find((d) => d.kind === editingKind) ?? null;
  const savedContent = useMemo(
    () => (editingKind !== null ? (docs.find((d) => d.kind === editingKind)?.content ?? '') : ''),
    [docs, editingKind],
  );
  const content = editingKind !== null ? (draft[editingKind] ?? savedContent) : '';
  const dirty = content !== savedContent;
  const canCleanUp =
    editingKind === 'product_truth' || editingKind === 'audience_niche';

  async function save() {
    if (!profile || editingKind === null) return;
    setSaving(true);
    try {
      await saveBrandDoc(profile.company_id, editingKind, content);
      await load();
      setDraft((prev) => ({ ...prev, [editingKind]: content }));
      Alert.alert('Saved', 'Every future scrape and draft reads this.');
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSaving(false);
    }
  }

  async function cleanUpWithAI() {
    if (editingKind === null || !canCleanUp) return;
    if (!content.trim()) {
      Alert.alert('Nothing to clean', 'Write the doc first, then clean it up.');
      return;
    }
    setCleaning(true);
    try {
      const cleaned = await cleanupBrandDoc(editingKind as CleanableKind, content);
      setDraft((prev) => ({ ...prev, [editingKind]: cleaned }));
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setCleaning(false);
    }
  }

  async function addAccount() {
    if (!profile || newHandle.trim() === '') return;
    try {
      await addSourceAccount(profile.company_id, newPlatform, newHandle);
      setNewHandle('');
      await load();
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Try again');
    }
  }

  async function toggleAccount(account: SourceAccount) {
    const status = account.status === 'active' ? 'muted' : 'active';
    try {
      await setSourceAccountStatus(account.id, status);
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? { ...a, status } : a)),
      );
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Try again');
    }
  }

  async function dropTerm(term: SourcingTerm) {
    if (!profile) return;
    try {
      setTerms(await removeSourcingTerm(profile.company_id, term.kind, term.term));
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Try again');
    }
  }

  // Editing state: one doc, the editor, Clean up and Save.
  if (editingDoc !== null && editingKind !== null) {
    return (
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.editorHead}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Back to docs"
              onPress={() => setEditingKind(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.backBtn}
            >
              <Icon name="chevron-left" size={20} color={color.ink} />
            </PressableScale>
            <View style={styles.editorTitles}>
              <Text style={styles.editorTitle}>{editingDoc.label}</Text>
              <Text style={styles.editorMeta}>
                {`${wordCount(content)} words`}
              </Text>
            </View>
          </View>
          <Text style={styles.hint}>{editingDoc.hint}</Text>

          <TextInput
            style={styles.editor}
            multiline
            value={content}
            onChangeText={(text) =>
              setDraft((prev) => ({ ...prev, [editingKind]: text }))
            }
            placeholder="Write the doc, then clean it up with AI if you want."
            placeholderTextColor={color.slate400}
            textAlignVertical="top"
          />

          <View style={styles.editorActions}>
            {canCleanUp && (
              <Button
                size="md"
                variant="outline"
                icon="sparkles"
                disabled={cleaning || !content.trim()}
                onPress={() => void cleanUpWithAI()}
              >
                {cleaning ? 'Cleaning…' : 'Clean up'}
              </Button>
            )}
            <Button
              size="md"
              variant="primary"
              disabled={!dirty || saving}
              onPress={() => void save()}
              style={styles.saveBtn}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
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
        <Text style={styles.intro}>
          The doctrine the generator writes against. Anything here changes what
          gets scraped, what passes the gate, and how drafts are written.
        </Text>

        <View style={styles.rows}>
          {loading ? (
            DOCS.map((d) => (
              <SkeletonCard key={d.kind} height={64} radius={radiusAdmin.lg} />
            ))
          ) : (
            DOCS.map((d) => {
              const doc = docs.find((row) => row.kind === d.kind);
              const words = wordCount(doc?.content ?? '');
              return (
                <PressableScale
                  key={d.kind}
                  accessibilityRole="button"
                  onPress={() => setEditingKind(d.kind)}
                  style={[styles.docRow, shadow.shadowCard]}
                >
                  <View style={styles.docBody}>
                    <Text style={styles.docTitle}>{d.label}</Text>
                    <Text style={styles.docMeta}>
                      {words > 0
                        ? `${words} words · ${updatedLabel(doc)}`
                        : updatedLabel(doc)}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={16} color={color.slate300} />
                </PressableScale>
              );
            })
          )}
        </View>

        <SectionLabel style={styles.section}>Source accounts</SectionLabel>
        <Text style={styles.hint}>
          The scraper pulls from these accounts first. Search terms are the
          fallback. Mute anything that pollutes the feed.
        </Text>

        <View style={styles.addRow}>
          <View style={styles.platformToggle}>
            {(['tiktok', 'instagram'] as const).map((p) => {
              const active = newPlatform === p;
              return (
                <PressableScale
                  key={p}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setNewPlatform(p)}
                  style={[styles.platformChip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {p === 'tiktok' ? 'TikTok' : 'IG'}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          <TextInput
            style={styles.handleInput}
            placeholder="@handle"
            placeholderTextColor={color.slate400}
            autoCapitalize="none"
            autoCorrect={false}
            value={newHandle}
            onChangeText={setNewHandle}
            onSubmitEditing={() => void addAccount()}
          />
          <Button
            size="sm"
            disabled={newHandle.trim() === ''}
            onPress={() => void addAccount()}
          >
            Add
          </Button>
        </View>

        {accounts.length === 0 ? (
          <Text style={styles.empty}>
            No accounts yet. Add the creators your audience already follows.
            The scraper also discovers accounts on its own as posts pass the
            gate.
          </Text>
        ) : (
          <View style={styles.chipWrap}>
            {accounts.map((a) => {
              const muted = a.status === 'muted';
              return (
                <PressableScale
                  key={a.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: !muted }}
                  onPress={() => void toggleAccount(a)}
                  style={[styles.accountChip, muted && styles.accountChipMuted]}
                >
                  <Icon
                    name={a.platform === 'tiktok' ? 'music-2' : 'at-sign'}
                    size={12}
                    color={muted ? color.slate400 : color.blue600}
                  />
                  <Text
                    style={[styles.accountChipText, muted && styles.accountChipTextMuted]}
                    numberOfLines={1}
                  >
                    {`@${a.handle}`}
                  </Text>
                  {a.scraped_count > 0 && (
                    <Text style={styles.accountChipCount}>
                      {`${a.keeper_count}/${a.scraped_count}`}
                    </Text>
                  )}
                </PressableScale>
              );
            })}
          </View>
        )}

        <SectionLabel style={styles.section}>Saved search terms</SectionLabel>
        {terms.length === 0 ? (
          <Text style={styles.empty}>
            No saved terms yet. The scraper remembers terms whose results pass
            the gate and reuses the best ones.
          </Text>
        ) : (
          <View style={styles.rows}>
            {terms.map((t) => (
              <View key={`${t.kind}:${t.term}`} style={[styles.termRow, shadow.shadowCard]}>
                <Text style={styles.termText} numberOfLines={1}>
                  {t.kind === 'hashtag' ? `#${t.term}` : t.term}
                </Text>
                <Text style={styles.termCount}>{`Used ${t.scrapes} time${t.scrapes === 1 ? '' : 's'} · ${t.keepers} kept`}</Text>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${t.term}`}
                  onPress={() => void dropTerm(t)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Icon name="x" size={15} color={color.slate400} />
                </PressableScale>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
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
    paddingVertical: 14,
    paddingBottom: 40,
    gap: 10,
  },
  intro: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
    lineHeight: type.size.bodySm * type.leading.body,
    marginBottom: 4,
  },
  rows: {
    gap: 10,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 64,
    paddingHorizontal: 14,
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  docBody: {
    flex: 1,
    gap: 2,
  },
  docTitle: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
  },
  docMeta: {
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate400,
  },
  section: {
    marginTop: 22,
  },
  hint: {
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.slate500,
    lineHeight: type.size.chip * type.leading.body,
  },
  editorHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: radiusAdmin.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  editorTitles: {
    flex: 1,
    gap: 1,
  },
  editorTitle: {
    fontSize: type.size.cardLg,
    fontWeight: '700',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  editorMeta: {
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate400,
  },
  editor: {
    backgroundColor: color.white,
    borderWidth: borderWidth.field,
    borderColor: color.lineStrong,
    borderRadius: radiusAdmin.md,
    padding: 14,
    minHeight: 280,
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    color: color.ink,
  },
  editorActions: {
    flexDirection: 'row',
    gap: 10,
  },
  saveBtn: {
    flex: 1,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  platformToggle: {
    flexDirection: 'row',
    gap: 6,
  },
  platformChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  chipActive: {
    backgroundColor: color.blue500,
    borderColor: color.blue500,
  },
  chipText: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate500,
  },
  chipTextActive: {
    color: color.white,
  },
  handleInput: {
    flex: 1,
    backgroundColor: color.white,
    borderWidth: borderWidth.field,
    borderColor: color.lineStrong,
    borderRadius: radiusAdmin.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.ink,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  accountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue100,
  },
  accountChipMuted: {
    backgroundColor: color.fillQuiet,
  },
  accountChipText: {
    maxWidth: 160,
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.blue700,
  },
  accountChipTextMuted: {
    color: color.slate400,
  },
  accountChipCount: {
    fontSize: type.size.micro,
    fontWeight: '600',
    color: color.slate400,
  },
  termRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  termText: {
    flex: 1,
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
  },
  termCount: {
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate400,
  },
  empty: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
    lineHeight: type.size.bodySm * type.leading.body,
  },
});
