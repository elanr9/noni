// Text embeddings from the model built into the Supabase edge runtime
// (gte-small), so no external provider or key is involved.
//
// Limits, from the Supabase docs (guides/functions/ai-models):
// - English text only.
// - Input past 512 tokens is truncated silently, so chunk long text first.
// - run() takes one string, so texts are embedded one after another.
// - The Supabase global exists only inside the edge runtime (deployed, or
//   `supabase functions serve`), not under plain `deno test`.

export const EMBED_DIM = 384;

type EmbedSession = {
  run(input: string, options: { mean_pool: boolean; normalize: boolean }): Promise<number[]>;
};
type EdgeAi = { ai: { Session: new (model: string) => EmbedSession } };

let session: EmbedSession | undefined;

/**
 * One unit length vector of EMBED_DIM numbers per text, in order. Mean
 * pooled and normalized, so inner product and cosine distance rank the same.
 */
export async function embed(texts: string[]): Promise<number[][]> {
  if (!session) {
    const runtime = (globalThis as { Supabase?: EdgeAi }).Supabase;
    if (!runtime?.ai) throw new Error('embed() needs the Supabase edge runtime (Supabase.ai is not defined)');
    // One session for the life of the worker; requests share it.
    session = new runtime.ai.Session('gte-small');
  }
  const vectors: number[][] = [];
  for (const text of texts) {
    if (!text.trim()) throw new Error('embed() was given an empty text');
    const vector = await session.run(text, { mean_pool: true, normalize: true });
    if (!Array.isArray(vector) || vector.length !== EMBED_DIM) {
      throw new Error(`embed() expected ${EMBED_DIM} dimensions, got ${Array.isArray(vector) ? vector.length : typeof vector}`);
    }
    vectors.push(vector);
  }
  return vectors;
}
