import type { ImperativeRouter as Router } from 'expo-router';

import type { AppMode } from './active-mode';

/**
 * Deep link grammar (mirrors supabase/functions/_shared/deep-link.ts):
 *
 *   noni://<role>/<company_id>/<screen>[/<id>]
 *
 * role   creator | manager
 * screen creator: home | posts | chat | profile | assignment/<id> | post/<id>
 *                 | posts/<id> | channel/<id>
 *        manager: home | settings | analytics | review/<id> | week/<id>
 *                 | chat/<id> | messages/<id> | account-approval/<id>
 *                 | creator/<id> | music/<id>
 */
export type DeepLinkRole = 'creator' | 'manager';

export type DeepLink = {
  role: DeepLinkRole;
  companyId: string;
  screen: string;
  id: string | null;
};

const SCHEME = 'noni://';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEGMENT = /^[a-z0-9-]+$/;

export function parseDeepLink(raw: unknown): DeepLink | null {
  if (typeof raw !== 'string' || !raw.startsWith(SCHEME)) return null;
  const parts = raw.slice(SCHEME.length).split('/').filter((p) => p.length > 0);
  if (parts.length < 3 || parts.length > 4) return null;
  const [role, companyId, screen, id] = parts;
  if (role !== 'creator' && role !== 'manager') return null;
  if (!UUID.test(companyId)) return null;
  if (!SEGMENT.test(screen)) return null;
  if (id !== undefined && !SEGMENT.test(id)) return null;
  return { role, companyId, screen, id: id ?? null };
}

export function modeForDeepLink(link: DeepLink): AppMode {
  return link.role === 'manager' ? 'admin' : 'creator';
}

const CREATOR_ROOT = '/(creator)';
const MANAGER_ROOT = '/(admin)';

/** Expo Router href for a parsed link. Unknown screens land on the role's home. */
export function routeForDeepLink(link: DeepLink): string {
  const { screen, id } = link;
  if (link.role === 'creator') {
    if (screen === 'home') return `${CREATOR_ROOT}/(tabs)`;
    if (screen === 'posts' && !id) return `${CREATOR_ROOT}/(tabs)/posts`;
    if (screen === 'profile') return `${CREATOR_ROOT}/(tabs)/profile`;
    if (screen === 'chat') return `${CREATOR_ROOT}/chat`;
    if (id && (screen === 'assignment' || screen === 'post' || screen === 'posts' || screen === 'channel')) {
      return `${CREATOR_ROOT}/${screen}/${id}`;
    }
    return `${CREATOR_ROOT}/(tabs)`;
  }
  if (screen === 'home') return `${MANAGER_ROOT}/(tabs)`;
  if (screen === 'settings' || screen === 'analytics') return `${MANAGER_ROOT}/(tabs)/${screen}`;
  if (
    id &&
    (screen === 'review' ||
      screen === 'week' ||
      screen === 'chat' ||
      screen === 'messages' ||
      screen === 'account-approval' ||
      screen === 'creator' ||
      screen === 'music')
  ) {
    return `${MANAGER_ROOT}/${screen}/${id}`;
  }
  return `${MANAGER_ROOT}/(tabs)`;
}

export type OpenDeepLinkOptions = {
  link: DeepLink;
  activeCompanyId: string | null;
  /** Server-side switch (rpc set_active_company); resolves once the profile is refetched. */
  switchCompany: (companyId: string) => Promise<unknown>;
  router: Pick<Router, 'push'>;
};

/** Switches the active company when the link points elsewhere, then navigates. */
export async function openDeepLink(options: OpenDeepLinkOptions): Promise<string> {
  const { link, activeCompanyId, switchCompany, router } = options;
  if (link.companyId !== activeCompanyId) {
    await switchCompany(link.companyId);
  }
  const href = routeForDeepLink(link);
  router.push(href as never);
  return href;
}
