// Dev only: the marketplace screens with sample data. ?view= picks one:
// creator (default), listing, sign, invite, profile, admin, applicants, editor.
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AdminMarketScreen, type MarketScope } from '../../components/marketplace/AdminMarketScreen';
import { CreatorSheet, FiltersSheet, InviteSheet } from '../../components/marketplace/AdminSheets';
import { CreatorMarketScreen } from '../../components/marketplace/CreatorMarketScreen';
import { ListingEditor } from '../../components/marketplace/ListingEditor';
import { ListingScreen } from '../../components/marketplace/ListingScreen';
import { ResumeEditor } from '../../components/marketplace/ResumeEditor';
import { NO_FILTERS, matchesFilters, sortCreators, type CreatorFilters, type CreatorSort, type MarketCreator } from '../../lib/marketplace';
import { PREVIEW_CREATORS, PREVIEW_FEED, PREVIEW_LISTING, PREVIEW_RESUME } from '../../lib/marketplace-preview';

export default function Preview() {
  const router = useRouter();
  const { view = 'creator', sheet } = useLocalSearchParams<{ view?: string; sheet?: string }>();
  const [scope, setScope] = useState<MarketScope>(view === 'applicants' ? 'applicants' : 'all');
  const [sort, setSort] = useState<CreatorSort>('match');
  const [filters, setFilters] = useState<CreatorFilters>(NO_FILTERS);
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(sheet === 'filters');
  const [openCreator, setOpenCreator] = useState<MarketCreator | null>(sheet === 'creator' ? PREVIEW_CREATORS[0] : null);
  const [inviting, setInviting] = useState<MarketCreator | null>(sheet === 'invite' ? PREVIEW_CREATORS[1] : null);
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
        onSign={async () => ({ status: listing.application_status === 'invited' ? 'accepted' : 'applied', start_date: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10) })}
      />
    );
  }
  if (view === 'profile') return <ResumeEditor resume={PREVIEW_RESUME} onBack={() => router.back()} onSave={async () => undefined} />;
  if (view === 'editor') return <ListingEditor listing={PREVIEW_LISTING} companyName="Inkbound AI" onBack={() => router.back()} onSave={async () => undefined} />;

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
        />
        <CreatorSheet creator={openCreator} photo={null} listing={PREVIEW_LISTING} onClose={() => setOpenCreator(null)} onInvite={setInviting} onDecide={() => undefined} />
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
      onEditProfile={() => go('profile')}
    />
  );
}
