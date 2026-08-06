import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  adminClient,
  askClaude,
  askClaudeVision,
  authenticate,
  handleCors,
  jsonResponse,
  parseClaudeJson,
} from '../_shared/wp8.ts';
import { crawlSite } from '../_shared/crawlSite.ts';

const INSERT_CAP = 15;
const BUCKET = 'feature-screenshots';
const MAX_IMAGES = 12;

type Body = {
  company_id?: string;
  image_urls?: string[];
  page_url?: string;
};

type ExtractedFeature = {
  name: string;
  what_it_does: string;
  claim: string;
  surface: string | null;
  source_ref: string;
};

type ProductType = 'software' | 'physical';

const EXTRACT_SHARED = `You draft rows for a product claim library used in short form video ads.
Return a JSON array and nothing else. Each item:
name          what an admin would call it
what_it_does  one sentence, mechanism or measurable fact only. Not marketing benefit.
claim         one line a 20 year old could say on camera. Under 20 words.
              Concrete and checkable. No seamless, powerful, revolutionary,
              premium. No three item lists.
surface       where on the product/UI this came from if identifiable, else null
source_ref    the image URL or page URL this came from (copy exactly from the input labels)`;

const EXTRACT_SOFTWARE = `${EXTRACT_SHARED}

Concrete means: what happens when the user does something.
  GOOD: "You hit send once and it goes out to fifty coaches."

SCREENSHOTS / MARKETING CAROUSELS (critical):
Read the product UI inside the image. IGNORE any headline, title, or
marketing text overlaid on or around it. Derive the claim from what the
interface shows a user doing. If a slide has no visible UI, skip it rather
than extracting from the copy.

Worked example:
  slide headline: FOLLOW UPS THAT SEND THEMSELVES
  UI shows: "12 follow ups drafted for you", "No reply in a week",
            per school rows, Send 12 follow ups button
  correct claim: If a coach doesn't reply in a week it drafts the
                 follow up and sends it

PAGES:
Ignore hero headlines and taglines. Prefer concrete UI copy, specs, pricing,
and described actions a user can take.

Only things a user can actually do or verify. Skip internal tooling and
vague brand promises.`;

const EXTRACT_PHYSICAL = `${EXTRACT_SHARED}

Concrete means: an attribute or spec someone who owns the product can verify.
  GOOD: "It holds forty ounces and keeps ice for a full day."

PRODUCT PHOTOS / PACKAGING (critical):
Extract ONLY from spec text: dimensions, capacity, materials, printed panel
data, care instructions, measurable claims on the back of the box.
IGNORE hero copy, taglines, lifestyle imagery, and adjectives like premium
or engineered. If an image shows no spec text, skip it rather than
extracting from marketing copy.

Worked example:
  hero copy:     ENGINEERED FOR ADVENTURE
  spec panel:    40 fl oz, 18/8 stainless, double wall vacuum, 24hr cold
  correct claim: It holds forty ounces and keeps ice for a full day

PAGES:
Ignore hero headlines, taglines, and lifestyle copy. Prefer specs,
materials, dimensions, capacity, care instructions, and measurable claims.

Only things a buyer can verify. Skip vague brand promises.`;

function extractSystem(productType: ProductType): string {
  return productType === 'physical' ? EXTRACT_PHYSICAL : EXTRACT_SOFTWARE;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function sanitizeFeature(raw: Record<string, unknown>): ExtractedFeature | null {
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const what = typeof raw.what_it_does === 'string' ? raw.what_it_does.trim() : '';
  const claim = typeof raw.claim === 'string' ? raw.claim.trim() : '';
  const sourceRef =
    typeof raw.source_ref === 'string' ? raw.source_ref.trim() : '';
  if (!name || !what || !claim || !sourceRef) return null;
  const surface =
    typeof raw.surface === 'string' && raw.surface.trim()
      ? raw.surface.trim()
      : null;
  return { name, what_it_does: what, claim, surface, source_ref: sourceRef };
}

function localDedupe(features: ExtractedFeature[]): ExtractedFeature[] {
  const byName = new Map<string, ExtractedFeature>();
  for (const f of features) {
    const key = normalizeName(f.name);
    if (!byName.has(key)) byName.set(key, { ...f });
  }
  return [...byName.values()];
}

/** Storage path company_id/... or a Supabase storage URL for this bucket. */
function parseStoragePath(raw: string, companyId: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const prefix = `${companyId}/`;
  if (!trimmed.includes('://') && trimmed.startsWith(prefix)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const marker = `/object/`;
    const idx = url.pathname.indexOf(marker);
    if (idx === -1) return null;
    // /storage/v1/object/sign|public|authenticated/feature-screenshots/<path>
    const after = url.pathname.slice(idx + marker.length);
    const parts = after.split('/');
    // parts[0] = sign|public|authenticated, parts[1] = bucket
    if (parts.length < 3) return null;
    if (parts[1] !== BUCKET) return null;
    const path = decodeURIComponent(parts.slice(2).join('/'));
    if (!path.startsWith(prefix)) return null;
    return path;
  } catch {
    return null;
  }
}

async function resolveImageUrls(
  admin: SupabaseClient,
  companyId: string,
  rawUrls: string[],
): Promise<Array<{ sourceRef: string; fetchUrl: string }>> {
  const out: Array<{ sourceRef: string; fetchUrl: string }> = [];
  for (const raw of rawUrls.slice(0, MAX_IMAGES)) {
    const path = parseStoragePath(raw, companyId);
    if (!path) {
      throw new Error(
        'image_urls must be feature-screenshots paths or storage URLs for this company',
      );
    }
    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      throw new Error(`Could not sign ${path}: ${error?.message ?? 'unknown'}`);
    }
    // Persist the stable path as source_ref so rescans and admins can find it.
    out.push({ sourceRef: path, fetchUrl: data.signedUrl });
  }
  return out;
}

async function loadProductType(
  admin: SupabaseClient,
  companyId: string,
): Promise<ProductType> {
  const { data, error } = await admin
    .from('brand_profiles')
    .select('product_type')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.product_type === 'physical' ? 'physical' : 'software';
}

async function extractFromImages(
  images: Array<{ sourceRef: string; fetchUrl: string }>,
  productType: ProductType,
): Promise<ExtractedFeature[]> {
  if (images.length === 0) return [];
  const labels = images
    .map((img, i) => `Image ${i + 1} source_ref=${img.sourceRef}`)
    .join('\n');
  const draftHint =
    productType === 'physical'
      ? 'Draft features from measurable spec text in these images.'
      : 'Draft features from the product UI in these images.';
  const raw = await askClaudeVision(
    extractSystem(productType),
    images.map((i) => i.fetchUrl),
    `${labels}\n\n${draftHint} Set source_ref to the matching source_ref label exactly.`,
    4096,
  );
  const parsed = parseClaudeJson<unknown>(raw);
  if (!Array.isArray(parsed)) return [];
  const allowed = new Set(images.map((i) => i.sourceRef));
  return parsed
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map(sanitizeFeature)
    .filter((x): x is ExtractedFeature => x !== null && allowed.has(x.source_ref));
}

async function extractFromPage(
  pageUrl: string,
  productType: ProductType,
): Promise<ExtractedFeature[]> {
  const siteText = await crawlSite(pageUrl);
  if (!siteText.trim()) return [];
  const user = `page_url source_ref=${pageUrl}\n\nPage text:\n${siteText}\n\nDraft features. Set every source_ref to ${pageUrl} exactly.`;
  const raw = await askClaude(extractSystem(productType), user, 4096);
  const parsed = parseClaudeJson<unknown>(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map(sanitizeFeature)
    .filter((x): x is ExtractedFeature => x !== null && x.source_ref === pageUrl);
}

async function loadExistingNames(
  admin: SupabaseClient,
  companyId: string,
): Promise<Set<string>> {
  const { data, error } = await admin
    .from('product_features')
    .select('name')
    .eq('company_id', companyId);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => normalizeName(r.name as string)));
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller || caller.kind !== 'user') {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  if (caller.role !== 'admin') return jsonResponse({ error: 'forbidden' }, 403);

  const body = ((await req.json().catch(() => null)) ?? {}) as Body;
  const companyId = body.company_id?.trim();
  const imageUrls = Array.isArray(body.image_urls)
    ? body.image_urls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
    : [];
  const pageUrl = body.page_url?.trim() || '';

  if (!companyId) {
    return jsonResponse({ error: 'expected { company_id, image_urls? , page_url? }' }, 400);
  }
  if (companyId !== caller.companyId) {
    return jsonResponse({ error: 'company_id mismatch' }, 403);
  }
  if (imageUrls.length === 0 && !pageUrl) {
    return jsonResponse({ error: 'expected image_urls and/or page_url' }, 400);
  }

  try {
    const productType = await loadProductType(admin, companyId);
    const extracted: ExtractedFeature[] = [];
    let scanned = 0;

    if (imageUrls.length > 0) {
      const images = await resolveImageUrls(admin, companyId, imageUrls);
      scanned += images.length;
      extracted.push(...(await extractFromImages(images, productType)));
    }

    if (pageUrl) {
      scanned += 1;
      extracted.push(...(await extractFromPage(pageUrl, productType)));
    }

    const withRef = extracted.filter((f) => f.source_ref.trim().length > 0);
    const deduped = localDedupe(withRef);
    const existing = await loadExistingNames(admin, companyId);
    const novel = deduped.filter((f) => !existing.has(normalizeName(f.name)));
    const skippedExisting = deduped.length - novel.length;
    const toInsert = novel.slice(0, INSERT_CAP);
    const droppedOverCap = Math.max(0, novel.length - toInsert.length);

    if (toInsert.length > 0) {
      const { error } = await admin.from('product_features').insert(
        toInsert.map((f) => ({
          company_id: companyId,
          name: f.name,
          what_it_does: f.what_it_does,
          claim: f.claim,
          surface: f.surface,
          source: pageUrl && f.source_ref === pageUrl ? 'site' : 'screenshot',
          source_ref: f.source_ref,
          approved: false,
          rejected: false,
        })),
      );
      if (error) throw new Error(error.message);
    }

    return jsonResponse({
      scanned,
      inserted: toInsert.length,
      skipped_existing: skippedExisting,
      dropped_over_cap: droppedOverCap,
    });
  } catch (e) {
    console.error('ingest-features error:', e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : 'ingest failed' },
      500,
    );
  }
});
