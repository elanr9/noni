// Fill in with AI for the v2 Create flow: a guided post (hook and points or
// slides, on-screen text, shot direction, caption, hashtags, search phrase),
// an outline (title and notes) or title ideas. The writing is done by the
// brief engine (_shared/ai/briefEngine.ts) from the company brain; this file
// is auth, the request body and the response the app reads.
import { adminClient, authenticate, handleCors, jsonResponse, streamJsonResponse } from '../_shared/wp8.ts';
import { writeBrief } from '../_shared/ai/briefEngine.ts';
import type { BriefMode, BriefType } from '../_shared/ai/contracts.ts';

type Body = {
  mode?: BriefMode;
  type?: BriefType;
  title?: string;
  link?: string;
  linkNotes?: string;
  notes?: string;
  typed?: string;
};

const MODES: BriefMode[] = ['guided', 'outline', 'titles', 'long_text'];
const TYPES: BriefType[] = ['Talking Head', 'Long Text', 'Slideshow', 'Greenscreen'];
const text = (v: unknown, max: number): string | undefined => (typeof v === 'string' ? v.slice(0, max) : undefined);

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller || caller.kind !== 'user') return jsonResponse({ error: 'unauthorized' }, 401);
  if (caller.role !== 'campaign_manager') return jsonResponse({ error: 'forbidden' }, 403);
  if (!caller.companyId) return jsonResponse({ error: 'no active company' }, 400);

  const body = ((await req.json().catch(() => null)) ?? {}) as Body;
  const mode: BriefMode = MODES.includes(body.mode as BriefMode) ? (body.mode as BriefMode) : 'guided';
  const type: BriefType = TYPES.includes(body.type as BriefType) ? (body.type as BriefType) : 'Talking Head';

  // A guided brief runs several model steps and can pass a minute. The app's
  // native fetch drops a connection that is silent for 60 s on iOS, so the
  // response trickles whitespace until the brief is ready. Failures come back
  // in the body as { error }, which the client already throws on.
  return streamJsonResponse(async () => {
    const result = await writeBrief(admin, {
      companyId: caller.companyId,
      mode,
      type,
      title: text(body.title, 300),
      link: text(body.link, 600),
      linkNotes: text(body.linkNotes, 1000),
      notes: text(body.notes, 2000),
      typed: text(body.typed, 300),
      userId: caller.userId ?? null,
    });
    if ('titles' in result) return { titles: result.titles };

    // A decline is an answer, not a failure: 200 with the reason and the
    // questions, so the app can show them where the brief would have gone.
    if (result.kill_reason) {
      return ({
        title: result.title,
        kill_reason: result.kill_reason,
        questions: result.questions,
        reference_note: result.reference_note ?? null,
      });
    }
    if (mode === 'outline') {
      return ({
        title: result.title,
        notes: result.notes,
        phrase: result.phrase,
        angle: result.angle,
        hooks: result.hooks,
        kill_reason: null,
        questions: result.questions,
        reference_note: result.reference_note ?? null,
      });
    }
    return ({
      title: result.title,
      phrase: result.phrase,
      // say, onScreen and cta are what the app reads today; shot,
      // demo_moment_id and claim_ids are new.
      clips: result.clips,
      caption: result.caption,
      tags: result.tags,
      angle: result.angle,
      hooks: result.hooks,
      kill_reason: null,
      questions: result.questions,
      reference_note: result.reference_note ?? null,
      warnings: result.warnings ?? [],
    });
  });
});
