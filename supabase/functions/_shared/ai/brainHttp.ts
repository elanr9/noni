// Request handling shared by the brain-* edge functions: who is calling, for
// which company, and whether they may change the brain.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { adminClient, authenticate, handleCors, hasPermission, jsonResponse } from '../wp8.ts';

export type BrainCaller = {
  admin: SupabaseClient;
  userId: string;
  companyId: string;
  /** Company admin, platform admin, or a campaign manager holding manage_brand. */
  canWrite: boolean;
  body: Record<string, unknown>;
};

/**
 * Campaign managers and admins of the active company only. Returns a Response
 * (CORS preflight, 401, 403, 400) when the request should stop there.
 */
export async function brainCaller(req: Request): Promise<BrainCaller | Response> {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller || caller.kind !== 'user') return jsonResponse({ error: 'unauthorized' }, 401);
  if (caller.role !== 'campaign_manager') return jsonResponse({ error: 'forbidden' }, 403);
  if (!caller.companyId) return jsonResponse({ error: 'No active company' }, 400);
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const canWrite = await hasPermission(admin, caller, 'manage_brand');
  return { admin, userId: caller.userId, companyId: caller.companyId, canWrite, body };
}

export function errorResponse(err: unknown, status = 500): Response {
  const message = err instanceof Error ? err.message : 'request failed';
  // "not found", "unknown", "empty": the caller sent something we cannot act on.
  const clientFault = /not found|unknown|empty|not part of/i.test(message);
  return jsonResponse({ error: message }, clientFault ? 400 : status);
}

export const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
