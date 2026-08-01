// Loads .env.local then .env into process.env without overriding values that
// are already set, so scripts can run bare: npx tsx scripts/<name>.ts
// Maps EXPO_PUBLIC_SUPABASE_URL to SUPABASE_URL when the latter is unset.

import { readFileSync } from 'fs';

declare const process: { env: Record<string, string | undefined> };

export function loadEnvLocal(): void {
  for (const file of ['.env.local', '.env']) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      const [, key, raw] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = raw.replace(/^["']|["']$/g, '').trim();
    }
  }
  if (!process.env.SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
  }
}
