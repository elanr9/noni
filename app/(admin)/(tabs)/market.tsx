import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { AdminMarketScreen, type MarketScope } from '../../../components/marketplace/AdminMarketScreen';
import { CreatorSheet, FiltersSheet, InviteSheet } from '../../../components/marketplace/AdminSheets';
import { ThreadSheet } from '../../../components/marketplace/MessageThread';
import { toast } from '../../../components/v2/Toast';
import { useAuth } from '../../../lib/auth';
import { NO_FILTERS, dayLabel, type CreatorFilters, type CreatorSort, type Listing, type MarketCreator } from '../../../lib/marketplace';
import { decideApplication, inviteCreator, loadCreators, loadOrMakeListing, loadThreadUnread, rankWithAi, signAvatars } from '../../../lib/marketplace-api';

/** Market tab (company): browse and rank creators, review applicants, reach out. */
export default function AdminMarket() {
  const router = useRouter();
  const { profile } = useAuth();
  const companyId = profile?.active_company_id;

  const [listing, setListing] = useState<Listing | null>(null);
  const [listingLoaded, setListingLoaded] = useState(false);
  const [scope, setScope] = useState<MarketScope>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<CreatorSort>('match');
  const [filters, setFilters] = useState<CreatorFilters>(NO_FILTERS);
  const [creators, setCreators] = useState<MarketCreator[] | null>(null);
  const [total, setTotal] = useState(0);
  const [applicantCount, setApplicantCount] = useState(0);
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [ranking, setRanking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openCreator, setOpenCreator] = useState<MarketCreator | null>(null);
  const [inviting, setInviting] = useState<MarketCreator | null>(null);
  const [thread, setThread] = useState<MarketCreator | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});

  // The search box waits for a pause before it asks the server.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Only the newest request may write: a slow answer to an old filter is dropped.
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!companyId) return;
    const mine = ++seq.current;
    try {
      // The campaign is made for the company the first time a manager looks.
      // Creators still load if that fails.
      const current = await loadOrMakeListing(companyId).catch(() => null);
      const [page, waiting] = await Promise.all([
        loadCreators({ listingId: current?.id ?? null, scope, search: scope === 'all' ? query : '', filters: scope === 'all' ? filters : NO_FILTERS, sort: scope === 'all' ? sort : 'newest' }),
        scope === 'applicants' ? null : loadCreators({ listingId: current?.id ?? null, scope: 'applicants', limit: 1 }),
      ]);
      if (mine !== seq.current) return;
      setListing(current);
      setListingLoaded(true);
      setCreators(page.rows);
      setTotal(page.total);
      setApplicantCount(waiting ? waiting.total : page.total);
      setFailed(false);
      void signAvatars(page.rows.map((r) => r.avatar_path))
        .then((m) => {
          if (mine === seq.current) setPhotos(m);
        })
        .catch(() => undefined);
      void loadThreadUnread(page.rows.map((r) => r.application_id))
        .then((u) => {
          if (mine === seq.current) setUnread(u);
        })
        .catch(() => undefined);
    } catch {
      if (mine !== seq.current) return;
      setListingLoaded(true);
      setFailed(true);
    } finally {
      if (mine === seq.current) setRefreshing(false);
    }
  }, [companyId, scope, query, filters, sort]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const decide = async (c: MarketCreator, accept: boolean) => {
    if (!c.application_id || busy) return;
    setBusy(true);
    try {
      const r = await decideApplication(c.application_id, accept);
      const first = c.full_name?.trim().split(/\s+/)[0] || 'They';
      if (accept) toast.success(`${first} is on your team. First post due ${dayLabel(r.start_date) ?? 'soon'}.`);
      else toast.show(`Declined ${first}`);
      setOpenCreator(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That did not go through');
    } finally {
      setBusy(false);
    }
  };

  const rank = async () => {
    if (!listing || ranking) return;
    setRanking(true);
    try {
      const n = await rankWithAi(listing.id);
      toast.success(n > 0 ? `Ranked ${n} ${n === 1 ? 'creator' : 'creators'} for your campaign` : 'No creators to rank yet');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ranking did not finish', { label: 'Retry', onPress: () => void rank() });
    } finally {
      setRanking(false);
    }
  };

  const startInvite = (c: MarketCreator) => {
    setOpenCreator(null);
    // Let the profile sheet finish closing before the next one opens.
    setTimeout(() => setInviting(c), openCreator ? 340 : 0);
  };

  const startThread = (c: MarketCreator) => {
    setOpenCreator(null);
    setTimeout(() => setThread(c), openCreator ? 340 : 0);
  };
  const threadId = thread?.application_id ?? null;

  return (
    <>
      <AdminMarketScreen
        listing={listing}
        listingLoaded={listingLoaded}
        scope={scope}
        onScope={(s) => {
          setCreators(null);
          setScope(s);
        }}
        creators={creators}
        total={total}
        applicantCount={applicantCount}
        photos={photos}
        search={search}
        onSearch={setSearch}
        sort={sort}
        onSort={setSort}
        filters={filters}
        onOpenFilters={() => setFiltersOpen(true)}
        ranking={ranking}
        onRank={rank}
        onOpenCreator={setOpenCreator}
        onInvite={startInvite}
        onDecide={decide}
        onEditListing={() => router.push('/(admin)/market/listing')}
        unread={unread}
        failed={failed}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void load();
        }}
      />
      <CreatorSheet
        creator={openCreator}
        photo={openCreator?.avatar_path ? photos.get(openCreator.avatar_path) ?? null : null}
        listing={listing}
        busy={busy}
        onClose={() => setOpenCreator(null)}
        onInvite={startInvite}
        onDecide={decide}
        onMessage={startThread}
        unread={!!openCreator?.application_id && (unread[openCreator.application_id] ?? 0) > 0}
      />
      <ThreadSheet
        applicationId={threadId}
        title={thread?.full_name?.trim() || 'Creator'}
        tint={listing?.brand_color}
        onRead={() => threadId && setUnread((u) => (u[threadId] ? { ...u, [threadId]: 0 } : u))}
        onClose={() => setThread(null)}
      />
      <FiltersSheet open={filtersOpen} filters={filters} onApply={setFilters} onClose={() => setFiltersOpen(false)} />
      <InviteSheet
        creator={inviting}
        listing={listing}
        onClose={() => setInviting(null)}
        onSend={async (c, message) => {
          if (!listing) throw new Error('Set up your campaign first');
          await inviteCreator(listing.id, c.creator_id, message);
          toast.success(`Invite sent to ${c.full_name?.trim().split(/\s+/)[0] || 'them'}`);
          await load();
        }}
      />
    </>
  );
}
