import { supabase } from './supabase';
import { forgetCompanyNiche } from './company-copy-api';
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
  /**
   * What a creator's feed should be about, e.g. "home workouts". Drives the
   * suggested handles, warm-up steps, warm-up push and the feed check.
   * Empty falls back to the company research profile, then neutral copy.
   */
  niche: string;
  /** What creators type into TikTok and Instagram search while warming up. */
  searchPhrases: string[];
};

export type { AccountNameSuggestions } from './company-copy';
export { suggestAccountNames } from './company-copy';

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
    niche: typeof t.niche === 'string' ? t.niche : '',
    searchPhrases: Array.isArray(t.search_phrases)
      ? t.search_phrases.filter((x): x is string => typeof x === 'string')
      : [],
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
      niche: template.niche.trim(),
      search_phrases: template.searchPhrases.map((p) => p.trim()).filter(Boolean),
    },
  };
  const { error } = await supabase
    .from('companies')
    .update({ settings })
    .eq('id', companyId);
  if (error) throw error;
  forgetCompanyNiche(companyId);
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
