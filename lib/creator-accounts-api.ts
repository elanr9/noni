import { supabase } from './supabase';
import type { Database, Json } from './types';

export type CreatorAccount =
  Database['public']['Tables']['creator_accounts']['Row'];

export type CreatorAccountStatus = 'pending' | 'needs_changes' | 'approved';

/**
 * The admin decision, stored as structured data (not free text) so the same
 * checks can later run as an automated vision pass over the uploads.
 */
export type AccountDecision = {
  instagram_recording_ok: boolean;
  tiktok_recording_ok: boolean;
  feed_is_niche: boolean;
  profile_matches_template: boolean;
};

export const DECISION_CHECKS: Array<{ key: keyof AccountDecision; label: string }> = [
  { key: 'instagram_recording_ok', label: 'Instagram recording shows home, explore, reels' },
  { key: 'tiktok_recording_ok', label: 'TikTok For You recording is 15s or longer' },
  { key: 'feed_is_niche', label: 'Feed is college soccer and recruiting content' },
  { key: 'profile_matches_template', label: 'Profiles match the account template' },
];

export function parseDecision(value: Json | null): AccountDecision {
  const raw =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    instagram_recording_ok: raw.instagram_recording_ok === true,
    tiktok_recording_ok: raw.tiktok_recording_ok === true,
    feed_is_niche: raw.feed_is_niche === true,
    profile_matches_template: raw.profile_matches_template === true,
  };
}

export type VerificationUploadKind =
  | 'instagram-recording'
  | 'tiktok-recording'
  | 'instagram-screenshot'
  | 'tiktok-screenshot';

export const VERIFICATION_BUCKET = 'account-verification';

/**
 * Storage rejects anything larger with a bare "The object exceeded the maximum
 * allowed size", so the size is checked here to say something a creator can act
 * on. The cap is the Supabase project limit, not the bucket limit, and it only
 * moves on a paid plan. A 20 second screen recording lands well under it.
 */
export const MAX_VERIFICATION_BYTES = 50 * 1024 * 1024;

function sizeLabel(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

export async function getCreatorAccount(
  companyId: string,
  creatorId: string,
): Promise<CreatorAccount | null> {
  const { data, error } = await supabase
    .from('creator_accounts')
    .select('*')
    .eq('company_id', companyId)
    .eq('creator_id', creatorId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Upload one warm-up proof file. Timestamped path so resubmits never collide. */
export async function uploadVerificationAsset(params: {
  companyId: string;
  creatorId: string;
  kind: VerificationUploadKind;
  localUri: string;
  contentType: string;
}): Promise<string> {
  const response = await fetch(params.localUri);
  if (!response.ok) throw new Error('Could not read the file');
  const blob = await response.blob();
  if (blob.size > MAX_VERIFICATION_BYTES) {
    throw new Error(
      `That recording is ${sizeLabel(blob.size)} and the limit is ${sizeLabel(
        MAX_VERIFICATION_BYTES,
      )}. Trim it in Photos to about 20 seconds and pick it again.`,
    );
  }
  const ext =
    params.contentType === 'video/quicktime'
      ? 'mov'
      : params.contentType.startsWith('video/')
        ? 'mp4'
        : 'jpg';
  const path = `${params.companyId}/${params.creatorId}/${params.kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .upload(path, blob, { contentType: params.contentType, upsert: false });
  if (error) throw error;
  return path;
}

/**
 * Setup step 1: save handles and profile screenshots without entering the
 * admin queue (the queue lists pending rows only, and status is constrained
 * to pending / needs_changes / approved, so needs_changes doubles as the
 * draft state). The warm-up proof submit flips the row to pending. A real
 * admin send-back keeps its reason; drafts never set one.
 */
export async function saveCreatorAccountDraft(params: {
  companyId: string;
  creatorId: string;
  tiktokHandle: string;
  instagramHandle: string;
  instagramScreenshotPath: string;
  tiktokScreenshotPath: string;
}): Promise<void> {
  const { error } = await supabase.from('creator_accounts').upsert(
    {
      company_id: params.companyId,
      creator_id: params.creatorId,
      status: 'needs_changes',
      tiktok_handle: params.tiktokHandle,
      instagram_handle: params.instagramHandle,
      instagram_screenshot_path: params.instagramScreenshotPath,
      tiktok_screenshot_path: params.tiktokScreenshotPath,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'company_id,creator_id' },
  );
  if (error) throw error;
}

/**
 * Creator submit and resubmit. Upsert on (company_id, creator_id); status
 * returns to pending so the row lands back in the admin queue.
 */
export async function submitCreatorAccount(params: {
  companyId: string;
  creatorId: string;
  tiktokHandle: string;
  instagramHandle: string;
  instagramRecordingPath: string;
  tiktokRecordingPath: string;
  instagramScreenshotPath: string;
  tiktokScreenshotPath: string;
}): Promise<void> {
  const { error } = await supabase.from('creator_accounts').upsert(
    {
      company_id: params.companyId,
      creator_id: params.creatorId,
      status: 'pending',
      tiktok_handle: params.tiktokHandle,
      instagram_handle: params.instagramHandle,
      instagram_recording_path: params.instagramRecordingPath,
      tiktok_recording_path: params.tiktokRecordingPath,
      instagram_screenshot_path: params.instagramScreenshotPath,
      tiktok_screenshot_path: params.tiktokScreenshotPath,
      reason: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'company_id,creator_id' },
  );
  if (error) throw error;

  void supabase.functions.invoke('notify', {
    body: { creator_id: params.creatorId, event: 'account_submitted' },
  });
}

export type AccountApprovalItem = CreatorAccount & {
  profiles: { id: string; full_name: string | null } | null;
};

/**
 * Pending rows plus real send-backs (needs_changes with a reason). Drafts
 * from step one also sit at needs_changes but never carry a reason, so the
 * reason filter keeps them out of the queue.
 */
export async function listAccountApprovalQueue(
  companyId: string,
): Promise<AccountApprovalItem[]> {
  const { data, error } = await supabase
    .from('creator_accounts')
    .select('*, profiles:creator_id ( id, full_name )')
    .eq('company_id', companyId)
    .or('status.eq.pending,and(status.eq.needs_changes,reason.not.is.null)')
    .order('updated_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AccountApprovalItem[];
}

export async function fetchAccountApprovalItem(
  companyId: string,
  accountId: string,
): Promise<AccountApprovalItem> {
  const { data, error } = await supabase
    .from('creator_accounts')
    .select('*, profiles:creator_id ( id, full_name )')
    .eq('company_id', companyId)
    .eq('id', accountId)
    .single();
  if (error) throw error;
  return data as AccountApprovalItem;
}

export async function decideAccount(params: {
  companyId: string;
  accountId: string;
  adminId: string;
  status: 'approved' | 'needs_changes';
  reason: string | null;
  decision: AccountDecision;
}): Promise<void> {
  if (params.status === 'needs_changes' && !params.reason?.trim()) {
    throw new Error('A reason is required when requesting changes');
  }
  const { data, error } = await supabase
    .from('creator_accounts')
    .update({
      status: params.status,
      reason: params.reason,
      decision: params.decision as unknown as Json,
      decided_by: params.adminId,
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', params.companyId)
    .eq('id', params.accountId)
    .select('creator_id')
    .single();
  if (error) throw error;

  void supabase.functions.invoke('notify', {
    body: {
      creator_id: data.creator_id,
      status: params.status,
      event: 'account_decided',
    },
  });
}

export async function signedVerificationUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
