// The post object contract from ugc-bible.md Part 7. Shared between
// generation (Workstream D), the admin app (E), and the learning loop (F).
// Keep this file free of Deno and npm imports so Node can import it too.

export const FORMAT_IDS = [
  'two_hander_comparison',
  'talking_head_advice',
  'slideshow_tip_list',
  'slideshow_question_list',
  'myth_bust',
  'mistake_callout',
  'storytime',
  'day_in_the_life',
  'tier_list',
  'green_screen_react',
  'before_and_after',
  'red_flags_green_flags',
] as const;

export type FormatId = (typeof FORMAT_IDS)[number];

export type AudioDirection = 'trending_sound' | 'voiceover' | 'both';

export type Slide = {
  header: string;
  body: string;
};

/**
 * Every generation call returns this shape. Fields are universal; slot fills
 * are format specific. When a REQUIRED slot cannot be filled, kill_reason is
 * populated and the content fields are meaningless.
 */
export type PostObject = {
  format_id: FormatId;
  claim_id: string;
  /** Assigned before the script exists, validated against vocabulary. */
  search_phrase: string;
  hook: string;
  /** The 8 to 10 generated and scored variants, retained for testing. */
  hook_variants: string[];
  /** Keys defined by the format's slot_schema. */
  slot_fills: Record<string, unknown>;
  /** Video family only. */
  script: string | null;
  /** Slideshow family only. */
  slides: Slide[] | null;
  /** Search phrase lands in the first sentence. */
  caption: string;
  /** 3 to 5: one broad, two niche, one problem or intent tag. */
  hashtags: string[];
  pinned_comment: string;
  audio_direction: AudioDirection;
  /** Video family only. */
  shot_list: string[] | null;
  /** Slideshow family only, one entry per slide. */
  image_direction: string[] | null;
  plug: boolean;
  cta_keyword: string | null;
  /** Video family only. */
  target_length_sec: number | null;
  /** Populated instead of content when a required slot fails. */
  kill_reason: string | null;
};

export type GenerationSource =
  | 'weekly_batch'
  | 'regenerate'
  | 'remix_cross_creator'
  | 'remix_hook_swap'
  | 'remix_claim_swap'
  | 'remix_format_port';

/**
 * Stored on content_tasks.generation_meta. Every dimension here is an
 * attribution axis for the learning loop. bible_version records which bible
 * revision produced the post so performance can be attributed across edits.
 */
export type GenerationMeta = {
  source: GenerationSource;
  bible_version: string;
  format_id: FormatId;
  claim_id: string;
  hook_pattern: string | null;
  creator_id: string;
  search_phrase: string;
  plug: boolean;
};
