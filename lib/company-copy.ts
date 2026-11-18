/**
 * Company aware copy for the creator setup flow (handles, warm-up steps, the
 * feed check). Every company describes its own niche; nothing here assumes a
 * particular industry. Pure functions only so tests and both apps can use
 * them; the loader lives in company-copy-api.ts.
 *
 * Where the niche comes from, first match wins:
 *   1. companies.settings.account_template.niche / search_phrases (the admin
 *      Account template screen)
 *   2. company_research.profile.niche and playbook.content_angles[].search_phrase
 *      (the website research run)
 *   3. nothing: copy falls back to neutral wording built from the company name.
 */

export type CompanyNiche = {
  companyName: string;
  slug: string;
  /** What the creator's feed should be about, e.g. "home workouts". Null when unknown. */
  niche: string | null;
  /** Phrases a creator types into TikTok or Instagram search to warm up. May be empty. */
  searchPhrases: string[];
  /** Single word topics for handle ideas and sound search chips. May be empty. */
  keywords: string[];
};

export type NicheSources = {
  companyName: string;
  slug: string;
  templateNiche?: string | null;
  templateSearches?: string[] | null;
  researchNiche?: string | null;
  researchSearches?: string[] | null;
  hashtags?: string[] | null;
};

const STOPWORDS = new Set([
  'and', 'the', 'for', 'with', 'your', 'you', 'from', 'into', 'that', 'this',
  'how', 'what', 'who', 'are', 'our', 'their', 'about', 'tips', 'content',
  'videos', 'video', 'people', 'more', 'best',
]);

function clean(s: string | null | undefined): string | null {
  const t = (s ?? '').replace(/\s+/g, ' ').trim().replace(/[.;:,]+$/, '');
  return t ? t.slice(0, 80) : null;
}

/** "Home workouts" -> "home workouts" for use mid sentence; leaves acronyms and names alone. */
export function inSentence(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function titleCase(s: string): string {
  return s
    .split(' ')
    .map((w) => (w.length > 2 || w === s ? capitalize(w) : w))
    .join(' ');
}

/** Lowercase a to z and 0 to 9 only, for handles and tags. */
export function handleToken(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function resolveCompanyNiche(src: NicheSources): CompanyNiche {
  const niche = clean(src.templateNiche) ?? clean(src.researchNiche);
  const list = (xs: string[] | null | undefined) =>
    (xs ?? []).map((x) => clean(x)).filter((x): x is string => x !== null);
  const fromTemplate = list(src.templateSearches);
  const searchPhrases = [
    ...new Set(
      (fromTemplate.length > 0
        ? fromTemplate
        : list(src.researchSearches).slice(0, 3).concat(niche ? [niche] : [])
      ).map(inSentence),
    ),
  ].slice(0, 3);

  const keywords: string[] = [];
  const push = (w: string) => {
    const tok = handleToken(w);
    if (tok.length < 3 || tok.length > 18 || STOPWORDS.has(tok)) return;
    if (!keywords.includes(tok)) keywords.push(tok);
  };
  if (niche) {
    const words = niche.split(/[\s/&,]+/).filter(Boolean);
    if (words.length > 1 && words.length <= 3) push(words.join(''));
    // Lone words make weak handles ("sam.home"); keep only the meaty ones.
    words.filter((w) => words.length === 1 || w.length >= 6).forEach(push);
  }
  (src.hashtags ?? []).forEach((h) => push(h.replace(/^#/, '')));

  return {
    companyName: src.companyName.trim() || 'the brand',
    slug: handleToken(src.slug) || handleToken(src.companyName),
    niche: niche ? inSentence(niche) : null,
    searchPhrases,
    keywords: keywords.slice(0, 8),
  };
}

/** Neutral niche for a company we know nothing about yet. */
export function emptyNiche(companyName = '', slug = ''): CompanyNiche {
  return resolveCompanyNiche({ companyName, slug });
}

// ---------------------------------------------------------------------------
// Account names

export type AccountNameSuggestions = {
  /** Profile display names, e.g. "Sam | Home Workouts". */
  displayNames: string[];
  /** @handles without the @, e.g. "sam.homeworkouts". */
  usernames: string[];
};

/**
 * Display name is the creator plus the company's niche; usernames mix the
 * creator's name with the niche keywords, else the company slug.
 */
export function suggestAccountNames(
  fullName: string,
  company: CompanyNiche,
): AccountNameSuggestions {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? 'Creator';
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  const firstTok = handleToken(first) || 'creator';
  const lastTok = handleToken(last);
  const short = firstTok.slice(0, 12);
  const label = company.niche ? titleCase(company.niche) : null;

  const displayNames = label
    ? [
        `${first} | ${label}`,
        last ? `${first} ${last} | ${label}` : `${label} with ${first}`,
        `${label} with ${first}`,
      ]
    : [first, last ? `${first} ${last}` : `${first} creates`];

  const stems = company.keywords.length > 0 ? company.keywords.slice(0, 4) : [company.slug];
  const usernames = new Set<string>();
  for (const stem of stems) {
    if (!stem) continue;
    usernames.add(`${short}.${stem}`);
    usernames.add(`${short}${stem}`);
  }
  if (stems[0]) usernames.add(`${stems[0]}with${short}`);
  if (lastTok) usernames.add(`${short}.${lastTok}`);
  usernames.add(`${short}.creates`);

  return {
    displayNames: [...new Set(displayNames)],
    usernames: [...usernames].filter((u) => u.length >= 3 && u.length <= 30).slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Warm-up and the feed check

function quoteList(phrases: string[]): string {
  const q = phrases.slice(0, 2).map((p) => `"${p}"`);
  return q.join(' or ');
}

/** The warm-up checklist a creator follows on a fresh TikTok and Instagram. */
export function warmupSteps(company: CompanyNiche): string[] {
  const { niche, searchPhrases, companyName } = company;
  return [
    searchPhrases.length > 0
      ? `Search ${quoteList(searchPhrases)}`
      : `Search the topics you will post about for ${companyName}`,
    niche ? `Like and save ${niche} videos` : 'Like and save videos on those topics',
    niche ? `Follow a few ${niche} accounts` : 'Follow a few accounts that post about them',
    'Watch videos to the end',
    '15 minutes on TikTok and Instagram',
  ];
}

/** One line for the warm-up push. */
export function warmupPushBody(company: CompanyNiche): string {
  const search =
    company.searchPhrases.length > 0
      ? `Search ${quoteList(company.searchPhrases)}`
      : `Search the topics you post about for ${company.companyName}`;
  return `${search}, then like, comment, save, and scroll for 10 to 15 minutes.`;
}

/** Approval checklist line for the For You feed. */
export function feedCheckLabel(company: CompanyNiche): string {
  return company.niche
    ? `Feed is ${company.niche} content`
    : `Feed matches the topics ${company.companyName} posts about`;
}

/** Short meta under the TikTok For You clip in account approval. */
export function feedMeta(company: CompanyNiche): string {
  return company.niche ? capitalize(company.niche) : `Topics for ${company.companyName}`;
}

/** Search chips under the empty sound search. Empty when the company has no keywords yet. */
export function soundSuggestions(company: CompanyNiche): string[] {
  const out = [company.niche, ...company.searchPhrases, ...company.keywords]
    .filter((x): x is string => Boolean(x))
    .map((x) => x.toLowerCase());
  return [...new Set(out)].slice(0, 6);
}
