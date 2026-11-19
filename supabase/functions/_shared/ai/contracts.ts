// Shared contracts for the AI core: the company brain, reference analysis,
// the brief engine and the edit planner. Every module under _shared/ai and the
// edge functions built on it code against these types. Change them here first.

// ---------------------------------------------------------------- brain

// What a brain record is about. Facts say what is true of the product, quotes
// hold what customers said verbatim, and angles and learnings hold what was
// decided or observed. The three are never mixed in one record.
export type EntityType =
  | 'company'
  | 'product'
  | 'feature'
  | 'demo_moment'
  | 'persona'
  | 'pain'
  | 'outcome'
  | 'alternative'
  | 'differentiator'
  | 'quote'
  | 'proof'
  | 'claim'
  | 'objection'
  | 'offer'
  | 'voice_rule'
  | 'glossary'
  | 'compliance'
  | 'goal'
  | 'creator_pref'
  | 'angle'
  | 'learning';

export type FactStatus = 'inferred' | 'confirmed' | 'disputed' | 'stale' | 'retired';

// 1 human-confirmed or legal, 2 live product (codebase, billing, store config),
// 3 first-party published (website, store listing), 4 first-party social and
// past content, 5 third-party (reviews, Reddit, press), 6 model inference.
// Tiers 1 to 3 decide what is true. Tier 5 only decides how customers talk.
export type AuthorityTier = 1 | 2 | 3 | 4 | 5 | 6;

// generation_ok may be stated in content, context_only informs but is never
// asserted, blocked is never shown to a generator.
export type FactUsage = 'generation_ok' | 'context_only' | 'blocked';

export type Freshness = 'volatile' | 'moving' | 'slow' | 'evidence' | 'durable';

export type SourceKind =
  | 'website_page'
  | 'app_store'
  | 'codebase'
  | 'upload'
  | 'survey_answer'
  | 'voice_note'
  | 'reference_post'
  | 'own_post'
  | 'review'
  | 'manual';

export type FactSourceRef = {
  source_id: string;
  // The exact words in the source that support the fact. A fact with no
  // excerpt is model inference (tier 6) whatever its source says.
  excerpt: string;
  locator?: string;
};

export type BrainFact<D = Record<string, unknown>> = {
  id: string;
  company_id: string;
  entity_type: EntityType;
  // Stable slug within (company, entity_type), used to match a new extraction
  // to the record it updates or contradicts.
  key: string;
  title: string;
  data: D;
  status: FactStatus;
  confidence: number;
  authority_tier: AuthorityTier;
  usage: FactUsage;
  freshness: Freshness;
  sources: FactSourceRef[];
  extracted_by: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  valid_until: string | null;
  last_verified_at: string | null;
  recheck_after: string | null;
  supersedes: string | null;
  created_at: string;
  updated_at: string;
};

// A claim the writer may put in a creator's mouth, with the id it must cite.
export type ApprovedClaim = { id: string; wording: string; qualifier: string | null };

// A screen moment a creator can film: where it starts, what they do, and the
// frame that proves it worked.
export type DemoMomentRef = {
  id: string;
  title: string;
  start_state: string;
  user_action: string;
  end_state: string;
  seconds: number | null;
  media_url: string | null;
};

export type BrainQuery = {
  companyId: string;
  // Free text describing what is being made: the topic, title or idea.
  topic?: string;
  format?: string;
  personaKey?: string;
  // Upper bound on retrieved (not always-injected) records.
  limit?: number;
};

// What a generator receives. `core` and `constraints` are injected in full on
// every call and are stable per company, so they sit in the cached prefix.
// `retrieved` depends on the query and goes after the cache breakpoint.
export type BrainContext = {
  companyId: string;
  productName: string;
  // Company, product, offer, personas, top pains, differentiators, voice rules.
  core: string;
  // Banned claims, required qualifiers, must-not-show, disclosure rule,
  // glossary must-use and never-use. Similarity search must not be able to
  // miss these, so they are never retrieved.
  constraints: string;
  // Topic-relevant quotes, proof, demo moments, objections, learnings and
  // angles, rendered with their ids.
  retrieved: string;
  approvedClaims: ApprovedClaim[];
  demoMoments: DemoMomentRef[];
  // Facts in dispute that touch this query. Generators avoid them.
  conflicts: string[];
  // 0 to 1: how much confirmed, usable knowledge exists. Below 0.3 a
  // generator should say what is missing instead of guessing.
  coverage: number;
  missing: string[];
  // Phrases the company never wants said, as a list, so code can check a
  // draft for them. The same rules are in `constraints` as prose. Optional:
  // a brain that does not fill it loses only the code check.
  bannedPhrases?: string[];
};

// ---------------------------------------------------------------- references

export type ReferencePlatform = 'tiktok' | 'instagram';

export type TimedWord = { w: string; s: number; e: number };

export type OnScreenText = {
  text: string;
  start_ms: number;
  end_ms: number;
  // Rough placement in the 9:16 frame.
  position: 'top' | 'upper' | 'center' | 'lower' | 'bottom';
  role: 'hook' | 'header' | 'caption' | 'label' | 'cta' | 'other';
};

export type ReferenceBeat = {
  index: number;
  start_ms: number;
  end_ms: number;
  role: 'hook' | 'setup' | 'point' | 'demo' | 'proof' | 'turn' | 'payoff' | 'cta';
  // What is said in this beat, verbatim from the transcript.
  spoken: string;
  // What is on screen: framing, setting, action, screen recording, b-roll.
  visual: string;
  shot: 'talking_head' | 'screen_recording' | 'green_screen' | 'b_roll' | 'photo' | 'text_only' | 'split' | 'other';
  // The job this beat does for retention, in one line.
  function: string;
};

export type ReferenceAnalysis = {
  version: 2;
  url: string;
  platform: ReferencePlatform;
  media: 'video' | 'slideshow';
  duration_ms: number | null;
  author: string | null;
  caption: string;
  hashtags: string[];
  metrics: { views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null };
  posted_at: string | null;
  sound: { title: string | null; original: boolean | null };
  transcript: string;
  words: TimedWord[];
  // What was actually observed. `frames` false means the visual fields below
  // were inferred from the transcript alone and must be treated as guesses.
  // `cover` true means only the post's cover image was seen (not sampled
  // frames); `frame_count` is how many sampled frames the analysis looked at.
  observed: { transcript: boolean; word_timings: boolean; frames: boolean; cover?: boolean; frame_count?: number };
  format: string;
  hook: {
    spoken: string;
    on_screen: string | null;
    visual: string;
    archetype: string;
    ends_ms: number | null;
  };
  beats: ReferenceBeat[];
  on_screen_text: OnScreenText[];
  // Slideshow references only: the text of each slide in order.
  slides: string[];
  editing: {
    cut_count: number | null;
    avg_shot_ms: number | null;
    captions: 'none' | 'word_by_word' | 'phrase' | 'full_sentence' | 'unknown';
    notes: string;
  };
  product_moment: { present: boolean; start_ms: number | null; how: string };
  cta: { kind: 'none' | 'comment' | 'link_in_bio' | 'follow' | 'save' | 'search' | 'other'; wording: string | null };
  why_it_works: string[];
  // The reusable skeleton: what carries over to another product unchanged and
  // what belongs to this post's own subject and must not be copied.
  transfer: { keep: string[]; replace: string[] };
};

// ---------------------------------------------------------------- briefs

export type BriefType = 'Talking Head' | 'Long Text' | 'Slideshow' | 'Greenscreen';
export type BriefMode = 'guided' | 'outline' | 'long_text' | 'titles';

// One clip or slide of a guided brief. `say` and `onScreen` keep the names the
// app already reads (lib/brief-ai.ts).
export type PlanClip = {
  say: string;
  onScreen: string;
  cta: boolean;
  // Direction for the creator: framing, what to show, which demo moment.
  shot: string;
  demo_moment_id: string | null;
  // Ids of approved claims this clip states. A product claim with no id fails
  // the gate.
  claim_ids: string[];
};

export type HookOption = { say: string; onScreen: string; visual: string; archetype: string };

export type BriefPlan = {
  title: string;
  // What a viewer would type into search to find this post.
  phrase: string;
  // One sentence: who it is for, the pain, and the turn.
  angle: string;
  clips: PlanClip[];
  // Alternative openings for clip 1, different in kind, not rewordings.
  hooks: HookOption[];
  caption: string;
  tags: string[];
  // Outline mode: the loose plan the creator films in their own words.
  notes: string;
  // Set when the engine declines to write: the brain lacks what the post
  // needs. The client shows the reason instead of content.
  kill_reason: string | null;
  // What the engine would have liked to know, for the brain's question queue.
  questions: string[];
  // Set when a reference link was given: what was and was not read from it.
  // Null or absent when the reference was read in full or none was given.
  reference_note?: string | null;
  // Checks code is certain about that still fail after the one revision. Shown
  // to the manager as suggestions; they never block.
  warnings?: string[];
};

// ---------------------------------------------------------------- edit plans

// The edit planner's output, in source time (ms within each take). The client
// maps it onto the VideoDocument (lib/edit-document.ts).
export type EditKeep = {
  asset_id: string;
  in_ms: number;
  out_ms: number;
  // 1 keeps full frame. Above 1 punches in (rendered as a static crop).
  zoom: number;
  speed: 1 | 1.5 | 2;
  reason: string;
};

export type EditText = {
  role: 'hook' | 'header' | 'label' | 'cta';
  text: string;
  // Output time, after cuts.
  start_ms: number;
  end_ms: number;
  position: 'top' | 'upper' | 'center' | 'lower';
};

export type EditInsert = {
  // A demo moment or feature media id from the brain.
  media_id: string;
  start_ms: number;
  end_ms: number;
  layout: 'overlay' | 'split' | 'full';
};

export type EditPlan = {
  keeps: EditKeep[];
  texts: EditText[];
  inserts: EditInsert[];
  captions: { enabled: boolean; position: 'center' | 'lower' };
  sound: { use_brief_track: boolean; track_volume: number; voice_volume: number };
  cut_ms: number;
  // What the planner did and why, for the creator, in a few short lines.
  summary: string[];
  // True when a model planned the edit, false for the deterministic fallback.
  ai: boolean;
};
