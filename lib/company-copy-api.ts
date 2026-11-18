import { useEffect, useState } from 'react';

import { useAuth } from './auth';
import { emptyNiche, resolveCompanyNiche, type CompanyNiche } from './company-copy';
import { supabase } from './supabase';
import type { Json } from './types';

function obj(v: Json | null | undefined): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

const cache = new Map<string, Promise<CompanyNiche>>();

/**
 * The company's niche, search phrases and keywords from its account
 * template, research profile and hashtag bank. Never throws: a company with
 * nothing filled in gets neutral copy built from its name.
 */
export function loadCompanyNiche(companyId: string): Promise<CompanyNiche> {
  const hit = cache.get(companyId);
  if (hit) return hit;
  const p = (async () => {
    const [companyRes, researchRes, brandRes] = await Promise.all([
      supabase.from('companies').select('name, slug, settings').eq('id', companyId).maybeSingle(),
      supabase.from('company_research').select('profile, playbook').eq('company_id', companyId).maybeSingle(),
      supabase.from('brand_profiles').select('hashtag_bank').eq('company_id', companyId).maybeSingle(),
    ]);
    const company = companyRes.data;
    const template = obj(obj(company?.settings).account_template as Json);
    const profile = obj(researchRes.data?.profile);
    const playbook = obj(researchRes.data?.playbook);
    const angles = Array.isArray(playbook.content_angles) ? (playbook.content_angles as unknown[]) : [];
    return resolveCompanyNiche({
      companyName: company?.name ?? '',
      slug: company?.slug ?? '',
      templateNiche: typeof template.niche === 'string' ? template.niche : null,
      templateSearches: strings(template.search_phrases),
      researchNiche: typeof profile.niche === 'string' ? profile.niche : null,
      researchSearches: angles
        .map((a) => obj(a as Json).search_phrase)
        .filter((x): x is string => typeof x === 'string'),
      hashtags: strings(brandRes.data?.hashtag_bank),
    });
  })().catch(() => emptyNiche());
  cache.set(companyId, p);
  return p;
}

/** Drop the cached niche, e.g. after the admin saves the account template. */
export function forgetCompanyNiche(companyId: string): void {
  cache.delete(companyId);
}

/** The active company's niche; neutral copy from the company name until it loads. */
export function useCompanyNiche(): CompanyNiche {
  const { profile, activeCompany } = useAuth();
  const companyId = profile?.active_company_id ?? null;
  const fallback = emptyNiche(activeCompany?.name ?? '', activeCompany?.slug ?? '');
  const [state, setState] = useState<{ id: string; niche: CompanyNiche } | null>(null);
  useEffect(() => {
    if (!companyId) return;
    let live = true;
    void loadCompanyNiche(companyId).then((niche) => {
      if (live) setState({ id: companyId, niche });
    });
    return () => {
      live = false;
    };
  }, [companyId]);
  return state && state.id === companyId ? state.niche : fallback;
}
