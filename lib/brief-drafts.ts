import AsyncStorage from '@react-native-async-storage/async-storage';

import type { BriefKind, BriefType, GuidedState, LongTextState } from './brief-library';

/** Draft shape version; older drafts are dropped. */
export const WIZ_V = 5;

export type WizardStep = 0 | 1 | 2;

/** Everything the new post modal holds, persisted per slot on every change. */
export type WizardState = {
  v: typeof WIZ_V;
  step: WizardStep;
  type?: BriefType;
  /** 'Long Text' skips the format step. */
  kind?: BriefKind | 'Long Text';
  /** Outline fields. */
  title?: string;
  notes?: string;
  link?: string;
  music?: boolean;
  filled?: boolean;
  g?: GuidedState | null;
  lt?: LongTextState | null;
  editingExisting?: boolean;
};

const key = (slot: string) => `noni.brief.${slot}`;

export async function loadDraft(slot: string): Promise<WizardState | null> {
  try {
    const raw = await AsyncStorage.getItem(key(slot));
    if (!raw) return null;
    const d = JSON.parse(raw) as WizardState;
    return d && d.v === WIZ_V ? d : null;
  } catch {
    return null;
  }
}

export function saveDraft(slot: string, state: WizardState): void {
  AsyncStorage.setItem(key(slot), JSON.stringify(state)).catch(() => undefined);
}

export function clearDraft(slot: string): void {
  AsyncStorage.removeItem(key(slot)).catch(() => undefined);
}
