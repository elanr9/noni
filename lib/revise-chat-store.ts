// The Revise with AI conversation kept on the device per post, so closing
// the sheet or leaving the editor keeps it. Storage failures never break it.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseReviseChat, REVISE_TURNS, type ReviseTurn } from './revise-chat';

const key = (briefId: string) => `noni.reviseChat.v1:${briefId}`;

export async function loadReviseChat(briefId: string): Promise<ReviseTurn[]> {
  try {
    return parseReviseChat(await AsyncStorage.getItem(key(briefId)));
  } catch {
    return [];
  }
}

export async function saveReviseChat(briefId: string, turns: ReviseTurn[]): Promise<void> {
  try {
    if (!turns.length) await AsyncStorage.removeItem(key(briefId));
    else await AsyncStorage.setItem(key(briefId), JSON.stringify(turns.slice(-REVISE_TURNS)));
  } catch (e) {
    console.warn('revise chat save failed', e);
  }
}
