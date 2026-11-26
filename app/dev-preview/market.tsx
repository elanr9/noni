// Dev only: the marketplace screens with sample data. ?view= picks one:
// creator (default), listing, sign, invite, applied, profile, admin, applicants, editor.
// ?sheet=creator|filters|invite|thread opens a sheet on the admin and applied views.
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AdminMarketScreen, type MarketScope } from '../../components/marketplace/AdminMarketScreen';
import { CreatorSheet, FiltersSheet, InviteSheet } from '../../components/marketplace/AdminSheets';
import { CreatorMarketScreen } from '../../components/marketplace/CreatorMarketScreen';
import { ListingEditor, type EditorTab } from '../../components/marketplace/ListingEditor';
import { ListingScreen } from '../../components/marketplace/ListingScreen';
import { ThreadSheet } from '../../components/marketplace/MessageThread';
import { ResumeEditor, type Tab } from '../../components/marketplace/ResumeEditor';
import { NO_FILTERS, matchesFilters, sortCreators, type CreatorFilters, type CreatorSort, type MarketCreator } from '../../lib/marketplace';
import { PREVIEW_CAMPAIGNS, PREVIEW_CREATORS, PREVIEW_FEED, PREVIEW_LISTING, PREVIEW_RESUME, previewThread } from '../../lib/marketplace-preview';

export default function Preview() {
  const router = useRouter();
  const { view = 'creator', sheet, tab } = useLocalSearchParams<{ view?: string; sheet?: string; tab?: string }>();
  const [scope, setScope] = useState<MarketScope>(view === 'applicants' ? 'applicants' : 'all');
  const [sort, setSort] = useState<CreatorSort>('match');
  const [filters, setFilters] = useState<CreatorFilters>(NO_FILTERS);
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(sheet === 'filters');
  const [openCreator, setOpenCreator] = useState<MarketCreator | null>(sheet === 'creator' ? PREVIEW_CREATORS[0] : null);
  const [inviting, setInviting] = useState<MarketCreator | null>(sheet === 'invite' ? PREVIEW_CREATORS[1] : null);
  const [thread, setThread] = useState<MarketCreator | null>(sheet === 'thread' && view !== 'applied' ? PREVIEW_CREATORS[0] : null);
  const [unread, setUnread] = useState<Record<string, number>>({ a1: 1 });
  const [companySide] = useState(() => previewThread('company'));
  const [creatorSide] = useState(() => previewThread('creator'));
  const go = (v: string) => router.push({ pathname: '/dev-preview/market', params: { view: v } });

  if (view === 'listing' || view === 'sign' || view === 'invite' || view === 'applied') {
    const listing = view === 'invite' ? PREVIEW_FEED[1] : view === 'applied' ? PREVIEW_FEED[2] : PREVIEW_FEED[0];
    return (
      <ListingScreen
        listing={listing}
        resume={PREVIEW_RESUME}
        defaultName="Maya Torres"
        initialStep={view === 'sign' ? 'sign' : 'view'}
        onBack={() => router.back()}
        onEditProfile={() => go('profile')}
        onEnterCompany={() => router.back()}
        onWithdraw={async () => undefined}
        unread={listing.application_id ? 1 : 0}
        messages={creatorSide}
        initialThread={sheet === 'thread'}
        onSign={async () => ({ status: listing.application_status === 'invited' ? 'accepted' : 'applied', start_date: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10) })}
      />
    );
  }
  if (view === 'profile') return <ResumeEditor resume={PREVIEW_RESUME} name="Maya Torres" startTab={(tab as Tab) ?? 'you'} onBack={() => router.back()} onSave={async () => undefined} />;
  if (view === 'editor') return <ListingEditor listing={PREVIEW_LISTING} companyName="Inkbound AI" startTab={(tab as EditorTab) ?? 'card'} onBack={() => router.back()} onSave={async () => undefined} />;

  if (view === 'admin' || view === 'applicants' || view === 'empty') {
    const pool =
      scope === 'applicants'
        ? PREVIEW_CREATORS.filter((c) => c.application_status === 'applied')
        : scope === 'invited'
          ? []
          : sortCreators(PREVIEW_CREATORS.filter((c) => matchesFilters(c, filters) && (c.full_name ?? '').toLowerCase().includes(search.toLowerCase())), sort);
    return (
      <>
        <AdminMarketScreen
          listing={view === 'empty' ? null : PREVIEW_LISTING}
          listingLoaded
          scope={scope}
          onScope={setScope}
          creators={pool}
          total={pool.length}
          applicantCount={1}
          photos={new Map()}
          search={search}
          onSearch={setSearch}
          sort={sort}
          onSort={setSort}
          filters={filters}
          onOpenFilters={() => setFiltersOpen(true)}
          ranking={false}
          onRank={() => undefined}
          onOpenCreator={setOpenCreator}
          onInvite={setInviting}
          onDecide={() => undefined}
          onEditListing={() => go('editor')}
          unread={unread}
        />
        <CreatorSheet
          creator={openCreator}
          photo={null}
          listing={PREVIEW_LISTING}
          onClose={() => setOpenCreator(null)}
          onInvite={setInviting}
          onDecide={() => undefined}
          onMessage={(c) => {
            setOpenCreator(null);
            setTimeout(() => setThread(c), 340);
          }}
          unread={!!openCreator?.application_id && (unread[openCreator.application_id] ?? 0) > 0}
        />
        <ThreadSheet
          applicationId={thread?.application_id ?? null}
          title={thread?.full_name?.trim() || 'Creator'}
          tint={PREVIEW_LISTING.brand_color}
          source={companySide}
          onRead={() => thread?.application_id && setUnread((u) => ({ ...u, [thread.application_id as string]: 0 }))}
          onClose={() => setThread(null)}
        />
        <FiltersSheet open={filtersOpen} filters={filters} onApply={setFilters} onClose={() => setFiltersOpen(false)} />
        <InviteSheet creator={inviting} listing={PREVIEW_LISTING} onClose={() => setInviting(null)} onSend={async () => undefined} />
      </>
    );
  }

  return (
    <CreatorMarketScreen
      listings={PREVIEW_FEED}
      resume={view === 'incomplete' ? { ...PREVIEW_RESUME, birth_year: null } : PREVIEW_RESUME}
      onOpen={(l) => go(l.application_status === 'invited' ? 'invite' : l.application_status === 'applied' ? 'applied' : 'listing')}
      campaigns={PREVIEW_CAMPAIGNS}
      messageUnread={{ 'a-glow': 1 }}
      initialTab={view === 'mine' ? 'mine' : undefined}
      onOpenCampaign={(c) => (c.kind === 'active' ? undefined : go('applied'))}
      onLeave={async () => undefined}
      onEditProfile={() => go('profile')}
    />
  );
}
