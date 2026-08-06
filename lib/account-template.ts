import { supabase } from './supabase';
import { VERIFICATION_BUCKET } from './creator-accounts-api';
import type { Json } from './types';

/**
 * The company-wide standard for what a creator account should look like.
 * Lives in companies.settings.account_template; assets live in the
 * account-verification bucket under the company folder.
 */
export type AccountTemplate = {
  instagramBio: string;
  tiktokBio: string;
  /** Instagram profile link only. TikTok has no equivalent field here. */
  instagramLink: string;
  profilePicturePath: string | null;
  exampleScreenshotPath: string | null;
};

export type AccountNameSuggestions = {
  /** Profile display names, e.g. "Elan | College Soccer Recruiting". */
  displayNames: string[];
  /** @handles without the @, e.g. "elan.d1soccer". */
  usernames: string[];
};

function handleToken(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Naming standard from live reference accounts: display name is the creator
 * plus College Soccer Recruiting; username mixes their name with recruiting
 * stems (d1soccer, d1recruit, recruiting, …).
 */
export function suggestAccountNames(fullName: string): AccountNameSuggestions {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? 'creator';
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  const firstTok = handleToken(first) || 'creator';
  const lastTok = handleToken(last);
  const short = firstTok.slice(0, 12);

  const displayNames = [
    `${first} | College Soccer Recruiting`,
    parts.length > 1
      ? `${first} ${last} | College Soccer Recruiting`
      : `${first} | College Recruiting Advice`,
    `College Recruitment with ${first}`,
  ];

  const stems = [
    'd1soccer',
    'd1recruit',
    'recruiting',
    'collegerecruit',
    'd1offers',
  ];
  const usernames = new Set<string>();
  for (const stem of stems) {
    usernames.add(`${short}.${stem}`);
    usernames.add(`${short}${stem}`);
  }
  usernames.add(`d1with${short}`);
  usernames.add(`${short}.d1`);
  if (lastTok) {
    usernames.add(`${short}.${lastTok}`);
    usernames.add(`${lastTok}.d1soccer`);
    usernames.add(`${short[0] ?? ''}${lastTok}.recruiting`);
  }

  return {
    displayNames,
    usernames: [...usernames].filter((u) => u.length >= 3 && u.length <= 30).slice(0, 10),
  };
}

export function parseAccountTemplate(settings: Json | null): AccountTemplate | null {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return null;
  }
  const raw = (settings as Record<string, unknown>).account_template;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const t = raw as Record<string, unknown>;
  const legacyBio = typeof t.bio === 'string' ? t.bio : '';
  return {
    instagramBio:
      typeof t.instagram_bio === 'string' ? t.instagram_bio : legacyBio,
    tiktokBio: typeof t.tiktok_bio === 'string' ? t.tiktok_bio : legacyBio,
    instagramLink: typeof t.instagram_link === 'string' ? t.instagram_link : '',
    profilePicturePath:
      typeof t.profile_picture_path === 'string' ? t.profile_picture_path : null,
    exampleScreenshotPath:
      typeof t.example_screenshot_path === 'string' ? t.example_screenshot_path : null,
  };
}

export async function getAccountTemplate(
  companyId: string,
): Promise<AccountTemplate | null> {
  const { data, error } = await supabase
    .from('companies')
    .select('settings')
    .eq('id', companyId)
    .single();
  if (error) throw error;
  return parseAccountTemplate(data.settings);
}

export async function saveAccountTemplate(
  companyId: string,
  template: AccountTemplate,
): Promise<void> {
  const { data, error: readError } = await supabase
    .from('companies')
    .select('settings')
    .eq('id', companyId)
    .single();
  if (readError) throw readError;
  const current =
    data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
      ? data.settings
      : {};
  const settings: Json = {
    ...current,
    account_template: {
      instagram_bio: template.instagramBio,
      tiktok_bio: template.tiktokBio,
      instagram_link: template.instagramLink,
      profile_picture_path: template.profilePicturePath,
      example_screenshot_path: template.exampleScreenshotPath,
    },
  };
  const { error } = await supabase
    .from('companies')
    .update({ settings })
    .eq('id', companyId);
  if (error) throw error;
}

export async function uploadTemplateAsset(
  companyId: string,
  kind: 'example-screenshot',
  localUri: string,
): Promise<string> {
  const response = await fetch(localUri);
  if (!response.ok) throw new Error('Could not read the image');
  const blob = await response.blob();
  const path = `${companyId}/template/${kind}.jpg`;
  const { error } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return path;
}
