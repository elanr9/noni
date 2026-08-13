import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  adminClient,
  askClaude,
  authenticate,
  handleCors,
  jsonResponse,
  parseClaudeJson,
} from '../_shared/wp8.ts';

const MAX_FILE_BYTES = 100 * 1024;
const CHUNK_CHAR_BUDGET = 80_000;

type Body = {
  company_id?: string;
  repo_url?: string;
};

type ParsedRepo = { owner: string; repo: string };

type TreeEntry = {
  path: string;
  type: string;
  size?: number;
  sha: string;
  url: string;
};

type ExtractedFeature = {
  name: string;
  what_it_does: string;
  claim: string;
  surface: string | null;
  source_ref: string;
};

const EXTRACT_SYSTEM = `You are reading a product codebase to build a claim library for short
form video ads. For each user facing capability, return:

name          what an admin would call it
what_it_does  one sentence, mechanism only. What happens, not what it
              means for the user.
              GOOD: "Writes personalized emails to every coach on a
                     target list and follows up automatically."
              BAD:  "Streamlines outreach so you can focus on the game."
surface       route or screen name if identifiable, else null
claim         one line a 20 year old could say on camera without sounding
              like an ad. Under 20 words. No seamless, powerful,
              revolutionary. No three item lists.
source_ref    file path

Only things a user can actually do. Skip internal utilities, admin
tooling, auth plumbing, anything behind an off feature flag. If unsure it
ships, leave it out. Return a JSON array and nothing else.`;

const MERGE_SYSTEM = `You merge duplicate product feature extractions into a single list.
Deduplicate by capability (same thing under different names counts as one).
For each merged feature return:
name, what_it_does, claim, surface, source_ref

Rules:
- Prefer the clearest mechanism wording for what_it_does and claim.
- source_ref MUST survive. If merging two or more features, join their
  source_ref paths with ", " (comma-space). Never invent paths. Never drop
  a path that appeared on an input.
- surface: keep the most specific route/screen, else null.
- Return a JSON array and nothing else. Every item must have a non-empty
  source_ref.`;

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** github.com host only, owner/repo shape only. No extra path segments. */
function parseGitHubRepoUrl(raw: string): ParsedRepo | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') return null;
  const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length !== 2) return null;
  const [owner, repoRaw] = parts;
  if (!owner || !repoRaw) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner)) return null;
  const repo = repoRaw.replace(/\.git$/i, '');
  if (!/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
  return { owner, repo };
}

function shouldKeepPath(path: string): boolean {
  const p = path.replace(/\\/g, '/');
  const lower = p.toLowerCase();

  if (lower.includes('node_modules/')) return false;
  if (/(^|\/)(\.git|\.next|dist|build|coverage|vendor)\//.test(lower)) return false;
  if (/(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$/.test(lower)) {
    return false;
  }
  if (/(^|\/)(migrations|supabase\/migrations)\//.test(lower)) return false;
  if (
    /(^|\/)(__tests__|tests?|e2e|spec|__mocks__)(\/|$)/.test(lower) ||
    /\.(test|spec)\.[jt]sx?$/.test(lower)
  ) {
    return false;
  }
  if (!/\.(tsx?|jsx?|mdx?|md)$/i.test(p)) return false;

  // Docs
  if (/\.mdx?$/i.test(p)) return true;
  if (/(^|\/)docs?\//.test(lower)) return true;

  // Routes / pages / app router
  if (/(^|\/)(app|pages|src\/app|src\/pages)\//.test(lower)) return true;
  if (/(^|\/)(routes?|screens?)\//.test(lower)) return true;

  // API handlers
  if (/(^|\/)(api|handlers?)\//.test(lower)) return true;
  if (/\/route\.[jt]sx?$/i.test(p)) return true;
  if (/\/(page|layout|loading)\.[jt]sx?$/i.test(p)) return true;

  // Page-like components outside app/ (common in RN / Expo)
  if (/(^|\/)components?\/.*(screen|page|route)/i.test(p)) return true;

  return false;
}

async function githubGet<T>(
  path: string,
  token: string,
): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Noni-ingest-codebase',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

async function fetchFileText(
  owner: string,
  repo: string,
  path: string,
  token: string,
): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`,
    {
      headers: {
        Accept: 'application/vnd.github.raw',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Noni-ingest-codebase',
      },
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!res.ok) return null;
  const text = await res.text();
  if (text.length > MAX_FILE_BYTES) return null;
  return text;
}

function chunkFiles(
  files: Array<{ path: string; content: string }>,
): Array<Array<{ path: string; content: string }>> {
  const chunks: Array<Array<{ path: string; content: string }>> = [];
  let current: Array<{ path: string; content: string }> = [];
  let size = 0;
  for (const f of files) {
    const cost = f.path.length + f.content.length + 32;
    if (current.length > 0 && size + cost > CHUNK_CHAR_BUDGET) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(f);
    size += cost;
  }
  if (current.length) chunks.push(current);
  return chunks;
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

async function extractChunk(
  files: Array<{ path: string; content: string }>,
): Promise<ExtractedFeature[]> {
  const user = files
    .map((f) => `--- FILE: ${f.path} ---\n${f.content}`)
    .join('\n\n');
  const raw = await askClaude(EXTRACT_SYSTEM, user, 4096);
  const parsed = parseClaudeJson<unknown>(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map(sanitizeFeature)
    .filter((x): x is ExtractedFeature => x !== null);
}

async function mergeFeatures(
  features: ExtractedFeature[],
): Promise<ExtractedFeature[]> {
  if (features.length <= 1) return features;
  const user = JSON.stringify(features, null, 2);
  const raw = await askClaude(MERGE_SYSTEM, user, 4096);
  const parsed = parseClaudeJson<unknown>(raw);
  if (!Array.isArray(parsed)) {
    // Fall back to local name-dedupe preserving source_ref joins.
    return localDedupe(features);
  }
  const cleaned = parsed
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map(sanitizeFeature)
    .filter((x): x is ExtractedFeature => x !== null);
  return cleaned.length ? cleaned : localDedupe(features);
}

function localDedupe(features: ExtractedFeature[]): ExtractedFeature[] {
  const byName = new Map<string, ExtractedFeature>();
  for (const f of features) {
    const key = normalizeName(f.name);
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, { ...f });
      continue;
    }
    const refs = new Set(
      [...existing.source_ref.split(','), ...f.source_ref.split(',')]
        .map((s) => s.trim())
        .filter(Boolean),
    );
    existing.source_ref = [...refs].join(', ');
    if (!existing.surface && f.surface) existing.surface = f.surface;
  }
  return [...byName.values()];
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
  if (caller.role !== 'campaign_manager') return jsonResponse({ error: 'forbidden' }, 403);

  const body = ((await req.json().catch(() => null)) ?? {}) as Body;
  const companyId = body.company_id?.trim();
  const repoUrl = body.repo_url?.trim();
  if (!companyId || !repoUrl) {
    return jsonResponse({ error: 'expected { company_id, repo_url }' }, 400);
  }
  if (companyId !== caller.companyId) {
    return jsonResponse({ error: 'company_id mismatch' }, 403);
  }

  const parsed = parseGitHubRepoUrl(repoUrl);
  if (!parsed) {
    return jsonResponse(
      { error: 'repo_url must be https://github.com/owner/repo' },
      400,
    );
  }

  const token = Deno.env.get('GITHUB_TOKEN');
  if (!token) return jsonResponse({ error: 'GITHUB_TOKEN not set' }, 500);

  try {
    const repoMeta = await githubGet<{ default_branch: string }>(
      `/repos/${parsed.owner}/${parsed.repo}`,
      token,
    );
    const tree = await githubGet<{
      tree: TreeEntry[];
      truncated: boolean;
    }>(
      `/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(repoMeta.default_branch)}?recursive=1`,
      token,
    );

    const candidates = tree.tree.filter((e) => {
      if (e.type !== 'blob') return false;
      if (typeof e.size === 'number' && e.size > MAX_FILE_BYTES) return false;
      return shouldKeepPath(e.path);
    });

    const files: Array<{ path: string; content: string }> = [];
    for (const entry of candidates) {
      const content = await fetchFileText(
        parsed.owner,
        parsed.repo,
        entry.path,
        token,
      );
      if (content == null || !content.trim()) continue;
      files.push({ path: entry.path, content });
    }

    const extracted: ExtractedFeature[] = [];
    for (const chunk of chunkFiles(files)) {
      const part = await extractChunk(chunk);
      extracted.push(...part);
    }

    const merged = await mergeFeatures(extracted);
    // Hard gate: never insert without source_ref (sanitizeFeature already
    // drops empties; re-check after merge).
    const withRef = merged.filter((f) => f.source_ref.trim().length > 0);

    const existing = await loadExistingNames(admin, companyId);
    const toInsert = withRef.filter(
      (f) => !existing.has(normalizeName(f.name)),
    );
    const skippedExisting = withRef.length - toInsert.length;

    if (toInsert.length > 0) {
      const { error } = await admin.from('product_features').insert(
        toInsert.map((f) => ({
          company_id: companyId,
          name: f.name,
          what_it_does: f.what_it_does,
          claim: f.claim,
          surface: f.surface,
          source: 'repo',
          source_ref: f.source_ref,
          approved: false,
          rejected: false,
        })),
      );
      if (error) throw new Error(error.message);
    }

    return jsonResponse({
      scanned: files.length,
      inserted: toInsert.length,
      skipped_existing: skippedExisting,
      truncated_tree: tree.truncated === true,
    });
  } catch (e) {
    console.error('ingest-codebase error:', e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : 'ingest failed' },
      500,
    );
  }
});
