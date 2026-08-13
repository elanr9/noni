import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  adminClient,
  askClaude,
  askOpenAI,
  authenticate,
  handleCors,
  jsonResponse,
  parseClaudeJson,
} from '../_shared/wp8.ts';
import { crawlSite } from '../_shared/crawlSite.ts';

type HumanDocKind = 'product_truth' | 'audience_niche' | 'voice';
const HUMAN_DOC_KINDS: HumanDocKind[] = ['product_truth', 'audience_niche', 'voice'];
type CleanupKind = 'product_truth' | 'audience_niche';

type IngestBody = {
  company_name?: string;
  website?: string;
  instagram_handle?: string;
  tiktok_handle?: string;
  // Admin "draft this doc" button: draft these docs even if non-empty,
  // as long as they were never human edited.
  docs?: HumanDocKind[];
  // Brand Brain "Clean up with AI" — cheap OpenAI rewrite of editor text.
  action?: 'cleanup_doc';
  kind?: CleanupKind;
  content?: string;
};

type BrandResult = {
  tone: string;
  audience: string;
  products: string;
  pillars: string[];
};

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
  opts?: { skipCaptions?: boolean },
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

  // Admin "Draft with AI" must stay under ~15s. Apify profile sync regularly
  // burns 60s alone; skip captions on that path and rely on the website.
  const [siteText, captions] = await Promise.all([
    website ? crawlSite(website).catch(() => '') : Promise.resolve(''),
    opts?.skipCaptions || !tiktokHandle
      ? Promise.resolve([] as string[])
      : fetchRecentCaptions(tiktokHandle).catch(() => [] as string[]),
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

// Seed hashtag_bank from the brand's own recent captions: most frequent tags
// first, capped at ten. Only used when the bank is still empty, so an admin
// edited (or migration seeded) bank is never clobbered.
function hashtagsFromCaptions(captions: string[]): string[] {
  const counts = new Map<string, number>();
  for (const caption of captions) {
    for (const match of caption.matchAll(/#[\p{L}\p{N}_]+/gu)) {
      const tag = match[0].toLowerCase();
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag]) => tag);
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
    .select('id, hashtag_bank')
    .eq('company_id', companyId)
    .maybeSingle();
  const bankEmpty =
    !Array.isArray(existing?.hashtag_bank) || existing.hashtag_bank.length === 0;
  const seededBank = bankEmpty ? hashtagsFromCaptions(src.captions) : [];
  const write = seededBank.length > 0
    ? { ...fields, hashtag_bank: seededBank }
    : fields;
  const { error } = existing
    ? await admin.from('brand_profiles').update(write).eq('id', existing.id)
    : await admin.from('brand_profiles').insert({ company_id: companyId, ...write });
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

/** Admin Draft-with-AI: draft only the requested docs, no profile rewrite, no Apify. */
async function draftRequestedDocs(
  admin: SupabaseClient,
  companyId: string,
  body: IngestBody,
): Promise<{ drafted: HumanDocKind[] }> {
  const requested = (body.docs ?? []).filter((k): k is HumanDocKind =>
    (HUMAN_DOC_KINDS as string[]).includes(k),
  );
  if (requested.length === 0) {
    throw new Error('No draftable docs requested');
  }
  const existing = await loadDocs(admin, companyId);
  const blocked = requested.filter(
    (kind) => existing.find((d) => d.kind === kind)?.human_edited === true,
  );
  const draftable = requested.filter((kind) => !blocked.includes(kind));
  if (draftable.length === 0) {
    throw new Error(
      'This doc was saved by a human. Clear it and save an empty doc, or edit it yourself.',
    );
  }
  const src = await gatherSources(admin, companyId, body, { skipCaptions: true });
  if (!src.siteText.trim() && !src.name.trim()) {
    throw new Error('No website text to draft from. Set the company website first.');
  }
  const drafted = await draftDocs(src, draftable);
  const written: HumanDocKind[] = [];
  for (const kind of draftable) {
    const content = drafted[kind];
    if (content?.trim()) {
      await upsertDoc(admin, companyId, kind, content);
      written.push(kind);
    }
  }
  if (written.length === 0) {
    throw new Error('AI returned an empty draft. Try again.');
  }
  return { drafted: written };
}

const CLEANUP_SPECS: Record<CleanupKind, string> = {
  product_truth:
    'This is a product truth doc: what the product does, who pays, killer features, natural plug angles, banned claims.',
  audience_niche:
    'This is an audience niche doc: who the audience is, pains and dreams, niche boundaries, accounts they follow, language they use.',
};

async function cleanupDoc(kind: CleanupKind, content: string): Promise<string> {
  const system = `You clean up brand knowledge documents for a UGC content engine. ${CLEANUP_SPECS[kind]} Rewrite the user's draft into tight markdown: short sections, concrete specifics, no filler, no invented facts or features. Keep every real claim. Do not wrap the answer in JSON or code fences — return only the cleaned markdown document.`;
  return askOpenAI(system, content.slice(0, 12000), 4096);
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);

  const body = ((await req.json().catch(() => null)) ?? {}) as IngestBody;

  try {
    if (caller.kind === 'user') {
      if (caller.role !== 'campaign_manager') return jsonResponse({ error: 'forbidden' }, 403);
      if (body.action === 'cleanup_doc') {
        const kind = body.kind;
        const content = body.content?.trim() ?? '';
        if (kind !== 'product_truth' && kind !== 'audience_niche') {
          return jsonResponse({ error: 'kind must be product_truth or audience_niche' }, 400);
        }
        if (!content) {
          return jsonResponse({ error: 'Write something first, then clean it up.' }, 400);
        }
        const cleaned = await cleanupDoc(kind, content);
        return jsonResponse({ content: cleaned });
      }
      // Optional draft path still available for onboarding tooling.
      if (Array.isArray(body.docs) && body.docs.length > 0) {
        const result = await draftRequestedDocs(admin, caller.companyId, body);
        return jsonResponse(result);
      }
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
