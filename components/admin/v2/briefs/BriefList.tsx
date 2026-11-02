import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';

import { JUST_MADE_MS, freshJustMade, useLibStore } from '../../../../lib/brief-library-api';
import { BRIEF_TYPES, TYPE_META, briefHay, type Brief, type BriefKind, type BriefType } from '../../../../lib/brief-library';
import { color, motion, radius, shadow, space, text } from '../../../../theme/v2';
import { Button, Chip, Empty, FilterButton, Icon, Label, Press, RootTitle, Seg, Sheet, useTabBarInset } from '../../../v2';
import { BriefCard, markWords } from './BriefCard';
import { TypeTile } from './TypeTile';

type SortKey = 'new' | 'used' | 'old' | 'az';
const SORTS: [SortKey, string][] = [['new', 'Newest'], ['used', 'Most used'], ['old', 'Oldest'], ['az', 'A to Z']];
type Lane = 'All' | BriefKind;

/** Query words that act as filters: kind words and the first word of each type. */
const KEYWORDS: Record<string, ['kind', BriefKind] | ['type', BriefType]> = {
  guided: ['kind', 'Guided'],
  outline: ['kind', 'Outline'],
  outlines: ['kind', 'Outline'],
  ...Object.fromEntries(BRIEF_TYPES.map((t) => [t.split(' ')[0].toLowerCase(), ['type', t] as ['type', BriefType]])),
};

export interface BriefListProps {
  title: string;
  right?: ReactNode;
  onOpen: (b: Brief) => void;
  /** Posts made per brief id, for the Most used sort. */
  uses?: (b: Brief) => number;
  /** Pushed screen: 52px header with a back chevron instead of the root title, no tab bar inset. */
  back?: boolean;
  /** Empty copy when nothing matches and there is no query. */
  empty?: string;
}

/** Pinned title, search, Guided / Outlines Seg and filter; only the cards scroll. */
export function BriefList({ title, right, onOpen, uses, back = false, empty }: BriefListProps) {
  const briefs = useLibStore((s) => s.briefs);
  const justMadeRaw = useLibStore((s) => s.justMade);
  const clearJustMade = useLibStore((s) => s.clearJustMade);
  const jm = freshJustMade(justMadeRaw);
  const barInset = useTabBarInset();

  const [kind, setKind] = useState<Lane>(jm && jm.ids.length > 1 ? 'All' : 'Guided');
  const [q, setQ] = useState('');
  const [type, setType] = useState<'All' | BriefType>('All');
  const [sort, setSort] = useState<SortKey>('new');
  const [filt, setFilt] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pop, setPop] = useState(true);

  useEffect(() => {
    if (!jm) return;
    const t = setTimeout(clearJustMade, Math.max(1000, JUST_MADE_MS - (Date.now() - jm.at)));
    return () => clearTimeout(t);
  }, [jm, clearJustMade]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const tokens = words.map((w) => KEYWORDS[w]).filter((t): t is NonNullable<typeof t> => !!t);
  const free = words.filter((w) => !KEYWORDS[w]);
  const qKind = tokens.find((t) => t[0] === 'kind')?.[1] as BriefKind | undefined;
  const qType = tokens.find((t) => t[0] === 'type')?.[1] as BriefType | undefined;
  const effKind: Lane = qKind ?? kind;
  const effType = qType ?? type;
  const matchFree = (b: Brief) => free.every((w) => briefHay(b).includes(w));
  const usedCount = (b: Brief) => b.uses ?? uses?.(b) ?? 0;

  const list = useMemo(() => {
    let out = briefs.filter((b) => (effKind === 'All' || b.kind === effKind) && (effType === 'All' || b.type === effType) && matchFree(b));
    out = out.slice().sort((a, b) => (sort === 'az' ? a.title.localeCompare(b.title) : sort === 'old' ? a.ts - b.ts : sort === 'used' ? usedCount(b) - usedCount(a) || b.ts - a.ts : b.ts - a.ts));
    if (jm) out = out.filter((b) => jm.ids.includes(b.id)).concat(out.filter((b) => !jm.ids.includes(b.id)));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefs, effKind, effType, sort, q, jm]);

  const count = (k: BriefKind) => briefs.filter((b) => b.kind === k && (effType === 'All' || b.type === effType) && matchFree(b)).length;
  const active = (type !== 'All' ? 1 : 0) + (sort !== 'new' ? 1 : 0);
  const showPop = focus && pop && words.length > 0;

  const popGroup = (k: BriefKind, label: string) => {
    const rows = briefs.filter((b) => b.kind === k && (!qKind || qKind === k) && (effType === 'All' || b.type === effType) && matchFree(b)).slice(0, 4);
    if (!rows.length) return null;
    return (
      <View key={k} style={{ paddingTop: 10, paddingBottom: 6, borderTopWidth: 1, borderTopColor: color.grey1 }}>
        <Text style={{ fontSize: 13, lineHeight: 16, fontWeight: '700', color: color.grey4, paddingHorizontal: 16, paddingBottom: 6 }}>{label}</Text>
        {rows.map((b) => (
          <Press
            key={b.id}
            onPress={() => {
              setFocus(false);
              onOpen(b);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 16 }}
          >
            <TypeTile type={b.type} size={24} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '500', color: color.ink }}>
              {markWords(b.title, free)}
            </Text>
            <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', color: color.grey3 }}>{b.type}</Text>
          </Press>
        ))}
      </View>
    );
  };
  const groups = [popGroup('Guided', 'Guided'), popGroup('Outline', 'Outlines')].filter(Boolean);

  const opt = (on: boolean, label: string, onPress: () => void) => (
    <Press key={label} onPress={onPress} style={{ height: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: on ? color.blue : color.grey1, justifyContent: 'center' }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: on ? color.white : color.ink }}>{label}</Text>
    </Press>
  );

  const segOptions = [
    ...(effKind === 'All' ? [{ key: 'All' as Lane, label: 'All', count: count('Guided') + count('Outline') }] : []),
    { key: 'Guided' as Lane, label: 'Guided', count: count('Guided'), tone: 'blue' as const },
    { key: 'Outline' as Lane, label: 'Outlines', count: count('Outline'), tone: 'purple' as const },
  ];

  return (
    <View style={{ flex: 1, paddingBottom: back ? 0 : barInset }}>
      <View style={{ paddingHorizontal: space.screen, paddingBottom: 10, zIndex: 5 }}>
        {back ? (
          <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', marginLeft: -16, marginRight: -12 }}>
            <Press accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="chevron_left" size={32} color={color.ink} />
            </Press>
            <Text style={[text.row, { flex: 1 }]}>{title}</Text>
            {right}
          </View>
        ) : (
          <RootTitle title={title} right={right} />
        )}
        <View style={{ marginBottom: 12, zIndex: 5 }}>
          <View style={{ height: 48, borderRadius: 16, backgroundColor: color.card, flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 8, borderWidth: 2, borderColor: showPop ? color.blue : 'transparent', ...shadow.card }}>
            <Icon name="search" size={22} color={color.grey3} />
            <TextInput
              value={q}
              onChangeText={(t) => {
                setQ(t);
                setPop(true);
              }}
              onFocus={() => {
                setFocus(true);
                setPop(true);
              }}
              onBlur={() => setTimeout(() => setFocus(false), 120)}
              placeholder="Search"
              placeholderTextColor={color.grey3}
              autoCorrect={false}
              returnKeyType="search"
              style={{ flex: 1, height: 44, paddingHorizontal: 8, fontSize: 16, color: color.ink }}
            />
            {q ? (
              <Press accessibilityLabel="Clear" onPress={() => setQ('')} style={{ width: 32, height: 32, borderRadius: radius.pill, backgroundColor: color.grey1, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="close" size={18} color={color.ink} />
              </Press>
            ) : null}
          </View>
          {showPop ? (
            <Animated.View entering={FadeIn.duration(120)} style={{ position: 'absolute', left: 0, right: 0, top: 54, backgroundColor: color.card, borderRadius: 16, maxHeight: 380, overflow: 'hidden', paddingBottom: 4, zIndex: 20, ...shadow.float }}>
              <ScrollView keyboardShouldPersistTaps="always" bounces={false}>
                {tokens.length ? (
                  <View style={{ flexDirection: 'row', gap: 6, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 10 }}>
                    {tokens.map(([, v]) => (
                      <Chip key={v} tone={v === 'Outline' ? 'purple' : v === 'Guided' ? 'blue' : TYPE_META[v as BriefType].tone} icon="filter_alt" label={v} />
                    ))}
                  </View>
                ) : null}
                {groups.length ? (
                  groups
                ) : (
                  <Text style={{ paddingVertical: 14, paddingHorizontal: 16, fontSize: 15, lineHeight: 20, color: color.grey4, borderTopWidth: tokens.length ? 1 : 0, borderTopColor: color.grey1 }}>No matches</Text>
                )}
                {groups.length ? (
                  <Press onPress={() => setPop(false)} style={{ paddingTop: 12, paddingBottom: 10, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: color.grey1 }}>
                    <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: color.blue }}>View all results</Text>
                  </Press>
                ) : null}
              </ScrollView>
            </Animated.View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View style={{ flex: 1, opacity: qKind ? 0.5 : 1 }} pointerEvents={qKind ? 'none' : 'auto'}>
            <Seg options={segOptions} value={effKind} onChange={setKind} />
          </View>
          <FilterButton size={48} radiusOverride={16} active={active} onPress={() => setFilt(true)} />
        </View>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 6, paddingHorizontal: space.screen, paddingBottom: 12 }}>
        {list.length === 0 ? (
          <Empty>{q ? 'No matches.' : (empty ?? `No ${effKind === 'Guided' ? 'guided posts' : 'outlines'} yet.`)}</Empty>
        ) : (
          list.map((b, i) => {
            const fresh = !!jm && jm.ids.includes(b.id);
            const card = <BriefCard b={b} onPress={() => onOpen(b)} words={free} />;
            return fresh ? (
              <Animated.View key={b.id} entering={FadeIn.duration(520).delay(i * 90)} style={{ borderRadius: 20, marginBottom: 12, boxShadow: `0 0 0 2px ${color.blue}` }}>
                <View style={{ marginBottom: -12 }}>{card}</View>
              </Animated.View>
            ) : (
              <View key={b.id}>{card}</View>
            );
          })
        )}
      </ScrollView>
      <Sheet
        open={filt}
        onClose={() => setFilt(false)}
        title="Filter and sort"
        footer={
          <>
            <Button
              variant="secondary"
              label="Reset"
              onPress={() => {
                setType('All');
                setSort('new');
              }}
            />
            <Button label={`Show ${list.length}`} onPress={() => setFilt(false)} />
          </>
        }
      >
        <Label style={{ marginTop: 4, marginBottom: 10 }}>Post type</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>{(['All', ...BRIEF_TYPES] as const).map((t) => opt(effType === t, t, () => setType(t)))}</View>
        <Label style={{ marginTop: 4, marginBottom: 10 }}>Sort</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{SORTS.map(([k, l]) => opt(sort === k, l, () => setSort(k)))}</View>
      </Sheet>
    </View>
  );
}

export { motion as briefListMotion };
