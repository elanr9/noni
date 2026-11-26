// Creator Campaigns tab: Explore (every open campaign, invites on top) and
// My campaigns (Active, Applied, Past) so one creator can run several
// companies from one place. Data comes in as props so the dev preview can feed it.
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  campaignTodo,
  groupCampaigns,
  missingToApply,
  orderFeed,
  pastLabel,
  standing,
  type CreatorCampaign,
  type CreatorResume,
  type FeedListing,
} from '../../lib/marketplace';
import { money } from '../../lib/v2-format';
import { color, space, text } from '../../theme/v2';
import { Button, Card, Chip, Chips, Empty, Icon, IconButton, Press, RootTitle, Seg, Sheet, Skeleton, UnderlineTabs, useTabBarInset } from '../v2';
import { CampaignCard } from './CampaignCard';
import { CompanyMark, UnreadDot, toneFor } from './parts';

const EXPLORE = ['All', 'For you'] as const;
type ExploreKey = (typeof EXPLORE)[number];
export type MarketTab = 'explore' | 'mine';
type MineKey = 'active' | 'applied' | 'past';

export interface CreatorMarketScreenProps {
  listings: FeedListing[] | null;
  resume: CreatorResume | null;
  campaigns: CreatorCampaign[] | null;
  /** Unread messages from companies, by application id: those campaigns carry a dot. */
  messageUnread?: Record<string, number>;
  failed?: boolean;
  refreshing?: boolean;
  initialTab?: MarketTab;
  onRefresh?: () => void;
  onOpen: (listing: FeedListing) => void;
  /** Active: switch to the company and go Home. Applied or past: show the listing. */
  onOpenCampaign: (campaign: CreatorCampaign) => void;
  /** Rejects with a message to show. */
  onLeave: (campaign: CreatorCampaign) => Promise<void>;
  onEditProfile: () => void;
}

export function CreatorMarketScreen({
  listings,
  resume,
  campaigns,
  messageUnread,
  failed,
  refreshing = false,
  initialTab,
  onRefresh,
  onOpen,
  onOpenCampaign,
  onLeave,
  onEditProfile,
}: CreatorMarketScreenProps) {
  const insets = useSafeAreaInsets();
  const barInset = useTabBarInset();
  const groups = useMemo(() => groupCampaigns(campaigns ?? []), [campaigns]);
  const [tab, setTab] = useState<MarketTab>(initialTab ?? 'explore');
  const [view, setView] = useState<ExploreKey>('All');
  const [mine, setMine] = useState<MineKey>('active');
  const [menu, setMenu] = useState<CreatorCampaign | null>(null);

  const ordered = useMemo(() => orderFeed(listings ?? []), [listings]);
  const invites = ordered.filter((l) => l.application_status === 'invited');
  const shown = ordered.filter((l) => {
    if (l.application_status === 'invited' || l.is_member || l.application_status !== null) return false;
    if (view === 'For you') return l.niche_overlap > 0 && l.status === 'open';
    return l.status === 'open';
  });
  const missing = missingToApply(resume);
  const mineCount = groups.active.length + groups.applied.length;

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.screen, paddingBottom: barInset }}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.grey4} /> : undefined}
      >
        <RootTitle title="Campaigns" right={<IconButton name="person" label="Your profile" onPress={onEditProfile} />} />

        <UnderlineTabs
          items={[
            { key: 'explore', label: 'Explore' },
            { key: 'mine', label: 'My campaigns', count: mineCount || undefined },
          ]}
          value={tab}
          onChange={setTab}
          style={{ marginBottom: 16 }}
        />

        {tab === 'explore' ? (
          <>
            {listings !== null && missing.length > 0 ? (
              <Card onPress={onEditProfile} accessibilityLabel="Finish your profile" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: color.amberTint, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="edit" size={20} color={color.amber} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={text.row}>Finish your profile</Text>
                  <Text style={text.meta}>Add {missing.join(' and ')} to apply.</Text>
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
              <Chips options={EXPLORE} value={view} onChange={setView} />
            </View>

            {listings === null && !failed ? (
              <>
                <Skeleton h={300} />
                <Skeleton h={300} />
              </>
            ) : failed && listings === null ? (
              <Empty>Could not load campaigns. Pull down to try again.</Empty>
            ) : shown.length === 0 ? (
              <Empty>{view === 'For you' ? 'Nothing matches your interests right now.' : 'No open campaigns right now.'}</Empty>
            ) : (
              shown.map((l) => <ListingCard key={l.id} listing={l} mine={resume?.niches ?? []} onPress={() => onOpen(l)} />)
            )}
          </>
        ) : (
          <>
            <Seg
              options={[
                { key: 'active', label: 'Active', count: groups.active.length, tone: 'green' },
                { key: 'applied', label: 'Applied', count: groups.applied.length, tone: 'amber' },
                { key: 'past', label: 'Past', count: groups.past.length },
              ]}
              value={mine}
              onChange={setMine}
              style={{ marginBottom: 16 }}
            />

            {campaigns === null && !failed ? (
              <>
                <Skeleton h={132} />
                <Skeleton h={132} />
              </>
            ) : campaigns === null ? (
              <Empty>Could not load your campaigns. Pull down to try again.</Empty>
            ) : groups[mine].length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 24, gap: 16 }}>
                <Text style={[text.card, { textAlign: 'center' }]}>{mine === 'active' ? 'No active campaigns' : mine === 'applied' ? 'No applications' : 'Nothing here yet'}</Text>
                {mine !== 'past' ? <Button pill label="Explore" onPress={() => setTab('explore')} /> : null}
              </View>
            ) : (
              groups[mine].map((c) =>
                c.kind === 'active' ? (
                  <ActiveCard key={c.company_id} c={c} onPress={() => onOpenCampaign(c)} onMore={() => setMenu(c)} />
                ) : (
                  <OtherCard key={`${c.kind}-${c.company_id}-${c.application_id ?? ''}`} c={c} unread={!!c.application_id && (messageUnread?.[c.application_id] ?? 0) > 0} onPress={c.listing_id ? () => onOpenCampaign(c) : undefined} />
                ),
              )
            )}
          </>
        )}
      </ScrollView>

      <LeaveSheet campaign={menu} onClose={() => setMenu(null)} onOpen={(c) => (setMenu(null), onOpenCampaign(c))} onLeave={onLeave} />
    </View>
  );
}

function ActiveCard({ c, onPress, onMore }: { c: CreatorCampaign; onPress: () => void; onMore: () => void }) {
  const todo = campaignTodo(c);
  return (
    <View>
      <Card onPress={onPress} accessibilityLabel={`Open ${c.company_name}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 40 }}>
          <CompanyMark name={c.company_name} tone={toneFor(c.company_id)} size={44} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={text.row}>{c.company_name}</Text>
            {c.title && c.title !== c.company_name ? <Text numberOfLines={1} style={text.meta}>{c.title}</Text> : null}
          </View>
          {c.is_active ? <Chip label="Current" tone="green" style={{ alignSelf: 'center' }} /> : null}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {todo.length > 0 ? todo.map((t) => <Chip key={t.label} small label={t.label} tone={t.tone} />) : <Chip small label="Caught up" tone="grey" />}
        </View>

        <View style={{ flexDirection: 'row', marginTop: 14 }}>
          <Stat value={money(c.earned_month_cents)} label="this month" green />
          <Stat value={String(c.posted)} label="posted" />
          <Stat value={String(c.in_review)} label="in review" />
        </View>
      </Card>
      <Press
        accessibilityRole="button"
        accessibilityLabel={`More for ${c.company_name}`}
        onPress={onMore}
        hitSlop={8}
        style={{ position: 'absolute', top: 20, right: 10, width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="more_horiz" size={22} color={color.grey4} />
      </Press>
    </View>
  );
}

function Stat({ value, label, green }: { value: string; label: string; green?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: green ? color.green : color.ink, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text numberOfLines={1} style={[text.meta, { fontSize: 12 }]}>{label}</Text>
    </View>
  );
}

function OtherCard({ c, unread, onPress }: { c: CreatorCampaign; unread?: boolean; onPress?: () => void }) {
  const chip =
    c.kind === 'invited'
      ? { label: 'Invited you', tone: 'purple' as const }
      : c.kind === 'applied'
        ? { label: 'Applied', tone: 'amber' as const }
        : { label: pastLabel(c.application_status), tone: 'grey' as const };
  return (
    <Card onPress={onPress} accessibilityLabel={`${c.company_name}, ${chip.label}${unread ? ', unread messages' : ''}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View>
          <CompanyMark name={c.company_name} tone={toneFor(c.company_id)} size={44} />
          {unread ? <UnreadDot style={{ position: 'absolute', top: -4, right: -4 }} /> : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={text.row}>{c.company_name}</Text>
          {c.title && c.title !== c.company_name ? <Text numberOfLines={1} style={text.meta}>{c.title}</Text> : null}
        </View>
        <Chip label={chip.label} tone={chip.tone} style={{ alignSelf: 'center' }} />
      </View>
      {c.kind === 'invited' && c.invite_message ? <Text numberOfLines={2} style={[text.body, { marginTop: 12 }]}>“{c.invite_message}”</Text> : null}
      {c.kind === 'past' && (c.earned_total_cents > 0 || c.posted > 0) ? (
        <Text style={[text.meta, { marginTop: 10 }]}>{`${money(c.earned_total_cents)} earned · ${c.posted} posted`}</Text>
      ) : null}
    </Card>
  );
}

function LeaveSheet({
  campaign,
  onClose,
  onOpen,
  onLeave,
}: {
  campaign: CreatorCampaign | null;
  onClose: () => void;
  onOpen: (c: CreatorCampaign) => void;
  onLeave: (c: CreatorCampaign) => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setConfirm(false);
    setError(null);
    onClose();
  };
  return (
    <Sheet open={campaign !== null} onClose={close} title={campaign?.company_name}>
      {campaign ? (
        <View style={{ gap: 10 }}>
          {!campaign.is_active ? <Button label="Open" onPress={() => (setConfirm(false), onOpen(campaign))} /> : null}
          <Button
            label={busy ? 'Leaving' : confirm ? 'Tap again to leave' : 'Leave campaign'}
            variant={confirm ? 'amber' : 'quiet'}
            disabled={busy}
            onPress={async () => {
              if (!confirm) {
                setConfirm(true);
                return;
              }
              setBusy(true);
              setError(null);
              try {
                await onLeave(campaign);
                close();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not leave');
              } finally {
                setBusy(false);
              }
            }}
          />
          {error ? <Text style={[text.meta, { color: color.amber, textAlign: 'center' }]}>{error}</Text> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

function ListingCard({ listing: l, mine, onPress }: { listing: FeedListing; mine: string[]; onPress: () => void }) {
  return <CampaignCard campaign={l} mine={mine} state={standing(l)} note={l.application_status === 'invited' ? l.invite_message : null} onPress={onPress} />;
}
