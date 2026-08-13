import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';
import type { Database, Json } from './types';

export type Company = Database['public']['Tables']['companies']['Row'];
export type BrandProfile = Database['public']['Tables']['brand_profiles']['Row'];

export type BrandAnswers = {
  tone: string;
  audience: string;
  products: string;
  buyingPath: 'link_in_bio' | 'dms' | 'website';
  pillars: string[];
  sourceUrls: string[];
};

export type CompanySettingsAnswers = {
  instagramHandle: string;
  tiktokHandle: string;
  cadencePerWeek: number;
  approvers: 'just_me' | 'me_plus_others';
  tone: string;
};

export type BrandSuggestions = {
  audience: string;
  products: string;
  pillars: string[];
};

export async function getCompany(companyId: string): Promise<Company> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateCompanyBasics(
  companyId: string,
  name: string,
  website: string,
): Promise<void> {
  const { error } = await supabase
    .from('companies')
    .update({ name, website: website || null })
    .eq('id', companyId);
  if (error) throw error;
}

export async function saveCompanySettings(
  companyId: string,
  answers: CompanySettingsAnswers,
): Promise<void> {
  const company = await getCompany(companyId);
  const current =
    company.settings && typeof company.settings === 'object' && !Array.isArray(company.settings)
      ? company.settings
      : {};
  const settings: Json = {
    ...current,
    handles: {
      instagram: answers.instagramHandle,
      tiktok: answers.tiktokHandle,
    },
    cadence_per_week: answers.cadencePerWeek,
    approvers: answers.approvers,
    tone: answers.tone,
    onboarded_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('companies')
    .update({ settings })
    .eq('id', companyId);
  if (error) throw error;
}

export async function saveBrandProfile(
  companyId: string,
  answers: BrandAnswers,
): Promise<void> {
  const { data: existing, error: readError } = await supabase
    .from('brand_profiles')
    .select('id')
    .eq('company_id', companyId)
    .maybeSingle();
  if (readError) throw readError;

  const fields = {
    tone: answers.tone,
    audience: answers.audience,
    products: { description: answers.products } as Json,
    buying_path: answers.buyingPath,
    content_pillars: answers.pillars as Json,
    source_urls: answers.sourceUrls,
    updated_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await supabase.from('brand_profiles').update(fields).eq('id', existing.id)
    : await supabase.from('brand_profiles').insert({ company_id: companyId, ...fields });
  if (error) throw error;
}

export type BrandIngestInput = {
  companyName: string;
  website: string;
  instagramHandle: string;
  tiktokHandle: string;
};

// Calls the brand-ingest edge function (site + recent posts → Claude → brand
// profile). Never throws: if the study fails the screen still gets usable
// suggestions instead of dead-ending onboarding.
export async function runBrandIngest(
  input: BrandIngestInput,
): Promise<BrandSuggestions> {
  try {
    const { data, error } = await supabase.functions.invoke('brand-ingest', {
      body: {
        company_name: input.companyName,
        website: input.website,
        instagram_handle: input.instagramHandle,
        tiktok_handle: input.tiktokHandle,
      },
    });
    if (error) throw error;
    const result = data as Partial<BrandSuggestions> & { error?: string };
    if (result.error) throw new Error(result.error);
    if (!result.audience || !result.products || !Array.isArray(result.pillars)) {
      throw new Error('Incomplete brand study');
    }
    return {
      audience: result.audience,
      products: result.products,
      pillars: result.pillars,
    };
  } catch {
    return fallbackSuggestions(input.companyName);
  }
}

function fallbackSuggestions(companyName: string): BrandSuggestions {
  const name = companyName.trim() || 'your brand';
  return {
    audience: `People who follow ${name} and creators in its niche, mostly 18 to 34, scrolling TikTok and Instagram for quick, useful content.`,
    products: `${name}'s core product and the results it gets customers.`,
    pillars: [
      'Behind the scenes',
      'Customer results',
      'How it works',
      'Hot takes',
      'Day in the life',
    ],
  };
}

export async function uploadAvatar(
  companyId: string,
  userId: string,
  localUri: string,
): Promise<string> {
  const response = await fetch(localUri);
  if (!response.ok) throw new Error('Could not read the photo');
  const blob = await response.blob();

  const path = `${companyId}/${userId}.jpg`;
  const { error } = await supabase.storage.from('avatars').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export async function saveCreatorBasics(
  userId: string,
  fullName: string,
  avatarPath: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName, avatar_path: avatarPath })
    .eq('id', userId);
  if (error) throw error;
}

export async function completeOnboarding(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ onboarded: true })
    .eq('id', userId);
  if (error) throw error;
}

// ——— Creator onboarding questions (Cal AI flow) ———

export type UgcExperience =
  | 'never_heard'
  | 'seen_around'
  | 'made_some'
  | 'do_ugc';
export type HardestPart =
  | 'getting_views'
  | 'knowing_what_to_post'
  | 'staying_consistent'
  | 'getting_paid';
export type HoursPerWeek = '2' | '5' | '10' | '15+';
export type HeardFrom = 'tiktok' | 'instagram' | 'friend' | 'other';

export type CreatorOnboardingAnswers = {
  firstName: string;
  /** ISO date, YYYY-MM-DD */
  birthday: string | null;
  /** US number, digits only, max 10 */
  phoneDigits: string;
  ugcExperience: UgcExperience | null;
  hardestPart: HardestPart | null;
  hoursPerWeek: HoursPerWeek | null;
  heardFrom: HeardFrom | null;
};

export const HOURS_TO_MONTHLY_ESTIMATE: Record<HoursPerWeek, number> = {
  '2': 1000,
  '5': 1500,
  '10': 2200,
  '15+': 3000,
};

const ANSWERS_KEY = 'noni.onboarding.answers';

function emptyAnswers(): CreatorOnboardingAnswers {
  return {
    firstName: '',
    birthday: null,
    phoneDigits: '',
    ugcExperience: null,
    hardestPart: null,
    hoursPerWeek: null,
    heardFrom: null,
  };
}

// Answers live in this module-level store until the heard step writes them to
// the profile, mirrored to AsyncStorage so a killed app resumes.
let answers = emptyAnswers();

export function getOnboardingAnswers(): CreatorOnboardingAnswers {
  return answers;
}

export function setOnboardingAnswer<K extends keyof CreatorOnboardingAnswers>(
  key: K,
  value: CreatorOnboardingAnswers[K],
): void {
  answers = { ...answers, [key]: value };
  void AsyncStorage.setItem(ANSWERS_KEY, JSON.stringify(answers)).catch(
    () => undefined,
  );
}

export async function hydrateOnboardingAnswers(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(ANSWERS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<CreatorOnboardingAnswers>;
    answers = { ...emptyAnswers(), ...parsed };
  } catch {
    answers = emptyAnswers();
  }
}

export async function clearOnboardingAnswers(): Promise<void> {
  answers = emptyAnswers();
  try {
    await AsyncStorage.removeItem(ANSWERS_KEY);
  } catch {
    // storage failure only means a stale draft sticks around
  }
}

export function formatUsPhone(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)} ${d.slice(6)}`;
}

/**
 * Writes the locally held answers onto the signed-in creator's profile row
 * (created by the auth trigger). Merges into onboarding_answers so keys
 * written later, like warmup_tutorial_seen, are never clobbered.
 */
export async function saveOnboardingAnswersToProfile(
  userId: string,
): Promise<void> {
  const a = answers;

  const { data: row, error: readError } = await supabase
    .from('profiles')
    .select('onboarding_answers')
    .eq('id', userId)
    .maybeSingle();
  if (readError) throw readError;

  const current =
    row?.onboarding_answers &&
    typeof row.onboarding_answers === 'object' &&
    !Array.isArray(row.onboarding_answers)
      ? row.onboarding_answers
      : {};

  const merged: Json = {
    ...current,
    ...(a.ugcExperience ? { ugc_experience: a.ugcExperience } : {}),
    ...(a.hardestPart ? { hardest_part: a.hardestPart } : {}),
    ...(a.hoursPerWeek ? { hours_per_week: a.hoursPerWeek } : {}),
    ...(a.heardFrom ? { heard_from: a.heardFrom } : {}),
  };

  const update: Database['public']['Tables']['profiles']['Update'] = {
    onboarding_answers: merged,
  };
  if (a.firstName.trim()) update.full_name = a.firstName.trim();
  if (a.birthday) update.birthday = a.birthday;
  if (a.phoneDigits.length === 10) update.phone = `+1${a.phoneDigits}`;

  const { error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', userId);
  if (error) throw error;
}
