import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';

import type { Profile } from './profile';

const KEY = 'noni.accounts.v1';

export type StoredAccount = {
  userId: string;
  email: string | null;
  fullName: string | null;
  role: string;
  avatarPath: string | null;
  accessToken: string;
  refreshToken: string;
};

function isStoredAccount(value: unknown): value is StoredAccount {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.userId === 'string' &&
    (row.email === null || typeof row.email === 'string') &&
    (row.fullName === null || typeof row.fullName === 'string') &&
    typeof row.role === 'string' &&
    (row.avatarPath === null || typeof row.avatarPath === 'string') &&
    typeof row.accessToken === 'string' &&
    typeof row.refreshToken === 'string'
  );
}

async function readAll(): Promise<StoredAccount[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredAccount);
  } catch {
    return [];
  }
}

async function writeAll(accounts: StoredAccount[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(accounts));
}

export async function listStoredAccounts(): Promise<StoredAccount[]> {
  return readAll();
}

export async function upsertStoredAccount(
  session: Session,
  profile: Profile | null,
): Promise<void> {
  const next: StoredAccount = {
    userId: session.user.id,
    email: session.user.email ?? null,
    fullName: profile?.full_name ?? null,
    role: profile?.role ?? 'creator',
    avatarPath: profile?.avatar_path ?? null,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  };
  const accounts = await readAll();
  const idx = accounts.findIndex((a) => a.userId === next.userId);
  if (idx >= 0) {
    accounts[idx] = next;
  } else {
    accounts.push(next);
  }
  await writeAll(accounts);
}

export async function removeStoredAccount(userId: string): Promise<void> {
  const accounts = await readAll();
  await writeAll(accounts.filter((a) => a.userId !== userId));
}

export async function getStoredAccount(
  userId: string,
): Promise<StoredAccount | null> {
  const accounts = await readAll();
  return accounts.find((a) => a.userId === userId) ?? null;
}
