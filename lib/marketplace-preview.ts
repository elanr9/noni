/** Sample marketplace data for the dev-preview routes. Never imported by a real screen. */
import { DEFAULT_TERMS, type CreatorCampaign, type CreatorResume, type FeedListing, type Listing, type MarketCreator, type ThreadMessage } from './marketplace';

const CONTRACT = `1. The work. The Creator makes short videos and posts for the Company from the briefs in Noni and posts them on the Creator's own accounts. The target is 2 to 3 posts a day. The first post is due within 3 days of signing.

2. Pay. Noni tracks views and pays the Creator on the Company's behalf.
Video: $10 once it is live and has 500 views
Slideshow: $5 once it is live and has 500 views
Views: $1 for every 1,000 views in the 30 days after posting, up to $300 a post
Payout: every Sunday to the Creator's bank
Only posts approved in Noni are paid. Drafts and unpublished posts are not paid.

3. Approval. Every post is reviewed in Noni before it goes live. Posts stay up for at least 90 days.

4. Content rights. The Creator keeps ownership of the content. The Creator gives the Company a worldwide, royalty free licence with no end date to use, copy, edit and share the content made under this agreement. The Company may repost it on its own social accounts, website and app store pages, run it as paid ads, cut it together with other clips, and add captions, music or its logo.

12. Ending it. Either side can end this agreement at any time in Noni. Posts approved before it ends are still paid.`;

/** The agreement as written for one creator once the company accepts. */
export const PREVIEW_OFFER_CONTRACT = `This Creator Agreement is made on November 26, 2026 between Inkbound AI ("the Company") and Maya Torres ("the Creator") for the campaign "Tattoo ideas in seconds". It starts the day the Creator signs.\n\n${CONTRACT}`;

const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

function feed(over: Partial<FeedListing> & Pick<FeedListing, 'id' | 'company_name' | 'title'>): FeedListing {
  return {
    company_id: `co-${over.id}`,
    company_website: null,
    status: 'open',
    tagline: null,
    about: null,
    requirements: null,
    niches: [],
    platforms: ['tiktok', 'instagram'],
    posts_per_week: 14,
    spots: null,
    spots_left: null,
    min_age: 18,
    start_days: 3,
    contract_title: 'Creator agreement',
    contract_body: CONTRACT,
    contract_version: 1,
    opened_at: day(2),
    creator_count: 0,
    is_member: false,
    application_id: null,
    application_status: null,
    application_origin: null,
    invite_message: null,
    signed_at: null,
    start_date: null,
    decision_note: null,
    niche_overlap: 0,
    logo_path: null,
    brand_color: '#1BA6EE',
    ...DEFAULT_TERMS,
    ...over,
  };
}

export const PREVIEW_FEED: FeedListing[] = [
  feed({
    id: 'l1',
    company_name: 'Inkbound AI',
    company_website: 'www.inkbound.ai',
    title: 'Study creators for Inkbound',
    tagline: 'Make videos about the app that turns your notes into essays you actually understand.',
    about: 'Inkbound is a writing app for students. You paste your notes, it helps you outline, draft and cite. 40,000 students use it every week.',
    requirements: 'College students who post study or day in the life content and are comfortable talking to camera.',
    niches: ['education', 'tech', 'lifestyle'],
    posts_per_week: 14,
    brand_color: '#6D4AE0',
    spots: 25,
    spots_left: 9,
    creator_count: 16,
    niche_overlap: 2,
  }),
  feed({
    id: 'l2',
    company_name: 'Lumen Skin',
    title: 'Morning routine creators',
    tagline: 'Three step skincare that fits in a gym bag.',
    niches: ['fashion_beauty', 'lifestyle', 'fitness'],
    posts_per_week: 7,
    posts_per_day_min: 1,
    posts_per_day_max: 1,
    video_post_cents: 2500,
    static_post_cents: 1000,
    cents_per_1k_views: 200,
    view_pay_cap_cents: 50000,
    min_views: 1000,
    brand_color: '#D0397A',
    creator_count: 41,
    application_id: 'a2',
    application_status: 'invited',
    application_origin: 'invited',
    invite_message: 'Hey Maya, your get ready with me videos are exactly our vibe. We would love to have you on the team.',
    niche_overlap: 1,
  }),
  feed({
    id: 'l3',
    company_name: 'Fuel Bar',
    title: 'Gym and run creators',
    tagline: 'Protein bars that do not taste like chalk.',
    niches: ['fitness', 'food', 'sports'],
    posts_per_week: 21,
    posts_per_day_min: 3,
    posts_per_day_max: 3,
    video_post_cents: 1500,
    static_post_cents: 750,
    brand_color: '#F97316',
    spots: 40,
    spots_left: 31,
    creator_count: 9,
    application_id: 'a3',
    application_status: 'applied',
    application_origin: 'applied',
    signed_at: day(1),
  }),
  feed({
    id: 'l4',
    company_name: 'Pocket Budget',
    title: 'Money creators, new or pro',
    tagline: 'The budgeting app that texts you before you overspend.',
    niches: ['finance', 'tech'],
    posts_per_week: 14,
    video_post_cents: 1250,
    cents_per_1k_views: 150,
    view_pay_cap_cents: 20000,
    min_views: 0,
    brand_color: '#0D9488',
    creator_count: 22,
  }),
];

export const PREVIEW_RESUME: CreatorResume = {
  user_id: 'me',
  instagram: 'mayamakes',
  tiktok: 'mayamakes',
  experience: 'some',
  best_campaign: 'Did 12 videos for a planner brand, two passed 200k views.',
  niches: ['education', 'lifestyle', 'fashion_beauty'],
  portfolio: [{ url: 'https://www.tiktok.com/@mayamakes/video/7300000000000000001' }],
  bio: 'Junior at UT Austin. Study vlogs, get ready with me, honest reviews.',
  gender: 'female',
  birth_year: new Date().getFullYear() - 21,
  location: 'Austin',
  country: 'US',
  languages: ['english', 'spanish'],
  youtube: null,
  tiktok_followers: 18400,
  instagram_followers: 6200,
  youtube_followers: null,
  listed: true,
};

export const PREVIEW_LISTING: Listing = {
  id: 'l1',
  company_id: 'co-l1',
  status: 'open',
  title: 'Study creators for Inkbound',
  tagline: 'Make videos about the app that turns your notes into essays you actually understand.',
  about: 'Inkbound is a writing app for students. You paste your notes, it helps you outline, draft and cite.',
  requirements: 'College students who post study or day in the life content and are comfortable talking to camera.',
  niches: ['education', 'tech', 'lifestyle'],
  platforms: ['tiktok', 'instagram'],
  posts_per_week: 14,
  spots: 25,
  min_age: 18,
  start_days: 3,
  contract_title: 'Creator agreement',
  contract_body: CONTRACT,
  contract_version: 1,
  opened_at: day(6),
  brand_color: '#6D4AE0',
  ...DEFAULT_TERMS,
};

function creator(over: Partial<MarketCreator> & Pick<MarketCreator, 'creator_id' | 'full_name'>): MarketCreator {
  return {
    avatar_path: null,
    age: null,
    gender: null,
    location: null,
    bio: null,
    instagram: null,
    tiktok: null,
    youtube: null,
    followers: null,
    tiktok_followers: null,
    instagram_followers: null,
    youtube_followers: null,
    country: null,
    languages: [],
    experience: null,
    campaigns_done: null,
    best_campaign: null,
    niches: [],
    styles: [],
    on_camera: null,
    weekly_capacity: null,
    portfolio: [],
    total_views: 0,
    posts_live: 0,
    total_earned_cents: 0,
    companies_count: 0,
    joined_at: day(20),
    is_member: false,
    match_score: 50,
    match_reason: null,
    match_ai: true,
    application_id: null,
    application_status: null,
    application_origin: null,
    application_note: null,
    signed_name: null,
    signed_at: null,
    start_date: null,
    applied_at: null,
    ...over,
  };
}

export const PREVIEW_CREATORS: MarketCreator[] = [
  creator({
    creator_id: 'c1',
    full_name: 'Maya Torres',
    age: 21,
    gender: 'female',
    location: 'Austin, TX',
    tiktok: 'mayamakes',
    instagram: 'mayamakes',
    followers: 24600,
    experience: 'some',
    campaigns_done: '1-5',
    best_campaign: 'Did 12 videos for a planner brand, two passed 200k views.',
    bio: 'Junior at UT Austin. Study vlogs, get ready with me, honest reviews.',
    niches: ['education', 'lifestyle', 'fashion_beauty'],
    weekly_capacity: '3-5',
    portfolio: [{ url: 'https://www.tiktok.com/@mayamakes/video/7300000000000000001' }, { url: 'https://www.tiktok.com/@mayamakes/video/7300000000000000002' }],
    total_views: 842000,
    posts_live: 31,
    total_earned_cents: 118400,
    companies_count: 1,
    match_score: 94,
    match_reason: 'Study vlogger at a big campus with 842k views on past Noni posts.',
    application_id: 'a1',
    application_status: 'applied',
    application_origin: 'applied',
    application_note: 'I already use Inkbound for my comp lit papers. I can show it in my real study sessions.',
    signed_name: 'Maya Torres',
    signed_at: day(0.4),
    applied_at: day(0.4),
  }),
  creator({
    creator_id: 'c2',
    full_name: 'Devon Park',
    age: 23,
    gender: 'male',
    location: 'Columbus, OH',
    tiktok: 'devonstudies',
    followers: 9100,
    experience: 'pro',
    campaigns_done: '5-20',
    niches: ['education', 'tech', 'finance'],
    total_views: 412000,
    posts_live: 58,
    total_earned_cents: 96200,
    companies_count: 2,
    match_score: 88,
    match_reason: 'Tech and study creator who has shipped 58 paid posts on time.',
  }),
  creator({
    creator_id: 'c3',
    full_name: 'Priya Nair',
    age: 19,
    gender: 'female',
    location: 'Atlanta, GA',
    instagram: 'priya.notes',
    followers: 3200,
    experience: 'new',
    niches: ['education', 'lifestyle'],
    total_views: 0,
    posts_live: 0,
    total_earned_cents: 0,
    match_score: 76,
    match_reason: 'Brand new, but posts note taking content to exactly your audience.',
  }),
  creator({
    creator_id: 'c4',
    full_name: 'Jordan Blake',
    age: 27,
    gender: 'nonbinary',
    location: 'Denver, CO',
    tiktok: 'jordanlifts',
    followers: 132000,
    experience: 'pro',
    campaigns_done: '20+',
    niches: ['fitness', 'food'],
    total_views: 2400000,
    posts_live: 120,
    total_earned_cents: 412000,
    companies_count: 3,
    match_score: 41,
    match_reason: 'Huge reach, but a gym audience with little overlap with students.',
  }),
];

const CAMPAIGN_BASE: Omit<CreatorCampaign, 'kind' | 'company_id' | 'company_name' | 'logo_path'> = { listing_id: null, title: null, posts_per_week: 3, application_id: null, application_status: null, invite_message: null, is_active: false, since: '2026-11-10T12:00:00Z', start_date: null, to_fix: 0, to_make: 0, in_review: 0, posted: 0, unread: 0, earned_month_cents: 0, earned_total_cents: 0 };

/** My campaigns sample: three live companies, two applications, one past. */
export const PREVIEW_CAMPAIGNS: CreatorCampaign[] = [
  { ...CAMPAIGN_BASE, kind: 'active', company_id: 'c-ink', company_name: 'Inkbound AI', logo_path: null, title: 'Tattoo ideas in seconds', is_active: true, to_make: 2, unread: 1, in_review: 1, posted: 14, earned_month_cents: 18400 },
  { ...CAMPAIGN_BASE, kind: 'active', company_id: 'c-fv', company_name: 'FieldVision', logo_path: null, title: 'Soccer film breakdowns', to_fix: 1, posted: 6, earned_month_cents: 7600 },
  { ...CAMPAIGN_BASE, kind: 'active', company_id: 'c-crumbs', company_name: 'socialcrumbs', logo_path: null, title: 'socialcrumbs', posted: 3, earned_month_cents: 3100 },
  { ...CAMPAIGN_BASE, kind: 'invited', company_id: 'c-glow', company_name: 'Glowday', logo_path: null, title: 'Morning skincare in 30 seconds', listing_id: 'l-glow', application_id: 'a-glow', application_status: 'invited', invite_message: 'Loved your GRWM videos. Want in?' },
  { ...CAMPAIGN_BASE, kind: 'applied', company_id: 'c-lift', company_name: 'Liftly', logo_path: null, title: 'Gym form checks', listing_id: 'l-lift', application_status: 'applied' },
  { ...CAMPAIGN_BASE, kind: 'past', company_id: 'c-old', company_name: 'Snackbox', logo_path: null, title: 'Snackbox', application_status: 'left', posted: 9, earned_total_cents: 12900 },
];

const minutesAgo = (n: number) => new Date(Date.now() - n * 6e4).toISOString();

/** A sample thread between Inkbound AI and Maya, as the company reads it. */
export const PREVIEW_MESSAGES: ThreadMessage[] = [
  { id: 'm1', from_company: false, mine: false, body: 'Hi! I applied this morning. Happy to send more videos if that helps.', created_at: minutesAgo(190), read_at: minutesAgo(120) },
  { id: 'm2', from_company: true, mine: true, body: 'Hey Maya, loved the comp lit study session one. Do you film in your dorm or the library?', created_at: minutesAgo(118), read_at: minutesAgo(90) },
  { id: 'm3', from_company: false, mine: false, body: 'Both. Library on weekdays, dorm desk at night.', created_at: minutesAgo(88), read_at: minutesAgo(60) },
  { id: 'm4', from_company: false, mine: false, body: 'I can start this week.', created_at: minutesAgo(87), read_at: minutesAgo(60) },
  { id: 'm5', from_company: true, mine: true, body: 'Perfect. Two posts a day works for you?', created_at: minutesAgo(40), read_at: null },
  { id: 'm6', from_company: false, mine: false, body: 'Yes, easily.', created_at: minutesAgo(3), read_at: null },
];

/** An in-memory thread for the previews. `side` picks whose bubbles are mine. */
export function previewThread(side: 'company' | 'creator' = 'company', start: ThreadMessage[] = PREVIEW_MESSAGES) {
  let rows = start.map((m) => ({ ...m, mine: m.from_company === (side === 'company') }));
  return {
    load: async () => rows,
    send: async (body: string) => {
      const sent: ThreadMessage = { id: `m-${rows.length + 1}-${Date.now()}`, from_company: side === 'company', mine: true, body, created_at: new Date().toISOString(), read_at: null };
      rows = [...rows, sent];
      return sent;
    },
  };
}
