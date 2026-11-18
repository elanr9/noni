import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Edge function tests run under Deno (`deno test` in supabase/functions): they import jsr: modules vitest cannot load.
    exclude: [...configDefaults.exclude, 'supabase/functions/_shared/cues.test.ts', 'supabase/functions/_shared/documentAssembly.test.ts'],
  },
});
