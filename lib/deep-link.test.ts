import { describe, expect, it, vi } from 'vitest';

import {
  modeForDeepLink,
  openDeepLink,
  parseDeepLink,
  routeForDeepLink,
} from './deep-link';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const ASSIGNMENT = '11111111-2222-4333-8444-555555555555';

describe('parseDeepLink', () => {
  it('parses role, company, screen and id', () => {
    expect(parseDeepLink(`noni://creator/${A}/assignment/${ASSIGNMENT}`)).toEqual({
      role: 'creator',
      companyId: A,
      screen: 'assignment',
      id: ASSIGNMENT,
    });
  });

  it('parses a screen without id', () => {
    expect(parseDeepLink(`noni://manager/${B}/settings`)).toEqual({
      role: 'manager',
      companyId: B,
      screen: 'settings',
      id: null,
    });
  });

  it('rejects bad input', () => {
    expect(parseDeepLink(undefined)).toBeNull();
    expect(parseDeepLink('https://usenoni.app/x')).toBeNull();
    expect(parseDeepLink(`noni://admin/${A}/home`)).toBeNull();
    expect(parseDeepLink('noni://creator/not-a-uuid/home')).toBeNull();
    expect(parseDeepLink(`noni://creator/${A}`)).toBeNull();
    expect(parseDeepLink(`noni://creator/${A}/home/x/y`)).toBeNull();
    expect(parseDeepLink(`noni://creator/${A}/home/../etc`)).toBeNull();
  });
});

describe('routeForDeepLink', () => {
  it('maps creator screens', () => {
    expect(routeForDeepLink({ role: 'creator', companyId: A, screen: 'home', id: null })).toBe(
      '/(creator)/(tabs)',
    );
    expect(routeForDeepLink({ role: 'creator', companyId: A, screen: 'posts', id: null })).toBe(
      '/(creator)/(tabs)/posts',
    );
    expect(
      routeForDeepLink({ role: 'creator', companyId: A, screen: 'posts', id: ASSIGNMENT }),
    ).toBe(`/(creator)/posts/${ASSIGNMENT}`);
    expect(routeForDeepLink({ role: 'creator', companyId: A, screen: 'chat', id: null })).toBe(
      '/(creator)/chat',
    );
    expect(
      routeForDeepLink({ role: 'creator', companyId: A, screen: 'channel', id: ASSIGNMENT }),
    ).toBe(`/(creator)/channel/${ASSIGNMENT}`);
    expect(routeForDeepLink({ role: 'creator', companyId: A, screen: 'bogus', id: null })).toBe(
      '/(creator)/(tabs)',
    );
  });

  it('maps manager screens', () => {
    expect(routeForDeepLink({ role: 'manager', companyId: A, screen: 'home', id: null })).toBe(
      '/(admin)/(tabs)',
    );
    expect(routeForDeepLink({ role: 'manager', companyId: A, screen: 'analytics', id: null })).toBe(
      '/(admin)/(tabs)/analytics',
    );
    expect(
      routeForDeepLink({ role: 'manager', companyId: A, screen: 'review', id: ASSIGNMENT }),
    ).toBe(`/(admin)/review/${ASSIGNMENT}`);
    expect(
      routeForDeepLink({ role: 'manager', companyId: A, screen: 'account-approval', id: ASSIGNMENT }),
    ).toBe(`/(admin)/account-approval/${ASSIGNMENT}`);
    expect(routeForDeepLink({ role: 'manager', companyId: A, screen: 'review', id: null })).toBe(
      '/(admin)/(tabs)',
    );
  });

  it('derives the app mode from the role', () => {
    expect(modeForDeepLink({ role: 'manager', companyId: A, screen: 'home', id: null })).toBe('admin');
    expect(modeForDeepLink({ role: 'creator', companyId: A, screen: 'home', id: null })).toBe('creator');
  });
});

describe('openDeepLink', () => {
  it('switches company only when the link points elsewhere', async () => {
    const switchCompany = vi.fn(async () => undefined);
    const router = { push: vi.fn() };
    const link = { role: 'creator' as const, companyId: B, screen: 'assignment', id: ASSIGNMENT };

    await openDeepLink({ link, activeCompanyId: A, switchCompany, router });
    expect(switchCompany).toHaveBeenCalledWith(B);
    expect(router.push).toHaveBeenCalledWith(`/(creator)/assignment/${ASSIGNMENT}`);

    switchCompany.mockClear();
    router.push.mockClear();
    await openDeepLink({ link, activeCompanyId: B, switchCompany, router });
    expect(switchCompany).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('does not navigate when the switch fails', async () => {
    const switchCompany = vi.fn(async () => {
      throw new Error('not a member');
    });
    const router = { push: vi.fn() };
    const link = { role: 'creator' as const, companyId: B, screen: 'home', id: null };
    await expect(
      openDeepLink({ link, activeCompanyId: A, switchCompany, router }),
    ).rejects.toThrow('not a member');
    expect(router.push).not.toHaveBeenCalled();
  });
});
