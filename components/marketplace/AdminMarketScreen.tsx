// Company Market tab: every creator on Noni, sorted for this company's
// campaign, with the people who applied and the people it reached out to.
// Data and actions come in as props so the dev preview can feed it.
import { RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  SORTS,
  activeFilterCount,
  creatorFactLine,
  creatorStats,
  dayLabel,
  mainHandle,
  type CreatorFilters,
  type CreatorSort,
  type Listing,
  type MarketCreator,
} from '../../lib/marketplace';
import { color, radius, shadow, space, text } from '../../theme/v2';
import { Avatar, Button, Card, Chip, Chips, Empty, FilterButton, Icon, Press, RootTitle, Seg, Skeleton, useTabBarInset } from '../v2';
import { Figures, MatchPill, NicheTags, toneFor } from './parts';

export type MarketScope = 'all' | 'applicants' | 'invited';

export interface AdminMarketScreenProps {
  listing: Listing | null;
  /** False until the first load answers whether the company has a listing. */
  listingLoaded: boolean;
  scope: MarketScope;
  onScope: (scope: MarketScope) => void;
  creators: MarketCreator[] | null;
  total: number;
  applicantCount: number;
  photos: Map<string, string>;
  search: string;
  onSearch: (value: string) => void;
  sort: CreatorSort;
  onSort: (sort: CreatorSort) => void;
  filters: CreatorFilters;
  onOpenFilters: () => void;
  ranking: boolean;
  onRank: () => void;
  onOpenCreator: (creator: MarketCreator) => void;
  onInvite: (creator: MarketCreator) => void;
  onDecide: (creator: MarketCreator, accept: boolean) => void;
  onEditListing: () => void;
  failed?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}

const SORT_LABELS = SORTS.map((s) => s.label);

export function AdminMarketScreen(p: AdminMarketScreenProps) {
  const insets = useSafeAreaInsets();
  const barInset = useTabBarInset();
  const { listing, creators } = p;
  const sortLabel = SORTS.find((s) => s.key === p.sort)?.label ?? SORT_LABELS[0];
  const aiRanked = (creators ?? []).some((c) => c.match_ai);
  const open = listing?.status === 'open';

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.screen, paddingBottom: barInset }}
        refreshControl={p.onRefresh ? <RefreshControl refreshing={!!p.refreshing} onRefresh={p.onRefresh} tintColor={color.grey4} /> : undefined}
      >
        <RootTitle title="Market" />

        {!p.listingLoaded ? (
          <Skeleton h={76} />
        ) : listing === null ? (
          <Card style={{ backgroundColor: color.ink }}>
            <Text style={[text.card, { color: color.white }]}>Put your campaign in front of every creator</Text>
            <Text style={[text.body, { color: color.grey3, marginTop: 6, marginBottom: 16 }]}>
              Say what you want and attach your agreement. Creators sign it when they apply, so the ones you accept start right away.
            </Text>
            <Button label="Set up your campaign" onPress={p.onEditListing} style={{ flex: 0 }} />
          </Card>
        ) : (
          <Card onPress={p.onEditListing} accessibilityLabel="Edit your campaign" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: open ? color.greenTint : color.amberTint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="storefront" size={20} color={open ? color.green : color.amber} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={text.row}>{listing.title}</Text>
              <Text numberOfLines={1} style={text.meta}>
                {open ? 'Open to applications' : listing.status === 'draft' ? 'Not open yet. Creators cannot see it.' : listing.status === 'paused' ? 'Paused. No new applications.' : 'Closed'}
              </Text>
            </View>
            <Text style={[text.row, { color: color.blue }]}>Edit</Text>
          </Card>
        )}

        <Seg
          options={[
            { key: 'all', label: 'Creators' },
            { key: 'applicants', label: 'Applied', count: p.applicantCount || undefined, tone: 'amber' },
            { key: 'invited', label: 'Invited' },
          ]}
          value={p.scope}
          onChange={p.onScope}
          style={{ marginBottom: 12 }}
        />

        {p.scope === 'all' ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: color.card, ...shadow.card }}>
                <Icon name="search" size={20} color={color.grey3} />
                <TextInput
                  value={p.search}
                  onChangeText={p.onSearch}
                  placeholder="Name or handle"
                  placeholderTextColor={color.grey3}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  style={{ flex: 1, padding: 0, fontSize: 15, color: color.ink }}
                />
              </View>
              <FilterButton onPress={p.onOpenFilters} active={activeFilterCount(p.filters)} size={44} />
            </View>
            <View style={{ marginBottom: 12 }}>
              <Chips options={SORT_LABELS} value={sortLabel} onChange={(label) => p.onSort(SORTS.find((s) => s.label === label)?.key ?? 'match')} />
            </View>
            {listing && p.sort === 'match' ? (
              <Press
                onPress={p.ranking ? undefined : p.onRank}
                disabled={p.ranking}
                accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, marginBottom: 12, borderRadius: radius.card, backgroundColor: color.blueTint }}
              >
                <Icon name="auto_awesome" size={20} color={color.blueDeep} />
                <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', color: color.blueDeep }}>
                  {p.ranking
                    ? 'Reading every profile against your campaign'
                    : aiRanked
                      ? `Ranked by AI for ${listing.title}`
                      : 'Have AI rank every creator for your campaign'}
                </Text>
                {p.ranking ? null : <Text style={{ fontSize: 15, fontWeight: '700', color: color.blue }}>{aiRanked ? 'Redo' : 'Rank'}</Text>}
              </Press>
            ) : null}
          </>
        ) : null}

        {creators === null && !p.failed ? (
          <>
            <Skeleton h={168} />
            <Skeleton h={168} />
          </>
        ) : creators === null ? (
          <Empty>Could not load creators. Pull down to try again.</Empty>
        ) : creators.length === 0 ? (
          <Empty>
            {p.scope === 'applicants'
              ? open
                ? 'No one is waiting. New applications land here, already signed.'
                : 'Open your campaign and applications land here, already signed.'
              : p.scope === 'invited'
                ? 'You have not reached out to anyone yet. Invite from Creators.'
                : activeFilterCount(p.filters) > 0 || p.search
                  ? 'No creators match. Loosen a filter.'
                  : 'No creators yet. They show up here as they join Noni.'}
          </Empty>
        ) : (
          <>
            {p.scope === 'all' ? <Text style={[text.meta, { paddingHorizontal: 4, marginBottom: 8 }]}>{p.total} {p.total === 1 ? 'creator' : 'creators'}</Text> : null}
            {creators.map((c) => (
              <CreatorCard
                key={c.creator_id}
                creator={c}
                photo={c.avatar_path ? p.photos.get(c.avatar_path) ?? null : null}
                wanted={listing?.niches ?? []}
                scope={p.scope}
                canInvite={listing !== null}
                onOpen={() => p.onOpenCreator(c)}
                onInvite={() => p.onInvite(c)}
                onDecide={(accept) => p.onDecide(c, accept)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function CreatorCard({
  creator: c,
  photo,
  wanted,
  scope,
  canInvite,
  onOpen,
  onInvite,
  onDecide,
}: {
  creator: MarketCreator;
  photo: string | null;
  wanted: string[];
  scope: MarketScope;
  canInvite: boolean;
  onOpen: () => void;
  onInvite: () => void;
  onDecide: (accept: boolean) => void;
}) {
  const name = c.full_name?.trim() || 'Creator';
  const facts = creatorFactLine(c);
  const handle = mainHandle(c);
  return (
    <Card onPress={onOpen} accessibilityLabel={name}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={name} photo={photo} tone={toneFor(c.creator_id)} size={48} ring={false} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={text.row}>{name}</Text>
          <Text numberOfLines={1} style={text.meta}>{facts || handle || 'New to Noni'}</Text>
        </View>
        <MatchPill score={c.match_score} ai={c.match_ai} />
      </View>

      {c.match_reason ? (
        <Text style={[text.body, { marginTop: 12, color: color.ink }]}>{c.match_reason}</Text>
      ) : scope === 'applicants' && c.application_note ? (
        <Text numberOfLines={3} style={[text.body, { marginTop: 12 }]}>“{c.application_note}”</Text>
      ) : null}

      <Figures items={creatorStats(c)} style={{ marginTop: 14 }} />

      {c.niches.length > 0 ? (
        <View style={{ marginTop: 12 }}>
          <NicheTags niches={c.niches} highlight={wanted} max={4} />
        </View>
      ) : null}

      {scope === 'applicants' ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <Button label="Pass" variant="quiet" onPress={() => onDecide(false)} style={{ height: 44 }} />
          <Button label="Accept" icon="check" onPress={() => onDecide(true)} style={{ height: 44 }} />
        </View>
      ) : scope === 'invited' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <Chip label="Waiting on them" tone="purple" />
        </View>
      ) : c.application_status === 'applied' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <Chip label={`Applied ${dayLabel(c.applied_at) ?? ''}`.trim()} tone="amber" />
        </View>
      ) : c.application_status === 'invited' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <Chip label="Invited" tone="purple" />
        </View>
      ) : canInvite ? (
        <View style={{ flexDirection: 'row', marginTop: 14 }}>
          <Button label="Reach out" variant="secondary" icon="send" onPress={onInvite} style={{ height: 44 }} />
        </View>
      ) : null}
    </Card>
  );
}
