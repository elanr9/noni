// The survey's `voice` answer: the founder pastes three videos they wish were
// theirs and one they would hate. Their words about each are already turned
// into voice rules by recordSurveyAnswer. This file handles the links: each
// TikTok or Instagram post is analysed (reference.ts) and stored as a
// `reference_post` source marked liked or disliked, with one `learning`
// record that says what the post does and which way the founder leans. The
// record is unconfirmed (the reading of the post is a model's) and context
// only, and assembleBrainContext retrieves it like any other learning.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  addSource,
  type BrainDeps,
  computeConfidence,
  decideUsage,
  factKey,
  freshnessFor,
  normaliseData,
  recheckAfter,
  upsertFact,
} from './brain.ts';
import type { AuthorityTier, BrainFact, ReferenceAnalysis } from './contracts.ts';
import { awaitReferenceAnalysis, ReferenceAnalysisError } from './reference.ts';

export type VoiceReference = {
  url: string;
  stance: 'liked' | 'disliked';
  /** What the founder wrote about this post, verbatim from the answer, or ''. */
  note: string;
  /** How the stance was decided: their words, or only the order the question asks for. */
  stanceFrom: 'words' | 'position' | 'default';
};

export const MAX_VOICE_REFERENCES = 6;

const URL_RE = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:tiktok\.com|instagram\.com)\/[^\s<>"')\]]+/gi;
const NEGATIVE = /\b(hate|hated|dislike|don'?t like|do not like|can'?t stand|cannot stand|cringe|cringey|awful|terrible|worst|avoid|never want|not this|not us|not for us)\b/i;
const POSITIVE = /\b(love|like|wish|favou?rite|want|great|best)\b/i;

function cleanUrl(raw: string): string {
  const trimmed = raw.replace(/[.,;:!?]+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const tidyNote = (text: string): string => text.replace(/\s+/g, ' ').replace(/^[\s\-*•\d.):,]+/, '').replace(/[\s\-:,]+$/, '').trim();

/**
 * The TikTok and Instagram links in the answer, each with what the founder
 * said about it and whether they like it. A line's own words decide first;
 * then the nearest heading above it ("ones I hate:"); and when nothing at all
 * says which is which and there are exactly four links, the last is taken as
 * the disliked one, because that is the order the question asks for.
 */
export function parseVoiceReferences(answer: string): VoiceReference[] {
  const lines = answer.replace(/\r\n/g, '\n').split('\n');
  const out: VoiceReference[] = [];
  const seen = new Set<string>();
  let heading: 'liked' | 'disliked' | null = null;
  lines.forEach((line, i) => {
    const urls = line.match(URL_RE) ?? [];
    if (!urls.length) {
      // A line of words with no link sets the mood for the links under it,
      // unless it is the note of the link just above.
      const prevHadLink = i > 0 && (lines[i - 1].match(URL_RE) ?? []).length > 0 && !tidyNote(lines[i - 1].replace(URL_RE, ''));
      if (!prevHadLink && line.trim()) {
        if (NEGATIVE.test(line)) heading = 'disliked';
        else if (POSITIVE.test(line)) heading = 'liked';
      }
      return;
    }
    let note = tidyNote(line.replace(URL_RE, ' '));
    const next = lines[i + 1] ?? '';
    if (!note && next.trim() && !(next.match(URL_RE) ?? []).length) note = tidyNote(next);
    for (const raw of urls) {
      const url = cleanUrl(raw);
      const key = url.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[/?#]+$/, '');
      if (seen.has(key)) continue;
      seen.add(key);
      const fromNote: VoiceReference['stance'] | null = note ? (NEGATIVE.test(note) ? 'disliked' : POSITIVE.test(note) ? 'liked' : null) : null;
      out.push({
        url,
        note: note.slice(0, 400),
        stance: fromNote ?? heading ?? 'liked',
        stanceFrom: fromNote || heading ? 'words' : 'default',
      });
    }
  });
  const refs = out.slice(0, MAX_VOICE_REFERENCES);
  if (refs.length === 4 && refs.every((r) => r.stanceFrom === 'default')) {
    refs[3] = { ...refs[3], stance: 'disliked', stanceFrom: 'position' };
  }
  return refs;
}

/** The learning record's fields for one reference. Pure. */
export function voiceLearning(ref: VoiceReference, analysis: ReferenceAnalysis): { title: string; data: Record<string, unknown> } {
  const liked = ref.stance === 'liked';
  const hook = analysis.hook?.archetype?.trim();
  const shape = [analysis.format?.trim(), hook ? `opens with a ${hook} hook` : null].filter(Boolean).join(', ');
  const why = (analysis.why_it_works ?? []).map((w) => w.trim()).filter(Boolean).slice(0, 3).join(' ');
  const statement = [
    liked ? 'The founder wishes this post were theirs.' : 'The founder would hate to post this.',
    ref.note ? `Their words: "${ref.note}".` : null,
    shape ? `What it is: ${shape}.` : null,
    liked && why ? `Why it works, as analysed: ${why}` : null,
    liked ? null : 'Do not model a brief on it.',
  ].filter(Boolean).join(' ');
  const who = analysis.author ? `@${analysis.author.replace(/^@/, '')}` : analysis.platform;
  return {
    title: `${liked ? 'Liked' : 'Disliked'} reference: ${who}`,
    data: normaliseData('learning', {
      statement,
      scope: liked ? 'taste, a reference the founder likes' : 'taste, a reference the founder dislikes',
      evidence: `One post the founder picked in the survey: ${analysis.url || ref.url}${ref.stanceFrom === 'position' ? ' (taken as the disliked one from its place in the answer)' : ''}`,
      sample_size: 1,
      strength: 'weak',
    }),
  };
}

export type VoiceContext = {
  /** The stored survey answer, so the record cites the founder's own words. */
  surveySourceId: string | null;
  userId: string | null;
};

/** Stores one analysed reference as a source and its learning record. */
export async function recordVoiceReference(
  admin: SupabaseClient,
  companyId: string,
  ref: VoiceReference,
  analysis: ReferenceAnalysis,
  ctx: VoiceContext,
  deps: BrainDeps = {},
): Promise<BrainFact | null> {
  const now = (deps.now ?? (() => new Date()))();
  const body = [analysis.caption && `Caption: ${analysis.caption}`, analysis.transcript && `Transcript: ${analysis.transcript}`].filter(Boolean).join('\n\n');
  const { source } = await addSource(
    admin,
    {
      companyId,
      kind: 'reference_post',
      url: analysis.url || ref.url,
      title: `${ref.stance === 'liked' ? 'Liked' : 'Disliked'} reference on ${analysis.platform}`,
      content: body || `Reference post ${analysis.url || ref.url}`,
      meta: { survey: 'voice', stance: ref.stance, stance_from: ref.stanceFrom, note: ref.note, format: analysis.format, hook: analysis.hook?.archetype ?? null },
      createdBy: ctx.userId,
      // Another creator's script is not this company's customer speaking.
      skipExtract: true,
      hashSalt: `voice:${ref.stance}`,
    },
    deps,
  );
  const { title, data } = voiceLearning(ref, analysis);
  // The stance is the founder's when they wrote about the post; the reading of the post is a model's.
  const cited = !!ref.note && !!ctx.surveySourceId && ref.stanceFrom === 'words';
  const evidence = { confirmed: false, tier: (cited ? 1 : 6) as AuthorityTier, verbatim: cited, sourceCount: cited ? 1 : 0 };
  const freshness = freshnessFor('learning', data);
  const slug = (analysis.url || ref.url).replace(/^https?:\/\/(www\.)?/, '');
  const out = await upsertFact(admin, companyId, {
    entity_type: 'learning',
    key: factKey('learning', `voice-ref-${slug}`, title, data),
    title,
    data,
    status: 'inferred',
    confidence: computeConfidence(evidence),
    authority_tier: evidence.tier,
    usage: decideUsage('learning', data, evidence),
    freshness,
    sources: [
      ...(cited ? [{ source_id: ctx.surveySourceId!, excerpt: ref.note }] : []),
      { source_id: source.id, excerpt: '' },
    ],
    extracted_by: 'survey:voice',
    confirmed_by: null,
    confirmed_at: null,
    valid_until: null,
    last_verified_at: null,
    recheck_after: recheckAfter(freshness, now),
    supersedes: null,
  }, deps);
  return out.fact;
}

export type VoiceDeps = BrainDeps & {
  analyze?: (admin: SupabaseClient, args: { companyId: string; url: string }) => Promise<ReferenceAnalysis>;
};

/**
 * Analyses every reference side by side (each takes a minute or more, and
 * background work has a wall clock) and records the ones that could be read.
 * A post that cannot be read is skipped: the founder's words about it are
 * already in the brain from the survey answer itself.
 */
export async function analyzeVoiceReferences(
  admin: SupabaseClient,
  companyId: string,
  refs: VoiceReference[],
  ctx: VoiceContext,
  deps: VoiceDeps = {},
): Promise<{ recorded: number; failed: { url: string; reason: string }[] }> {
  const analyze = deps.analyze ?? ((a: SupabaseClient, args: { companyId: string; url: string }) => awaitReferenceAnalysis(a, args, { waitMs: 240_000 }));
  const failed: { url: string; reason: string }[] = [];
  let recorded = 0;
  await Promise.all(
    refs.slice(0, MAX_VOICE_REFERENCES).map(async (ref) => {
      try {
        const analysis = await analyze(admin, { companyId, url: ref.url });
        if (await recordVoiceReference(admin, companyId, ref, analysis, ctx, deps)) recorded += 1;
      } catch (e) {
        const reason = e instanceof ReferenceAnalysisError ? e.reason : e instanceof Error ? e.message : String(e);
        console.error('voice reference failed:', ref.url, reason);
        failed.push({ url: ref.url, reason });
      }
    }),
  );
  return { recorded, failed };
}
