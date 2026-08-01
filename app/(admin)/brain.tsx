import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import { LoadingScreen, Screen, colors } from '../../components/Screen';
import { useAuth } from '../../lib/auth';
import {
  addSourceAccount,
  draftBrandDocs,
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

const DOC_TABS: Array<{ kind: BrandDocKind; label: string; hint: string }> = [
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
    hint: 'How the brand sounds, with real example lines, and what the voice never does.',
  },
  {
    kind: 'learnings',
    label: 'Learnings',
    hint: 'Machine-written, append only. What the engine has learned from performance and refreshes.',
  },
];

export default function BrainScreen() {
  const { profile } = useAuth();
  const [docs, setDocs] = useState<BrandDoc[]>([]);
  const [accounts, setAccounts] = useState<SourceAccount[]>([]);
  const [terms, setTerms] = useState<SourcingTerm[]>([]);
  const [tab, setTab] = useState<BrandDocKind>('product_truth');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
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

  const activeTab = DOC_TABS.find((t) => t.kind === tab) ?? DOC_TABS[0];
  const savedContent = useMemo(
    () => docs.find((d) => d.kind === tab)?.content ?? '',
    [docs, tab],
  );
  const content = draft[tab] ?? savedContent;
  const dirty = content !== savedContent;

  async function save() {
    if (!profile) return;
    setSaving(true);
    try {
      await saveBrandDoc(profile.company_id, tab, content);
      await load();
      setDraft((prev) => ({ ...prev, [tab]: content }));
      Alert.alert('Saved', 'Every future scrape and draft reads this.');
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSaving(false);
    }
  }

  async function draftWithAI() {
    if (tab === 'learnings') return;
    setDrafting(true);
    try {
      await draftBrandDocs([tab]);
      setDraft((prev) => {
        const next = { ...prev };
        delete next[tab];
        return next;
      });
      await load();
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setDrafting(false);
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

  if (loading) return <LoadingScreen label="Loading Brand Brain" />;

  return (
    <Screen style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
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
          This is the engine's knowledge of your brand. Anything you write here
          changes what gets scraped, what passes the gate, and how drafts are
          written.
        </Text>

        <View style={styles.tabRow}>
          {DOC_TABS.map((t) => (
            <Pressable
              key={t.kind}
              style={[styles.tab, tab === t.kind && styles.tabOn]}
              onPress={() => setTab(t.kind)}
            >
              <Text style={[styles.tabText, tab === t.kind && styles.tabTextOn]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.hint}>{activeTab.hint}</Text>

        <TextInput
          style={styles.editor}
          multiline
          value={content}
          onChangeText={(text) => setDraft((prev) => ({ ...prev, [tab]: text }))}
          editable={tab !== 'learnings'}
          placeholder={
            tab === 'learnings'
              ? 'Nothing learned yet. The engine writes here as campaigns run.'
              : 'Write it yourself (best) or draft it with AI below.'
          }
          placeholderTextColor="#9A9AA3"
          textAlignVertical="top"
        />

        {tab !== 'learnings' ? (
          <View style={styles.row}>
            <Pressable
              style={[styles.secondaryBtn, drafting && styles.disabled]}
              disabled={drafting}
              onPress={() => void draftWithAI()}
            >
              <Text style={styles.secondaryText}>
                {drafting ? 'Drafting…' : 'Draft with AI'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, (!dirty || saving) && styles.disabled]}
              disabled={!dirty || saving}
              onPress={() => void save()}
            >
              <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Source accounts</Text>
        <Text style={styles.hint}>
          The scraper pulls from these accounts first. Search terms are the
          fallback. Mute anything that pollutes the feed.
        </Text>

        <View style={styles.addRow}>
          <View style={styles.platformToggle}>
            {(['tiktok', 'instagram'] as const).map((p) => (
              <Pressable
                key={p}
                style={[styles.platformChip, newPlatform === p && styles.tabOn]}
                onPress={() => setNewPlatform(p)}
              >
                <Text
                  style={[styles.tabText, newPlatform === p && styles.tabTextOn]}
                >
                  {p === 'tiktok' ? 'TikTok' : 'IG'}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.handleInput}
            placeholder="@handle"
            placeholderTextColor="#9A9AA3"
            autoCapitalize="none"
            value={newHandle}
            onChangeText={setNewHandle}
            onSubmitEditing={() => void addAccount()}
          />
          <Pressable
            style={[styles.primaryBtn, newHandle.trim() === '' && styles.disabled]}
            disabled={newHandle.trim() === ''}
            onPress={() => void addAccount()}
          >
            <Text style={styles.primaryText}>Add</Text>
          </Pressable>
        </View>

        {accounts.length === 0 ? (
          <Text style={styles.empty}>
            No accounts yet. Add the creators your audience already follows.
            The scraper also discovers accounts on its own as posts pass the
            gate.
          </Text>
        ) : (
          accounts.map((a) => (
            <View key={a.id} style={styles.accountRow}>
              <View style={styles.accountInfo}>
                <Text style={styles.accountHandle}>
                  @{a.handle}
                  <Text style={styles.accountMeta}>
                    {'  '}
                    {a.platform === 'tiktok' ? 'TikTok' : 'Instagram'}
                    {a.kind === 'discovered' ? ' · discovered' : ''}
                    {a.scraped_count > 0
                      ? ` · ${a.keeper_count}/${a.scraped_count} kept`
                      : ''}
                  </Text>
                </Text>
              </View>
              <Pressable style={styles.muteBtn} onPress={() => void toggleAccount(a)}>
                <Text
                  style={[
                    styles.muteText,
                    a.status === 'muted' && styles.muteTextMuted,
                  ]}
                >
                  {a.status === 'muted' ? 'Unmute' : 'Mute'}
                </Text>
              </Pressable>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Saved search terms</Text>
        {terms.length === 0 ? (
          <Text style={styles.empty}>
            No saved terms yet. The scraper remembers terms whose results pass
            the gate and reuses the best ones.
          </Text>
        ) : (
          terms.map((t) => (
            <View key={`${t.kind}:${t.term}`} style={styles.accountRow}>
              <Text style={styles.accountHandle}>
                {t.kind === 'hashtag' ? `#${t.term}` : t.term}
                <Text style={styles.accountMeta}>
                  {'  '}
                  {t.keepers}/{t.scrapes} kept
                </Text>
              </Text>
              <Pressable style={styles.muteBtn} onPress={() => void dropTerm(t)}>
                <Text style={styles.muteText}>Remove</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { paddingHorizontal: 24, paddingBottom: 40, gap: 12 },
  intro: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  tabRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#D9D6D0',
  },
  tabOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  tabText: { color: colors.ink, fontWeight: '600', fontSize: 14 },
  tabTextOn: { color: '#fff' },
  hint: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  editor: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#D9D6D0',
    borderRadius: 14,
    padding: 14,
    minHeight: 260,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  row: { flexDirection: 'row', gap: 10 },
  primaryBtn: {
    backgroundColor: colors.ink,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '700' },
  secondaryBtn: {
    borderWidth: 1.5,
    borderColor: '#D9D6D0',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  secondaryText: { color: colors.ink, fontWeight: '600' },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 12,
  },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  platformToggle: { flexDirection: 'row', gap: 6 },
  platformChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#D9D6D0',
  },
  handleInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#D9D6D0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E6E2DA',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  accountInfo: { flex: 1 },
  accountHandle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  accountMeta: { fontSize: 13, fontWeight: '400', color: colors.muted },
  muteBtn: { paddingVertical: 4, paddingHorizontal: 6 },
  muteText: { color: '#C1121F', fontWeight: '600', fontSize: 14 },
  muteTextMuted: { color: '#2D6A4F' },
  empty: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  disabled: { opacity: 0.5 },
});
