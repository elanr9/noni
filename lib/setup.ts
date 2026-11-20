import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { CREATOR_ROSTER_OR } from './active-mode';
import { getSocialConnectStatus, type SocialConnectStatus } from './admin-api';
import { getCreatorAccount, type CreatorAccount } from './creator-accounts-api';
import {
  CREATOR_INVITED_KEY,
  hasCompanyFlag,
  MANAGER_SETUP_COMPLETE_KEY,
  SETUP_COMPLETE_KEY,
  withCompanyFlag,
} from './profile';
import { parseSocialAccount } from './social-accounts';
import { supabase } from './supabase';
import type { Json } from './types';

export { isSetupCompleteFlag } from './profile';

/**
 * Creator setup state, derived entirely from live data (creator_accounts,
 * social connect). No new tables. The creator layout gates every
 * non-exempt route on `complete`.
 */

export type SetupStepStatus = 'todo' | 'in_review' | 'done';

export type SetupState = {
  /** Step 1: creator_accounts row exists (handles + screenshots saved). */
  accounts: SetupStepStatus;
  /** Step 2: both socials linked through Upload-Post. */
  connect: SetupStepStatus;
  /** Step 3: warm-up proof; pending = in review, approved = done. */
  warmup: SetupStepStatus;
  /** Admin send-back note on the account row, if any. */
  accountReason: string | null;
  instagramConnected: boolean;
  tiktokConnected: boolean;
  complete: boolean;
};

export function deriveSetupState(
  account: CreatorAccount | null,
  social: SocialConnectStatus | null,
): SetupState {
  const socialAccounts = social?.social_accounts ?? {};
  const instagramConnected = parseSocialAccount(socialAccounts.instagram).connected;
  const tiktokConnected = parseSocialAccount(socialAccounts.tiktok).connected;
  const bothConnected = instagramConnected && tiktokConnected;

  const warmup: SetupStepStatus =
    account === null
      ? 'todo'
      : account.status === 'approved'
        ? 'done'
        : account.status === 'pending'
          ? 'in_review'
          : 'todo';

  return {
    accounts: account !== null ? 'done' : 'todo',
    connect: bothConnected ? 'done' : 'todo',
    warmup,
    accountReason: account?.reason ?? null,
    instagramConnected,
    tiktokConnected,
    complete: account?.status === 'approved' && bothConnected,
  };
}

// ---------------------------------------------------------------------------
// Shared snapshot so the layout gate and the checklist screen see one state.

// Setup is per company: the same creator has separate accounts, review and
// warm-up in each one, so the snapshot is keyed by both ids.
type SetupSnapshot = {
  creatorId: string | null;
  companyId: string | null;
  state: SetupState | null;
  loading: boolean;
};

let snapshot: SetupSnapshot = {
  creatorId: null,
  companyId: null,
  state: null,
  loading: false,
};
const listeners = new Set<() => void>();

function setSnapshot(next: SetupSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): SetupSnapshot {
  return snapshot;
}

export async function refreshSetupState(
  companyId: string,
  creatorId: string,
): Promise<SetupState> {
  const sameKey =
    snapshot.creatorId === creatorId && snapshot.companyId === companyId;
  setSnapshot({
    creatorId,
    companyId,
    // Another company's state must never show while this one loads.
    state: sameKey ? snapshot.state : null,
    loading: true,
  });
  const [account, social] = await Promise.all([
    getCreatorAccount(companyId, creatorId).catch(() => null),
    getSocialConnectStatus().catch(() => null),
  ]);
  const state = deriveSetupState(account, social);
  // The creator switched company while this was loading: the newer request
  // owns the snapshot.
  if (snapshot.creatorId !== creatorId || snapshot.companyId !== companyId) {
    return state;
  }
  setSnapshot({ creatorId, companyId, state, loading: false });
  if (state.complete) {
    // Fast path for future launches: the gate trusts this flag and skips the
    // network calls. Setup never un-completes once approved.
    void markCompanyFlag(creatorId, SETUP_COMPLETE_KEY, companyId).catch(
      () => undefined,
    );
  }
  return state;
}

export function useSetupState(
  profile: { id: string; active_company_id: string } | null,
): { state: SetupState | null; loading: boolean; refresh: () => Promise<void> } {
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  const creatorId = profile?.id ?? null;
  const companyId = profile?.active_company_id ?? null;

  const refresh = useCallback(async () => {
    if (creatorId === null || companyId === null) return;
    await refreshSetupState(companyId, creatorId);
  }, [creatorId, companyId]);

  const current = snap.creatorId === creatorId && snap.companyId === companyId;
  const stale = snap.state === null || !current;
  useEffect(() => {
    // A load for another company does not hold this one back.
    if (creatorId !== null && stale && !(current && snap.loading)) void refresh();
  }, [creatorId, stale, current, snap.loading, refresh]);

  return {
    state: current ? snap.state : null,
    loading: current && snap.loading,
    refresh,
  };
}

// ---------------------------------------------------------------------------
// profiles.onboarding_answers helpers.

function answersRecord(answers: Json | null): Record<string, Json> {
  return answers && typeof answers === 'object' && !Array.isArray(answers)
    ? (answers as Record<string, Json>)
    : {};
}

async function mergeOnboardingAnswers(
  creatorId: string,
  patch: Record<string, Json>,
): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .select('onboarding_answers')
    .eq('id', creatorId)
    .single();
  if (error) throw error;
  const { error: writeError } = await supabase
    .from('profiles')
    .update({
      onboarding_answers: { ...answersRecord(data.onboarding_answers), ...patch },
    })
    .eq('id', creatorId);
  if (writeError) throw writeError;
}

export async function markWarmupTutorialSeen(creatorId: string): Promise<void> {
  await mergeOnboardingAnswers(creatorId, { warmup_tutorial_seen: true });
}

async function markCompanyFlag(
  profileId: string,
  key: string,
  companyId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .select('onboarding_answers')
    .eq('id', profileId)
    .single();
  if (error) throw error;
  if (hasCompanyFlag(data.onboarding_answers, key, companyId)) return;
  const { error: writeError } = await supabase
    .from('profiles')
    .update({
      onboarding_answers: withCompanyFlag(data.onboarding_answers, key, companyId),
    })
    .eq('id', profileId);
  if (writeError) throw writeError;
}

// ---------------------------------------------------------------------------
// Campaign manager setup (the temporary admin Onboarding tab).

export type ManagerSetupState = {
  /** The company has at least one brief. */
  brief: boolean;
  /** A creator joined the roster, or this manager already sent an invite. */
  creators: boolean;
};

/**
 * Derived from live company data, like the creator checklist. Invited
 * creators are invisible to managers until they sign in (company_invites is
 * admin-only under RLS), so sending an invite is tracked with a profile flag.
 */
export async function fetchManagerSetupState(
  companyId: string,
  answers: Json | null,
): Promise<ManagerSetupState> {
  const [briefs, creators] = await Promise.all([
    supabase
      .from('briefs')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .is('library_item_id', null),
    supabase
      .from('company_roster')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .or(CREATOR_ROSTER_OR),
  ]);
  return {
    brief: (briefs.count ?? 0) > 0,
    creators:
      (creators.count ?? 0) > 0 ||
      hasCompanyFlag(answers, CREATOR_INVITED_KEY, companyId),
  };
}

export async function markCreatorInvited(
  profileId: string,
  companyId: string,
): Promise<void> {
  await markCompanyFlag(profileId, CREATOR_INVITED_KEY, companyId);
}

export async function markManagerSetupComplete(
  profileId: string,
  companyId: string,
): Promise<void> {
  await markCompanyFlag(profileId, MANAGER_SETUP_COMPLETE_KEY, companyId);
}
