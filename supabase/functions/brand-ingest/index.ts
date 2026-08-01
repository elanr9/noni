import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  adminClient,
  askClaude,
  authenticate,
  jsonResponse,
  parseClaudeJson,
} from '../_shared/wp8.ts';

type HumanDocKind = 'product_truth' | 'audience_niche' | 'voice';
const HUMAN_DOC_KINDS: HumanDocKind[] = ['product_truth', 'audience_niche', 'voice'];

type IngestBody = {
  company_name?: string;
  website?: string;
  instagram_handle?: string;
  tiktok_handle?: string;
  // Admin "draft this doc" button: draft these docs even if non-empty,
  // as long as they were never human edited.
  docs?: HumanDocKind[];
};

type BrandResult = {
  tone: string;
  audience: string;
  products: string;
  pillars: string[];
};

const PAGE_CHAR_CAP = 6000;
const TOTAL_CHAR_CAP = 20000;
const MAX_SUBPAGES = 5;
const SUBPAGE_HINTS = [
  'about', 'product', 'pricing', 'feature', 'how', 'faq', 'team', 'mission', 'why',
];

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NoniBot/1.0)' },
  });
  if (!res.ok) throw new Error(`site fetch ${res.status}`);
  return res.text();
}

// Homepage plus up to MAX_SUBPAGES same-domain pages, preferring paths that
// look like about/product/pricing content.
async function crawlSite(website: string): Promise<string> {
  const base = new URL(website.startsWith('http') ? website : `https://${website}`);
  const homeHtml = await fetchPage(base.href);

  const paths = new Set<string>();
  for (const match of homeHtml.matchAll(/href="([^"#?]+)"/gi)) {
    try {
      const url = new URL(match[1], base);
      if (url.hostname !== base.hostname) continue;
      const path = url.pathname.replace(/\/$/, '');
      if (!path || path === base.pathname.replace(/\/$/, '')) continue;
      if (/\.(png|jpe?g|svg|gif|pdf|css|js|ico|webp|mp4)$/i.test(path)) continue;
      paths.add(path);
    } catch {
      // Ignore malformed hrefs.
    }
  }

  const ranked = [...paths].sort((a, b) => {
    const score = (p: string) =>
      SUBPAGE_HINTS.some((h) => p.toLowerCase().includes(h)) ? 0 : 1;
    return score(a) - score(b) || a.length - b.length;
  });

  const chunks = [stripHtml(homeHtml).slice(0, PAGE_CHAR_CAP)];
  for (const path of ranked.slice(0, MAX_SUBPAGES)) {
    try {
      const html = await fetchPage(new URL(path, base).href);
      chunks.push(`\n[Page ${path}]\n${stripHtml(html).slice(0, PAGE_CHAR_CAP)}`);
    } catch {
      // Skip unreachable pages.
    }
    if (chunks.join('').length >= TOTAL_CHAR_CAP) break;
  }
  return chunks.join('\n').slice(0, TOTAL_CHAR_CAP);
}

// Best effort: recent TikTok captions via Apify so Claude hears the brand's
// actual social voice, not just the website.
async function fetchRecentCaptions(tiktokHandle: string): Promise<string[]> {
  const token = Deno.env.get('APIFY_API_TOKEN');
  if (!token) return [];
  const handle = tiktokHandle.replace(/^@/, '');
  const res = await fetch(
    `https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profiles: [handle], resultsPerPage: 6 }),
      signal: AbortSignal.timeout(60000),
    },
  );
  if (!res.ok) return [];
  const items = (await res.json()) as Array<{ text?: string }>;
  return items.map((i) => i.text ?? '').filter(Boolean).slice(0, 6);
}

type SourceMaterial = {
  name: string;
  website: string;
  instagramHandle: string;
  tiktokHandle: string;
  siteText: string;
  captions: string[];
};

async function gatherSources(
  admin: SupabaseClient,
  companyId: string,
  body: IngestBody,
): Promise<SourceMaterial> {
  const { data: company } = await admin
    .from('companies')
    .select('name, website, settings')
    .eq('id', companyId)
    .single();
  const settings = (company?.settings ?? {}) as {
    handles?: { instagram?: string; tiktok?: string };
  };
  const name = body.company_name || company?.name || 'the brand';
  const website = body.website || company?.website || '';
  const tiktokHandle = body.tiktok_handle || settings.handles?.tiktok || '';
  const instagramHandle = body.instagram_handle || settings.handles?.instagram || '';

  const [siteText, captions] = await Promise.all([
    website ? crawlSite(website).catch(() => '') : Promise.resolve(''),
    tiktokHandle
      ? fetchRecentCaptions(tiktokHandle).catch(() => [] as string[])
      : Promise.resolve([] as string[]),
  ]);
  return { name, website, instagramHandle, tiktokHandle, siteText, captions };
}

function sourceLines(src: SourceMaterial): string {
  return [
    `Brand name: ${src.name}`,
    src.website ? `Website: ${src.website}` : null,
    src.instagramHandle ? `Instagram: ${src.instagramHandle}` : null,
    src.tiktokHandle ? `TikTok: ${src.tiktokHandle}` : null,
    src.siteText ? `\nWebsite text:\n${src.siteText}` : '\nNo website text available.',
    src.captions.length
      ? `\nRecent post captions:\n${src.captions.map((c) => `- ${c.slice(0, 300)}`).join('\n')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');
}

// Legacy structured fields, still consumed by onboarding suggestions.
async function generateProfileFields(src: SourceMaterial): Promise<BrandResult> {
  const system = `You analyze a brand for a UGC content engine. Answer with a single JSON object: {"tone": string, "audience": string, "products": string, "pillars": string[]}. tone: two or three sentences describing the brand voice for short form video. audience: two sentences describing who watches and buys, written so a founder nods and says "yes, that's them". products: two sentences on what is sold and the outcome customers get. pillars: 5 to 7 short content pillar names (2 to 4 words each) tailored to this brand, ordered by expected performance.`;
  const result = parseClaudeJson<BrandResult>(await askClaude(system, sourceLines(src)));
  if (!result.audience || !result.products || !Array.isArray(result.pillars)) {
    throw new Error('Claude returned an incomplete brand profile');
  }
  return result;
}

const DOC_SPECS: Record<HumanDocKind, string> = {
  product_truth:
    'product_truth: what the product does, who pays for it and why, the 3 to 5 killer features worth plugging in content, natural product-plug angles (how to slot the product into a tips list or story without sounding like an ad), and banned claims or topics.',
  audience_niche:
    'audience_niche: exactly who the audience is, their pains and dreams in their own words, the niche boundaries (what is squarely in the niche, what is adjacent, what is out), the account types they already follow, and the language and slang they use.',
  voice:
    'voice: how the brand sounds in short form content, with 5 to 8 real example lines written in that voice (hooks, mid-script lines, CTA lines), and what the voice never does.',
};

async function draftDocs(
  src: SourceMaterial,
  kinds: HumanDocKind[],
): Promise<Partial<Record<HumanDocKind, string>>> {
  if (kinds.length === 0) return {};
  const system = `You write brand knowledge documents for a UGC content engine. Each document is markdown with short sections and concrete specifics, no filler, written so a content strategist can act on it directly. Answer with a single JSON object whose keys are exactly: ${kinds.join(', ')}. Each value is the full markdown document as a string.\n\nDocument specs:\n${kinds.map((k) => DOC_SPECS[k]).join('\n')}`;
  const result = parseClaudeJson<Partial<Record<HumanDocKind, string>>>(
    await askClaude(system, sourceLines(src), 8192),
  );
  return result;
}

async function upsertDoc(
  admin: SupabaseClient,
  companyId: string,
  kind: string,
  content: string,
  humanEdited = false,
): Promise<void> {
  const { error } = await admin.from('brand_docs').upsert(
    {
      company_id: companyId,
      kind,
      content,
      human_edited: humanEdited,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'company_id,kind' },
  );
  if (error) throw error;
}

type DocRow = { kind: string; content: string; human_edited: boolean };

async function loadDocs(admin: SupabaseClient, companyId: string): Promise<DocRow[]> {
  const { data } = await admin
    .from('brand_docs')
    .select('kind, content, human_edited')
    .eq('company_id', companyId);
  return (data ?? []) as DocRow[];
}

// Full ingest: refresh legacy profile fields, then draft any human doc that
// is draftable (empty, or explicitly requested and never human edited).
async function ingestCompany(
  admin: SupabaseClient,
  companyId: string,
  body: IngestBody,
): Promise<BrandResult> {
  const src = await gatherSources(admin, companyId, body);
  const result = await generateProfileFields(src);

  const fields = {
    tone: result.tone,
    audience: result.audience,
    products: { description: result.products },
    content_pillars: result.pillars,
    source_urls: src.website ? [src.website] : [],
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await admin
    .from('brand_profiles')
    .select('id')
    .eq('company_id', companyId)
    .maybeSingle();
  const { error } = existing
    ? await admin.from('brand_profiles').update(fields).eq('id', existing.id)
    : await admin.from('brand_profiles').insert({ company_id: companyId, ...fields });
  if (error) throw error;

  const docs = await loadDocs(admin, companyId);
  const draftable = HUMAN_DOC_KINDS.filter((kind) => {
    const row = docs.find((d) => d.kind === kind);
    if (row?.human_edited) return false;
    if (body.docs) return body.docs.includes(kind);
    return !row || row.content.trim() === '';
  });

  if (draftable.length > 0) {
    const drafted = await draftDocs(src, draftable);
    for (const kind of draftable) {
      const content = drafted[kind];
      if (content?.trim()) await upsertDoc(admin, companyId, kind, content);
    }
  }
  return result;
}

// Monthly cron: never touches the human docs; appends a dated findings note
// to the machine-owned learnings doc instead.
async function refreshLearnings(admin: SupabaseClient, companyId: string): Promise<void> {
  const src = await gatherSources(admin, companyId, {});
  if (!src.siteText && src.captions.length === 0) return;

  const docs = await loadDocs(admin, companyId);
  const productDoc = docs.find((d) => d.kind === 'product_truth')?.content ?? '';
  const learnings = docs.find((d) => d.kind === 'learnings')?.content ?? '';

  const system = `You maintain the learnings document of a UGC content engine. Given the brand's current product document and freshly crawled site and social material, list only genuinely new or changed facts worth knowing for content creation (new features, pricing changes, positioning shifts, new campaigns). Answer with a single JSON object: {"findings": string[]}. 0 to 5 findings, one sentence each. Return an empty array if nothing changed.`;
  const user = [
    productDoc ? `Current product document:\n${productDoc.slice(0, 4000)}` : null,
    sourceLines(src),
  ]
    .filter(Boolean)
    .join('\n\n');

  const { findings } = parseClaudeJson<{ findings: string[] }>(
    await askClaude(system, user, 1024),
  );
  if (!Array.isArray(findings) || findings.length === 0) return;

  const date = new Date().toISOString().slice(0, 10);
  const note = `\n\n## Site refresh ${date}\n${findings.map((f) => `- ${f}`).join('\n')}`;
  await upsertDoc(admin, companyId, 'learnings', `${learnings}${note}`.trim());
}

Deno.serve(async (req) => {
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);

  const body = ((await req.json().catch(() => null)) ?? {}) as IngestBody;

  try {
    if (caller.kind === 'user') {
      if (caller.role !== 'admin') return jsonResponse({ error: 'forbidden' }, 403);
      const result = await ingestCompany(admin, caller.companyId, body);
      return jsonResponse(result as unknown as Record<string, unknown>);
    }

    // Monthly cron: append fresh findings to learnings for every company.
    const { data: profiles } = await admin.from('brand_profiles').select('company_id');
    let refreshed = 0;
    for (const p of profiles ?? []) {
      try {
        await refreshLearnings(admin, p.company_id);
        refreshed += 1;
      } catch (e) {
        console.error(`brand-ingest failed for ${p.company_id}:`, e);
      }
    }
    return jsonResponse({ refreshed });
  } catch (e) {
    console.error('brand-ingest error:', e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : 'brand ingest failed' },
      500,
    );
  }
});
