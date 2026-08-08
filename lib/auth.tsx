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
import { registerPushToken } from './notifications';
import { destinationForProfile, type Profile } from './profile';
import { supabase } from './supabase';

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  accounts: StoredAccount[];
  refreshProfile: () => Promise<void>;
  refreshAccounts: () => Promise<void>;
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

  return data;
}

async function activateStoredAccount(userId: string): Promise<Profile | null> {
  const target = await getStoredAccount(userId);
  if (!target) {
    throw new Error('That account is no longer saved on this device.');
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: target.accessToken,
    refresh_token: target.refreshToken,
  });
  if (error || !data.session) {
    await removeStoredAccount(userId);
    throw new Error(
      error?.message ?? 'Could not switch accounts. Sign in again.',
    );
  }

  const nextProfile = await fetchProfile(data.session.user.id);
  await upsertStoredAccount(data.session, nextProfile);
  return nextProfile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshAccounts = useCallback(async () => {
    setAccounts(await listStoredAccounts());
  }, []);

  const refreshProfile = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      setProfile(null);
      return;
    }
    const next = await fetchProfile(userId);
    setProfile(next);
    if (session) {
      await upsertStoredAccount(session, next);
      await refreshAccounts();
    }
  }, [session, refreshAccounts]);

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
        await upsertStoredAccount(nextSession, next);
        await refreshAccounts();
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [refreshAccounts]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (userId) void registerPushToken(userId);
  }, [session?.user?.id]);

  const switchAccount = useCallback(
    async (userId: string) => {
      if (session?.user?.id === userId) return;

      if (session) {
        await upsertStoredAccount(session, profile);
      }

      try {
        const nextProfile = await activateStoredAccount(userId);
        await refreshAccounts();
        router.replace(destinationForProfile(nextProfile, true));
      } catch (e) {
        await refreshAccounts();
        throw e;
      }
    },
    [session, profile, refreshAccounts],
  );

  const addAccount = useCallback(async () => {
    if (session) {
      await upsertStoredAccount(session, profile);
      await refreshAccounts();
    }
    await supabase.auth.signOut({ scope: 'local' });
    setProfile(null);
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
        router.replace(destinationForProfile(nextProfile, true));
      } catch {
        setProfile(null);
        await refreshAccounts();
        router.replace('/(auth)/login');
      }
      return;
    }
    setProfile(null);
  }, [session?.user?.id, refreshAccounts]);

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      accounts,
      refreshProfile,
      refreshAccounts,
      signOut,
      switchAccount,
      addAccount,
    }),
    [
      session,
      profile,
      loading,
      accounts,
      refreshProfile,
      refreshAccounts,
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
