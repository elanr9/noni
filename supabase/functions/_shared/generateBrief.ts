// Generation core shared by ingest-brief (whole drafts) and brief-assist
// (per-field regeneration, segment derivation). Owns the system prompt, the
// JSON contract, normalization, and brief_segments derivation.
//
// The generation order is the method and the JSON key order enforces it
// (generation is autoregressive, so key order IS generation order):
// claim -> search phrase -> talking points (+plug) -> HOOK LAST -> caption.
//
// Kill rather than pad: the model may answer {"kill_reason": string} instead
// of a draft when a required field cannot be concrete. Callers return that to
// the client; the slot stays empty with the reason shown.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import type { BrainFeature, BrandContext } from './wp8.ts';
import { askClaude, legacyBrandLines, parseClaudeJson, stripDashes } from './wp8.ts';
import { validateBrief } from './validateBrief.ts';
import type {
  BriefDraftShape,
  PostTypeShape,
  TalkingPoint,
  ValidationResult,
} from './validateBrief.ts';

export type PostTypeRow = {
  id: string;
  key: string;
  label: string;
  family: 'video' | 'photo_carousel';
  min_points: number;
  max_points: number;
  clip_structure: 'hook_points_outro' | 'single_clip' | 'slide_per_point';
  requires_plug: boolean;
  requires_credential: boolean;
  target_words_min: number | null;
  target_words_max: number | null;
};

export async function loadPostType(
  admin: SupabaseClient,
  companyId: string,
  key: string,
): Promise<PostTypeRow | null> {
  const { data, error } = await admin
    .from('post_types')
    .select(
      'id, key, label, family, min_points, max_points, clip_structure, requires_plug, requires_credential, target_words_min, target_words_max',
    )
    .eq('company_id', companyId)
    .eq('key', key)
    .maybeSingle();
  if (error) throw new Error(`post_types read failed: ${error.message}`);
  return data as PostTypeRow | null;
}

const POST_TYPE_COLUMNS =
  'id, key, label, family, min_points, max_points, clip_structure, requires_plug, requires_credential, target_words_min, target_words_max';

/**
 * Lets the model pick the kind of post the source material actually wants
 * ("5 mistakes" is a list, "X vs Y" is a contrast, one blunt truth is a
 * 7 second video) instead of every idea landing in the first type. The
 * company's recent mix is a tie breaker toward variety. Never throws on a
 * bad answer: falls back to the type least used lately.
 *
 * `mirror` is for a pasted reference post: name the kind the source already
 * is and copy it, no variety rotation. A bad answer there falls back to the
 * first type by sort order.
 */
export async function pickPostType(
  admin: SupabaseClient,
  companyId: string,
  family: 'video' | 'photo_carousel',
  sourceLines: string[],
  mode: 'fit' | 'mirror' = 'fit',
): Promise<PostTypeRow | null> {
  const [{ data: typeRows, error: typeError }, { data: recentRows }] = await Promise.all([
    admin
      .from('post_types')
      .select(POST_TYPE_COLUMNS)
      .eq('company_id', companyId)
      .eq('family', family)
      .order('sort_order', { ascending: true }),
    admin
      .from('briefs')
      .select('post_type_id')
      .eq('company_id', companyId)
      .not('post_type_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(12),
  ]);
  if (typeError) throw new Error(`post_types read failed: ${typeError.message}`);
  const types = (typeRows ?? []) as PostTypeRow[];
  if (types.length === 0) return null;
  if (types.length === 1) return types[0];

  const recentIds = ((recentRows ?? []) as { post_type_id: string | null }[]).map(
    (r) => r.post_type_id,
  );
  const recentKeys = recentIds
    .map((id) => types.find((t) => t.id === id)?.key ?? null)
    .filter((k): k is string => k !== null);
  const leastUsed = [...types].sort(
    (a, b) =>
      recentKeys.filter((k) => k === a.key).length -
      recentKeys.filter((k) => k === b.key).length,
  )[0];

  const options = types
    .map(
      (t) =>
        `- ${t.key}: ${t.label}. ${t.min_points === t.max_points ? t.min_points : `${t.min_points} to ${t.max_points}`} talking point${t.max_points === 1 ? '' : 's'}${t.clip_structure === 'single_clip' ? ', one clip only' : ''}.`,
    )
    .join('\n');
  const kinds =
    'a counted set of tips, steps, reasons or mistakes is a list, even when the video is short; two sides or a before/after is a contrast; a how or why breakdown is an explainer; a personal story or opinion is a talking head; a seven second video is ONLY one blunt truth whose entire spoken content is one or two short sentences, never anything that walks through several points; a satisfying visual moment with no lesson is replay bait.';
  const transcriptLine = sourceLines.find((l) => l.startsWith('Transcript:'));
  const spokenWords = transcriptLine
    ? transcriptLine.replace(/^Transcript:\s*/, '').split(/\s+/).filter(Boolean).length
    : null;
  const evidence =
    spokenWords !== null
      ? `Spoken words in the source: ${spokenWords}. Over 40 spoken words is never a one clip kind.`
      : 'No transcript was recovered. Judge from the caption and slide text; a caption that lists or counts several things is a list. Never pick a one clip kind without a transcript that is itself one or two sentences.';
  const system =
    mode === 'mirror'
      ? [
          'You identify which kind of short form post a source post already is.',
          'Answer with a single JSON object {"key": string} and nothing else. key must be one of the option keys exactly.',
          `Mirror the source exactly, never pick for variety: ${kinds}`,
          evidence,
        ].join('\n')
      : [
          'You choose which kind of short form post a piece of source material should become.',
          'Answer with a single JSON object {"key": string} and nothing else. key must be one of the option keys exactly.',
          `Pick by fit first: ${kinds}`,
          'When two kinds fit equally, prefer the one used least in the recent mix.',
        ].join('\n');
  const user = [
    `Options:\n${options}`,
    ...(mode === 'mirror'
      ? []
      : [
          recentKeys.length
            ? `Recent mix, newest first: ${recentKeys.join(', ')}`
            : 'Recent mix: nothing yet.',
        ]),
    `Source material:\n${sourceLines.join('\n').slice(0, 3000)}`,
  ].join('\n\n');
  const unparsedFallback = mode === 'mirror' ? types[0] : leastUsed;

  try {
    const raw = await askClaude(system, user, 64);
    const parsed = parseClaudeJson<{ key?: unknown }>(raw);
    const chosen = types.find((t) => t.key === parsed.key);
    if (!chosen) return unparsedFallback;
    const tooLongForOneClip =
      chosen.clip_structure === 'single_clip' && spokenWords !== null && spokenWords > 40;
    if (tooLongForOneClip) {
      return types.find((t) => t.clip_structure !== 'single_clip') ?? chosen;
    }
    return chosen;
  } catch (e) {
    console.warn('pickPostType fell back:', e instanceof Error ? e.message : e);
    return leastUsed;
  }
}

export function toPostTypeShape(row: PostTypeRow): PostTypeShape {
  return {
    key: row.key,
    family: row.family,
    min_points: row.min_points,
    max_points: row.max_points,
    requires_plug: row.requires_plug,
    target_words_min: row.target_words_min,
    target_words_max: row.target_words_max,
  };
}

// ---------------------------------------------------------------------------
// Prompt building

const JSON_CONTRACT =
  '{"claim_id": string | null, "search_phrase": string, "point_count": number, "talking_points": [{"id": string, "text": string, "is_product": boolean, "claim_id": string | null, "feature_id": string | null, "overlay_label": string}], "cta": string | null, "script": string | null, "target_words": number, "hook_options": [{"text": string, "score": number}], "title": string, "caption": string, "hashtags": string[], "why_it_works": string}';

const KILL_RULE = `KILL ONLY AS LAST RESORT: almost never kill. If the topic is thin, still write the best concrete brief you can from product truth and audience. Do NOT kill because the topic is a competitor, a comparison, or feels awkward for a plug; pick the closest approved claim and angle the plug as what to do instead. Only answer {"kill_reason": string} if the search phrase is empty or pure gibberish with zero usable topic.`;

const CREDENTIAL_RULE = `CREDENTIAL: never write a creator credential, background claim, or playing history into the hook or any talking point. "As a former D1 player, here are five tips" is forbidden. One brief serves the whole roster; each creator's credential renders at record time from their profile, so a written one doubles up. Write the hook so it lands right after that credential line: the credential supplies the authority, the hook supplies the promise.`;

const SECOND_PERSON_RULE = `SECOND PERSON: aim for 5 to 6 uses of "you" or "your" per 100 words. Every strong post talks straight at one person.`;

const EXPERT_CREATOR_RULE = `EXPERT CREATORS: every creator on the roster has lived this topic and has their own stories. Write points as cues with one concrete anchor each, not scripts; the creator adds their own example on camera. A short bracketed nudge like "[your own example]" is optional, never required: at most one per post, only on a non plug cue point the creator talks around, never on a point that is said verbatim (script true) and never on the plug point. A bracket on the plug or on a verbatim point fails validation.`;

const CAPABILITY_RULE = (productName: string) =>
  `PRODUCT CAPABILITIES (hard allowlist): ${productName} may only be credited with capabilities written verbatim or near verbatim in the Product truth, the Approved claims or the Feature library in the message. Naming any capability not written there (a data source it pulls, a thing it tracks or analyzes, a result it produces) is a kill level failure, worse than a thin brief. When no sentence there fits the topic, take the closest capability sentence that does exist, keep its verb and its object, and angle the advice beat toward it instead of inventing a fit.`;

const HOOK_CRAFT_RULE = `HOOK CRAFT: every hook is one complete grammatical sentence a real person would say out loud, at least 5 words and never over the 9 word cap. No sentence fragments stitched with commas (these fail: 'Send this email, get coaches to tell truth', 'Coaches reveal the real fit, right here, now'). Never 'these 5 things' or any hook with the word 'things', never 'here is why'. Every hook names a specific stake or detail from this industry and this audience (the roster spot, the person who reads the email, the deadline), never the general topic.`;

const HOOK_RULES = `HOOKS (write these LAST, against the finished talking points). The hook is the first line the creator says AND the title card on screen for the first two seconds, so it must read as a headline. hook_options is 8 to 10 variants, each 9 words or fewer (count them; 10 is a hard fail), and EVERY variant must:
- name the viewer's specific high-stakes moment (the round, the deadline, the email, the tryout), never the general topic;
- carry one specificity marker: a number, an absolute ("WILL", "never", "stop", "every"), or a named thing (the platform, the round, the person who judges you);
- promise or threaten a concrete outcome for "you" (what you will be asked, why you got dropped, what you are doing wrong).
Cover at least four of these angles across the set: FEAR OF LOSS ("why people get dropped during rush"), INSIDER GUARANTEE ("questions you WILL be asked"), CONTRARIAN ("stop applying on LinkedIn and Indeed"), CURIOSITY GAP ("the one email recruiters always answer"), COUNTED VALUE ("3 emails that got me asked back every day"), and at least one that restates the search phrase so a searcher knows they landed right; that restatement still carries a marker ("how to email a recruiter" is banned, "the 4 line email recruiters answer" passes). Banned hook shapes, these fail validation: anything starting "how to", "tips for", "here is how", "let's talk about", "in this video", or anything a viewer could not screenshot as a title. Every hook reads as a grammatical headline a person would type; never bolt a keyword onto an existing line. Score each 0 to 100 for how hard it stops the viewer who typed the search phrase; do not reuse the same score. Single speaker only. No "Wait what?", no second voice, no dialogue, ever. Hooks sound like a person saying something true and specific, never a headline generator: no perfect, ultimate, elite, killer, formula, secret, hack or game changer, and no line a viewer has seen on a hundred other posts.`;

function captionRules(requiresPlug: boolean): string {
  const product = requiresPlug
    ? ', and the product is named exactly once with a nudge on where to find it ("link in bio", "search it"); the nudge never repeats the name (the caption is the second place a viewer looks for the product after hearing it). No dashes of any kind in the caption'
    : ', and the product is not mentioned';
  return `CAPTION (after the hooks): exactly two sentences and under 200 characters (about 30 words, count them). Sentence one carries the search phrase verbatim and the promise of the post; sentence two is ${requiresPlug ? 'the product sentence with its nudge' : 'the one line moral'}. Never list or summarize the talking points in the caption. No hashtags inside it${product}. HASHTAGS: 3 to 5 tags chosen from the hashtag bank in the message by topical fit, not the same set every time.`;
}

const POINT_RULES = `TALKING POINTS: beats, not lines. Write each point at 15 to 22 words; 25 is the ceiling and 30 is a hard fail (the plug point may run to 36, hard fail over 40). Count the words of every point before you answer and cut the rationale clause first when over. A creator reads a point and starts talking; they do not recite it. Every point carries ONE concrete anchor the viewer can screenshot or repeat: an exact phrase to say or type, a named example, a number, or a two-second scenario ("even in freshman orientation you never know who is in your group"). A point with no anchor is filler; cut it or replace it. Each point is what to do plus why it works in one breath; "keep it short" alone is not a point, "keep it short: role, one result with a number, one line on why this team, recruiters read on their phone" is. THE MORAL: the post ends on one sentence that is a general truth about the viewer's situation, written fresh for this exact topic ("be kind to everyone and you will be totally okay" closes a post on getting dropped during rush; "the resume you send everywhere is the one nobody reads" closes a job hunt post); it is never the same sentence across two posts; it is never a step, never an instruction, never a stat, never a recap, and it has no verb of instruction (send, end with, lock in, email). It is 12 words or fewer. When the count is fixed by the source or title ("5 mistakes"), the final item is its anchor in one short clause plus the moral sentence; otherwise the final talking point is the moral alone. When the final point must be shortened, the instruction clause goes and the moral stays. No hedge words anywhere in spoken lines: really, truly, actually, honestly, simply, just, very. If a point reads as a complete performable sentence with closing rhythm, compress it. Give every point a short unique id. Also give every point an overlay_label (see ON-SCREEN TEXT).`;

const SUBSTANCE_RULE = `SUBSTANCE (the bar every point clears): write as the most experienced insider in this niche talking to one person, never as a content marketer summarizing a topic. Every non plug point carries something a generic list would not: a real number, a named rule, date or deadline, a named tool, event, level or role, or a scenario only someone who has lived it knows. Take these facts from the Industry playbook and the Reference playbook in the message; never invent a statistic, rule or date, and when the playbooks do not have one, use a concrete scenario instead. THE GENERIC TEST: if the point could sit unchanged in a list for any sport, any job or any product ("start early", "stay consistent", "use multiple angles", "build a smart list", "stay visible", "track everything", "be professional", "quality over quantity"), it fails; replace it with the specific move behind it and the reason an insider knows. Off niche example of the fix: "tailor your resume to each job" fails; "paste three exact phrases from the job post into your resume, the screening software scores keyword matches before a person reads it" passes. Every point must be correct advice a real expert would sign; one wrong or made up detail loses the viewer's trust in the whole post.`;

const NO_DASH_RULE = `NO DASHES, ANYWHERE: never write an em dash, an en dash or a hyphen in any text field (title, hooks, points, cta, caption, script, labels, notes). Not between clauses, not between words ("follow up", never "follow-up"), not in number ranges ("3 to 5"). A dash is the tell of machine written copy and every one is removed anyway; write the comma, period or word you meant.`;

const SPOKEN_RULE = `SPOKEN LINES: every talking point is read off a teleprompter and burned into the video as subtitles, so it must be a sentence a person says out loud to a friend. Plain words, contractions welcome, short clauses. No dashes of any kind or semicolons anywhere in talking points, cta or hooks (use a period or a comma). No stacked noun phrases, no corporate or marketing words: elite, seamless, streamline, game changer, stand out, unlock, level up, leverage, journey, crucial, key, essential, perfect, ultimate, optimize, smart. Read each point aloud in your head; if it sounds like a blog summary or an ad, rewrite it.`;

const ON_SCREEN_RULE = `ON-SCREEN TEXT (overlay_label): the text card on screen during that point's clip, read with the sound off in about a second. It is the point's actual advice compressed into a complete thought of 3 to 7 words: a verb plus the specific thing, or the specific fact, numbered when the type is a list. Someone who reads only the labels must get the real advice. Off niche examples that pass: "3. Quote their job post back", "2. Apply before Thursday noon", "5. Ask for the hiring manager". Labels that fail because they name a topic instead of saying the move: "Multiple angles matter", "Smart school list", "Auto-build option", "Stay visible", "Track everything", "Game film matters". Never use the adjectives smart, strategic, perfect, key, proper, right or good in a label. The plug point's label says what the product does for the viewer, with the product name ("4. Bidly drills your rush questions").`;

const FEATURE_ID_RULE = `FEATURE ID: every talking point carries feature_id. On a product point it is the id of the one entry in the Feature library (in the message) that the point is about, copied exactly; null when the point is not about a specific feature. Non product points are always null. If the message says the Feature library is empty, feature_id is null on every point.`;

const SEARCH_PHRASE_RULE = `SEARCH PHRASE: the search string a target viewer actually types with a deadline in mind, e.g. "why am i not getting interviews after 100 applications".`;

function plugRule(requiresPlug: boolean, productName: string, hasApprovedClaims: boolean): string {
  if (!requiresPlug) {
    return `PLUG: this type takes NO plug. claim_id null, cta null, is_product false on every point. Do not mention the product.`;
  }
  const claimSource = hasApprovedClaims
    ? `pick the one approved claim from the message that fits this topic best (or the closest useful one) and put its id in the top-level claim_id and on the plug point. Compose the plug from that claim as mechanism, not benefit`
    : `no approved claims exist yet, so claim_id is null everywhere and the plug is composed from the Product truth document in the message: one real thing ${productName} does, stated as mechanism, not benefit. Never invent a capability the Product truth does not describe`;
  return `CLAIM AND PLUG (settle this first, it is the whole reason the post exists): ${claimSource}: mechanism means the concrete thing it does (drafts, sends, tracks, matches, practices with you), never a benefit word like "streamlines" or "saves time". Competitor or comparison topics still get a plug; angle it as the practical next step, never invent competitor facts or fake positioning.
The plug (cta) is ONE plain sentence of 8 to 20 words in the first person, no colon, no semicolon, nothing before or after it inside cta; it MUST contain the product name "${productName}" spoken out loud, and a plug that does not say "${productName}" is a failed brief. The creator owns it, in the shape of "I have ${productName} <verb> my <named thing> for me" or "I asked ${productName} for <named thing>" (off niche example of the shape: "I have Bidly quiz me on rush questions every night"), written fresh for this post. The cta makes sense read alone: it names the thing the product acts on, never a dangling "them", "it" or "this". The advice beat before it is what the viewer does by hand and never mentions ${productName}; the product appears in the plug sentence and the nudge only. The beat, the cta and the nudge are three separate sentences in the point text. Never the third person ad line "${productName} writes the emails for you"; that reads as a sponsor read and dies. No numbers, savings or outcomes about the product unless the Product truth or an approved claim states them. Put that exact sentence in cta AND inside exactly one talking point (set is_product true on that point).
The plug point is spoken as the creator's own tool, first person. Three shapes top performing UGC uses (these are structures to follow, never wording to copy; write the sentence fresh in the creator's voice every time):
1. RESOURCE FRAMING, right after the hook: the creator names ${productName} as the tool they lean on, with one mechanism. Best for lists of mistakes or questions.
2. I ASKED IT: the creator got the content of this post from ${productName}, then the content follows. Best for question or idea lists.
3. THE FIX for a pain point: one action the viewer takes in ${productName} and the mechanism that follows. Best for contrarian or problem posts.
The plug point is one of the counted items, numbered like the others (its overlay_label is numbered like the others and says what ${productName} does for the viewer, with the name), never an extra unnumbered beat squeezed between items. Its text opens with one advice beat of 8 to 15 words (the thing the viewer does) and ends with the plug sentence plus a short nudge on where to find it ("search ${productName}", "it is in my bio"); a plug point that is only the plug sentence fails validation. The whole point stays under 40 words and never carries a bracketed nudge. It is never an ad read on its own. Position: early, while retention is high, in the first half of the points and never the last point. Vague plugs are banned: "there are tools that help", "use a recruiting app", "check out the app" all fail. Never write "It is my biggest tip" or "I use it constantly"; those were examples, not lines.`;
}

const POINT_COUNT_RULE =
  `POINT COUNT: if the source material, title, idea or search phrase names a number of items ("5 tips", "3 things", "7 mistakes"), point_count MUST equal that number exactly, talking_points MUST have exactly that many entries, and the title MUST lead with that same number. Never add or drop a point to fit a plug; the plug rides inside one of those points. Otherwise 3 to 10, pick the count the topic actually supports, default 4.`;

function postTypeBlock(postType: PostTypeRow | null, fallbackFormat: 'video' | 'photo_carousel'): string {
  if (!postType) {
    return [
      `FORMAT: ${fallbackFormat === 'photo_carousel' ? 'photo carousel; each talking point becomes one slide, read not spoken' : 'video; hook clip, then one clip per talking point, nothing after; the plug rides inside one point clip, never a separate outro clip'}.`,
      POINT_COUNT_RULE,
      `TARGET WORDS: set target_words to your honest estimate of spoken words for the finished post. There is no length target.`,
    ].join('\n');
  }
  const lines: string[] = [];
  const structure =
    postType.clip_structure === 'hook_points_outro'
      ? 'hook clip, then one clip per talking point, nothing after; the plug rides inside one point clip, never a separate outro clip'
      : postType.clip_structure === 'single_clip'
        ? 'one single clip'
        : 'photo carousel, one slide per talking point';
  lines.push(
    `POST TYPE: ${postType.label} (${postType.family}). Structure: ${structure}. Talking points: ${postType.min_points} to ${postType.max_points}; pick the count this topic actually supports.`,
    POINT_COUNT_RULE,
  );
  if (postType.key === 'contrast') {
    lines.push(
      `CONTRAST: one speaker alternating between two sides (red flags vs green flags, first round vs final round, 10 interviews vs 0 interviews). Never two people talking.`,
    );
  }
  if (postType.key === 'seven_second') {
    lines.push(
      `SEVEN SECOND VIDEO: one clip of about 7 seconds. The creator says ONE complete, specific idea out loud in one or two short sentences (12 to 25 words total) and the same line sits on screen. No intro, no list, no outro, no plug. The hook options are candidates for that spoken line and must each stand alone as the whole video. The single talking point is that spoken line.`,
    );
  } else if (postType.clip_structure === 'single_clip') {
    lines.push(
      `REPLAY BAIT: one 6 to 9 second clip carrying on-screen text that takes slightly longer to read than the clip runs, so the viewer loops it. The hook options are candidates for that on-screen text. The single talking point says what the creator does on camera during the clip.`,
    );
  }
  // Title shape is type-native. Search phrase anchors discovery; title is
  // what the admin scans in the grid and must read as that format.
  switch (postType.key) {
    case 'numbered_list':
    case 'numbered_tips':
      lines.push(
        `TITLE SHAPE: lead with point_count, then a list frame tied to the topic; e.g. "5 rush mistakes that get you dropped", "8 things I wish I knew before my first job hunt", "7 resume lines recruiters skip". Never paste the search phrase as the title.`,
      );
      break;
    case 'talking_head':
      lines.push(
        `TITLE SHAPE: first-person or direct address story beat, e.g. "How I got my first job offer", "What recruiters reply to". Not a numbered list title.`,
      );
      break;
    case 'explainer':
      lines.push(
        `TITLE SHAPE: why/how explainer, e.g. "Why recruiters skip your email", "How rush bids get decided". Clear and specific.`,
      );
      break;
    case 'contrast':
      lines.push(
        `TITLE SHAPE: two sides with "vs" or clear opposition, e.g. "First round vs final round", "10 interviews vs 0 interviews".`,
      );
      break;
    case 'replay_bait':
      lines.push(
        `TITLE SHAPE: short loop provocation matching the on-screen text vibe, under 8 words.`,
      );
      break;
    case 'seven_second':
      lines.push(
        `TITLE SHAPE: the one idea as a blunt statement, under 8 words, e.g. "Recruiters decide in 8 seconds", "Your resume buries the lead".`,
      );
      break;
    case 'how_to':
      lines.push(
        `TITLE SHAPE: how-to frame, e.g. "How to email a recruiter", "How to prep for rush week".`,
      );
      break;
    case 'getting_started':
      lines.push(
        `TITLE SHAPE: beginner start frame, e.g. "Start job hunting with zero connections", "First steps to get on a recruiter's radar".`,
      );
      break;
    default:
      break;
  }
  if (postType.family === 'photo_carousel') {
    lines.push(
      `SLIDES: talking points are read on screen, not spoken. The first slide's text is the hook. script holds the slide-by-slide overlay copy, one short paragraph per talking point, in order.`,
    );
  } else {
    lines.push(`SCRIPT: null for video; the talking points are the brief.`);
  }
  lines.push(
    postType.target_words_min !== null && postType.target_words_max !== null
      ? `TARGET WORDS: target_words between ${postType.target_words_min} and ${postType.target_words_max}; the talking points must hold enough substance to fill it.`
      : `TARGET WORDS: no length target for this type; set target_words to your honest estimate of spoken words.`,
  );
  return lines.join('\n');
}

/**
 * The anatomy shared by the highest converting expert-creator UGC we have
 * measured (12% engagement on a 900 follower account). Every brief is built
 * against it.
 */
function winningPattern(requiresPlug: boolean): string {
  const plugStep = requiresPlug
    ? `3. Product as the creator's own tool, named out loud, with one mechanism and one nudge, inside the first half of the post.`
    : `3. No product step for this post; the beats carry it alone.`;
  const plugFailure = requiresPlug
    ? ' the product is mentioned without its name or without saying where to find it,'
    : '';
  return `THE PATTERN THAT CONVERTS (built from the top performing expert UGC for products like this one):
1. Title card hook: a specific promise or fear, on screen and spoken, in the first two seconds.
2. Credential: rendered per creator, not written by you.
${plugStep}
4. Numbered concrete beats: each is a named example plus why it matters plus what to do, said like advice to a friend, with room for the creator's own story.
5. One-line moral to close, no recap, no "follow for more".
The posts that underperform break this pattern in known ways: the hook is spoken with no on-screen text,${plugFailure} the beats are generic advice with no example, or the whole video reads as an ad with no proof. Avoid every one of those.`;
}

/** Options that shape the system prompt; the brand supplies the product name. */
export type BriefSystemOptions = {
  bannedPhrases: string[];
  productName: string;
  /** False when no approved claims exist; the plug is then skipped regardless of type. */
  hasApprovedClaims: boolean;
};

function briefSystemBlocks(
  postType: PostTypeRow | null,
  fallbackFormat: 'video' | 'photo_carousel',
  options: BriefSystemOptions,
  preamble: string,
  portRule: string | null,
  contract: string = JSON_CONTRACT,
): string {
  const requiresPlug = postType ? postType.requires_plug : true;
  return [
    preamble,
    KILL_RULE,
    `Otherwise answer with a single JSON object, no markdown fences, no preamble. Inside string values use single quotes for any quoted phrase ('2026 center mid, 4.1 GPA'); an unescaped double quote breaks the JSON. Generate the keys IN THIS EXACT ORDER; the order is the method: the claim and search phrase anchor the body, the hooks are written last against the finished body, the caption after the hooks:\n${contract}`,
    `EXAMPLES IN THESE RULES are from other niches (sorority rush, job hunting) and exist to show shape only. Never reuse an example line, hook, plug or moral from these rules in the brief, and never write anything about sororities or job boards unless the brand is in that niche.`,
    winningPattern(requiresPlug),
    postTypeBlock(postType, fallbackFormat),
    portRule,
    `Rules, measured against real high performing posts. Follow the numbers exactly.`,
    NO_DASH_RULE,
    plugRule(requiresPlug, options.productName, options.hasApprovedClaims),
    requiresPlug ? CAPABILITY_RULE(options.productName) : null,
    SEARCH_PHRASE_RULE,
    SUBSTANCE_RULE,
    POINT_RULES,
    SPOKEN_RULE,
    ON_SCREEN_RULE,
    EXPERT_CREATOR_RULE,
    FEATURE_ID_RULE,
    CREDENTIAL_RULE,
    SECOND_PERSON_RULE,
    HOOK_RULES,
    HOOK_CRAFT_RULE,
    `TITLE: the admin-facing name of THIS post format; never copy search_phrase into title. For numbered_list and numbered_tips the title MUST start with the chosen point_count digit and a list phrase (tips / things / mistakes / signs); when the source names a number, that digit is the source's number and talking_points has exactly that many entries. Other types follow TITLE SHAPE above. Keep it under 12 words.`,
    captionRules(requiresPlug),
    `WHY IT WORKS: one punchy sentence a content strategist would say about why this concept performs.`,
    options.bannedPhrases.length
      ? `BANNED PHRASES: the admin has banned these exact phrases; never use them: ${options.bannedPhrases.join(' | ')}`
      : null,
  ]
    .filter((l): l is string => l !== null)
    .join('\n\n');
}

export function buildBriefSystem(
  postType: PostTypeRow | null,
  fallbackFormat: 'video' | 'photo_carousel',
  options: BriefSystemOptions,
): string {
  return briefSystemBlocks(
    postType,
    fallbackFormat,
    options,
    `You write structured UGC content briefs for creators posting on TikTok and Instagram from their own accounts.`,
    null,
  );
}

const REVISE_CONTRACT =
  '{"revision_note": string, "claim_id": string | null, "search_phrase": string, "point_count": number, "talking_points": [{"id": string, "text": string, "is_product": boolean, "claim_id": string | null, "feature_id": string | null, "overlay_label": string}], "cta": string | null, "script": string | null, "target_words": number, "hook_options": [{"text": string, "score": number}], "title": string, "caption": string, "hashtags": string[], "why_it_works": string}';

const REVISE_PREAMBLE = `You revise a structured UGC content brief after the campaign manager reviewed it and gave feedback in plain language. The current brief, the conversation so far and the newest feedback are in the message. The feedback is law: rewrite every part it touches and fix the root cause across the whole brief (if the manager says the product was never mentioned, the plug, the caption and the plug point's on-screen label all change). Parts the manager did not complain about stay as close to the current brief as the feedback allows, so the manager recognizes their post; a talking point marked "edited by the manager" is kept word for word unless the feedback names it. Never argue with the feedback and never ask a question back; make the change. THE MANAGER OUTRANKS EVERY RULE BELOW: when the message carries a LOCKED block, a REQUIRED POINT COUNT or STANDING INSTRUCTIONS, obey them exactly even where a rule below says otherwise (a locked hook is returned unchanged even if it breaks a hook rule; a required count wins over the post type range). Product mechanisms come only from the approved claims or the Product truth in the message, never invented. When feedback targets the hook and the hook is not locked, EVERY hook option is rewritten to that angle as a fresh grammatical headline; carrying over old hooks or bolting the feedback's keywords onto existing lines is a failed revision. Start the JSON with revision_note: two or three plain sentences to the manager about the post itself, naming exactly what changed and why it is stronger; never mention validation, rules, claims tables, hashtag banks or anything about how you work, no bullet points, no markdown.`;

/** Full-brief rewrite driven by manager feedback (chat revise). */
export function buildReviseSystem(
  postType: PostTypeRow | null,
  fallbackFormat: 'video' | 'photo_carousel',
  options: BriefSystemOptions,
): string {
  return briefSystemBlocks(
    postType,
    fallbackFormat,
    options,
    REVISE_PREAMBLE,
    null,
    REVISE_CONTRACT,
  );
}

const PORT_PREAMBLE = `You port a finished UGC post into a different format for the same brand. The source post is in the message. Keep its idea, angle and substance; rewrite every line so it is native to the target format. This is a port, not a new topic: the ported post covers the same ground as the source and answers the same viewer question.`;

function portRule(
  targetPostType: PostTypeRow | null,
  fallbackFormat: 'video' | 'photo_carousel',
): string {
  const family = targetPostType ? targetPostType.family : fallbackFormat;
  if (family === 'photo_carousel') {
    return `PORTING A VIDEO TO A SLIDESHOW: the source points were spoken, these are read. Each talking point becomes one slide the reader takes in under three seconds, so compress hard and keep the concrete detail, never the filler. Strip every spoken-only phrase ("in this video", "stick around", "let me explain"). The first slide's text is the hook, rewritten to stop a scroll rather than open a monologue. Keep the source's point order and its point count unless the type's limits forbid it.`;
  }
  return `PORTING A SLIDESHOW TO A VIDEO: the source slides were read, these are spoken. Each slide becomes a talking point with the substance a creator can actually talk around for a few seconds, not the clipped slide wording. The source's first slide was its hook, so write fresh hook_options against the finished points rather than reusing that line verbatim. Keep the source's point order and its point count unless the type's limits forbid it.`;
}

export function buildPortSystem(
  targetPostType: PostTypeRow | null,
  fallbackFormat: 'video' | 'photo_carousel',
  options: BriefSystemOptions,
): string {
  return briefSystemBlocks(
    targetPostType,
    fallbackFormat,
    options,
    PORT_PREAMBLE,
    portRule(targetPostType, fallbackFormat),
  );
}

/** The finished post a port reads from, flattened for the user message. */
export type SourceBrief = {
  title: string;
  searchPhrase: string | null;
  format: 'video' | 'photo_carousel';
  postTypeLabel: string | null;
  hook: string | null;
  talkingPoints: Array<{ text: string | null; is_product: boolean }>;
  cta: string | null;
  caption: string | null;
  hashtags: string[];
  script: string | null;
  /** On-screen copy per clip or slide, in slot order. */
  overlayTexts: string[];
};

export function sourceBriefLines(source: SourceBrief): string[] {
  const kind = source.format === 'photo_carousel' ? 'slideshow' : 'video';
  const lines = [
    `Source post (a finished ${kind}${source.postTypeLabel ? `, type "${source.postTypeLabel}"` : ''}):`,
    `Title: ${source.title || '(none)'}`,
    `Search phrase: ${source.searchPhrase ?? '(none)'}`,
    `Hook: ${source.hook ?? '(none)'}`,
    `${source.format === 'photo_carousel' ? 'Slides' : 'Talking points'} (${source.talkingPoints.length}):\n${source.talkingPoints
      .map(
        (p, i) =>
          `[${i}]${p.is_product ? ' (product point)' : ''} ${p.text ?? '(empty)'}`,
      )
      .join('\n')}`,
    `Plug sentence (cta): ${source.cta ?? '(none)'}`,
    `Caption: ${source.caption || '(none)'}`,
    `Hashtags: ${source.hashtags.join(' ') || '(none)'}`,
  ];
  if (source.overlayTexts.length) {
    lines.push(`On-screen text, in order: ${source.overlayTexts.join(' | ')}`);
  }
  if (source.script?.trim()) {
    lines.push(`Slide copy:\n${source.script.trim()}`);
  }
  return lines;
}

export type RegenField =
  | 'search_phrase'
  | 'talking_points'
  | 'talking_point'
  | 'hook'
  | 'caption'
  | 'title';

/**
 * Per-field regeneration prompts. Each returns JSON holding only the
 * regenerated field(s); the current draft rides in the user message as
 * context so the result stays consistent with what the admin kept.
 */
export function buildFieldSystem(
  field: RegenField,
  postType: PostTypeRow | null,
  fallbackFormat: 'video' | 'photo_carousel',
  options: BriefSystemOptions,
): string {
  const requiresPlug = postType ? postType.requires_plug : true;
  const preamble = `You revise one part of a structured UGC content brief for creators posting on TikTok and Instagram. The current brief is in the message; regenerate ONLY what is asked and keep it consistent with the parts the admin is keeping. Answer with a single JSON object, no markdown fences, no preamble.`;
  const banned = options.bannedPhrases.length
    ? `BANNED PHRASES: the admin has banned these exact phrases; never use them: ${options.bannedPhrases.join(' | ')}`
    : null;
  const blocks: (string | null)[] = [preamble, NO_DASH_RULE];
  switch (field) {
    case 'search_phrase':
      blocks.push(
        SEARCH_PHRASE_RULE,
        `Write the search phrase the finished talking points actually answer, different from the current one. JSON: {"search_phrase": string}`,
      );
      break;
    case 'talking_points':
      blocks.push(
        KILL_RULE,
        `Otherwise answer with the keys IN THIS EXACT ORDER: {"claim_id": string | null, "point_count": number, "talking_points": [{"id": string, "text": string, "is_product": boolean, "claim_id": string | null, "feature_id": string | null, "overlay_label": string}], "cta": string | null, "script": string | null, "target_words": number}`,
        winningPattern(requiresPlug),
        postTypeBlock(postType, fallbackFormat),
        plugRule(requiresPlug, options.productName, options.hasApprovedClaims),
        requiresPlug ? CAPABILITY_RULE(options.productName) : null,
        SUBSTANCE_RULE,
        POINT_RULES,
        SPOKEN_RULE,
        ON_SCREEN_RULE,
        EXPERT_CREATOR_RULE,
        FEATURE_ID_RULE,
        CREDENTIAL_RULE,
        SECOND_PERSON_RULE,
        banned,
      );
      break;
    case 'talking_point':
      blocks.push(
        KILL_RULE,
        `Otherwise answer: {"talking_point": {"id": string, "text": string, "is_product": boolean, "claim_id": string | null, "feature_id": string | null, "overlay_label": string}, "cta": string | null}`,
        `Regenerate ONLY the talking point at the index named in the message. Keep its id. Do not duplicate or contradict the other points; they stay exactly as given. If it is the is_product point, it stays the plug point: keep its claim_id and compose the plug sentence from that approved claim, naming "${options.productName}" out loud; put that exact plug sentence in cta and inside the point text (advice beat first, then the plug sentence, then the nudge). cta is null when the point is not the plug point.`,
        plugRule(requiresPlug, options.productName, options.hasApprovedClaims),
        requiresPlug ? CAPABILITY_RULE(options.productName) : null,
        SUBSTANCE_RULE,
        POINT_RULES,
        SPOKEN_RULE,
        ON_SCREEN_RULE,
        EXPERT_CREATOR_RULE,
        FEATURE_ID_RULE,
        CREDENTIAL_RULE,
        SECOND_PERSON_RULE,
        banned,
      );
      break;
    case 'hook':
      blocks.push(
        `JSON: {"hook_options": [{"text": string, "score": number}]}`,
        HOOK_RULES,
        HOOK_CRAFT_RULE,
        CREDENTIAL_RULE,
        banned,
      );
      break;
    case 'caption':
      blocks.push(
        `JSON: {"caption": string, "hashtags": string[]}`,
        captionRules(requiresPlug),
        banned,
      );
      break;
    case 'title':
      blocks.push(
        `JSON: {"title": string}`,
        postTypeBlock(postType, fallbackFormat),
        `TITLE: the admin-facing name of this post; never copy the search phrase into it. Follow TITLE SHAPE above when one is given; a numbered list title starts with the number of talking points in the message. Under 12 words.`,
        banned,
      );
      break;
  }
  return blocks.filter((b): b is string => b !== null).join('\n\n');
}

/**
 * The corrective message for attempt two. Retries were trimming a word or
 * merging points instead of compressing, so the fix method is spelled out.
 */
export function retryMessage(priorFailures: string[], what: 'draft' | 'revision' | 'answer'): string {
  return [
    `Your previous ${what} failed validation. Fix every one of these and return the corrected JSON:`,
    ...priorFailures.map((f) => `- ${f}`),
    `How to fix: a point flagged for length is rewritten to 20 words or fewer by deleting its rationale clause, never by merging it with another point, never by changing point_count, and a bracketed nudge on a cue point stays; when it is the final point, its moral sentence stays and its instruction clause goes. A caption flagged for length becomes two sentences, the search phrase sentence and the product sentence, with the talking points left out. A hook flagged for length or for a banned shape is replaced with a new hook from a different angle, never a shorter version of the same line. A plug point flagged for advice gets an 8 to 15 word advice beat written in front of the unchanged cta sentence; cta itself never grows. A line flagged for a banned word is written again from scratch without that word or any synonym for it; when it is the cta, compose a new plug sentence from the approved claims or Product truth and put the same new sentence in the plug point. A final point flagged for its ending keeps its anchor clause and ends on a fresh one sentence moral with no instruction verb. A plug flagged for crediting the product with a capability not written in the Product truth is rewritten from one capability sentence quoted near verbatim from the Product truth or an approved claim, keeping that sentence's verb and object; never paraphrase a new capability into it, and put the same new sentence in cta and in the plug point. A verbatim point (script true) flagged for a bracket loses the bracket entirely. A hook flagged for stitched fragments or for the word "things" is replaced with one complete spoken sentence naming a specific stake. A line flagged for a hedge word is rewritten without it. Everything not flagged stays exactly as it was.`,
  ].join('\n');
}

export function brandSystemOptions(brand: BrandContext): BriefSystemOptions {
  return {
    bannedPhrases: brand.bannedPhrases,
    productName: brand.productName,
    hasApprovedClaims: brand.approvedClaims.length > 0,
  };
}

/** Validation context every generation path shares. */
export function brandValidationCtx(brand: BrandContext): {
  hashtagBank: string[];
  approvedClaimIds: string[];
  productNames: string[];
  bannedPhrases: string[];
  productCapabilityText: string;
} {
  const names = [brand.productName, brand.companyName].filter(
    (n, i, all) => n.trim().length > 0 && all.indexOf(n) === i,
  );
  const capabilityText = [
    brand.docs.productTruth,
    ...brand.approvedClaims.map((c) => `${c.claim} ${c.what_it_does}`),
    ...brand.features.map((f) => `${f.name} ${f.sentence ?? ''}`),
  ]
    .join(' ')
    .trim();
  return {
    hashtagBank: brand.hashtagBank,
    approvedClaimIds: brand.approvedClaims.map((c) => c.id),
    productNames: names,
    bannedPhrases: brand.bannedPhrases,
    productCapabilityText: capabilityText,
  };
}

// Caps keep the cached per company prefix bounded as the docs grow.
const INDUSTRY_DOC_CAP = 12000;
const REFERENCE_DOC_CAP = 7000;

export function brandDocBlocks(brand: BrandContext): string[] {
  const docBlocks: string[] = [
    `Brand: ${brand.companyName}`,
    `Product name, said out loud in the plug and written in the caption: ${brand.productName}`,
  ];
  const hasCoreDocs =
    Boolean(brand.docs.productTruth.trim()) ||
    Boolean(brand.docs.voice.trim()) ||
    Boolean(brand.docs.learnings.trim());
  if (brand.docs.productTruth.trim()) {
    docBlocks.push(`Product truth:\n${brand.docs.productTruth.trim()}`);
  }
  if (brand.docs.audienceNiche.trim()) {
    docBlocks.push(`Audience (who is watching and buying):\n${brand.docs.audienceNiche.trim()}`);
  }
  if (brand.docs.voice.trim()) {
    docBlocks.push(`Voice:\n${brand.docs.voice.trim()}`);
  }
  if (brand.docs.learnings.trim()) {
    docBlocks.push(
      `What has worked so far (content insight only; it is not a feature list):\n${brand.docs.learnings.trim()}`,
    );
  }
  if (!hasCoreDocs) docBlocks.push(legacyBrandLines(brand));
  if (brand.docs.industryResearch.trim()) {
    docBlocks.push(
      `Industry playbook (researched; the source for every fact, number, date, rule and insider detail in the post; never contradict it):\n${brand.docs.industryResearch.trim().slice(0, INDUSTRY_DOC_CAP)}`,
    );
  }
  if (brand.docs.referencePlaybook.trim()) {
    docBlocks.push(
      `Reference playbook (distilled from posts that already won in this niche; match their craft, specificity and on-screen text style, never copy their words):\n${brand.docs.referencePlaybook.trim().slice(0, REFERENCE_DOC_CAP)}`,
    );
  }

  docBlocks.push(
    brand.approvedClaims.length
      ? `Approved claims (the ONLY source for the plug; reference by id):\n${brand.approvedClaims
          .map((c) => `- id ${c.id}: ${c.claim} (${c.what_it_does})`)
          .join('\n')}`
      : `Approved claims: none exist yet. Compose the plug from the Product truth above (claim_id null); it still names ${brand.productName} out loud.`,
  );
  if (brand.features.length) {
    docBlocks.push(
      `Feature library (pick feature_id per product talking point; null when the point is not about a specific feature):\n${brand.features
        .map(
          (f) =>
            `- feature_id ${f.id}: ${f.name}${f.sentence ? `: ${f.sentence}` : ''} (${f.screenshots.length} screenshot${f.screenshots.length === 1 ? '' : 's'})`,
        )
        .join('\n')}`,
    );
  } else {
    docBlocks.push('Feature library: empty. Set feature_id null on every talking point.');
  }
  docBlocks.push(
    brand.hashtagBank.length
      ? `Hashtag bank (pick 3 to 5): ${brand.hashtagBank.join(' ')}`
      : 'Hashtag bank: empty. Pick 3 to 5 topical tags yourself, the niche community tags a real creator in this space uses.',
  );
  const learned = learningBlocks(brand.learnings);
  if (learned) docBlocks.push(learned);
  return docBlocks;
}

/**
 * Rules the manager stated out loud in revise chat (saved at confidence 1).
 * They ride next to the ask in every generation, not only in the cached
 * brand prefix, so a fresh rewrite cannot miss them.
 */
export function managerRuleLines(brand: BrandContext): string[] {
  const rules = brand.learnings.filter((l) => l.company_id !== null && l.confidence >= 1);
  if (!rules.length) return [];
  return [
    `RULES THE MANAGER STATED (absolute; breaking one fails the post):\n${rules.map((r) => `- ${r.insight}`).join('\n')}`,
  ];
}

/**
 * Rules distilled from how this team (and every team) edited AI posts before
 * publishing. Company rules first; each carries at most one before/after pair
 * so the model sees the correction, not just the rule.
 */
const COPY_LEARNING_CATEGORIES = new Set([
  'hook', 'talking_points', 'script', 'caption', 'hashtags', 'cta', 'structure', 'voice', 'other',
]);

/** Layout learnings (overlay_text, layout, screenshots) and weak rows are noise in a copy prompt. */
function isCopyLearning(l: BrandContext['learnings'][number]): boolean {
  return COPY_LEARNING_CATEGORIES.has(l.category) && (l.confidence >= 0.4 || l.evidence_count >= 3);
}

export function learningBlocks(allLearnings: BrandContext['learnings']): string | null {
  const learnings = allLearnings.filter(isCopyLearning);
  if (!learnings.length) return null;
  const line = (l: BrandContext['learnings'][number]) => {
    const example = l.examples[0];
    const pair = example
      ? `\n    AI wrote: ${example.before}\n    Manager published: ${example.after}`
      : '';
    return `- [${l.category}] ${l.insight} (seen ${l.evidence_count}x)${pair}`;
  };
  const own = learnings.filter((l) => l.company_id !== null);
  const global = learnings.filter((l) => l.company_id === null);
  const parts: string[] = [
    'LEARNED FROM MANAGER EDITS. These are corrections managers made to previous AI posts before publishing. Apply them so the next post needs fewer edits. Team rules outrank general rules.',
  ];
  if (own.length) parts.push(`This team:\n${own.map(line).join('\n')}`);
  if (global.length) parts.push(`Across all teams:\n${global.map(line).join('\n')}`);
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Normalization

type RawPoint = {
  id?: string;
  text: string | null;
  is_product: boolean;
  claim_id?: string | null;
  feature_id?: string | null;
  overlay_label?: string | null;
};

type RawHook = { text?: string; score?: number } | string;

export type RawGenerated = {
  kill_reason?: string;
  /** Chat revise only: what changed, addressed to the manager. */
  revision_note?: string;
  claim_id?: string | null;
  search_phrase?: string;
  point_count?: number;
  talking_points?: RawPoint[];
  cta?: string | null;
  script?: string | null;
  target_words?: number;
  hook_options?: RawHook[];
  title?: string;
  caption?: string;
  hashtags?: string[];
  why_it_works?: string;
};

export type DraftWithCta = BriefDraftShape;

export type GeneratedDraft = {
  draft: DraftWithCta;
  // Model-authored on-screen labels, index-aligned with talking_points.
  // They live only in brief_segments, never in talking_points jsonb.
  overlayLabels: (string | null)[];
  // Feature library ids per point, index-aligned; null when not about a
  // feature or when the model named an id outside the loaded library.
  featureIds: (string | null)[];
};

export type PointMedia = {
  feature_id: string | null;
  screenshot_url: string | null;
  shape: 'phone' | 'laptop' | null;
  /** Labeled media_library pick; wins over the feature screenshot when set. */
  library_path?: string;
  library_kind?: 'screenshot' | 'recording';
};

type LibraryRow = {
  id: string;
  kind: 'screenshot' | 'recording';
  path: string;
  title: string;
  description: string | null;
};

const MEDIA_MATCH_SYSTEM = `You attach on-screen media to the talking points of a short social video or slideshow. You get the company's media library (each item has a title the manager wrote and sometimes a description of what it shows; videos may get screen recordings and screenshots, slideshows are offered screenshots only) and the talking points in order. Every library item is a screenshot or screen recording of the company's own product. Pick, for each talking point, the one library item that best shows what that point talks about. Rules: a point with is_product true is the product plug and MUST get an item, pick the one that best matches its wording (emails, follow-ups, school list, film, inbox, campaigns); other points get an item only on a clear match; use each item at most once; never invent indexes. Answer ONLY with JSON: {"picks": [{"point_index": number, "media_index": number}]}.`;

/** The item to show on the plug when the matcher picked none: newest recording for video, newest screenshot otherwise. */
function fallbackPlugMedia(
  library: LibraryRow[],
  used: ReadonlySet<number>,
  family: 'video' | 'photo_carousel',
): LibraryRow | null {
  const free = library.filter((_, i) => !used.has(i));
  if (family === 'video') {
    const recording = free.find((m) => m.kind === 'recording');
    if (recording) return recording;
  }
  return free.find((m) => m.kind === 'screenshot') ?? free[0] ?? null;
}

/**
 * Asks Claude to match labeled library media to talking points and layers
 * the picks over the feature screenshots. Untitled media is never offered.
 * The product plug always ends up with media when the library has any: a
 * failed or empty match falls back to the newest fitting item.
 */
export async function resolvePointMedia(
  admin: SupabaseClient,
  companyId: string,
  features: BrainFeature[],
  featureIds: (string | null)[],
  points: TalkingPoint[],
  family: 'video' | 'photo_carousel',
): Promise<(PointMedia | null)[]> {
  const base = buildPointMedia(features, featureIds);
  const { data } = await admin
    .from('media_library')
    .select('id, kind, path, title, description')
    .eq('company_id', companyId)
    .not('title', 'is', null)
    .order('created_at', { ascending: false });
  // Slideshows are stills only: recordings are never offered to the matcher.
  const library = ((data ?? []) as LibraryRow[]).filter(
    (r) => r.title.trim().length > 0 && (family === 'video' || r.kind === 'screenshot'),
  );
  if (library.length === 0 || points.length === 0) return base;

  const user = [
    `Media library${family === 'photo_carousel' ? ' (slideshow: screenshots only)' : ''}:\n${library.map((m, i) => `- media_index ${i} (${m.kind}): ${m.title.trim()}${m.description?.trim() ? `: ${m.description.trim()}` : ''}`).join('\n')}`,
    `Talking points:\n${points.map((p, i) => `- point_index ${i}${p.is_product ? ' [is_product]' : ''}: ${p.text}`).join('\n')}`,
  ].join('\n\n');

  let picks: { point_index: number; media_index: number }[] = [];
  try {
    const raw = await askClaude(MEDIA_MATCH_SYSTEM, user, 512);
    const parsed = parseClaudeJson<{ picks?: unknown }>(raw);
    if (Array.isArray(parsed.picks)) {
      picks = parsed.picks.filter(
        (p): p is { point_index: number; media_index: number } =>
          typeof p === 'object' && p !== null &&
          Number.isInteger((p as { point_index?: unknown }).point_index) &&
          Number.isInteger((p as { media_index?: unknown }).media_index),
      );
    }
  } catch (error) {
    console.warn(`media match failed, falling back: ${error instanceof Error ? error.message : String(error)}`);
  }

  const attach = (pointIndex: number, item: LibraryRow) => {
    const prior = base[pointIndex];
    base[pointIndex] = {
      feature_id: prior?.feature_id ?? null,
      screenshot_url: prior?.screenshot_url ?? null,
      shape: prior?.shape ?? null,
      library_path: item.path,
      library_kind: item.kind,
    };
  };

  const used = new Set<number>();
  for (const pick of picks) {
    const item = library[pick.media_index];
    if (!item || used.has(pick.media_index)) continue;
    if (pick.point_index < 0 || pick.point_index >= points.length) continue;
    used.add(pick.media_index);
    attach(pick.point_index, item);
  }

  // The plug is the one point that must show the product. Never leave it bare.
  points.forEach((point, i) => {
    if (!point.is_product) return;
    const current = base[i];
    if (current?.library_path || current?.screenshot_url) return;
    const item = fallbackPlugMedia(library, used, family);
    if (!item) return;
    used.add(library.indexOf(item));
    attach(i, item);
  });
  return base;
}

export function sanitizeFeatureId(
  value: unknown,
  knownFeatureIds: ReadonlySet<string>,
): string | null {
  return typeof value === 'string' && knownFeatureIds.has(value) ? value : null;
}

/**
 * One entry per point. Phone screenshots come first; points sharing a
 * feature walk through its screenshots in order and cycle.
 */
export function buildPointMedia(
  features: BrainFeature[],
  featureIds: (string | null)[],
): (PointMedia | null)[] {
  const byId = new Map(features.map((f) => [f.id, f]));
  const usedPerFeature = new Map<string, number>();
  return featureIds.map((id) => {
    if (!id) return null;
    const feature = byId.get(id);
    if (!feature) return { feature_id: id, screenshot_url: null, shape: null };
    const ordered = [
      ...feature.screenshots.filter((s) => s.shape === 'phone'),
      ...feature.screenshots.filter((s) => s.shape !== 'phone'),
    ];
    if (ordered.length === 0) return { feature_id: id, screenshot_url: null, shape: null };
    const used = usedPerFeature.get(id) ?? 0;
    usedPerFeature.set(id, used + 1);
    const shot = ordered[used % ordered.length];
    return { feature_id: id, screenshot_url: shot.url, shape: shot.shape };
  });
}

export type GenOutcome = { kill_reason: string } | GeneratedDraft;

export function isKill(outcome: GenOutcome): outcome is { kill_reason: string } {
  return 'kill_reason' in outcome;
}

/** Best-first: sort scored hooks descending and keep the strings. */
export function sortHooks(raw: RawHook[] | undefined): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((h) =>
      typeof h === 'string'
        ? { text: h, score: 0 }
        : { text: String(h.text ?? ''), score: typeof h.score === 'number' ? h.score : 0 },
    )
    .filter((h) => h.text.trim().length > 0)
    .sort((a, b) => b.score - a.score)
    .map((h) => h.text);
}

function numberedListTitle(
  title: string,
  searchPhrase: string | null,
  pointCount: number,
): string {
  const trimmed = title.trim();
  const phrase = (searchPhrase ?? '').trim().toLowerCase();
  const startsWithCount = new RegExp(`^${pointCount}\\b`).test(trimmed);
  const isPhraseCopy =
    Boolean(phrase) && trimmed.toLowerCase() === phrase;
  if (startsWithCount && !isPhraseCopy) return trimmed;
  const topic = (searchPhrase ?? 'this topic')
    .replace(/^(is|are|does|do|how|why|what|when|should)\s+/i, '')
    .replace(/\?+$/g, '')
    .trim();
  return `${pointCount} things to know about ${topic}`;
}

export function normalizeGenerated(
  raw: RawGenerated,
  format: 'video' | 'photo_carousel',
  postTypeKey?: string | null,
  knownFeatureIds: ReadonlySet<string> = new Set(),
): GenOutcome {
  if (typeof raw.kill_reason === 'string' && raw.kill_reason.trim()) {
    return { kill_reason: stripDashes(raw.kill_reason) };
  }
  const rawPoints = raw.talking_points ?? [];
  const points: TalkingPoint[] = rawPoints.map((p, i) => ({
    id: p.id?.trim() || `p${i + 1}-${crypto.randomUUID().slice(0, 8)}`,
    text: typeof p.text === 'string' ? stripDashes(p.text) : null,
    is_product: Boolean(p.is_product),
    edited_by_admin: false,
    claim_id: p.claim_id ?? null,
  }));
  const overlayLabels = rawPoints.map((p) =>
    typeof p.overlay_label === 'string' && p.overlay_label.trim()
      ? stripDashes(p.overlay_label)
      : null,
  );
  const featureIds = rawPoints.map((p) => sanitizeFeatureId(p.feature_id, knownFeatureIds));
  const pointCount =
    typeof raw.point_count === 'number' ? raw.point_count : points.length;
  const searchPhrase = raw.search_phrase?.trim() ? stripDashes(raw.search_phrase) : null;
  let title = stripDashes(raw.title ?? '');
  if (postTypeKey === 'numbered_list' || postTypeKey === 'numbered_tips') {
    title = numberedListTitle(title, searchPhrase, pointCount);
  }
  return {
    draft: {
      title,
      search_phrase: searchPhrase,
      format,
      point_count: pointCount,
      target_words: typeof raw.target_words === 'number' ? raw.target_words : 380,
      hook_options: sortHooks(raw.hook_options).map(stripDashes),
      talking_points: points,
      cta: typeof raw.cta === 'string' && raw.cta.trim() ? stripDashes(raw.cta) : null,
      caption: stripDashes(raw.caption ?? ''),
      hashtags: Array.isArray(raw.hashtags)
        ? raw.hashtags.map((h) => String(h).replace(/[-–—]/g, ''))
        : [],
      why_it_works: stripDashes(raw.why_it_works ?? ''),
      script: format === 'photo_carousel' && raw.script ? stripDashes(raw.script) : null,
    },
    overlayLabels,
    featureIds,
  };
}

const LENGTH_CHECK = /^(talking point|plug point) is \d+ words, over the hard cap|^hook option over 9 words/;

const COMPRESS_POINT_SYSTEM = `You shorten one talking point of a UGC brief. Answer with the rewritten point text only, no quotes, no JSON, no commentary. Keep its concrete anchor (the number, named example or exact phrase), keep any [bracketed nudge] word for word, and cut the rationale clause first. If the message marks it as the plug point, the sentence given as cta stays inside it verbatim and the product name is never added anywhere else. Target the word budget in the message exactly.`;

const COMPRESS_HOOK_SYSTEM = `You shorten one hook line of a UGC brief to 9 words or fewer. Answer with the hook only. Keep its angle, its specificity marker (number, absolute or named thing) and make it read as a headline a person would type; never end on a preposition or conjunction.`;

/**
 * Per-item compression for the length failures a full retry leaves behind.
 * Returns null when nothing in the failures is about length.
 */
async function compressOverLongItems(
  outcome: GeneratedDraft,
  failures: string[],
  isLocked: (text: string) => boolean,
): Promise<GeneratedDraft | null> {
  if (!failures.some((f) => LENGTH_CHECK.test(f))) return null;
  const draft = outcome.draft;
  const points = await Promise.all(
    draft.talking_points.map(async (point) => {
      if (!point.text || isLocked(point.text)) return point;
      const budget = point.is_product ? 36 : 22;
      const cap = point.is_product ? 40 : 30;
      if (point.text.split(/\s+/).filter(Boolean).length <= cap) return point;
      const user = [
        `Talking point (${point.is_product ? 'the plug point' : 'a regular point'}), rewrite to ${budget} words or fewer:`,
        point.text,
        ...(point.is_product && draft.cta ? [`cta sentence that must stay verbatim: ${draft.cta}`] : []),
      ].join('\n');
      try {
        const text = stripDashes(await askClaude(COMPRESS_POINT_SYSTEM, user, 200));
        return text ? { ...point, text } : point;
      } catch (error) {
        console.warn('point compression failed:', error instanceof Error ? error.message : error);
        return point;
      }
    }),
  );
  const hooks = await Promise.all(
    draft.hook_options.map(async (hook) => {
      if (isLocked(hook) || hook.split(/\s+/).filter(Boolean).length <= 9) return hook;
      try {
        const text = stripDashes(await askClaude(COMPRESS_HOOK_SYSTEM, hook, 60));
        return text || hook;
      } catch {
        return hook;
      }
    }),
  );
  return { ...outcome, draft: { ...draft, talking_points: points, hook_options: hooks } };
}

/**
 * One draft, validated, with a single corrective retry and a per-item
 * compression pass for what the retry leaves over length. Every attempt is
 * logged to brief_validations against the generation_id, which joins to the
 * brief once the client saves it.
 */
export type GenerateOptions = {
  /** Texts the manager locked: never flagged, never compressed, so a retry never rewrites them. */
  lockedTexts?: string[];
  /** Failures the standard validator cannot know about (the manager's point count). */
  extraFailures?: (draft: BriefDraftShape) => string[];
  /** Failures about parts a retry is not allowed to touch. */
  ignoreFailure?: (failure: string) => boolean;
};

const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

/** A failure that quotes a locked text (or part of one) is about that text. */
function failureIsAboutLocked(failure: string, locked: string[]): boolean {
  if (!locked.length) return false;
  const quoted = [...failure.matchAll(/"([^"]+)"/g)].map((m) => normalizeText(m[1]));
  return quoted.some((q) => locked.some((l) => l.includes(q) || q.includes(l)));
}

/** Failures worth a second corrective retry; everything else gets one. */
const SECOND_RETRY_FAILURES: RegExp[] = [
  /which the manager banned/,
  /^a point said verbatim \(script true\) carries a bracketed nudge/,
  /^plug point is \d+ words, over the hard cap/,
  /^hedge words in the spoken lines/,
  /^hook is a generic shape/,
  /^hook is short fragments stitched/,
  /^hook says "things"/,
  /^the plug credits .+ which is not written in the Product truth/,
];

const MAX_DRAFT_ATTEMPTS = 3;

function earnsSecondRetry(failures: string[]): boolean {
  return failures.some((f) => SECOND_RETRY_FAILURES.some((re) => re.test(f)));
}

export async function generateValidated(
  admin: SupabaseClient,
  companyId: string,
  generationId: string,
  postType: PostTypeRow | null,
  draftOnce: (priorFailures: string[]) => Promise<GenOutcome>,
  validationCtx: {
    hashtagBank: string[];
    approvedClaimIds: string[];
    productNames?: string[];
    bannedPhrases?: string[];
    productCapabilityText?: string;
  },
  options: GenerateOptions = {},
): Promise<{ outcome: GenOutcome; warnings: string[] }> {
  const ctx = {
    ...validationCtx,
    postType: postType ? toPostTypeShape(postType) : null,
  };
  const locked = (options.lockedTexts ?? []).map(normalizeText);
  const isLocked = (text: string) => locked.includes(normalizeText(text));
  const validate = (draft: BriefDraftShape): ValidationResult => {
    const base = validateBrief(draft, ctx);
    const failures = [
      ...base.failures.filter(
        (f) => !failureIsAboutLocked(f, locked) && !(options.ignoreFailure?.(f) ?? false),
      ),
      ...(options.extraFailures?.(draft) ?? []),
    ];
    return { passed: failures.length === 0, failures, warnings: base.warnings };
  };
  const logAttempt = async (attempt: number, res: ValidationResult) => {
    const { error } = await admin.from('brief_validations').insert({
      company_id: companyId,
      generation_id: generationId,
      attempt,
      passed: res.passed,
      failures: res.failures,
      warnings: res.warnings,
    });
    if (error) console.error('brief_validations insert failed:', error.message);
  };

  let outcome: GenOutcome;
  try {
    outcome = await draftOnce([]);
  } catch (error) {
    // Malformed JSON from the model is a retryable failure, not a 500.
    const message = error instanceof Error ? error.message : String(error);
    if (!/json|unexpected token|position \d+/i.test(message)) throw error;
    outcome = await draftOnce([
      `your previous answer was not valid JSON (${message.slice(0, 160)}); answer with one JSON object only, no markdown fences, no commentary`,
    ]);
  }
  if (isKill(outcome)) return { outcome, warnings: [] };
  let result = validate(outcome.draft);
  let attempt = 1;
  await logAttempt(attempt, result);
  while (
    !result.passed &&
    attempt < MAX_DRAFT_ATTEMPTS &&
    (attempt === 1 || earnsSecondRetry(result.failures))
  ) {
    let retry: GenOutcome;
    try {
      retry = await draftOnce(result.failures);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/json|unexpected token|position \d+/i.test(message)) throw error;
      retry = await draftOnce([
        ...result.failures,
        `your previous answer was not valid JSON (${message.slice(0, 160)}); answer with one JSON object only and use single quotes for any quoted phrase inside a string value`,
      ]);
    }
    if (isKill(retry)) return { outcome: retry, warnings: [] };
    outcome = retry;
    result = validate(outcome.draft);
    attempt++;
    await logAttempt(attempt, result);
  }
  // Length is the one failure a whole-brief retry never fixes (it trims a
  // word or drifts the untouched fields), so over-long items are compressed
  // one at a time and spliced back in. Nothing else in the draft moves.
  if (!result.passed && !isKill(outcome)) {
    const repaired = await compressOverLongItems(outcome, result.failures, isLocked);
    if (repaired) {
      const repairedResult = validate(repaired.draft);
      await logAttempt(attempt + 1, repairedResult);
      if (repairedResult.failures.length < result.failures.length) {
        outcome = repaired;
        result = repairedResult;
      }
    }
  }
  const warnings = result.passed
    ? result.warnings
    : [...result.failures, ...result.warnings];
  return { outcome, warnings };
}

// ---------------------------------------------------------------------------
// brief_segments derivation (HANDOFF defaults)

export type SegmentDraft = {
  slot_index: number;
  kind: 'hook' | 'point' | 'outro' | 'slide';
  talking_point_index: number | null;
  overlay_text: string | null;
  show_on_screen: boolean;
};

function fallbackLabel(index: number, text: string | null): string | null {
  if (!text) return null;
  const words = text.split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
  return `${index + 1}. ${words}`;
}

/**
 * One row per clip or slide.
 * hook_points_outro: [hook][point 0..n-1]; hook overlay = the hook line,
 * point overlay = short label. No separate outro clip: the product CTA rides
 * inside one of the point clips (is_product).
 * single_clip: one hook-kind segment carrying the hook line.
 * slide_per_point: a title slide carrying the hook (talking_point_index
 * null), then one slide per point, overlay = the point text (read, not
 * spoken); no outro.
 */
export function deriveSegments(params: {
  clipStructure: PostTypeRow['clip_structure'];
  hook: string | null;
  talkingPoints: Array<{ text: string | null }>;
  overlayLabels?: (string | null)[];
}): SegmentDraft[] {
  const { clipStructure, hook, talkingPoints, overlayLabels } = params;
  if (clipStructure === 'single_clip') {
    return [
      {
        slot_index: 0,
        kind: 'hook',
        talking_point_index: null,
        overlay_text: hook,
        show_on_screen: true,
      },
    ];
  }
  if (clipStructure === 'slide_per_point') {
    // The title slide: the hook over the cover photo, then one slide per point.
    const cover: SegmentDraft[] = hook?.trim()
      ? [
          {
            slot_index: 0,
            kind: 'slide',
            talking_point_index: null,
            overlay_text: hook.trim(),
            show_on_screen: true,
          },
        ]
      : [];
    return [
      ...cover,
      ...talkingPoints.map((p, i) => ({
        slot_index: i + cover.length,
        kind: 'slide' as const,
        talking_point_index: i,
        overlay_text: p.text,
        show_on_screen: true,
      })),
    ];
  }
  const segments: SegmentDraft[] = [
    {
      slot_index: 0,
      kind: 'hook',
      talking_point_index: null,
      overlay_text: hook,
      show_on_screen: true,
    },
  ];
  talkingPoints.forEach((p, i) => {
    segments.push({
      slot_index: i + 1,
      kind: 'point',
      talking_point_index: i,
      overlay_text: overlayLabels?.[i] ?? fallbackLabel(i, p.text),
      show_on_screen: true,
    });
  });
  return segments;
}
