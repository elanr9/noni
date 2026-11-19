// Shows exactly what a generator would be told about the caller's company
// for a given topic. Campaign managers and admins.
//
// POST { topic?: string, format?: string, persona_key?: string, limit?: number }
// 200  { context: BrainContext }   (see _shared/ai/contracts.ts)

import { assembleBrainContext } from '../_shared/ai/brain.ts';
import { brainCaller, errorResponse, text } from '../_shared/ai/brainHttp.ts';
import { jsonResponse } from '../_shared/wp8.ts';

Deno.serve(async (req) => {
  const caller = await brainCaller(req);
  if (caller instanceof Response) return caller;
  const { admin, companyId, body } = caller;
  try {
    const context = await assembleBrainContext(admin, {
      companyId,
      topic: text(body.topic) || undefined,
      format: text(body.format) || undefined,
      personaKey: text(body.persona_key) || undefined,
      limit: typeof body.limit === 'number' ? body.limit : undefined,
    });
    return jsonResponse({ context });
  } catch (err) {
    return errorResponse(err);
  }
});
