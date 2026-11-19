// The shape of each brain record's `data`, the JSON Schemas the extractor
// fills, and the rules that decide how far a record can be trusted. No I/O
// and no imports beyond types, so it loads under Deno and vitest alike.
//
// Each entity keeps only the fields that change what a creator is asked to
// say or show. Unknown strings are '' and unknown counts are 0 (never null):
// structured outputs cap the number of nullable fields in one schema, and the
// extractor's schema covers many entities at once.

import type { AuthorityTier, EntityType, FactStatus, FactUsage, Freshness, SourceKind } from './contracts.ts';

// ---------------------------------------------------------------- data shapes

export type CompanyData = {
  one_liner: string;
  /** The words customers use for the category, not the company's own label. */
  category_terms: string[];
  markets: string[];
  /** Why the category is regulated (finance, health, minors), or ''. */
  regulated: string;
};

export type ProductData = {
  name: string;
  platforms: string[];
  one_liner: string;
  /** The job a customer hires it for, in their terms. */
  job: string;
  /** What a user must bring before it does anything (an account, data, a photo). */
  inputs_required: string;
  /** What the user ends up holding: a report, a plan, a booked slot. */
  output: string;
  limitations: string[];
};

export type FeatureData = {
  name: string;
  description: string;
  /** Plan or paywall it sits behind, or ''. */
  gating: string;
  platforms: string[];
  maturity: 'stable' | 'beta' | 'changing' | 'unknown';
  /** Screenshots or clips of the feature. Filled by imports and uploads, never by extraction. */
  media_urls: string[];
};

export type DemoMomentData = {
  /** Name of the feature this shows. */
  feature: string;
  /** What is on screen before the creator touches anything. */
  start_state: string;
  /** The taps or typing, in order. */
  user_action: string;
  /** The frame that proves it worked. */
  end_state: string;
  /** Seconds from first tap to proof frame; 0 when unknown. */
  seconds: number;
  /** Data the screen needs to look right on camera, or ''. */
  needs_sample_data: string;
  must_not_show: string[];
  /** True for the moment a new user gets it. */
  is_aha: boolean;
  /** A capture of the moment. Filled by imports and uploads, never by extraction. */
  media_url: string;
};

export type PersonaData = {
  label: string;
  /** The circumstances in which the pain shows up. */
  situation: string;
  triggers: string[];
  role: 'payer' | 'user' | 'both' | 'recommender' | 'unknown';
  /** Words and phrases these people actually use. */
  vocabulary: string[];
  /** Communities, hashtags, creators they follow. */
  hangouts: string[];
  /** Who they would believe on camera. */
  believable_messenger: string;
  bad_fit: string;
};

export type PainData = {
  /** In the customer's words. */
  statement: string;
  /** What it costs them: time, money, a feeling. */
  cost: string;
  /** What they do about it today. */
  workaround: string;
  /** Label of the persona who has it, or ''. */
  persona: string;
};

export type OutcomeData = {
  statement: string;
  /** When it arrives: first session, a week, three months. */
  horizon: string;
  /** How the result shows up on a screen. */
  on_screen: string;
  typicality: 'typical' | 'best_case' | 'unknown';
};

export type AlternativeData = {
  name: string;
  type: 'direct' | 'generic_tool' | 'manual' | 'do_nothing' | 'aspirational';
  does_well: string;
  falls_short: string;
  /** Whether creators may say its name. Only the company can grant this. */
  may_name: boolean;
};

export type DifferentiatorData = {
  /** What is different. */
  attribute: string;
  /** Compared with which alternative. */
  versus: string;
  /** What the difference lets a customer do. */
  value: string;
  who_cares: string;
  substantiation: string;
};

export type QuoteData = {
  /** Verbatim and immutable. */
  text: string;
  source_type: 'app_store' | 'reddit' | 'support' | 'call' | 'survey' | 'comment' | 'review_site' | 'other';
  bucket: 'pain' | 'trigger' | 'objection' | 'transformation' | 'standout_language';
  persona: string;
  /** Star rating when the source has one; 0 otherwise. */
  rating: number;
  /** The words may shape a script; the person may only be named when this is true. */
  may_attribute: boolean;
};

export type ProofData = {
  statement: string;
  type: 'number' | 'testimonial' | 'press' | 'award' | 'logo' | 'rating' | 'certification' | 'artefact';
  /** The figure with its unit, or ''. */
  value: string;
  as_of: string;
  typicality: 'typical' | 'best_case' | 'single_case' | 'unknown';
};

export type ClaimData = {
  /** The exact words. For a banned claim, the thing that must not be said. */
  wording: string;
  type: 'performance' | 'comparative' | 'price' | 'health' | 'financial' | 'ai_capability' | 'safety' | 'feature' | 'other';
  status: 'approved' | 'needs_substantiation' | 'banned';
  /** Words that must accompany the claim ("results vary"), or ''. */
  qualifier: string;
  /** Why it is banned or restricted, or ''. */
  reason: string;
  substantiation: string;
  /** '' when it holds everywhere. */
  market: string;
};

export type ObjectionData = {
  /** In the customer's words. */
  statement: string;
  /** The company's honest answer, or ''. */
  answer: string;
  persona: string;
};

export type OfferData = {
  kind: 'pricing' | 'trial' | 'free_tier' | 'promotion' | 'creator_code' | 'cta';
  /** The exact terms: amounts, lengths, what is included, or for cta what the viewer should do. */
  terms: string;
  url: string;
  /** Wording that must be used as written, or ''. */
  required_wording: string;
  /** '' when it holds everywhere. */
  market: string;
  /** '' when it holds for every plan. */
  plan: string;
  /** ISO date the offer ends, or ''. */
  ends_on: string;
};

export type VoiceRuleData = {
  /** brand_voice covers captions and overlays; creator_latitude covers what creators may do in their own voice. */
  scope: 'brand_voice' | 'creator_latitude';
  rule: string;
  do: string[];
  dont: string[];
  /** Real lines in the voice, copied from the source. */
  example_lines: string[];
  banned_words: string[];
};

export type GlossaryData = {
  term: string;
  written_form: string;
  pronunciation: string;
  meaning: string;
  never_use: string[];
  internal_only: boolean;
};

export type ComplianceData = {
  kind: 'disclosure' | 'must_not_show' | 'regulated' | 'platform' | 'music' | 'minors' | 'approval' | 'other';
  rule: string;
  /** Exact wording to use, or ''. */
  wording: string;
};

export type GoalData = {
  objective: string;
  metric: string;
  platforms: string[];
  placement: 'organic' | 'boosted' | 'asset_only' | 'unknown';
};

export type CreatorPrefData = {
  /** Who the customer would trust: a role or kind of person. */
  role: string;
  traits: string[];
  face: 'face' | 'faceless' | 'either';
  exclusions: string[];
  /** How closely creators must follow a script. */
  latitude: 'word_for_word' | 'key_points' | 'loose' | 'unknown';
};

export type AngleData = {
  sentence: string;
  pain: string;
  persona: string;
  family: string;
  differentiator: string;
  status: 'candidate' | 'testing' | 'winner' | 'fatigued' | 'retired';
};

export type LearningData = {
  statement: string;
  /** Where it applies: a persona, platform or format. */
  scope: string;
  /** What it rests on: post ids, a metric, a date range. */
  evidence: string;
  sample_size: number;
  strength: 'weak' | 'moderate' | 'strong';
};

export type EntityDataMap = {
  company: CompanyData;
  product: ProductData;
  feature: FeatureData;
  demo_moment: DemoMomentData;
  persona: PersonaData;
  pain: PainData;
  outcome: OutcomeData;
  alternative: AlternativeData;
  differentiator: DifferentiatorData;
  quote: QuoteData;
  proof: ProofData;
  claim: ClaimData;
  objection: ObjectionData;
  offer: OfferData;
  voice_rule: VoiceRuleData;
  glossary: GlossaryData;
  compliance: ComplianceData;
  goal: GoalData;
  creator_pref: CreatorPrefData;
  angle: AngleData;
  learning: LearningData;
};

// ---------------------------------------------------------------- field specs

type Field =
  | { t: 'string'; d: string; extract?: false }
  | { t: 'list'; d: string; extract?: false }
  | { t: 'enum'; values: readonly string[]; d: string; fallback: string }
  | { t: 'int'; d: string }
  | { t: 'bool'; d: string };

const str = (d: string): Field => ({ t: 'string', d });
const list = (d: string): Field => ({ t: 'list', d });
// The fallback is what an unrecognised value becomes: the least committal
// member where the enum has one, otherwise the last.
const SAFE = ['unknown', 'other', 'needs_substantiation', 'candidate', 'weak', 'either', 'brand_voice', 'direct', 'standout_language'];
const pick = (values: readonly string[], d: string): Field => ({
  t: 'enum',
  values,
  d,
  fallback: SAFE.find((v) => values.includes(v)) ?? values[values.length - 1],
});
const int = (d: string): Field => ({ t: 'int', d });
const bool = (d: string): Field => ({ t: 'bool', d });

export type EntitySpec = {
  /** Heading used when records are rendered for a model or a person. */
  label: string;
  /** One line telling the extractor when a passage is this kind of record. */
  when: string;
  freshness: Freshness;
  /** What a sourced, unconfirmed record may be used for. */
  usage: FactUsage;
  /** Never generation_ok until a person confirms it, whatever the source. */
  needsHuman?: true;
  /** Only one record makes sense, so the key is fixed. */
  singletonKey?: string;
  /** Fields whose disagreement is a contradiction and not just rewording. */
  conflictFields: string[];
  /** The field shown first when rendering, then the rest in declaration order. */
  lead: string;
  fields: Record<string, Field>;
};

export const ENTITIES: Record<EntityType, EntitySpec> = {
  company: {
    label: 'Company',
    when: 'who the company is and the market it sells in',
    freshness: 'durable',
    usage: 'generation_ok',
    singletonKey: 'company',
    conflictFields: [],
    lead: 'one_liner',
    fields: {
      one_liner: str('one plain sentence on what the company does, in the source\'s own terms'),
      category_terms: list('the words customers use for this kind of product'),
      markets: list('countries or regions it sells in, only when stated'),
      regulated: str('why the category is regulated, or empty'),
    },
  },
  product: {
    label: 'Product',
    when: 'what the product is and what a user gets from it',
    freshness: 'moving',
    usage: 'generation_ok',
    conflictFields: [],
    lead: 'one_liner',
    fields: {
      name: str('product name as written'),
      platforms: list('iOS, Android, web, desktop and so on, only when stated'),
      one_liner: str('one plain sentence on what it does'),
      job: str('the job a customer hires it for'),
      inputs_required: str('what a user must bring before it does anything, or empty'),
      output: str('what the user ends up holding, or empty'),
      limitations: list('things it does not do, only when stated'),
    },
  },
  feature: {
    label: 'Features',
    when: 'a specific thing the product does',
    freshness: 'moving',
    usage: 'generation_ok',
    conflictFields: ['gating'],
    lead: 'description',
    fields: {
      name: str('the customer-facing name'),
      description: str('the concrete thing it does, in plain words'),
      gating: str('the plan or paywall it sits behind, or empty'),
      platforms: list('where it is available, only when stated'),
      maturity: pick(['stable', 'beta', 'changing', 'unknown'], 'unknown unless the source says'),
      media_urls: { t: 'list', d: 'screenshots or clips', extract: false },
    },
  },
  demo_moment: {
    label: 'Demo moments',
    when: 'a moment on screen a creator could film: a starting screen, an action and a visible result',
    freshness: 'moving',
    usage: 'generation_ok',
    conflictFields: [],
    lead: 'user_action',
    fields: {
      feature: str('name of the feature it shows, or empty'),
      start_state: str('what is on screen before anything is tapped'),
      user_action: str('the taps or typing, in order'),
      end_state: str('the frame that proves it worked'),
      seconds: int('seconds from first tap to result when stated, otherwise 0'),
      needs_sample_data: str('data the screen needs to look right, or empty'),
      must_not_show: list('things that must stay off camera in this moment'),
      is_aha: bool('true only when the source calls this the moment a new user gets it'),
      media_url: { t: 'string', d: 'a capture of the moment', extract: false },
    },
  },
  persona: {
    label: 'Personas',
    when: 'a kind of customer and the situation they are in when they need this',
    freshness: 'slow',
    usage: 'generation_ok',
    conflictFields: [],
    lead: 'situation',
    fields: {
      label: str('a short name for this kind of customer'),
      situation: str('what is going on in their life or work when the need appears'),
      triggers: list('events that make them start looking'),
      role: pick(['payer', 'user', 'both', 'recommender', 'unknown'], 'who they are in the purchase'),
      vocabulary: list('words and phrases they use, copied as written'),
      hangouts: list('communities, hashtags or creators they follow, only when stated'),
      believable_messenger: str('who they would trust on camera, or empty'),
      bad_fit: str('who this is not for, or empty'),
    },
  },
  pain: {
    label: 'Pains',
    when: 'a problem the customer has, ideally in their words',
    freshness: 'slow',
    usage: 'generation_ok',
    conflictFields: [],
    lead: 'statement',
    fields: {
      statement: str('the problem as the customer would say it'),
      cost: str('what it costs them: time, money or a feeling, or empty'),
      workaround: str('what they do about it today, or empty'),
      persona: str('label of the persona who has it, or empty'),
    },
  },
  outcome: {
    label: 'Outcomes',
    when: 'the result a customer wants or gets',
    freshness: 'slow',
    usage: 'generation_ok',
    conflictFields: [],
    lead: 'statement',
    fields: {
      statement: str('the result'),
      horizon: str('when it arrives, or empty'),
      on_screen: str('how the result shows up on a screen, or empty'),
      typicality: pick(['typical', 'best_case', 'unknown'], 'unknown unless the source says'),
    },
  },
  alternative: {
    label: 'Alternatives',
    when: 'what customers use or do instead, including doing nothing',
    freshness: 'slow',
    usage: 'context_only',
    conflictFields: [],
    lead: 'falls_short',
    fields: {
      name: str('the product, tool or habit'),
      type: pick(['direct', 'generic_tool', 'manual', 'do_nothing', 'aspirational'], 'what kind of alternative'),
      does_well: str('what it does well, or empty'),
      falls_short: str('where it fails the customer, or empty'),
      may_name: bool('true only when the company itself says creators may name it'),
    },
  },
  differentiator: {
    label: 'Differentiators',
    when: 'something this product can say that alternatives cannot',
    freshness: 'slow',
    usage: 'generation_ok',
    needsHuman: true,
    conflictFields: [],
    lead: 'attribute',
    fields: {
      attribute: str('what is different'),
      versus: str('compared with what, or empty'),
      value: str('what the difference lets a customer do'),
      who_cares: str('who values it most, or empty'),
      substantiation: str('what backs it up, or empty'),
    },
  },
  quote: {
    label: 'Customer quotes',
    when: 'something a customer or user said, word for word',
    freshness: 'slow',
    usage: 'context_only',
    conflictFields: [],
    lead: 'text',
    fields: {
      text: str('the customer\'s words exactly as written, never tidied'),
      source_type: pick(['app_store', 'reddit', 'support', 'call', 'survey', 'comment', 'review_site', 'other'], 'where it was said'),
      bucket: pick(['pain', 'trigger', 'objection', 'transformation', 'standout_language'], 'what the quote is evidence of'),
      persona: str('label of the persona who seems to be speaking, or empty'),
      rating: int('star rating when shown, otherwise 0'),
      may_attribute: bool('true only when the company says the person may be named'),
    },
  },
  proof: {
    label: 'Proof',
    when: 'evidence the product works: a number, rating, award, press mention or named customer',
    freshness: 'slow',
    usage: 'generation_ok',
    needsHuman: true,
    conflictFields: ['value'],
    lead: 'statement',
    fields: {
      statement: str('the proof as stated'),
      type: pick(['number', 'testimonial', 'press', 'award', 'logo', 'rating', 'certification', 'artefact'], 'what kind of proof'),
      value: str('the figure with its unit, or empty'),
      as_of: str('the date it was true, or empty'),
      typicality: pick(['typical', 'best_case', 'single_case', 'unknown'], 'unknown unless the source says'),
    },
  },
  claim: {
    label: 'Claims',
    when: 'a statement about the product a creator might say out loud, or one the company forbids',
    freshness: 'slow',
    usage: 'context_only',
    needsHuman: true,
    conflictFields: ['status'],
    lead: 'wording',
    fields: {
      wording: str('the exact words; for a banned claim, the thing that must not be said'),
      type: pick(['performance', 'comparative', 'price', 'health', 'financial', 'ai_capability', 'safety', 'feature', 'other'], 'what kind of claim'),
      status: pick(['approved', 'needs_substantiation', 'banned'], 'approved or banned only when the company says so in this source; otherwise needs_substantiation'),
      qualifier: str('words that must accompany it, or empty'),
      reason: str('why it is banned or restricted, or empty'),
      substantiation: str('what backs it up, or empty'),
      market: str('the market it is limited to, or empty'),
    },
  },
  objection: {
    label: 'Objections',
    when: 'a reason people hesitate or do not buy',
    freshness: 'slow',
    usage: 'generation_ok',
    conflictFields: [],
    lead: 'statement',
    fields: {
      statement: str('the hesitation as the customer would say it'),
      answer: str('the company\'s answer when the source gives one, or empty'),
      persona: str('label of the persona who raises it, or empty'),
    },
  },
  offer: {
    label: 'Offer',
    when: 'price, trial, free tier, promotion, creator code, or what a viewer should do next',
    freshness: 'volatile',
    usage: 'generation_ok',
    conflictFields: ['terms'],
    lead: 'terms',
    fields: {
      kind: pick(['pricing', 'trial', 'free_tier', 'promotion', 'creator_code', 'cta'], 'which part of the offer this is; one record per part'),
      terms: str('the exact terms as stated: amounts, lengths, what is included; for cta, what the viewer should do'),
      url: str('where it sends people, or empty'),
      required_wording: str('wording that must be used as written, or empty'),
      market: str('the market it applies to when the source limits it, or empty'),
      plan: str('the plan it applies to when the source limits it, or empty'),
      ends_on: str('ISO date it ends when stated, or empty'),
    },
  },
  voice_rule: {
    label: 'Voice',
    when: 'how the brand speaks or how much freedom creators have',
    freshness: 'slow',
    usage: 'context_only',
    conflictFields: [],
    lead: 'rule',
    fields: {
      scope: pick(['brand_voice', 'creator_latitude'], 'brand_voice for captions and overlays, creator_latitude for what creators may do in their own voice'),
      rule: str('the rule in one sentence'),
      do: list('things to do'),
      dont: list('things to avoid'),
      example_lines: list('real lines in this voice copied from the source; never write new ones'),
      banned_words: list('words or phrases never to use'),
    },
  },
  glossary: {
    label: 'Glossary',
    when: 'a term with a required spelling, pronunciation or meaning',
    freshness: 'durable',
    usage: 'context_only',
    conflictFields: [],
    lead: 'meaning',
    fields: {
      term: str('the term'),
      written_form: str('how it must be written'),
      pronunciation: str('how it is said, or empty'),
      meaning: str('what it means'),
      never_use: list('variants that must not be used'),
      internal_only: bool('true when customers never see the term'),
    },
  },
  compliance: {
    label: 'Rules',
    when: 'something that must or must not be shown or said for legal, platform or company reasons',
    freshness: 'durable',
    usage: 'context_only',
    conflictFields: [],
    lead: 'rule',
    fields: {
      kind: pick(['disclosure', 'must_not_show', 'regulated', 'platform', 'music', 'minors', 'approval', 'other'], 'what kind of rule'),
      rule: str('the rule in one sentence'),
      wording: str('exact wording to use, or empty'),
    },
  },
  goal: {
    label: 'Goals',
    when: 'what the company wants its content to achieve',
    freshness: 'durable',
    usage: 'context_only',
    conflictFields: [],
    lead: 'objective',
    fields: {
      objective: str('the objective'),
      metric: str('how it is measured, or empty'),
      platforms: list('platforms it applies to'),
      placement: pick(['organic', 'boosted', 'asset_only', 'unknown'], 'how the videos will be used'),
    },
  },
  creator_pref: {
    label: 'Creator fit',
    when: 'who should be on camera and how closely they must follow a script',
    freshness: 'durable',
    usage: 'context_only',
    conflictFields: [],
    lead: 'role',
    fields: {
      role: str('the kind of person the customer would trust'),
      traits: list('traits wanted'),
      face: pick(['face', 'faceless', 'either'], 'whether the creator appears'),
      exclusions: list('who or what to avoid'),
      latitude: pick(['word_for_word', 'key_points', 'loose', 'unknown'], 'how closely creators must follow the script'),
    },
  },
  angle: {
    label: 'Angles',
    when: 'a decided way into the product for one persona and pain',
    freshness: 'evidence',
    usage: 'context_only',
    conflictFields: [],
    lead: 'sentence',
    fields: {
      sentence: str('the angle in one sentence'),
      pain: str('the pain it starts from'),
      persona: str('the persona it is for'),
      family: str('the kind of angle, or empty'),
      differentiator: str('the differentiator it leans on, or empty'),
      status: pick(['candidate', 'testing', 'winner', 'fatigued', 'retired'], 'where it stands'),
    },
  },
  learning: {
    label: 'Learnings',
    when: 'something observed about what works, with the evidence for it',
    freshness: 'evidence',
    usage: 'context_only',
    conflictFields: [],
    lead: 'statement',
    fields: {
      statement: str('what was observed'),
      scope: str('where it applies, or empty'),
      evidence: str('what it rests on'),
      sample_size: int('how many posts or cases, 0 when unknown'),
      strength: pick(['weak', 'moderate', 'strong'], 'how well supported'),
    },
  },
};

export const ENTITY_TYPES = Object.keys(ENTITIES) as EntityType[];

// ---------------------------------------------------------------- extraction schema

export type JsonSchema = { [key: string]: unknown };

function fieldSchema(f: Field): JsonSchema {
  switch (f.t) {
    case 'string':
      return { type: 'string', description: f.d };
    case 'list':
      return { type: 'array', items: { type: 'string' }, description: f.d };
    case 'enum':
      return { type: 'string', enum: [...f.values], description: f.d };
    case 'int':
      return { type: 'integer', description: f.d };
    case 'bool':
      return { type: 'boolean', description: f.d };
  }
}

/** Fields the extractor is asked for (imports fill the rest). */
export function extractableFields(type: EntityType): string[] {
  return Object.entries(ENTITIES[type].fields)
    .filter(([, f]) => !('extract' in f && f.extract === false))
    .map(([name]) => name);
}

function itemSchema(type: EntityType): JsonSchema {
  const spec = ENTITIES[type];
  const names = extractableFields(type);
  return {
    type: 'object',
    additionalProperties: false,
    required: ['key', 'title', 'excerpt', 'data'],
    properties: {
      key: { type: 'string', description: 'short lowercase slug naming the subject; reuse an existing key when the record is about the same thing' },
      title: { type: 'string', description: 'a few words a person would recognise the record by' },
      excerpt: { type: 'string', description: 'the passage that supports this record, copied character for character from the source' },
      data: {
        type: 'object',
        additionalProperties: false,
        required: names,
        properties: Object.fromEntries(names.map((n) => [n, fieldSchema(spec.fields[n])])),
      },
    },
  };
}

/**
 * The structured-output schema for one extraction call: one array per entity
 * type the source is allowed to yield. Strict (every object closed, every
 * property required) as llm.ts generate() demands.
 */
export function extractionSchema(types: EntityType[]): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: [...types],
    properties: Object.fromEntries(
      types.map((t) => [t, { type: 'array', description: `Use when the source states ${ENTITIES[t].when}.`, items: itemSchema(t) }]),
    ),
  };
}

/**
 * Coerces whatever arrived (a model's output, a person's edit, a legacy row)
 * into the entity's shape: unknown keys dropped, missing ones defaulted,
 * enums checked.
 */
export function normaliseData(type: EntityType, raw: unknown): Record<string, unknown> {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const [name, f] of Object.entries(ENTITIES[type].fields)) {
    const v = input[name];
    if (f.t === 'string') out[name] = typeof v === 'string' ? v.trim() : '';
    else if (f.t === 'list') {
      out[name] = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : [];
    } else if (f.t === 'enum') out[name] = typeof v === 'string' && f.values.includes(v) ? v : f.fallback;
    else if (f.t === 'int') out[name] = typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
    else out[name] = v === true;
  }
  return out;
}

// ---------------------------------------------------------------- authority

export const SOURCE_TIER: Record<SourceKind, AuthorityTier> = {
  survey_answer: 1,
  voice_note: 1,
  manual: 1,
  // An upload is the company handing over its own material.
  upload: 1,
  codebase: 2,
  website_page: 3,
  app_store: 3,
  own_post: 4,
  reference_post: 5,
  review: 5,
};

// Third parties tell us how customers talk and what they compare us with.
// They do not get to say what the product does, costs or may claim.
const VOICE_OF_CUSTOMER: EntityType[] = ['quote', 'pain', 'objection', 'alternative', 'persona'];
// Not extracted from documents: these are decided or measured, not read.
const NOT_EXTRACTED: EntityType[] = ['angle', 'learning'];

/** Entity types a source of this tier may yield. */
export function allowedEntityTypes(tier: AuthorityTier): EntityType[] {
  if (tier <= 3) return ENTITY_TYPES.filter((t) => !NOT_EXTRACTED.includes(t));
  if (tier === 4) return [...VOICE_OF_CUSTOMER, 'voice_rule', 'glossary'];
  if (tier === 5) return [...VOICE_OF_CUSTOMER];
  // A model-written document can suggest hypotheses, never numbers, offers or claims.
  return ENTITY_TYPES.filter((t) => !NOT_EXTRACTED.includes(t) && !['claim', 'proof', 'offer'].includes(t));
}

// ---------------------------------------------------------------- freshness

const RECHECK_DAYS: Record<Freshness, number> = { volatile: 7, moving: 30, slow: 90, evidence: 75, durable: 365 };

/** Prices, trial terms and anything resting on a number go stale fast. */
export function freshnessFor(type: EntityType, data: Record<string, unknown>): Freshness {
  if (type === 'offer') return 'volatile';
  if (type === 'proof' && /\d/.test(`${data.value ?? ''} ${data.statement ?? ''}`)) return 'volatile';
  if (type === 'claim' && /\d/.test(String(data.wording ?? ''))) return 'volatile';
  return ENTITIES[type].freshness;
}

export function recheckAfter(freshness: Freshness, from: Date): string {
  return new Date(from.getTime() + RECHECK_DAYS[freshness] * 86_400_000).toISOString();
}

// ---------------------------------------------------------------- confidence and usage

export type Evidence = {
  /** A person confirmed, wrote or edited the record. */
  confirmed: boolean;
  tier: AuthorityTier;
  /** The excerpt was found in the source text. */
  verbatim: boolean;
  /** Distinct sources with a verified excerpt. */
  sourceCount: number;
};

/**
 * Confidence by rule. A model's own estimate is never used: it would only
 * measure how fluent the guess was.
 */
export function computeConfidence(e: Evidence): number {
  if (e.confirmed) return 1;
  if (!e.verbatim || e.tier === 6) return 0.4;
  if (e.tier <= 2) return 0.9;
  if (e.tier === 3) return 0.8;
  // First-party social and third parties: one voice is an anecdote, two agree.
  if (e.sourceCount >= 2) return 0.7;
  return e.tier === 4 ? 0.6 : 0.5;
}

/**
 * What a record may be used for. Unverified records only ever inform. Claims,
 * proof and differentiators need a person before a creator may state them,
 * because a marketing page saying something does not make it safe to repeat.
 */
export function decideUsage(type: EntityType, data: Record<string, unknown>, e: Evidence): FactUsage {
  if (type === 'claim') {
    return e.confirmed && data.status === 'approved' ? 'generation_ok' : 'context_only';
  }
  if (!e.verbatim || e.tier === 6) return e.confirmed ? ENTITIES[type].usage : 'context_only';
  if (ENTITIES[type].needsHuman && !e.confirmed) return 'context_only';
  // Third-party and social sources shape language; they do not assert.
  if (e.tier >= 4 && !e.confirmed) return 'context_only';
  return ENTITIES[type].usage;
}

export function statusFor(e: Evidence): FactStatus {
  return e.confirmed ? 'confirmed' : 'inferred';
}

// ---------------------------------------------------------------- founder questions

export type SurveyQuestion = {
  key: string;
  question: string;
  /** Shown under the question: what a good answer looks like. */
  hint: string;
  /** Why it is asked: what the answer changes. */
  why: string;
  /** Record types the answer usually produces; used to draw a suggestion from the scan. */
  entityTypes: EntityType[];
  optional: boolean;
  /** Easier spoken or shown than typed. */
  accepts: Array<'text' | 'voice' | 'screen_recording' | 'links'>;
};

// Copy follows the Noni UI rules: sentence case, no dashes, no emoji, no
// exclamation marks, no hype words.
export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    key: 'aha_moment',
    question: 'What is the moment a new user gets it?',
    hint: 'Tell us what is on screen, what they tap and what appears. A 30 second screen recording works too.',
    why: 'This becomes the demo creators film. Without it, videos describe the product instead of showing it.',
    entityTypes: ['demo_moment', 'feature'],
    optional: false,
    accepts: ['text', 'voice', 'screen_recording'],
  },
  {
    key: 'best_customers',
    question: 'Think of three customers who love it. What was going on the day they signed up?',
    hint: 'Describe the situation, not the demographics. What had just happened, and what were they trying to fix?',
    why: 'Scripts open on a situation the viewer recognises. We write those from real ones.',
    entityTypes: ['persona', 'pain'],
    optional: false,
    accepts: ['text', 'voice'],
  },
  {
    key: 'alternative',
    question: 'If you disappeared tomorrow, what would customers go back to, and what would they miss?',
    hint: 'A competitor, a spreadsheet, a notes app or doing nothing all count.',
    why: 'Creators compare your product with what viewers use today, so we need to know what that is.',
    entityTypes: ['alternative', 'outcome'],
    optional: false,
    accepts: ['text', 'voice'],
  },
  {
    key: 'only_we',
    question: 'What can you say that no competitor can honestly say?',
    hint: 'One or two things, and what each one lets a customer do.',
    why: 'This is what keeps your videos from sounding like every other product in the category.',
    entityTypes: ['differentiator'],
    optional: false,
    accepts: ['text', 'voice'],
  },
  {
    key: 'proof',
    question: 'Which numbers and results are true, typical and safe to say out loud?',
    hint: 'Ratings, user counts, time saved, results customers usually see. Say when each was last true.',
    why: 'A creator will only state a number you have approved here.',
    entityTypes: ['proof', 'claim'],
    optional: false,
    accepts: ['text'],
  },
  {
    key: 'hesitation',
    question: 'Why do people who should buy not buy, and what is your honest answer?',
    hint: 'The doubt you hear most, in their words, and what you tell them.',
    why: 'Videos that answer the real doubt convert better than videos that avoid it.',
    entityTypes: ['objection'],
    optional: false,
    accepts: ['text', 'voice'],
  },
  {
    key: 'never_say',
    question: 'What must a creator never claim or show?',
    hint: 'Promises you cannot keep, screens with private data, competitor names, anything legal has ruled out.',
    why: 'These rules go into every brief in full, so nothing slips through.',
    entityTypes: ['claim', 'compliance'],
    optional: false,
    accepts: ['text'],
  },
  {
    key: 'offer',
    question: 'What should a viewer do next, and what do they get?',
    hint: 'Download, sign up or book a call, plus the price, the trial and any creator code.',
    why: 'Every video ends on this. Prices and trial terms are checked again before each brief.',
    entityTypes: ['offer'],
    optional: false,
    accepts: ['text'],
  },
  {
    key: 'voice',
    question: 'Paste three videos you wish were yours and one you would hate.',
    hint: 'Links are enough. Add a line on what you like or dislike about each.',
    why: 'Examples tell us more about your taste than adjectives do.',
    entityTypes: ['voice_rule'],
    optional: false,
    accepts: ['links', 'text'],
  },
  {
    key: 'messenger',
    question: 'Who would your customer trust, and how much freedom will you give them?',
    hint: 'A kind of person, such as a nurse, a student or a founder. Then say whether they follow a script or use their own words.',
    why: 'This decides which creators we match and how tightly we script them.',
    entityTypes: ['creator_pref', 'voice_rule'],
    optional: false,
    accepts: ['text', 'voice'],
  },
  {
    key: 'payer_user',
    question: 'Who pays for it and who uses it day to day?',
    hint: 'Only needed when they are different people, as in most business software.',
    why: 'A video for the person who pays is a different video from one for the person who uses it.',
    entityTypes: ['persona'],
    optional: true,
    accepts: ['text'],
  },
];
