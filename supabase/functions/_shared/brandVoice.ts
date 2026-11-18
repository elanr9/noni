// Company aware wording for prompts and pushes, so nothing assumes one
// customer's industry. Mirrors lib/company-copy.ts (the app side); keep the
// niche resolution order the same:
//   1. companies.settings.account_template.niche / search_phrases
//   2. company_research.profile.niche, playbook.content_angles[].search_phrase
//   3. neutral wording built from the company name.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import type { BrandContext } from './wp8.ts';

export type CompanyNiche = {
  companyName: string;
  niche: string | null;
  searchPhrases: string[];
};

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};
}

function clean(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.replace(/\s+/g, ' ').trim().replace(/[.;:,]+$/, '');
  return t ? t.slice(0, 80) : null;
}

function inSentence(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

export function resolveNiche(
  companyName: string,
  settings: unknown,
  research: { profile?: unknown; playbook?: unknown } | null,
): CompanyNiche {
  const template = obj(obj(settings).account_template);
  const niche = clean(template.niche) ?? clean(obj(research?.profile).niche);
  const list = (v: unknown) =>
    (Array.isArray(v) ? v : []).map(clean).filter((x): x is string => x !== null);
  const fromTemplate = list(template.search_phrases);
  const angles = Array.isArray(obj(research?.playbook).content_angles)
    ? (obj(research?.playbook).content_angles as unknown[])
    : [];
  const fromResearch = list(angles.map((a) => obj(a).search_phrase));
  const phrases = fromTemplate.length > 0
    ? fromTemplate
    : fromResearch.slice(0, 3).concat(niche ? [niche] : []);
  return {
    companyName: companyName.trim() || 'the brand',
    niche: niche ? inSentence(niche) : null,
    searchPhrases: [...new Set(phrases.map(inSentence))].slice(0, 3),
  };
}

/** Niche for many companies at once (cron jobs). Missing rows fall back to neutral copy. */
export async function loadNiches(
  admin: SupabaseClient,
  companyIds: string[],
): Promise<Map<string, CompanyNiche>> {
  const out = new Map<string, CompanyNiche>();
  if (companyIds.length === 0) return out;
  const [{ data: companies }, { data: research }] = await Promise.all([
    admin.from('companies').select('id, name, settings').in('id', companyIds),
    admin.from('company_research').select('company_id, profile, playbook').in('company_id', companyIds),
  ]);
  const researchBy = new Map<string, { profile?: unknown; playbook?: unknown }>();
  for (const r of (research ?? []) as Array<{ company_id: string; profile: unknown; playbook: unknown }>) {
    researchBy.set(r.company_id, r);
  }
  for (const c of (companies ?? []) as Array<{ id: string; name: string | null; settings: unknown }>) {
    out.set(c.id, resolveNiche(c.name ?? '', c.settings, researchBy.get(c.id) ?? null));
  }
  for (const id of companyIds) {
    if (!out.has(id)) out.set(id, resolveNiche('', null, null));
  }
  return out;
}

/** The warm-up push body for one company. No dashes. */
export function warmupPushBody(n: CompanyNiche): string {
  const q = n.searchPhrases.slice(0, 2).map((p) => `"${p}"`);
  const search = q.length > 0
    ? `Search ${q.join(' or ')}`
    : `Search the topics you post about for ${n.companyName}`;
  return `${search}, then like, comment, save, and scroll for 10 to 15 minutes.`;
}

/**
 * Who the posts are for, for prompt voice lines: the brand profile's
 * audience, else the vertical, else null (the prompt then says "this
 * audience" and leans on the brand docs).
 */
export function brandAudience(
  brand: Pick<BrandContext, 'audience' | 'vertical'>,
): string | null {
  const a = brand.audience?.replace(/\s+/g, ' ').trim();
  if (a) return a.length > 240 ? `${a.slice(0, 237).replace(/\s+\S*$/, '')}...` : a;
  const v = brand.vertical?.replace(/_/g, ' ').trim();
  return v || null;
}
