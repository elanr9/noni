import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));

import {
  destinationForProfile,
  hasCompanyFlag,
  isManagerSetupCompleteFlag,
  isSetupCompleteFlag,
  MANAGER_SETUP_COMPLETE_KEY,
  SETUP_COMPLETE_KEY,
  withCompanyFlag,
  type Profile,
} from './profile';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

describe('per-company setup flags', () => {
  it('is complete only in the company it was marked for', () => {
    const answers = withCompanyFlag(null, SETUP_COMPLETE_KEY, A);
    expect(isSetupCompleteFlag(answers, A)).toBe(true);
    expect(isSetupCompleteFlag(answers, B)).toBe(false);
  });

  it('does not trust the old person-wide flag', () => {
    const answers = { setup_complete: true, manager_setup_complete: true };
    expect(isSetupCompleteFlag(answers, A)).toBe(false);
    expect(isManagerSetupCompleteFlag(answers, A)).toBe(false);
  });

  it('keeps other answers and other companies when a company is added', () => {
    const first = withCompanyFlag({ warmup_tutorial_seen: true }, SETUP_COMPLETE_KEY, A);
    const both = withCompanyFlag(first, SETUP_COMPLETE_KEY, B);
    expect(both.warmup_tutorial_seen).toBe(true);
    expect(isSetupCompleteFlag(both, A)).toBe(true);
    expect(isSetupCompleteFlag(both, B)).toBe(true);
    expect(isManagerSetupCompleteFlag(both, A)).toBe(false);
  });

  it('is false with no company or malformed answers', () => {
    expect(hasCompanyFlag(null, SETUP_COMPLETE_KEY, A)).toBe(false);
    expect(hasCompanyFlag({ [SETUP_COMPLETE_KEY]: true }, SETUP_COMPLETE_KEY, A)).toBe(false);
    expect(hasCompanyFlag({ [SETUP_COMPLETE_KEY]: [A] }, SETUP_COMPLETE_KEY, A)).toBe(false);
    expect(hasCompanyFlag(withCompanyFlag(null, SETUP_COMPLETE_KEY, A), SETUP_COMPLETE_KEY, null)).toBe(false);
  });
});

describe('destinationForProfile for a manager in several companies', () => {
  const manager = (companyId: string) =>
    ({
      id: 'u1',
      role: 'campaign_manager',
      can_create: false,
      onboarded: true,
      active_company_id: companyId,
      onboarding_answers: withCompanyFlag(null, MANAGER_SETUP_COMPLETE_KEY, A),
    }) as unknown as Profile;

  it('skips the checklist where it is done and shows it in a new company', () => {
    expect(destinationForProfile(manager(A), true, 'admin')).toBe('/(admin)/(tabs)');
    expect(destinationForProfile(manager(B), true, 'admin')).toBe('/(admin)/(tabs)/setup');
  });
});
