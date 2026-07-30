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
