import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { router } from 'expo-router';

import {
  getStoredAccount,
  listStoredAccounts,
  removeStoredAccount,
  upsertStoredAccount,
  type StoredAccount,
} from './accounts';
import {
  defaultMode,
  modesForProfile,
  resolveMode,
  setStoredMode,
  type AppMode,
} from './active-mode';
import {
  attachNotificationRouting,
  registerPushToken,
} from './notifications';
import { destinationForProfile, type Profile } from './profile';
import { supabase } from './supabase';

export type CompanyPermissions = {
  invite_members: boolean;
  edit_account_template: boolean;
  manage_brand: boolean;
  manage_features: boolean;
  manage_billing: boolean;
  manage_publish_time: boolean;
};

export const NO_PERMISSIONS: CompanyPermissions = {
  invite_members: false,
  edit_account_template: false,
  manage_brand: false,
  manage_features: false,
  manage_billing: false,
  manage_publish_time: false,
};

const ALL_PERMISSIONS: CompanyPermissions = {
  invite_members: true,
  edit_account_template: true,
  manage_brand: true,
  manage_features: true,
  manage_billing: true,
  manage_publish_time: true,
};

/** Company-wide campaign manager access, from companies.settings.manager_access. */
export type ManagerAccess = {
  viewFinancials: boolean;
  viewSignups: boolean;
  inviteCreators: boolean;
};

export const DEFAULT_MANAGER_ACCESS: ManagerAccess = {
  viewFinancials: false,
  viewSignups: true,
  inviteCreators: false,
};

const FULL_MANAGER_ACCESS: ManagerAccess = {
  viewFinancials: true,
  viewSignups: true,
  inviteCreators: true,
};

export function parseManagerAccess(settings: unknown): ManagerAccess {
  const root =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  const raw =
    root.manager_access &&
    typeof root.manager_access === 'object' &&
    !Array.isArray(root.manager_access)
      ? (root.manager_access as Record<string, unknown>)
      : {};
  return {
    viewFinancials: raw.view_financials === true,
    viewSignups: raw.view_signups !== false,
    inviteCreators: raw.invite_creators === true,
  };
}

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  permissions: CompanyPermissions;
  managerAccess: ManagerAccess;
  loading: boolean;
  accounts: StoredAccount[];
  activeMode: AppMode;
  refreshProfile: () => Promise<void>;
  refreshManagerAccess: () => Promise<void>;
  refreshAccounts: () => Promise<void>;
  setActiveMode: (mode: AppMode) => Promise<void>;
  enableCreatorMode: () => Promise<void>;
  signOut: () => Promise<void>;
  switchAccount: (userId: string) => Promise<void>;
  addAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('profile lookup failed', error.message);
    return null;
  }

  // company_id is null only for pre-join creators; see the Profile type note.
  return data as Profile | null;
}

// The platform admin and the company admin implicitly hold every permission;
// campaign managers carry theirs on their company_members row.
async function fetchPermissions(
  profile: Profile | null,
): Promise<CompanyPermissions> {
  if (!profile) return NO_PERMISSIONS;
  if (profile.role === 'admin' || profile.role === 'company_admin') {
    return ALL_PERMISSIONS;
  }
  if (profile.role !== 'campaign_manager' || !profile.company_id) {
    return NO_PERMISSIONS;
  }
  const { data, error } = await supabase
    .from('company_members')
    .select('permissions')
    .eq('company_id', profile.company_id)
    .eq('profile_id', profile.id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('permissions lookup failed', error.message);
    return NO_PERMISSIONS;
  }
  const raw = data.permissions as Record<string, unknown>;
  return {
    invite_members: raw.invite_members === true,
    edit_account_template: raw.edit_account_template === true,
    manage_brand: raw.manage_brand === true,
    manage_features: raw.manage_features === true,
    manage_billing: raw.manage_billing === true,
    manage_publish_time: raw.manage_publish_time === true,
  };
}

export async function fetchManagerAccess(
  profile: Profile | null,
): Promise<ManagerAccess> {
  if (!profile) return DEFAULT_MANAGER_ACCESS;
  if (profile.role === 'admin' || profile.role === 'company_admin') {
    return FULL_MANAGER_ACCESS;
  }
  if (!profile.company_id) return DEFAULT_MANAGER_ACCESS;
  const { data, error } = await supabase
    .from('companies')
    .select('settings')
    .eq('id', profile.company_id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('manager access lookup failed', error.message);
    return DEFAULT_MANAGER_ACCESS;
  }
  return parseManagerAccess(data.settings);
}

async function activateStoredAccount(userId: string): Promise<Profile | null> {
  const target = await getStoredAccount(userId);
  if (!target) {
    throw new Error('That account is no longer saved on this device.');
  }
  if (!target.refreshToken.trim()) {
    await removeStoredAccount(userId);
    throw new Error('Session expired. Sign in again for that account.');
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: target.accessToken,
    refresh_token: target.refreshToken,
  });
  if (error || !data.session) {
    await removeStoredAccount(userId);
    const msg = error?.message ?? '';
    if (/refresh token/i.test(msg)) {
      throw new Error('Session expired. Sign in again for that account.');
    }
    throw new Error(msg || 'Could not switch accounts. Sign in again.');
  }

  const nextProfile = await fetchProfile(data.session.user.id);
  await upsertStoredAccount(data.session, nextProfile);
  return nextProfile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<CompanyPermissions>(NO_PERMISSIONS);
  const [managerAccess, setManagerAccess] = useState<ManagerAccess>(
    DEFAULT_MANAGER_ACCESS,
  );
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [activeMode, setActiveModeState] = useState<AppMode>('admin');
  const [loading, setLoading] = useState(true);

  const refreshAccounts = useCallback(async () => {
    setAccounts(await listStoredAccounts());
  }, []);

  const applyProfileMode = useCallback(async (next: Profile | null) => {
    if (!next) {
      setActiveModeState('admin');
      return;
    }
    try {
      const mode = await resolveMode(next);
      setActiveModeState(mode);
      await setStoredMode(next.id, mode);
    } catch (e) {
      console.error('active mode resolve failed', e);
      setActiveModeState(defaultMode(next));
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      setProfile(null);
      setPermissions(NO_PERMISSIONS);
      setManagerAccess(DEFAULT_MANAGER_ACCESS);
      return;
    }
    const next = await fetchProfile(userId);
    setProfile(next);
    const [perms, access] = await Promise.all([
      fetchPermissions(next),
      fetchManagerAccess(next),
    ]);
    setPermissions(perms);
    setManagerAccess(access);
    await applyProfileMode(next);
    if (session) {
      await upsertStoredAccount(session, next);
      await refreshAccounts();
    }
  }, [session, refreshAccounts, applyProfileMode]);

  const refreshManagerAccess = useCallback(async () => {
    setManagerAccess(await fetchManagerAccess(profile));
  }, [profile]);

  useEffect(() => {
    let mounted = true;

    void refreshAccounts();

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        if (data.session?.user) {
          const next = await fetchProfile(data.session.user.id);
          if (!mounted) return;
          setProfile(next);
          const [perms, access] = await Promise.all([
            fetchPermissions(next),
            fetchManagerAccess(next),
          ]);
          if (!mounted) return;
          setPermissions(perms);
          setManagerAccess(access);
          await applyProfileMode(next);
          await upsertStoredAccount(data.session, next);
          if (mounted) await refreshAccounts();
        }
        setLoading(false);
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        const next = await fetchProfile(nextSession.user.id);
        setProfile(next);
        const [perms, access] = await Promise.all([
          fetchPermissions(next),
          fetchManagerAccess(next),
        ]);
        setPermissions(perms);
        setManagerAccess(access);
        await applyProfileMode(next);
        await upsertStoredAccount(nextSession, next);
        await refreshAccounts();
      } else {
        setProfile(null);
        setPermissions(NO_PERMISSIONS);
        setManagerAccess(DEFAULT_MANAGER_ACCESS);
        setActiveModeState('admin');
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [refreshAccounts, applyProfileMode]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (userId) void registerPushToken(userId);
  }, [session?.user?.id]);

  useEffect(() => {
    if (loading || !session?.user) return;
    return attachNotificationRouting(() => activeMode);
  }, [loading, session?.user?.id, activeMode]);

  const setActiveMode = useCallback(
    async (mode: AppMode) => {
      if (!profile) return;
      if (!modesForProfile(profile).includes(mode)) return;
      try {
        await setStoredMode(profile.id, mode);
      } catch (e) {
        console.error('active mode persist failed', e);
      }
      setActiveModeState(mode);
      router.replace(destinationForProfile(profile, true, mode));
    },
    [profile],
  );

  const enableCreatorMode = useCallback(async () => {
    if (!profile || !session) return;
    if (profile.can_create !== true) {
      const { error } = await supabase
        .from('profiles')
        .update({ can_create: true })
        .eq('id', profile.id);
      if (error) throw error;
    }
    const next = await fetchProfile(profile.id);
    if (!next) throw new Error('Could not refresh profile.');
    setProfile(next);
    const [perms, access] = await Promise.all([
      fetchPermissions(next),
      fetchManagerAccess(next),
    ]);
    setPermissions(perms);
    setManagerAccess(access);
    await upsertStoredAccount(session, next);
    await refreshAccounts();
    try {
      await setStoredMode(next.id, 'creator');
    } catch (e) {
      console.error('active mode persist failed', e);
    }
    setActiveModeState('creator');
    router.replace(destinationForProfile(next, true, 'creator'));
  }, [profile, session, refreshAccounts]);

  const switchAccount = useCallback(
    async (userId: string) => {
      if (session?.user?.id === userId) return;

      const { data: fresh } = await supabase.auth.getSession();
      if (fresh.session) {
        await upsertStoredAccount(fresh.session, profile);
      }

      try {
        const nextProfile = await activateStoredAccount(userId);
        await refreshAccounts();
        const mode = nextProfile ? await resolveMode(nextProfile) : 'creator';
        setActiveModeState(mode);
        router.replace(destinationForProfile(nextProfile, true, mode));
      } catch (e) {
        await refreshAccounts();
        throw e;
      }
    },
    [session?.user?.id, profile, refreshAccounts],
  );

  const addAccount = useCallback(async () => {
    if (session) {
      await upsertStoredAccount(session, profile);
      await refreshAccounts();
    }
    await supabase.auth.signOut({ scope: 'local' });
    setProfile(null);
    setPermissions(NO_PERMISSIONS);
    setManagerAccess(DEFAULT_MANAGER_ACCESS);
    router.replace('/(auth)/login');
  }, [session, profile, refreshAccounts]);

  const signOut = useCallback(async () => {
    const userId = session?.user?.id;
    await supabase.auth.signOut({ scope: 'local' });
    if (userId) {
      await removeStoredAccount(userId);
    }
    const remaining = await listStoredAccounts();
    setAccounts(remaining);
    if (remaining[0]) {
      try {
        const nextProfile = await activateStoredAccount(remaining[0].userId);
        await refreshAccounts();
        const mode = nextProfile ? await resolveMode(nextProfile) : 'creator';
        setActiveModeState(mode);
        router.replace(destinationForProfile(nextProfile, true, mode));
      } catch {
        setProfile(null);
        setPermissions(NO_PERMISSIONS);
        setManagerAccess(DEFAULT_MANAGER_ACCESS);
        await refreshAccounts();
        router.replace('/(auth)/login');
      }
      return;
    }
    setProfile(null);
    setPermissions(NO_PERMISSIONS);
    setManagerAccess(DEFAULT_MANAGER_ACCESS);
  }, [session?.user?.id, refreshAccounts]);

  const value = useMemo(
    () => ({
      session,
      profile,
      permissions,
      managerAccess,
      loading,
      accounts,
      activeMode,
      refreshProfile,
      refreshManagerAccess,
      refreshAccounts,
      setActiveMode,
      enableCreatorMode,
      signOut,
      switchAccount,
      addAccount,
    }),
    [
      session,
      profile,
      permissions,
      managerAccess,
      loading,
      accounts,
      activeMode,
      refreshProfile,
      refreshManagerAccess,
      refreshAccounts,
      setActiveMode,
      enableCreatorMode,
      signOut,
      switchAccount,
      addAccount,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
