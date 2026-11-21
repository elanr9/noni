/**
 * The marketplace: shapes and plain rules shared by both sides.
 *
 * A listing is a company's open campaign with the agreement a creator signs
 * to apply. An application is one creator on one listing, applied or invited.
 * The server side is supabase migration 155; these types mirror what its
 * functions return.
 */
import { fmt, money } from './v2-format';

export type ListingStatus = 'draft' | 'open' | 'paused' | 'closed';
export type ApplicationStatus = 'invited' | 'applied' | 'accepted' | 'declined' | 'withdrawn';
export type Gender = 'female' | 'male' | 'nonbinary' | 'undisclosed';
export type Experience = 'pro' | 'some' | 'new';

/** The niche list the web apply chat offers (supabase/functions/apply-chat). Keep the two in step. */
export const NICHES = [
  { key: 'fitness', label: 'Fitness' },
  { key: 'sports', label: 'Sports' },
  { key: 'beauty', label: 'Beauty' },
  { key: 'fashion', label: 'Fashion' },
  { key: 'food', label: 'Food' },
  { key: 'tech', label: 'Tech and apps' },
  { key: 'gaming', label: 'Gaming' },
  { key: 'money', label: 'Money' },
  { key: 'school', label: 'School and study' },
  { key: 'lifestyle', label: 'Lifestyle' },
  { key: 'parenting', label: 'Parenting' },
  { key: 'travel', label: 'Travel' },
] as const;

export const GENDERS: { key: Gender; label: string }[] = [
  { key: 'female', label: 'Woman' },
  { key: 'male', label: 'Man' },
  { key: 'nonbinary', label: 'Non-binary' },
  { key: 'undisclosed', label: 'Rather not say' },
];

export const EXPERIENCE: { key: Experience; label: string }[] = [
  { key: 'pro', label: 'Paid UGC before' },
  { key: 'some', label: 'A little' },
  { key: 'new', label: 'Brand new' },
];

export const PLATFORMS = [
  { key: 'tiktok', label: 'TikTok' },
  { key: 'instagram', label: 'Instagram' },
] as const;

export function nicheLabel(key: string): string {
  return NICHES.find((n) => n.key === key)?.label ?? key.charAt(0).toUpperCase() + key.slice(1);
}

export function genderLabel(g: Gender | null | undefined): string | null {
  if (!g || g === 'undisclosed') return null;
  return GENDERS.find((x) => x.key === g)?.label ?? null;
}

export function experienceLabel(e: Experience | null | undefined): string | null {
  return EXPERIENCE.find((x) => x.key === e)?.label ?? null;
}

/** A listing as a creator sees it in the feed (rpc marketplace_feed). */
export type FeedListing = {
  id: string;
  company_id: string;
  company_name: string;
  company_website: string | null;
  status: ListingStatus;
  title: string;
  tagline: string | null;
  about: string | null;
  requirements: string | null;
  niches: string[];
  platforms: string[];
  posts_per_week: number;
  spots: number | null;
  spots_left: number | null;
  min_age: number;
  start_days: number;
  contract_title: string;
  contract_body: string;
  contract_version: number;
  opened_at: string | null;
  creator_count: number;
  is_member: boolean;
  application_id: string | null;
  application_status: ApplicationStatus | null;
  application_origin: 'applied' | 'invited' | null;
  invite_message: string | null;
  signed_at: string | null;
  start_date: string | null;
  decision_note: string | null;
  niche_overlap: number;
};

/** A company's own listing row (table marketplace_listings). */
export type Listing = {
  id: string;
  company_id: string;
  status: ListingStatus;
  title: string;
  tagline: string | null;
  about: string | null;
  requirements: string | null;
  niches: string[];
  platforms: string[];
  posts_per_week: number;
  spots: number | null;
  min_age: number;
  start_days: number;
  contract_title: string;
  contract_body: string;
  contract_version: number;
  opened_at: string | null;
};

export type PortfolioLink = { url: string; note?: string };

/** One creator as a company sees them (rpc marketplace_creators). */
export type MarketCreator = {
  creator_id: string;
  full_name: string | null;
  avatar_path: string | null;
  age: number | null;
  gender: Gender | null;
  location: string | null;
  bio: string | null;
  instagram: string | null;
  tiktok: string | null;
  followers: number | null;
  experience: Experience | null;
  campaigns_done: string | null;
  best_campaign: string | null;
  niches: string[];
  styles: string[];
  on_camera: string | null;
  weekly_capacity: string | null;
  portfolio: PortfolioLink[];
  total_views: number;
  posts_live: number;
  total_earned_cents: number;
  companies_count: number;
  joined_at: string | null;
  is_member: boolean;
  match_score: number;
  match_reason: string | null;
  match_ai: boolean;
  application_id: string | null;
  application_status: ApplicationStatus | null;
  application_origin: 'applied' | 'invited' | null;
  application_note: string | null;
  signed_name: string | null;
  signed_at: string | null;
  start_date: string | null;
  applied_at: string | null;
};

/** A creator's own resume (table creator_profiles). */
export type CreatorResume = {
  user_id: string;
  instagram: string | null;
  tiktok: string | null;
  experience: Experience | null;
  best_campaign: string | null;
  niches: string[];
  portfolio: PortfolioLink[];
  bio: string | null;
  gender: Gender | null;
  birth_year: number | null;
  location: string | null;
  tiktok_followers: number | null;
  instagram_followers: number | null;
  listed: boolean;
};

export type CreatorSort = 'match' | 'views' | 'earned' | 'followers' | 'newest';

export const SORTS: { key: CreatorSort; label: string }[] = [
  { key: 'match', label: 'Best match' },
  { key: 'views', label: 'Most views' },
  { key: 'earned', label: 'Most earned' },
  { key: 'followers', label: 'Most followers' },
  { key: 'newest', label: 'Newest' },
];

export type CreatorFilters = {
  niches: string[];
  gender: Gender | null;
  minAge: number | null;
  maxAge: number | null;
  minViews: number | null;
  minEarnedCents: number | null;
  minFollowers: number | null;
  experience: Experience | null;
};

export const NO_FILTERS: CreatorFilters = {
  niches: [],
  gender: null,
  minAge: null,
  maxAge: null,
  minViews: null,
  minEarnedCents: null,
  minFollowers: null,
  experience: null,
};

export const AGE_BANDS: { key: string; label: string; min: number | null; max: number | null }[] = [
  { key: 'any', label: 'Any age', min: null, max: null },
  { key: '18-20', label: '18 to 20', min: 18, max: 20 },
  { key: '21-24', label: '21 to 24', min: 21, max: 24 },
  { key: '25-34', label: '25 to 34', min: 25, max: 34 },
  { key: '35+', label: '35 and up', min: 35, max: null },
];

export const VIEW_FLOORS = [null, 10_000, 100_000, 1_000_000] as const;
export const EARNED_FLOORS = [null, 10_000, 50_000, 100_000] as const;
export const FOLLOWER_FLOORS = [null, 1_000, 10_000, 100_000] as const;

export function ageBandKey(f: Pick<CreatorFilters, 'minAge' | 'maxAge'>): string {
  return AGE_BANDS.find((b) => b.min === f.minAge && b.max === f.maxAge)?.key ?? 'any';
}

/** How many filters are on, for the badge on the filter button. */
export function activeFilterCount(f: CreatorFilters): number {
  return (
    (f.niches.length > 0 ? 1 : 0) +
    (f.gender ? 1 : 0) +
    (f.minAge !== null || f.maxAge !== null ? 1 : 0) +
    (f.minViews !== null ? 1 : 0) +
    (f.minEarnedCents !== null ? 1 : 0) +
    (f.minFollowers !== null ? 1 : 0) +
    (f.experience ? 1 : 0)
  );
}

/** Same rules as the server, for sample data and instant re-filtering of a loaded page. */
export function matchesFilters(c: MarketCreator, f: CreatorFilters): boolean {
  if (f.niches.length > 0 && !c.niches.some((n) => f.niches.includes(n))) return false;
  if (f.gender && c.gender !== f.gender) return false;
  if (f.minAge !== null && (c.age === null || c.age < f.minAge)) return false;
  if (f.maxAge !== null && (c.age === null || c.age > f.maxAge)) return false;
  if (f.minViews !== null && c.total_views < f.minViews) return false;
  if (f.minEarnedCents !== null && c.total_earned_cents < f.minEarnedCents) return false;
  if (f.minFollowers !== null && (c.followers ?? 0) < f.minFollowers) return false;
  if (f.experience && c.experience !== f.experience) return false;
  return true;
}

export function sortCreators(rows: MarketCreator[], sort: CreatorSort): MarketCreator[] {
  const by: Record<CreatorSort, (c: MarketCreator) => number> = {
    match: (c) => c.match_score,
    views: (c) => c.total_views,
    earned: (c) => c.total_earned_cents,
    followers: (c) => c.followers ?? -1,
    newest: (c) => Date.parse(c.applied_at ?? c.joined_at ?? '') || 0,
  };
  const key = by[sort];
  return [...rows].sort((a, b) => key(b) - key(a) || b.match_score - a.match_score);
}

export function ageFromBirthYear(year: number | null | undefined, now = new Date()): number | null {
  if (!year) return null;
  return now.getFullYear() - year;
}

export function birthYearFromAge(age: number, now = new Date()): number {
  return now.getFullYear() - age;
}

/** "22 · Woman · Austin", skipping what is missing. */
export function creatorFactLine(c: Pick<MarketCreator, 'age' | 'gender' | 'location'>): string {
  return [c.age !== null ? String(c.age) : null, genderLabel(c.gender), c.location].filter(Boolean).join(' · ');
}

/** The handle a company sees first: TikTok, then Instagram. */
export function mainHandle(c: Pick<MarketCreator, 'tiktok' | 'instagram'>): string | null {
  const h = c.tiktok ?? c.instagram;
  return h ? `@${h}` : null;
}

/** The three numbers on a creator card. */
export function creatorStats(c: Pick<MarketCreator, 'total_views' | 'total_earned_cents' | 'followers'>): { label: string; value: string }[] {
  return [
    { label: 'Views', value: fmt(c.total_views) },
    { label: 'Earned', value: money(c.total_earned_cents) },
    { label: 'Followers', value: c.followers === null ? 'n/a' : fmt(c.followers) },
  ];
}

/** Signing takes a first and a last name; the server checks the same. */
export function isFullName(name: string): boolean {
  const clean = name.trim().replace(/\s+/g, ' ');
  return clean.length >= 3 && clean.includes(' ');
}

/** What a creator still has to add before the server lets them sign. */
export function missingToApply(r: CreatorResume | null): string[] {
  const missing: string[] = [];
  if (!r?.birth_year) missing.push('your age');
  if (!r?.tiktok && !r?.instagram) missing.push('your TikTok or Instagram');
  return missing;
}

/** "Tue, Nov 24" from a date-only string, read as a local day. */
export function dayLabel(date: string | null): string | null {
  if (!date) return null;
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function spotsLabel(l: Pick<FeedListing, 'spots' | 'spots_left'>): string | null {
  if (l.spots === null || l.spots_left === null) return null;
  if (l.spots_left === 0) return 'Full';
  return `${l.spots_left} ${l.spots_left === 1 ? 'spot' : 'spots'} left`;
}

/** Where a creator stands on a listing, as a chip. */
export function standing(l: Pick<FeedListing, 'application_status' | 'is_member'>): { label: string; tone: 'blue' | 'green' | 'amber' | 'grey' | 'purple' } | null {
  if (l.application_status === 'accepted' || l.is_member) return { label: 'You are in', tone: 'green' };
  if (l.application_status === 'invited') return { label: 'Invited you', tone: 'purple' };
  if (l.application_status === 'applied') return { label: 'Applied', tone: 'amber' };
  if (l.application_status === 'declined') return { label: 'Not this time', tone: 'grey' };
  return null;
}

/** Feed order: invites first, then the closest niche fit, then the newest. */
export function orderFeed(rows: FeedListing[]): FeedListing[] {
  const rank = (l: FeedListing) => (l.application_status === 'invited' ? 2 : 0) + (l.application_status === null && !l.is_member ? 1 : 0);
  return [...rows].sort(
    (a, b) => rank(b) - rank(a) || b.niche_overlap - a.niche_overlap || (Date.parse(b.opened_at ?? '') || 0) - (Date.parse(a.opened_at ?? '') || 0),
  );
}
