// Creator Market tab: every open campaign, invites on top, and where each
// application stands. Data comes in as props so the dev preview can feed it.
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { missingToApply, orderFeed, spotsLabel, standing, type CreatorResume, type FeedListing } from '../../lib/marketplace';
import { color, space, text } from '../../theme/v2';
import { Card, Chip, Chips, Empty, Icon, IconButton, RootTitle, Skeleton, useTabBarInset } from '../v2';
import { CompanyMark, NicheTags, PAY_LINE, toneFor } from './parts';

const VIEWS = ['All', 'For you', 'Applied'] as const;
type ViewKey = (typeof VIEWS)[number];

export interface CreatorMarketScreenProps {
  listings: FeedListing[] | null;
  resume: CreatorResume | null;
  failed?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  onOpen: (listing: FeedListing) => void;
  onEditProfile: () => void;
}

export function CreatorMarketScreen({ listings, resume, failed, refreshing = false, onRefresh, onOpen, onEditProfile }: CreatorMarketScreenProps) {
  const insets = useSafeAreaInsets();
  const barInset = useTabBarInset();
  const [view, setView] = useState<ViewKey>('All');

  const ordered = useMemo(() => orderFeed(listings ?? []), [listings]);
  const invites = ordered.filter((l) => l.application_status === 'invited');
  const rest = ordered.filter((l) => l.application_status !== 'invited');
  const shown = rest.filter((l) => {
    if (view === 'For you') return l.niche_overlap > 0 && l.status === 'open' && !l.is_member && l.application_status === null;
    if (view === 'Applied') return l.application_status !== null || l.is_member;
    return l.status === 'open' || l.application_status !== null;
  });
  const missing = missingToApply(resume);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.screen, paddingBottom: barInset }}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.grey4} /> : undefined}
      >
        <RootTitle title="Market" right={<IconButton name="person" label="Your profile" onPress={onEditProfile} />} />

        {listings !== null && missing.length > 0 ? (
          <Card onPress={onEditProfile} accessibilityLabel="Finish your profile" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: color.amberTint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="edit" size={20} color={color.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={text.row}>Finish your profile</Text>
              <Text style={text.meta}>Add {missing.join(' and ')} to apply. Companies see it when you do.</Text>
            </View>
            <Icon name="chevron_right" size={22} color={color.grey3} />
          </Card>
        ) : null}

        {invites.length > 0 ? (
          <View style={{ marginBottom: 8 }}>
            <Text style={[text.card, { paddingHorizontal: 4, paddingBottom: 8 }]}>{invites.length === 1 ? 'A company wants you' : 'Companies want you'}</Text>
            {invites.map((l) => (
              <ListingCard key={l.id} listing={l} mine={resume?.niches ?? []} onPress={() => onOpen(l)} />
            ))}
          </View>
        ) : null}

        <View style={{ marginBottom: 12 }}>
          <Chips options={VIEWS} value={view} onChange={setView} />
        </View>

        {listings === null && !failed ? (
          <>
            <Skeleton h={148} />
            <Skeleton h={148} />
          </>
        ) : failed && listings === null ? (
          <Empty>Could not load the market. Pull down to try again.</Empty>
        ) : shown.length === 0 ? (
          <Empty>
            {view === 'Applied'
              ? 'Nothing yet. Campaigns you apply to show up here.'
              : view === 'For you'
                ? 'No open campaigns match your niches right now. Check All.'
                : 'No campaigns are open yet. New ones land here first.'}
          </Empty>
        ) : (
          shown.map((l) => <ListingCard key={l.id} listing={l} mine={resume?.niches ?? []} onPress={() => onOpen(l)} />)
        )}
      </ScrollView>
    </View>
  );
}

function ListingCard({ listing: l, mine, onPress }: { listing: FeedListing; mine: string[]; onPress: () => void }) {
  const state = standing(l);
  const spots = spotsLabel(l);
  const meta = [`${l.posts_per_week} posts a week`, l.creator_count > 0 ? `${l.creator_count} ${l.creator_count === 1 ? 'creator' : 'creators'}` : null, spots].filter(Boolean).join(' · ');
  return (
    <Card onPress={onPress} accessibilityLabel={`${l.company_name}, ${l.title}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <CompanyMark name={l.company_name} tone={toneFor(l.company_id)} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={text.meta}>{l.company_name}</Text>
          <Text numberOfLines={2} style={text.row}>{l.title}</Text>
        </View>
        {state ? <Chip label={state.label} tone={state.tone} style={{ alignSelf: 'center' }} /> : null}
      </View>
      {l.application_status === 'invited' && l.invite_message ? (
        <Text numberOfLines={3} style={[text.body, { marginTop: 12 }]}>“{l.invite_message}”</Text>
      ) : l.tagline ? (
        <Text numberOfLines={2} style={[text.body, { marginTop: 12, color: color.grey4 }]}>{l.tagline}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
        <Icon name="payments" size={18} color={color.green} />
        <Text style={{ fontSize: 15, fontWeight: '700', color: color.ink }}>{PAY_LINE}</Text>
      </View>
      <Text style={[text.meta, { marginTop: 4 }]}>{meta}</Text>
      {l.niches.length > 0 ? (
        <View style={{ marginTop: 12 }}>
          <NicheTags niches={l.niches} highlight={mine} max={4} />
        </View>
      ) : null}
    </Card>
  );
}
