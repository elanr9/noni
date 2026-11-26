/**
 * The marketplace: shapes and plain rules shared by both sides.
 *
 * A listing is a company's open campaign with the agreement a creator signs
 * to apply. An application is one creator on one listing, applied or invited.
 * The server side is supabase migrations 155 and 163; these types mirror
 * what its functions return.
 */
import { fmt, money } from './v2-format';

export type ListingStatus = 'draft' | 'open' | 'paused' | 'closed';
export type ApplicationStatus = 'invited' | 'applied' | 'accepted' | 'declined' | 'withdrawn';
export type Gender = 'female' | 'male' | 'nonbinary' | 'undisclosed';
export type Experience = 'pro' | 'some' | 'new';

/** The interest list. Keep in step with supabase/functions/apply-chat (CREATOR niches) and noni-web src/lib/creator-profile.ts. */
export const NICHES = [
  { key: 'social', label: 'Social and communication' },
  { key: 'finance', label: 'Finance and commerce' },
  { key: 'entertainment', label: 'Entertainment and media' },
  { key: 'music', label: 'Music' },
  { key: 'fitness', label: 'Health and fitness' },
  { key: 'education', label: 'Education and learning' },
  { key: 'travel', label: 'Travel and local' },
  { key: 'lifestyle', label: 'Lifestyle' },
  { key: 'tech', label: 'Tech and AI' },
  { key: 'photo_video', label: 'Photo and video' },
  { key: 'food', label: 'Food and drink' },
  { key: 'home_family', label: 'Home and family' },
  { key: 'fashion_beauty', label: 'Fashion and beauty' },
  { key: 'sports', label: 'Sports' },
  { key: 'gaming', label: 'Gaming' },
  { key: 'other', label: 'Other' },
] as const;

export const MAX_NICHES = 5;
export const MAX_LANGUAGES = 5;
export const MAX_VIDEOS = 3;

export const LANGUAGES = [
  'English', 'Spanish', 'Portuguese', 'French', 'German', 'Italian', 'Dutch',
  'Arabic', 'Hindi', 'Urdu', 'Bengali', 'Chinese', 'Japanese', 'Korean',
  'Vietnamese', 'Thai', 'Indonesian', 'Tagalog', 'Turkish', 'Russian',
].map((label) => ({ key: label.toLowerCase(), label }));

/** The countries offered as taps; anything else is typed. Stored as the code, or the typed name. */
export const COUNTRIES = [
  { key: 'US', label: 'United States' },
  { key: 'CA', label: 'Canada' },
  { key: 'GB', label: 'United Kingdom' },
  { key: 'AU', label: 'Australia' },
];

export function countryLabel(c: string | null | undefined): string | null {
  if (!c) return null;
  return COUNTRIES.find((x) => x.key === c)?.label ?? c;
}

export function languageLabel(key: string): string {
  return LANGUAGES.find((l) => l.key === key)?.label ?? key.charAt(0).toUpperCase() + key.slice(1);
}

export const GENDERS: { key: Gender; label: string }[] = [
  { key: 'female', label: 'Female' },
  { key: 'male', label: 'Male' },
  { key: 'nonbinary', label: 'Non-binary' },
  { key: 'undisclosed', label: 'Prefer not to say' },
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

/** A campaign's own numbers (migration 163): posts a day and what a post pays. */
export type CampaignTerms = {
  posts_per_day_min: number;
  posts_per_day_max: number;
  video_post_cents: number;
  static_post_cents: number;
  cents_per_1k_views: number;
  /** 0 means no view pay. */
  view_pay_cap_cents: number;
  /** A post earns its base pay once it has this many views. */
  min_views: number;
};

/** What a new campaign starts with; the same defaults as the table. */
export const DEFAULT_TERMS: CampaignTerms = {
  posts_per_day_min: 2,
  posts_per_day_max: 3,
  video_post_cents: 1000,
  static_post_cents: 500,
  cents_per_1k_views: 100,
  view_pay_cap_cents: 30000,
  min_views: 500,
};

/** The floors the server holds pay to. */
export const PAY_FLOORS = { video_post_cents: 1000, static_post_cents: 500, cents_per_1k_views: 100 } as const;

/** The flat cover colours a company picks from; the server picks one from the company name. */
export const BRAND_COLORS = ['#1BA6EE', '#6D4AE0', '#D0397A', '#16A34A', '#F97316', '#0F172A', '#0D9488', '#E11D48'] as const;

/** What the campaign card draws from; a feed row fits as is. */
export type CardCampaign = CampaignTerms & {
  company_name: string;
  logo_path: string | null;
  brand_color: string | null;
  title: string;
  tagline: string | null;
  niches: string[];
  spots: number | null;
  spots_left: number | null;
};

/** The cover colour, or the first swatch when a campaign has none saved. */
export function coverColor(hex: string | null | undefined): string {
  return hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : BRAND_COLORS[0];
}

/** True when text on this colour should be dark ink instead of white. */
export function isLightColor(hex: string): boolean {
  const c = coverColor(hex);
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6;
}

/** "2 to 3 posts a day", "1 post a day", "3 posts a day". */
export function postsPerDayLabel(l: Pick<CampaignTerms, 'posts_per_day_min' | 'posts_per_day_max'>): string {
  const min = Math.max(1, l.posts_per_day_min);
  if (l.posts_per_day_max > min) return `${min} to ${l.posts_per_day_max} posts a day`;
  return min === 1 ? '1 post a day' : `${min} posts a day`;
}

/** "$10/video" */
export function payHeadline(l: Pick<CampaignTerms, 'video_post_cents'>): string {
  return `${money(l.video_post_cents)}/video`;
}

/** "+$1/1k views", or null when the campaign pays nothing for views. */
export function paySub(l: Pick<CampaignTerms, 'cents_per_1k_views' | 'view_pay_cap_cents'>): string | null {
  if (l.view_pay_cap_cents <= 0) return null;
  return `+${money(l.cents_per_1k_views)}/1k views`;
}

/** The pay terms, one short line each. */
export function payLines(l: Omit<CampaignTerms, 'posts_per_day_min' | 'posts_per_day_max'>): string[] {
  const lines = [`${money(l.video_post_cents)} a video`, `${money(l.static_post_cents)} a slideshow`];
  if (l.min_views > 0) lines.push(`Paid at ${l.min_views.toLocaleString('en-US')} views`);
  if (l.view_pay_cap_cents > 0) {
    lines.push(`${money(l.cents_per_1k_views)} per 1,000 views`, `Up to ${money(l.view_pay_cap_cents)} view pay a post`);
  }
  return lines;
}

/** One line of numbers for an applicant: "24.6k followers · 842k views · 31 posts". */
export function applicantStatLine(c: Pick<MarketCreator, 'followers' | 'total_views' | 'posts_live'>): string {
  const parts = [
    c.followers ? `${fmt(c.followers)} followers` : null,
    c.total_views > 0 ? `${fmt(c.total_views)} views` : null,
    c.posts_live > 0 ? `${fmt(c.posts_live)} ${c.posts_live === 1 ? 'post' : 'posts'}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'New to Noni';
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
  logo_path: string | null;
  /** Never null from the feed: the server picks one from the company name. */
  brand_color: string | null;
} & CampaignTerms;

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
  brand_color: string | null;
} & CampaignTerms;

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
  youtube: string | null;
  followers: number | null;
  tiktok_followers: number | null;
  instagram_followers: number | null;
  youtube_followers: number | null;
  country: string | null;
  languages: string[];
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
  country: string | null;
  languages: string[];
  youtube: string | null;
  tiktok_followers: number | null;
  instagram_followers: number | null;
  youtube_followers: number | null;
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
export function creatorFactLine(c: Pick<MarketCreator, 'age' | 'gender' | 'location'> & { country?: string | null }): string {
  const place = [c.location, countryLabel(c.country)].filter(Boolean).join(', ');
  return [c.age !== null ? String(c.age) : null, genderLabel(c.gender), place || null].filter(Boolean).join(' · ');
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

/** One campaign in the creator's own list (rpc creator_campaigns, migration 162). */
export type CampaignKind = 'active' | 'invited' | 'applied' | 'past';

export type CreatorCampaign = {
  kind: CampaignKind;
  company_id: string;
  company_name: string;
  logo_path: string | null;
  listing_id: string | null;
  title: string | null;
  posts_per_week: number | null;
  application_id: string | null;
  /** On past rows: 'left', 'declined' or 'withdrawn'. */
  application_status: string | null;
  invite_message: string | null;
  is_active: boolean;
  since: string | null;
  start_date: string | null;
  to_fix: number;
  to_make: number;
  in_review: number;
  posted: number;
  unread: number;
  earned_month_cents: number;
  earned_total_cents: number;
};

export type CampaignGroups = { active: CreatorCampaign[]; applied: CreatorCampaign[]; past: CreatorCampaign[] };

/** Active first by what needs doing, then the one open now; invites lead the applied group. */
export function groupCampaigns(rows: CreatorCampaign[]): CampaignGroups {
  const todo = (c: CreatorCampaign) => c.to_fix * 3 + c.to_make * 2 + c.unread;
  const when = (c: CreatorCampaign) => Date.parse(c.since ?? '') || 0;
  return {
    active: rows
      .filter((c) => c.kind === 'active')
      .sort((a, b) => todo(b) - todo(a) || Number(b.is_active) - Number(a.is_active) || a.company_name.localeCompare(b.company_name)),
    applied: rows
      .filter((c) => c.kind === 'invited' || c.kind === 'applied')
      .sort((a, b) => Number(b.kind === 'invited') - Number(a.kind === 'invited') || when(b) - when(a)),
    past: rows.filter((c) => c.kind === 'past').sort((a, b) => when(b) - when(a)),
  };
}

/** The short to-do line on an active campaign, or null when caught up. */
export function campaignTodo(c: Pick<CreatorCampaign, 'to_fix' | 'to_make' | 'unread' | 'in_review'>): { label: string; tone: 'amber' | 'blue' | 'purple' }[] {
  const out: { label: string; tone: 'amber' | 'blue' | 'purple' }[] = [];
  if (c.to_make > 0) out.push({ label: `${c.to_make} to make`, tone: 'blue' });
  if (c.to_fix > 0) out.push({ label: `${c.to_fix} to fix`, tone: 'amber' });
  if (c.unread > 0) out.push({ label: `${c.unread} unread`, tone: 'purple' });
  return out;
}

export function pastLabel(status: string | null): string {
  if (status === 'declined') return 'Not this time';
  if (status === 'withdrawn') return 'Withdrawn';
  return 'Ended';
}

/** One message on an application's thread (rpc application_messages, migration 164). */
export type ThreadMessage = {
  id: string;
  from_company: boolean;
  /** Written by the side reading it. */
  mine: boolean;
  body: string;
  created_at: string;
  read_at: string | null;
};

/** The server trims a message and keeps at most this many characters. */
export const MESSAGE_MAX = 1000;

/** What goes to the server for a typed message, or null when there is nothing to send. */
export function messageBody(draft: string): string | null {
  const body = draft.trim().slice(0, MESSAGE_MAX);
  return body.length > 0 ? body : null;
}

/** Unread counts by application id; rows with nothing unread are left out. */
export function unreadByApplication(rows: { application_id: string; unread: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const n = Number(r.unread) || 0;
    if (r.application_id && n > 0) out[r.application_id] = n;
  }
  return out;
}

/** A fresh read of a thread, keeping the list as it is when nothing changed so the screen does not redraw. */
export function mergeThread(current: ThreadMessage[] | null, next: ThreadMessage[]): ThreadMessage[] {
  if (!current || current.length !== next.length) return next;
  return current.every((m, i) => m.id === next[i].id && m.read_at === next[i].read_at) ? current : next;
}
