/**
 * Creator Settings: the profile photo and name, plus what the Settings screen
 * shows about the creator's TikTok and Instagram after setup.
 */
import * as ImageManipulator from 'expo-image-manipulator';

import { getCreatorAccount, type CreatorAccount } from './creator-accounts-api';
import { getSocialConnectStatus } from './admin-api';
import { parseSocialAccount, type SocialAccountInfo } from './social-accounts';
import { uploadFileToStorage } from './storage-upload';
import { supabase } from './supabase';

const AVATAR_BUCKET = 'avatars';
const AVATAR_PX = 512;

/** Signed URL for a stored avatar path, or null when there is none or it fails. */
export async function signedAvatarUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/**
 * Shrinks to a 512 wide JPEG, uploads to avatars/{company}/{user}.jpg (the path
 * every avatar reader signs), and points profiles.avatar_path at it.
 */
export async function uploadMyAvatar(companyId: string, userId: string, localUri: string): Promise<string> {
  const small = await ImageManipulator.manipulateAsync(localUri, [{ resize: { width: AVATAR_PX } }], {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const path = `${companyId}/${userId}.jpg`;
  try {
    await uploadFileToStorage({ bucket: AVATAR_BUCKET, path, localUri: small.uri, contentType: 'image/jpeg', upsert: true });
  } catch {
    throw new Error('Could not upload your photo. Try again.');
  }
  const { error: saveError } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId);
  if (saveError) throw new Error('Could not save your photo. Try again.');
  return path;
}

export async function saveMyName(userId: string, fullName: string): Promise<void> {
  const name = fullName.trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Add your name first.');
  const { error } = await supabase.from('profiles').update({ full_name: name }).eq('id', userId);
  if (error) throw new Error('Could not save your name. Try again.');
}

export type HandleState = 'verified' | 'in_review' | 'changes' | 'draft' | 'missing';

export type CreatorAccountsView = {
  tiktok: { handle: string | null; state: HandleState };
  instagram: { handle: string | null; state: HandleState };
  /** The manager's note when the accounts were sent back. */
  reason: string | null;
  /** Publishing link through Upload-Post; null when the status call failed. */
  publishing: { tiktok: SocialAccountInfo; instagram: SocialAccountInfo } | null;
};

function handleState(row: CreatorAccount | null, handle: string | null): HandleState {
  if (!row || !handle) return 'missing';
  if (row.status === 'approved') return 'verified';
  if (row.status === 'pending') return 'in_review';
  // needs_changes doubles as the draft state; only a real send back carries a reason.
  return row.reason ? 'changes' : 'draft';
}

function at(handle: string | null | undefined): string | null {
  const h = handle?.trim();
  if (!h) return null;
  return h.startsWith('@') ? h : `@${h}`;
}

export async function loadCreatorAccountsView(companyId: string, creatorId: string): Promise<CreatorAccountsView> {
  const [row, social] = await Promise.all([
    getCreatorAccount(companyId, creatorId),
    getSocialConnectStatus().catch(() => null),
  ]);
  const tiktok = at(row?.tiktok_handle);
  const instagram = at(row?.instagram_handle);
  const raw = social?.social_accounts ?? {};
  return {
    tiktok: { handle: tiktok, state: handleState(row, tiktok) },
    instagram: { handle: instagram, state: handleState(row, instagram) },
    reason: row?.status === 'needs_changes' ? (row.reason ?? null) : null,
    publishing: social ? { tiktok: parseSocialAccount(raw.tiktok), instagram: parseSocialAccount(raw.instagram) } : null,
  };
}

export function handleStateLabel(s: HandleState): string {
  switch (s) {
    case 'verified':
      return 'Verified';
    case 'in_review':
      return 'In review';
    case 'changes':
      return 'Changes needed';
    case 'draft':
      return 'Not sent';
    default:
      return 'Not added';
  }
}
