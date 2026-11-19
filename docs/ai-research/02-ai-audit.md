# Noni AI layer audit (2026-11-18, branch briefs-redesign)

Read-only audit of `supabase/functions/*` AI functions, `_shared/*`, client callers, migrations and evals. Paths are relative to `/Users/elanromo/noni` unless absolute. `fn/` = `supabase/functions/`.

## 0. Verdict in one page

- There is no "company brain" in the retrieval sense. It is six markdown blobs in `brand_docs` plus a few list tables, concatenated whole into every prompt with character caps. No embeddings, no pgvector, no chunking, no retrieval function (section 4).
- Reference posts are reduced to flat text. A TikTok/IG URL becomes caption + an untimed transcript string (or OCR'd slide text). No frames, no shot list, no on-screen-text timing, no pacing, no audio, no view/like counts. A Haiku 4.5 call turns that text into a "pattern card" whose `structure` and `on_screen_text` fields are inferred from speech alone. "Keep the pacing of this reference" is asked of a model that was never shown pacing (section 3).
- Auto-edit is a transcript-only cut list with two text roles. It never sees a frame, never sees the reference, never sees the brain, emits 4 primitives (cut, hook text, header text, feature pop-up) against an editor that supports far more, and is given 1,500 output tokens and a 35 s timeout with silent fallback to "title as hook, no cuts" (section 5).
- Brief creation exists four times: `ingest-brief`+`brief-assist` (talking-point model, ~2,000-word rule prompt), `write-deck` (slide/deck model, a second independent rule set and validator), `brief-fill` (v2 Create flow, a third, tiny prompt that is handed a reference URL as a string and cannot read it), and the legacy `generate-script`/`auto-fill`/doctrine pipeline. Rules, banned-word lists and validators are duplicated and disagree with each other.
- Quality is enforced by regex validators and "repair" calls, not by examples or evals. The prompts are walls of capitalised prohibitions written to patch individual bad outputs. There is not a single eval that scores LLM output; every test is a pure-function unit test.
- The only feedback loop is manager edits to rules (`learn-from-edits`). Post performance (views, saves, sales attribution that already exists in the product) never reaches generation.
- One shared raw-`fetch` wrapper (`fn/_shared/wp8.ts`) with no retries, no `stop_reason` handling, no structured outputs, prompt-only JSON + a parser that breaks on trailing prose, and a cache layout that mostly misses.

## 1. Shared LLM plumbing: `fn/_shared/wp8.ts`

All Claude calls in the repo go through five helpers in this file. No SDK; raw `fetch` to `https://api.anthropic.com/v1/messages` with `anthropic-version: 2023-06-01`.

| Helper | Lines | Model | Notes |
|---|---|---|---|
| `askClaude(system, user, maxTokens=2048, {tier, cachedPrefix, prefixInSystem, timeoutMs})` | 292-332 | `claudeModel(tier)` | Non-streaming. Timeout only if caller passes one. |
| `askClaudeStream` | 346-406 | same | Hand-rolled SSE parser. No timeout at all. |
| `askClaudeResearch` | 478-546 | research tier | Server web search `web_search_20260209`, `max_uses` 10 default, `output_config.effort: 'medium'`, beta `server-side-fallback-2026-07-01` + `fallbacks: 'default'`, 300 s timeout, up to 4 `pause_turn` resumes. |
| `askClaudeVision` | 585-626 | `ANTHROPIC_MODEL ?? 'claude-sonnet-4-5'` | Images by URL. Ignores tiers. Stale fallback id that differs from every other helper. |
| `askOpenAI` | 549-582 | `OPENAI_MODEL ?? 'gpt-4o-mini'`, `temperature: 0.3` | One caller (brand-ingest `cleanup_doc`). |

Model selection (`claudeModel`, 207-213): `draft` = `ANTHROPIC_MODEL ?? 'claude-sonnet-5-5'`; `fast` = `ANTHROPIC_FAST_MODEL ?? 'claude-haiku-4-5'`; `research` = `ANTHROPIC_RESEARCH_MODEL ?? 'claude-sonnet-5-5'`. Thinking is switched off everywhere by `noThinking` (279-283): `thinking: {type:'between_tools'}` for Sonnet 5.5, `output_config.effort:'low'` for Opus 5.5/Fable/Mythos, `thinking:{type:'disabled'}` otherwise.

Env var names: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_FAST_MODEL`, `ANTHROPIC_RESEARCH_MODEL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `DEEPGRAM_API_KEY`, `APIFY_API_TOKEN`, `REPLICATE_API_TOKEN`, `CREATOMATE_API_KEY`, `GITHUB_TOKEN`, `IG_GRAPH_ACCESS_TOKEN`, `IG_USER_ID`, `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. What is actually set in production for the three model vars could not be checked from the repo; the code defaults are what is described here.

Weaknesses

1. No structured outputs. Every function asks for "a single JSON object, no markdown fences" in prose and parses with `parseClaudeJson` (628-636): strip a leading/trailing code fence, find the first `{` or `[`, `JSON.parse` everything after it. Any trailing sentence, a second fence, or an unescaped quote throws. The prompts carry the scar tissue: "Inside string values use single quotes for any quoted phrase ... an unescaped double quote breaks the JSON" (`generateBrief.ts:382`, also `referenceStudy.ts:77`, `companyResearch.ts:64`). `generateValidated` regex-matches the error message (`/json|unexpected token|position \d+/`, `generateBrief.ts:1358`) to decide whether to redraft the whole brief. `output_config.format` with a JSON schema removes this entire class.
2. `stop_reason` is never read in `askClaude`/`askClaudeStream`/`askClaudeVision`. A `max_tokens` truncation surfaces as a JSON parse error (and for briefs, a full second generation); a `refusal` surfaces as "Claude returned no text". Only `askClaudeResearch` checks `refusal`.
3. No retries or backoff on 429/5xx/529 anywhere. One overloaded response fails the user action (or, in auto-edit, silently degrades to the fallback plan).
4. Thinking is disabled globally "because Sonnet 5 can spend the whole max_tokens budget thinking" (comment 273-278). That is a `max_tokens` sizing problem solved by removing reasoning from the hardest tasks in the product (planning an edit, writing a brief against 40 rules). The quality tier here should think.
5. Prompt caching is mostly wasted. Default layout (238-264) puts a cache breakpoint on the system prompt, then the brand docs as a cached block at the head of the user message. Render order is system then messages, so the brand-doc block only hits when the system prompt before it is byte-identical. The brief system prompt varies by post type, product name and banned phrases (`generateBrief.ts:370-411`), so drafts of different post types never share the brand cache. The JSDoc claim "a week of drafts ... pay about a tenth" (wp8.ts:218-221) is false: the TTL is the 5-minute default. `brandDocBlocks` also embeds `ai_learnings` (`generateBrief.ts:730`), which changes after every publish. Only `write-deck` uses the correct order (`prefixInSystem`, brand docs first).
6. `fast` tier is `claude-haiku-4-5` (previous generation, $1/$5 per MTok). It runs the two calls that most determine downstream quality: reference pattern extraction and brief line repair. Current-generation Haiku is both cheaper and stronger; and pattern extraction should not be on a small model at all.
7. A second provider (OpenAI `gpt-4o-mini`, with `temperature`) is kept alive for one markdown-cleanup button.
8. Usage is `console.log`'d (285-290) and nowhere else. No per-company or per-feature cost accounting, no request ids stored, no prompt/response logging to replay failures. `brief_validations` stores failures but not the prompt or output that produced them.
9. `streamJsonResponse` (32-63) "streams" by dripping a space every 15 s. Users get no partial output; it exists only to beat a 60 s iOS idle timeout.

## 2. Per-function audit

Conventions: "draft" = `claude-sonnet-5-5` default, "fast" = `claude-haiku-4-5` default, both via `askClaude` unless stated. All are thinking-off, non-streaming, prompt-only JSON, no retry, unless stated. Client callers and cron wiring are in section 7.

### 2.1 auto-edit (`fn/auto-edit/index.ts`, `fn/_shared/autoEdit.ts`)

- Purpose: turn a creator's raw takes of one reel into a cut timeline with on-screen text. Caller: creator app (and managers); auth = assignment's creator, a manager of the company, or platform admin (index.ts:83-101).
- Input (index.ts:9-11): `{ assignment_id, takes:[{asset_id, storage_path, duration_ms, words?}], features?:[{id,title,description,kind:'clip'|'still'}], mode?:'words' }`. Max 20 takes, 12 features (38-39).
- Output (index.ts:194-201): `{ takes:[{asset_id,duration_ms,words:[{w,s,e}]}], blocks:[{asset_id,in_ms,out_ms}], texts:[{role:'hook'|'header',text,start_ms,end_ms}], media:[{feature_id,start_ms,end_ms}], cut_ms, ai }`. `mode:'words'` returns transcripts only (168-177).
- Tables read: `assignments`, `profiles`, `companies(name)`, `briefs(title, creator_note, cta, slides, post_types(key,label))`; storage bucket `videos` (signed URLs). Writes nothing.
- Providers: Deepgram `nova-3` word timestamps via `transcribeClip` (`cues.ts:96-132`; `smart_format`, `punctuate`, keyterms = company name + feature titles; 20 s timeout, no retry; a failed take silently becomes "no words, nothing cut", index.ts:159-161). Claude draft tier, `max_tokens` 1500, `timeoutMs` 35,000 (index.ts:40, 184).
- Prompt (`autoEdit.ts:258-289`). System, verbatim core:
  - "You edit raw TikTok and Instagram reels a creator just recorded on their phone. You get the transcript of every take with word indexes. You decide three things and return JSON only."
  - "1. cuts: retakes and stumbles. When they start a sentence, stop, and say it again, cut the earlier attempt and keep the last clean one. ... Never cut the only version of something, never cut the product mention, never cut normal speech just to shorten it. Pauses are already handled, do not cut for silence."
  - "2. hook and headers: on screen text. The hook sits on top until the first header: 3 to 9 words ... Headers are 2 to 6 words after the number ..."
  - "3. media: when they name the product or describe what one of its features does, show that feature. Use the given feature ids only, at most 3"
  - Return shape: `{"hook", "headers":[{"take","word","text"}], "cuts":[{"take","from","to"}], "media":[{"take","from","to","feature"}]}`.
  - User: post title, post type label + one of three `typeRule` strings keyed on hard-coded post-type keys (245-256), brand note, brief point texts, company name as "Product", CTA, feature list (title + 160 chars of description), then every take as `[0]word [1]word ...` with no timestamps and no pause markers.
- Post-processing (`buildAutoEdit`, 154-231): silence removal is deterministic (`speechRangesFromWords`, `cues.ts:363-384`: cut interior pauses > 700 ms, keep 120 ms each side); Claude cuts are subtracted; pieces < 300 ms dropped; capped at 60 pieces; hook shown from 0 until first header if that is >= 1.2 s; headers back to back until the end; media clamped 2.5-8 s, max 3. `parsePlan` silently drops any invalid entry.
- Conspicuously missing from context: the video itself (no frames, no visual quality, no framing, no B-roll awareness), audio features (energy, laughter, filler sounds Deepgram drops), word timings and pause lengths (the model cannot tell a 2 s restart pause from fluent speech), the reference post or its pattern card, the reference playbook, the brand voice, the brief's script/hook options, the creator's previous manual edits, any example of a good edit, target length, platform.
- Weaknesses
  1. The model decides retakes from text tokens alone. Deepgram `smart_format` text loses disfluencies, so "the same sentence said twice" is the only signal; a retake with different wording, a take that is visually bad, or the better of two clean takes cannot be chosen. "If a whole take is a redo of an earlier take, cut the earlier one" hard-codes "last is best".
  2. Edit vocabulary is 4 primitives (cut range, hook text, header text, feature pop-up). No captions/subtitles decision, no zoom/punch-in, no B-roll, no reordering of takes or sentences, no music, no pacing/speed, no text styling or position, no emphasis words, no end card. Compare section 5.
  3. `max_tokens` 1500 with up to 20 takes; an unbounded transcript with `[i]` prefixes goes in uncapped. Truncated JSON, a timeout at 35 s, or a 429 all land in the same `catch` and return the fallback (title as hook, zero cuts) with `ai:false` (index.ts:179-191). The user sees an "edit" that did nothing.
  4. No reasoning: thinking is off for a planning task over indexes, where off-by-one index errors are the classic failure. Invalid indexes are dropped silently, so a partially wrong plan ships.
  5. Hook text is invented ("the punchy version of what they open with") and is not checked against the brief's approved hook options or the manager's locked hook.
  6. Three hard-coded key sets (`LIST_TYPES`, `ONE_CLIP_TYPES`) duplicate post-type semantics that live in the DB and in `write-deck/specs.ts`.
  7. Company name is used as the product name (`companies.name`), not `settings.product_name` as everywhere else (wp8.ts:911).
  8. Tests: `fn/_shared/autoEdit_test.ts` covers the pure timeline math only. Nothing measures whether cuts are right.

### 2.2 cue-clip (`fn/cue-clip/index.ts`, `fn/_shared/cues.ts`)

- Purpose: legacy per-slot pipeline. Transcribe one recorded clip and decide when that slot's overlay text and screenshot/recording enter. Callers: creator app after recording a slot, managers previewing, and the render path with the service-role key (index.ts:107-110).
- Input: `{assignment_id, slot_index, storage_path, duration_ms?}`. Output: `{ words:[{w,s,e}], cue:{text_start_ms, text_hold_ms:null, media_start_ms, media_end_ms, source:'ai'} }`.
- Reads `assignments`, `profiles`, `companies`, `briefs(hook,talking_points,cta)`, `brief_segments`, `media_library` (up to 500 rows scanned to match a file stem, index.ts:64-74). Writes nothing.
- Model: draft tier, `max_tokens` 200, no timeout. Prompt `PLACE_CUE_SYSTEM` (`cues.ts:245-252`): "You time on-screen elements for a short vertical video clip in which a creator states one talking point. ... Answer with one JSON object only: {"text_word_index": number|null, "media_word_index": number|null}". Keyword-match fallback (`keywordCue`) on any failure.
- Weaknesses: a full Sonnet call to pick two integers that the deterministic `keywordCue` mostly gets; duplicates `parseClaudeJson` with its own `parseJsonObject` (272-280); this slot model (`brief_segments`, `SlotCue`) is a parallel edit system to auto-edit's document model (section 5).

### 2.3 study-reference (`fn/study-reference/index.ts`, `fn/_shared/referenceStudy.ts`, `fn/_shared/scrapeSocial.ts`)

- Purpose: scrape a pasted TikTok/IG post once, store it, extract a "pattern card", and periodically distil all cards into the `reference_playbook` brand doc.
- Input: `{library_item_id}` | `{url}` | `{backfill:true}` (6 per call) | `{distill:true}`. Output: 202 `{queued, distill, studies:[{id,url,status,error}]}`; work continues in `EdgeRuntime.waitUntil` and the client polls `reference_studies(status, phase)`.
- Tables: reads `library_items(source='reference')`; upserts `reference_studies(company_id,url,status,phase,platform,format,caption[:2000],transcript[:8000],slide_texts,pattern,error,studied_at,library_item_id)`; upserts/deletes `brand_docs(kind='reference_playbook')`.
- Scrape (`scrapeSocial.ts`): Apify `clockworks~tiktok-scraper` with `downloadSubtitlesOptions:'TRANSCRIBE_ALL_VIDEOS'` (73-78) or `apify~instagram-scraper` (111-115), `run-sync-get-dataset-items`, 240 s timeout, token in the query string. Video transcript = Apify subtitle file reduced to plain text by `subtitleToText` (130-148, timestamps deliberately thrown away), else Deepgram `nova-3` on the remote media URL (172-198) returning `alternatives[0].transcript` only. Instagram always goes to Deepgram (`transcript_url: null`, 123). Carousels: Claude vision OCR of up to 10 slides (`ocrSlides`, 200-211) through `askClaudeVision` (the helper with the stale `claude-sonnet-4-5` default).
- What is kept from the scrape: `platform, caption, media_url, transcript_url, image_urls, format` (SourcePost, 7-14). Discarded: views, likes, shares, comments, saves, duration, post date, author, follower count, sound/music id, cover image, hashtags. `media_url` is not persisted.
- LLM call 1, pattern card (`extractPattern`, 97-122): fast tier (Haiku 4.5), `max_tokens` 1500. Input: caption[:600], transcript[:5000] or slides[:4000]. `PATTERN_SYSTEM` (66-77), verbatim: "You break down one short form social post that performed well, so a writer can learn from it. You get the caption and the transcript or slide text." Output keys: `topic, hook_spoken, hook_on_screen, hook_type (7-way enum), structure[], on_screen_text[], insider_details[], phrases[], product_mention, cta, why_it_works, quality (1-5)`. "Never invent content the source does not contain."
- LLM call 2, playbook distil (`maybeDistillPlaybook`, 334-399): draft tier, `max_tokens` 3000, input = up to 40 cards with `quality >= 3`, rebuilt every 3 new studies unless the doc is `human_edited`. `DISTILL_SYSTEM` (307-323) forces seven fixed sections ("Hooks that won", "How the body is built", "On-screen text", "The level of detail", "How they talk", "How the product comes in", "Never do"), under 900 words, and: "Every reference you get is a strong model; treat each as proof of what works."
- Weaknesses
  1. For a video, `hook_on_screen` and `on_screen_text` ("text cards and slide headers copied word for word") cannot be known: the model only has speech. These fields are either null or hallucinated, then quoted "word for word as evidence" in the playbook and fed to every draft as "On-screen text ... with verbatim examples". This is fabricated grounding.
  2. `structure` is "beats in order" inferred from an untimed transcript. No durations, no hook length in seconds, no cut rate, no visual format (talking head vs green screen vs screen recording vs B-roll), no caption style. Downstream prompts ask to "keep ... the pacing" of the reference (`ingest-brief/index.ts:508`).
  3. "It performed well" is asserted, never measured. No metrics are stored, `quality` is the model's own 1-5 guess from text, and it is the only filter into the playbook.
  4. The most leverage-heavy analysis in the product runs on the cheapest, previous-generation model with thinking off.
  5. Three different truncations of the same transcript: 8000 stored, 5000 into the card, 2500 into `ingest-brief`, 3500 into `write-deck` make, 2000 into `brief-assist` revise. Long videos lose their CTA/ending in different places per path.
  6. The playbook is a lossy average of up to 40 posts in 900 words, across formats (video and slideshow mixed), and is what generation normally sees instead of the references themselves. Per-format or per-post-type retrieval does not exist.
  7. A failed pattern call still marks the study `failed` but keeps the scrape; `status==='failed'` rows with a transcript are re-studied on every `ingest-brief` call only if the transcript is missing (ingest-brief:447-452), so a study that failed at the LLM step is never retried by that path.
  8. `stripDashes` in referenceStudy.ts (303-305) is a third dash-stripper next to `stripDashes`/`softenDashes` in wp8.

### 2.4 research-company (`fn/research-company/index.ts`, `fn/_shared/companyResearch.ts`, `fn/_shared/crawlSite.ts`)

- Purpose: the "Industry research" panel of the Brain. Input `{website?, force?}`; output 202 `{research, started}`; progress on `company_research(status, stage, profile, playbook, sources, error, started_at, finished_at, website)`; result rendered to `brand_docs(kind='industry_research')` unless human-edited. Reuse window 1 h, stale-run window 8 min.
- Step 1 crawl: homepage + up to 5 same-host subpages preferring about/product/pricing paths, regex HTML strip, 6,000 chars per page, 20,000 total (`crawlSite.ts:1-3, 94-130`). No JS rendering, so SPA marketing sites return near-empty text. SSRF checks are present.
- Step 2 profile: fast tier, `max_tokens` 3000, `PROFILE_SYSTEM` (44-50) -> `{product_name, one_liner, industry, niche, audience[], problems[], features[], pricing, differentiators[], research_questions[8-12]}`.
- Step 3 research: `askClaudeResearch`, research tier, web search max 12 uses, `max_tokens` 16000, effort medium. `RESEARCH_SYSTEM` (52-64): "You are an industry analyst and the head of content ... Research the industry the product lives in with web search so a scriptwriter can write like a real insider ..." -> JSON with `market, audience, calendar, insider_facts (15 to 30 with source_url), problems, myths, vocabulary, product_fit, alternatives, content_angles (12 to 20), never_say`.
- Weaknesses
  1. `insider_facts[].source_url` is model-typed, not taken from citations; nothing verifies that a URL was actually returned by search or supports the fact. `playbookMarkdown` (98-132) then drops the URLs, and generation is told this doc is "the source for every fact, number, date, rule and insider detail in the post; never contradict it" (`generateBrief.ts:697`). Unverified web facts become ground truth for creator scripts.
  2. `content_angles` (12-20 researched post ideas with search phrases) are stored in `company_research.playbook` but left out of the markdown, so idea generation never sees them (only `brandVoice.ts:44-50` reads `search_phrase` for push copy).
  3. `normalizePlaybook` (78-95) casts arrays without validating element shapes; a malformed item renders as `undefined` in the doc.
  4. 12 searches in one turn, capped at 4 resumes and 300 s inside `waitUntil` with an 8-minute platform ceiling; a long run dies and the row is only recovered by the stale check.
  5. The doc is capped at 12,000 chars on injection (`generateBrief.ts:668`) with a plain `slice`, cutting whatever sections come last (alternatives, never-say).

### 2.5 brand-ingest (`fn/brand-ingest/index.ts`)

- Purpose and modes: (a) onboarding ingest `{company_name?, website?, instagram_handle?, tiktok_handle?}` -> writes legacy `brand_profiles(tone, audience, products, content_pillars)` and drafts `brand_docs` kinds `product_truth`, `audience_niche`, `voice`; (b) `{docs:[kind]}` re-draft of non-human-edited docs; (c) `{action:'cleanup_doc', kind, content}` -> `{content}` via OpenAI; (d) cron (no body): monthly "refresh" that appends a dated "## Verified from the website" bullet section to `product_truth`, capped at 6,000 chars by deleting the oldest such sections (254-307).
- Sources: `crawlSite` text (20k chars) + up to 6 recent TikTok captions (300 chars each) from Apify `clockworks~tiktok-scraper` (45-58). Instagram handle is accepted but never scraped.
- LLM calls: profile (draft tier, default 2048 tokens; system at 134: "You analyze a brand for a UGC content engine. Answer with a single JSON object: {"tone", "audience", "products", "pillars"}..."); docs (draft, 8192; system at 161 + `DOC_SPECS` 147-154); refresh findings (draft, 1024; system at 308); cleanup (`gpt-4o-mini`, 4096).
- Weaknesses
  1. The `voice` doc is specified as "5 to 8 real example lines written in that voice" (153). They are not real; the model invents them from a marketing site and six captions. `write-deck` then says "If the brand docs carry real creator transcripts, match their cadence" (`specs.ts:254`), but nothing ever puts real creator transcripts into the docs, even though Noni has Deepgram transcripts of every approved submission.
  2. `audience_niche` asks for "pains and dreams in their own words" and "the accounts they already follow" from a website crawl: invented.
  3. Three full markdown documents returned as string values of one JSON object (161-163): maximum exposure to the escaping failure in `parseClaudeJson`.
  4. Two overlapping representations of the brand (legacy `brand_profiles` columns and `brand_docs`) are both written and both still read (`legacyBrandLines`, `brandAudience`).
  5. Monthly refresh appends bullets by exact-string dedupe; contradictions with earlier human-written text are never reconciled, and it re-crawls every company serially in one invocation.

### 2.6 ingest-codebase (`fn/ingest-codebase/index.ts`)

- Purpose: read a GitHub repo and draft `product_features` rows (unapproved). Input `{company_id, repo_url}`; output `{scanned, inserted, skipped_existing, truncated_tree}`. Uses one platform `GITHUB_TOKEN` (307) for all tenants; 100 KB per file, 80,000 chars per chunk; one draft-tier call per chunk (4096 tokens), then one merge call (4096 tokens) over all extractions.
- Prompts: `EXTRACT_SYSTEM` (40-57) with one GOOD/BAD pair; `MERGE_SYSTEM` (59-).
- Weaknesses: chunk calls run sequentially with no time budget in a synchronous request; the merge call's output is capped at 4096 tokens, so a large app's feature list truncates and fails to parse; dedupe against existing rows is by lowercased name only; private customer repos are only reachable if the platform token happens to have access, so in practice this only works for the in-house product; "claim: one line a 20 year old could say on camera" bakes a persona into the claim library.

### 2.7 ingest-features (`fn/ingest-features/index.ts`)

- Purpose: draft `product_features` rows from uploaded screenshots (vision, up to 12 images) and/or one page URL. Input `{company_id, image_urls?, page_url?}`; output `{scanned, inserted, skipped_existing, dropped_over_cap}`; inserts at most 15 rows, `approved:false`.
- Prompts: `EXTRACT_SOFTWARE` / `EXTRACT_PHYSICAL` (36-94) chosen by `brand_profiles.product_type`. These are the best prompts in the codebase: they explain what to ignore and include a worked example ("slide headline: FOLLOW UPS THAT SEND THEMSELVES / UI shows: ... / correct claim: ...").
- Weaknesses: vision goes through `askClaudeVision` (stale default model, no tier); the worked examples leak a specific customer's domain ("per school rows"); writes to `product_features` while the brief pipeline's media comes from a different table, `brain_features` (below).

### 2.8 ingest-brief (`fn/ingest-brief/index.ts`, `fn/_shared/generateBrief.ts`, `validateBrief.ts`)

- Purpose: draft one structured brief. Input: exactly one of `{url}` (reference post), `{query}` (search phrase), `{feature_id}`, `{media_id}`, plus `context?`, `post_type?` (key or `"auto"`), `family?`. Nothing is saved server-side except `brief_validations` rows.
- Output: `{title, search_phrase, format, point_count, target_words, hook_options[], talking_points:[{id,text,is_product,edited_by_admin,claim_id}], cta, caption, hashtags[], why_it_works, script, overlay_labels[], point_media:[{feature_id,screenshot_url,shape,library_path?,library_kind?}|null], post_type_id, generation_id, warnings[], example_url, example_transcript}` or `{kill_reason, generation_id, post_type_id}` or `{error}`. Response is the space-dripping pseudo-stream.
- Calls per draft: (1) optional `pickPostType` (draft tier, 64 tokens, `generateBrief.ts:70-167`); (2) the draft: draft tier, `max_tokens` 8000, `cachedPrefix` = brand docs (index.ts:158-163); (3) 0-2 `repairLines` calls on the fast tier, 1500 tokens (`generateBrief.ts:1197-1297`); (4) `resolvePointMedia` (draft tier, 512 tokens, `MEDIA_MATCH_SYSTEM`, 843). So 2 to 5 model calls, three of them Sonnet.
- System prompt (`briefSystemBlocks`, 370-411): about 2,000 words made of ~20 named rule blocks: KILL_RULE, JSON contract with enforced key order, an "EXAMPLES IN THESE RULES come from a spread of niches ... Never reuse an example line" disclaimer, `winningPattern`, post-type block, NO_DASH_RULE, plugRule, CAPABILITY_RULE, SEARCH_PHRASE_RULE, SUBSTANCE_RULE, POINT_RULES, SPOKEN_RULE, ON_SCREEN_RULE, EXPERT_CREATOR_RULE, FEATURE_ID_RULE, CREDENTIAL_RULE, SECOND_PERSON_RULE, HOOK_RULES, HOOK_CRAFT_RULE, title, caption, why-it-works, banned phrases. Representative passages:
  - "Rules, measured against real high performing posts. Follow the numbers exactly." (387)
  - "TALKING POINTS: beats, not lines. Write each point at 15 to 22 words; 25 is the ceiling and 30 is a hard fail (the plug point may run to 36, hard fail over 40). Count the words of every point before you answer" (213)
  - "SECOND PERSON: aim for 5 to 6 uses of "you" or "your" per 100 words." (191)
  - "hook_options is 8 to 10 variants, each 9 words or fewer (count them; 10 is a hard fail) ... Score each 0 to 100 ... do not reuse the same score." (200)
  - "THE PATTERN THAT CONVERTS (built from the top performing expert UGC for products like this one)" (353); the code comment gives the evidence base: "12% engagement on a 900 follower account" (343).
- Injected context (`brandDocBlocks`, 671-733): company and product name; `product_truth`, `audience_niche`, `voice`, `learnings` docs in full; `industry_research` (first 12,000 chars); `reference_playbook` (first 7,000 chars); all approved `product_features` claims; up to 40 `brain_features` that have screenshots; hashtag bank; `ai_learnings` rules with one before/after pair each. For the URL path the user message adds caption[:400], transcript[:2500], slide texts[:2500], the pattern card, and: "Keep the hook shape, the structure, the pacing and the level of detail of this reference ... Rewrite every line in fresh words." (index.ts:494-508).
- Missing: any complete example of a good brief for this company (approved/published briefs are never shown here, unlike write-deck); any performance data; the reference's visuals/timing; the creator roster (who will film it); other briefs in the same campaign/week (no dedupe of topics in this path); the reference itself on non-URL paths (only the 900-word averaged playbook).
- Validation and repair: `validateBrief.ts` (758 lines of regex/word-count checks) produces failure strings; `failureTargets` (1110-1156) regex-parses those English strings back into line targets; `repairLines` asks Haiku to rewrite only those lines with a subset of the rules plus a 300-word `FIX_METHOD` paragraph (622). Unrepaired failures are returned to the UI as `warnings`.
- Weaknesses
  1. The prompt is an accretion of patches. Dozens of hard numeric constraints (word counts per point, "you" density, hook word caps, caption char caps, score uniqueness) compete with "write like a real person". Models cannot count words reliably while composing; the system then spends 1-2 extra calls repairing counts. The result is text optimised to pass regexes, which is the likely source of the "not good" feel.
  2. Rules contradict each other and the other pipeline: HOOK_RULES demands a "specificity marker" such as an absolute in caps and bans "how to", while the post-type block's own `how_to` title example is "How to email a landlord" (315) and HOOK_RULES bans exactly that string as a hook (204); the doctrine says hooks are "plain, not clever"; SPOKEN_RULE bans the word "smart", "key", "perfect", "essential" anywhere; write-deck bans a different word list (`specs.ts:256`).
  3. Negative-example contamination. Every rule carries off-niche examples (sorority rush, landlords, "Bidly"), then a separate rule begs the model not to copy them (383). The code already contains evidence it leaks: "Never write "It is my biggest tip" or "I use it constantly"; those were examples, not lines." (240).
  4. Unfalsifiable authority claims ("measured against real high performing posts", "the pattern that converts") rest on one small account, and are presented to the model as law.
  5. KILL_RULE says "almost never kill" (187), contradicting the file header and doctrine ("Kill rather than pad"). In practice thin topics are padded.
  6. `hook_options` are self-scored 0-100 by the same call and sorted by that score (`sortHooks`, 990-1001); the top self-score becomes the hook. No independent judge.
  7. Capability grounding is a prompt request plus a regex over `productCapabilityText`; hallucinated product capabilities remain the #1 documented failure (CAPABILITY_RULE, the `remember`/`banned_terms` machinery in brief-assist exists to clean up after it).
  8. `numberedListTitle` (1002-1018) silently replaces a model title with "N things to know about {topic}", the exact phrasing HOOK_CRAFT_RULE bans ("never ... the word 'things'").
  9. `target_words` defaults to 380 (1055) regardless of post type.
  10. `askClaude` is imported and unused in ingest-brief/index.ts; four near-identical 60-line branches (query/feature/media/url) repeat the same generate-validate-media sequence.
  11. Two feature tables: plug claims come from `product_features` (approved rows), on-screen media from `brain_features` + `feature_screenshots` + `media_library`. A claim and its screenshot are linked only by a model guess (`feature_id` in the draft, then `MEDIA_MATCH_SYSTEM`, whose prompt still lists one customer's nouns: "emails, follow-ups, school list, film, inbox, campaigns", 843).

### 2.9 brief-assist (`fn/brief-assist/index.ts`, `fn/_shared/reviseConstraints.ts`)

- Actions: `regenerate_field` (`field`: search_phrase | talking_points | talking_point+index | hook | caption | title; returns only that field, plus `hook_may_be_stale`), `port_format` (video <-> slideshow, same output shape as ingest-brief), `revise` (chat revise; SSE with `stage`, `note`, `result`, `error` events when `Accept: text/event-stream`), `derive_segments` (no LLM; `sync_brief_segments` RPC writes `brief_segments`).
- `revise` flow (918-1158): (1) `extractConstraints` on the fast tier, 600 tokens, `EXTRACT_SYSTEM` (`reviseConstraints.ts:70-81`) -> `{scope, point_index, remember[], banned_terms[], point_count, lock_*, lock_point_indexes[], standing_instructions[]}` with a regex fallback (`regexConstraints`, 94); (2) side effects: `rememberForCompany` inserts `ai_learnings` rows at confidence 1 and `banTermsForCompany` appends to `brand_profiles.banned_phrases`; (3) either a targeted `regenerateField` or a full rewrite with `buildReviseSystem` (`generateBrief.ts:430`) streamed through `askClaudeStream`, `generateValidated`, locks re-applied in code (`applyLocked`), then `resolvePointMedia`. History: last 8 turns, 2,000 chars each; reference transcript[:2000].
- Good ideas worth keeping: locks enforced in code not trusted to the model; the change report computed by diff, not taken from the model; scope-limited partial returns.
- Weaknesses
  1. A cheap model silently writes permanent company memory. One Haiku classification of a chat message can add an absolute rule ("RULES THE MANAGER STATED (absolute; breaking one fails the post)", `generateBrief.ts:744`) or a banned word that applies to every future post and every validator, with no confirmation step in this function and only a regex (`feedbackAllowsMemory`, 130) as a guard.
  2. The revise system prompt is the full 2,000-word rule set plus a 350-word preamble that then says "THE MANAGER OUTRANKS EVERY RULE BELOW" (430). The model is asked to hold two rule hierarchies at once.
  3. It is a single-shot rewrite dressed as chat: the model cannot ask a clarifying question ("never ask a question back") and has no tools; all intent parsing is delegated to the constraint extractor.
  4. `ignoreFailure` uses three different string-matching heuristics over validator messages (1126-1130); validator wording changes break repair routing silently.
  5. `askClaudeStream` has no timeout; a stalled stream holds the SSE connection until the platform kills it.
  6. 1,213 lines with five copies of the same field `switch` (lines 107, 280, 364, 451-489, 997).

### 2.10 brief-fill (`fn/brief-fill/index.ts`)

- Purpose: "Fill in with AI" in the v2 Create flow. Modes `guided` | `long_text` (draft tier, 1800 tokens, 45 s) -> `{title, phrase, clips:[{say,onScreen,cta}], caption, tags[]}`; `outline` (fast, 900, 30 s) -> `{title, notes}`; `titles` (fast, 600, 25 s) -> `{titles[]}`.
- Prompt: a 7-line `RULES` block (55-62) + `brandBlock` (36-53) in the system prompt: legacy lines, product_truth[:2500], audience[:2000], voice[:1500], 8 features, 8 claims, hashtags, banned phrases. No cache breakpoint benefit (brand block is in system, which is fine, but this is a different brand rendering than `brandDocBlocks`).
- Critical defect: the reference is passed as a bare URL string: "Reference video the manager wants to copy the idea of: ${ref}" (76) and "Reference video: ${link}" (124). Nothing is fetched. No `reference_studies` lookup, no transcript. The model will write as if it had watched the video. This is the newest brief path and it is the least grounded.
- Also missing: industry research, reference playbook, learnings/manager rules, approved examples, validation of any kind, post-type specs (types are four hard-coded strings: 'Talking Head' | 'Long Text' | 'Slideshow' | 'Greenscreen', which match neither `post_types` rows nor `write-deck/specs.ts`).

### 2.11 brief-review (`fn/brief-review/index.ts`, `fn/_shared/reviewBrief.ts`)

- Input `{draft, post_type?, hook_index?}`; output `{checks:[{check_id,tier,section,severity,message,suggestion?}], scores:{overall,hook,talking_points,cta}, tier3:{spoken,worst_line}}`.
- Tier 1 = the same regex validator. Tier 2 (draft tier, 2048): four "AI tell" checks (dialogue, symmetry, parallel_list, search_promise), `TIER2_SYSTEM` (115-126): "You review one short-form social post script for structural tells that AI wrote it." Tier 3 (draft tier, 512): "does this read as SPOKEN, like one person talking to a friend, or as WRITTEN copy?" Scores are 100 minus fixed deductions (29-34).
- Weaknesses: the reviewer sees no brand context, no audience, no product truth and no reference, so it cannot judge accuracy, relevance or whether the brief will work; it only polices style tells. The "score" is arithmetic over regex hits and is unrelated to performance. Two Sonnet calls for two style questions. It reviews the same rule set the generator was already told to follow (self-agreement).

### 2.12 write-deck (`fn/write-deck/{index,specs,make,chat,checks}.ts`, 2,604 lines)

- Purpose: the writer behind the stepped editor, the idea chat, "Fill my week" and the Library "make/remix". One function, eleven modes (index.ts:18-58):
  - `ideas` -> `{ideas:[{cover,say,count,angle}]}`
  - `cover|points|cta|details|all|revise` -> `{slides:[{text,shot,feature_id,changed}], caption, hashtags, search_phrase, note, warnings}`
  - `review` -> `{score, verdict, fixes:[{i,problem,text,shot}]}`
  - `chat` -> `{reply, ideas:[{format,post_type_id,kind,cover,say,count,angle,preview}], chips}`
  - `draft` -> `{cover, slides:[{role,text,shot,feature_id}], caption, hashtags, search_phrase, warnings}`
  - `make` -> `{format, post_type_id, kind:'handheld', cover, say, slides[...], caption, hashtags, search_phrase, source_note, warnings}`
- Data model is slides (`role: cover|point|cta`, `text`, `shot`), not talking points; post types come from a hard-coded `SPECS` table in `specs.ts:69-201`, not the `post_types` DB table that ingest-brief uses.
- Model: draft tier for everything; `max_tokens` 1200-3600; `timeoutMs` 45 s (ideas/chat) or a remaining-budget value; overall deadlines `DRAFT_BUDGET_MS` 55 s, `MAKE_BUDGET_MS` 110 s (176-182). Uses `prefixInSystem` caching with brand docs + `PLATFORM_RULES` first, approved examples second (604, 715, 916): the only correct cache layout in the repo. An in-memory 120 s cache for lookups (212).
- Context: `brandDocBlocks` (same docs as ingest-brief), `PLATFORM_RULES` and `VOICE_RULES` (`specs.ts:239-265`), features/claims (30 max, 356), banned phrases, covers already used this week and the last 40-60 brief titles (anti-repeat by listing, 258, 597, 957), `ai_feedback` dismissals (rejected ideas, 333), and up to 4 of the team's own approved briefs as examples: "POSTS THIS TEAM ALREADY APPROVED in this format. Match their voice and level of detail. Never copy a line and never repeat their topic." (270-292). For `make` with a reference: the stored study via `sourceBlock` (`make.ts:183-196`): "What is said, word for word" transcript[:3500], caption[:500], pattern card.
- Checks and repair: `checks.ts` (`checkDeck`, `slopHits`, hedge and colon stripping) is a second, independent validator; near-miss tolerance (`nearMiss`, index.ts:497-503); targeted re-ask of failing slides.
- Weaknesses
  1. It is a full second implementation of brief writing with its own rules, banned-word list, post-type specs, validator, repair loop and review mode, sharing only `brandDocBlocks` and `patternLines` with the ingest-brief stack. Any fix must be made twice; the two already disagree (e.g. CTA nudge: ingest-brief requires "link in bio"/"search it" nudges, `generateBrief.ts:240`; write-deck forbids them: "Never "it is in my bio" or "link in bio" unless that mechanic says so", `specs.ts:267`).
  2. Framing inconsistency on references: here a reference is "a reference post that won in another niche to remix for us" (index.ts:693); in ingest-brief it "already performed in this niche" (index.ts:494); in referenceStudy every reference is "proof of what works". The system has no stored notion of whether a reference is in-niche.
  3. Approved examples are selected by recency (`reviewed_at desc`, 4 of the last 12), not by performance or by similarity to the idea.
  4. Anti-repetition is a list of titles in the prompt plus a token-overlap check (`overlap > 0.75`, 976). The doctrine's claim that "every idea is embedded and compared against prior drafted and posted ideas" (`doctrine.ts:58`) is not implemented anywhere.
  5. `review` mode scores "0 to 100 for how well it will do with this audience" (990) with no outcome data: an uncalibrated number shown to managers.
  6. One 1,304-line handler with mode flags (`drafting`, `making`, `usesWeek`, `wantDetails`) threading through every branch.
  7. Tests (`chat_test.ts`, `make_test.ts`) cover normalisation only.

### 2.13 learn-from-edits (`fn/learn-from-edits/index.ts`, `fn/_shared/briefDiff.ts`)

- Trigger: `publish-campaign` after a publish (`{campaign_id, brief_ids}`), and nightly cron (`{source:'cron'}`). Output `{captured, rules_written, global_rules_written}`.
- Capture: `brief_ai_snapshots` (what the AI wrote) vs the published brief -> `brief_edit_diffs(diff, edit_ratio, learned_at)`. Distil per company: draft tier, 4096 tokens, up to 25 diffs + up to 40 `ai_feedback` rows (editor edits, dismissed ideas, revise notes) + current rules -> upsert `ai_learnings(category, insight, confidence, evidence_count, examples[<=3], source_diff_ids, active)`; max 30 active rules. Global distil (cron only, >= 2 companies, up to 80 diffs) writes `company_id null` rules.
- Prompt `distillSystem` (197-218): "You maintain the rule set an AI uses to write UGC post briefs ... Each edit is the manager telling the AI what it got wrong. Your job: turn the edits into a small set of precise, actionable rules so the next post needs fewer edits."
- Injection: `learningBlocks` (`generateBrief.ts:762-780`, rules with confidence >= 0.4 or evidence >= 3, copy categories only) and `managerRuleLines` (740-746).
- Weaknesses
  1. Optimises for "fewer manager edits", not for posts that perform. Views, saves, completion, promo-code sales (all in the product: `poll-metrics`, sales attribution) never enter any prompt. A manager's taste is the only teacher.
  2. `MIN_DIFFS_TO_DISTILL = 1`: a single edit can mint a rule; rules then accrete into every prompt (up to 14 company + 8 global) and into the cached prefix, invalidating it.
  3. Global rules mix all tenants' edits; the only privacy control is a prompt instruction ("never mention a product, brand, feature name or niche") and verbatim before/after examples are stored and re-injected "Across all teams" (`generateBrief.ts:778`). Cross-tenant leakage risk.
  4. Layout/overlay/screenshot learnings are captured (categories `overlay_text`, `screenshots`, `layout`) but filtered out of prompts (`isCopyLearning`, 758) and never reach auto-edit or media matching.
  5. No evaluation that a learned rule reduced edits; rules are only retired when the same model says so.

### 2.14 scrape-trends, auto-fill, generate-script (legacy trend pipeline)

Covered in detail by a sub-audit; key facts (line refs are `fn/scrape-trends/index.ts` unless noted):

- scrape-trends: weekly pg_cron (`0 6 * * 1`, `x-cron-secret`), also callable by a manager. Scrapes niche + "format donor" corpora with Apify (`clockworks~tiktok-scraper`, `apify~instagram-hashtag-scraper`, `apify~instagram-profile-scraper`, `clockworks~tiktok-comments-scraper`), Deepgram `nova-3` plain transcripts, vision OCR of 4 slides. Six draft-tier LLM steps, all uncached, no timeouts: OCR (448), annotate hook + why_it_works for a whole 16-20 item chunk in one call (528-538), relevance gate with up to 16 golden few-shots (577, prompt `_shared/relevance.ts:37-47`), classify into the 12-format library (612, `_shared/classify.ts:61-69`), claim mining (785, `_shared/mine-claims.ts:41-45`), search-term picking (915). Writes `trend_items`, `format_examples`, `claims`, `vocabulary`, `ocr_cache`, `source_accounts`, `brand_profiles.sourcing`.
- Defects: `remake_mode`/`remake_reason` are requested from the gate but never inserted (insert at 1218-1251), so `generateTaskDraft` always takes the STRUCTURE ONLY branch (wp8.ts:1068-1071). A gate failure leaves `relevance_score` null, which downstream readers treat as eligible. `format_id` and slot keys from the classifier are not validated. `annotate` is told to infer the hook from the caption when there is no transcript. Apify/Deepgram/OCR code is duplicated from `_shared/scrapeSocial.ts`, minus that file's subtitle parsing and host check before appending the Apify token (375-376). `APPENDIX_A_EXAMPLES` in `formats-seed.ts` (746-769) are 19 soccer-recruiting examples seeded for every tenant.
- The live brief paths (`ingest-brief`, `brief-assist`, `write-deck`, `brief-fill`) never read `trend_items`, `claims`, `vocabulary`, `formats` or `format_examples`. This whole corpus is write-mostly: only `auto-fill`, `generate-script`, the admin trend list and the creator inspiration feed read it.
- generate-script (`fn/generate-script/index.ts`, 50 lines) and auto-fill (`fn/auto-fill/index.ts`) both call `generateTaskDraft` (wp8.ts:1040-1107): draft tier with the default 2048 `max_tokens` for a "roughly 60 seconds" script plus five other fields (truncation risk), one-paragraph system prompt, no validation beyond non-empty fields, writes legacy `content_tasks`. With no trend the prompt says "Draft an original brief from one of the content pillars" but pillars are only injected on the legacy fallback path (wp8.ts:1058). auto-fill's cron was unscheduled in migration 015 and no UI call site was found for either; treat both as dead.
- `_shared/doctrine.ts` (`DOCTRINE`, `assembleGenerationContext`) and `_shared/post-object.ts` (`PostObject` with `shot_list`, `hook_variants`, `audio_direction`) describe a slot-filling generator that no function calls. `doctrine.ts` is imported only by `formats-seed.ts`. Dead design.

### 2.15 vary-copy (`fn/vary-copy/index.ts`)

- Purpose: per-creator rewording of caption, overlays and slides so the roster does not post identical copy. Triggers: `publish-campaign`, `post-approved` (cron secret), client on brief swap. Input `{campaign_id}` or `{brief_id, assignment_ids?, force?}`; output `{varied, failed[], problems{}}`. Writes `assignments.caption`, `assignments.slides_variant`, `assignment_segment_edits`.
- Model: fast tier, `max_tokens` 8192 (16000 for decks), 8 assignments per chunk, no timeout. SYSTEM (146-163): "Keep the meaning, the product claims and the call to action. Never invent features or numbers." Validation is the most rigorous in the repo (Jaccard collision checks, hashtag allow-list, length ratio, one re-ask, fallback to original).
- Weaknesses: no brand voice, product truth, banned phrases or creator identity in context (variants are synonyms, not per-creator voice); the "taken" list grows O(creators) and is resent uncached; prompt says within 20 percent length while the check allows 0.6-1.5; the banned-word guidance hard-codes "player" (152-154) from one customer; own bracket-slicing parser (115-118).

### 2.16 audio-search (`fn/audio-search/index.ts`)

- No LLM. `GET graph.facebook.com/v21.0/{IG_USER_ID}/audio_search` with one global token for all tenants, 8 s timeout, always 200 `{tracks[], source, error?}`. Not connected to anything AI: reference posts' sounds are never captured, and auto-edit never proposes audio.

### 2.17 render-submission (AI parts)

- `fn/render-submission/index.ts` routes a submission: `edit_document != null` -> `assembleDocumentSubmission` (`documentAssembly.ts`), else legacy `assembleSubmission` (`assemble.ts`); self-invokes up to 5 hops; writes `submissions.video_path, transcript, render_timeline, render_status, render_error` (and `cues` on the legacy path).
- There is no edit-plan generation at render time. The document path calls no LLM; it calls Deepgram again per audible asset for subtitles (`documentAssembly.ts:486-507`). The legacy path calls Deepgram per clip (`assemble.ts:1151`) and Claude only through `placeCue` (`assemble.ts:1300`, prompt in `cues.ts:245-252`) for slots without a stored cue.
- Renderers: Upload-Post hosted ffmpeg by default; Creatomate only behind `OVERLAY_RENDERER=creatomate` on the legacy path; Replicate RVM for legacy green-screen cutout. Details and defects in section 5.

## 3. Cross-cutting: how reference posts are ingested and used

Entry points for a TikTok/Instagram URL

| Entry | Code | What happens to the URL |
|---|---|---|
| Library reference -> study | `fn/study-reference/index.ts` -> `studyReference` | Scraped, transcribed/OCR'd, pattern card, stored in `reference_studies`; playbook distilled every 3 studies |
| "Draft from link" | `fn/ingest-brief/index.ts:447-548` | Reuses the stored study (or scrapes + studies inline), then drafts; returns `example_url` and `example_transcript` to the client |
| Library make/remix | `fn/write-deck/index.ts` mode `make` + `make.ts:183-196` | Reads the stored study by `reference_id` or `url`; does not scrape |
| v2 Create "Fill in with AI" | `fn/brief-fill/index.ts:76,124` | URL pasted into the prompt as text. Never fetched. |
| Weekly trend scrape | `fn/scrape-trends` | Separate scraper code and separate table (`trend_items`); not read by any live brief path |

Fetch chain (`fn/_shared/scrapeSocial.ts`): Apify actor (TikTok: `clockworks~tiktok-scraper` with forced transcription; Instagram: `apify~instagram-scraper`) -> for video: Apify subtitle file flattened to plain text, else Deepgram `nova-3` on the CDN URL, plain transcript only -> for carousels: Claude vision OCR, 10 slides max. Only TikTok and Instagram hosts are accepted (`socialHost`, 216-226); no YouTube Shorts.

Stored per reference (`reference_studies`): url (normalised), platform, format, caption[:2000], transcript[:8000] (flat string), slide_texts, pattern (JSON card), status/phase/error. Not stored: the video or any frames, word timings, duration, engagement metrics, author, sound, posting date, on-screen text of videos, visual format.

Downstream use

- Brief creation sees: the transcript text (truncated to 2,500 / 3,500 chars depending on path), the caption, the Haiku pattern card, and the distilled playbook. That is the entire "reference understanding".
- Visual structure is not used because it is never extracted. The only vision call in the reference path is slideshow OCR.
- Auto-edit does not use references at all: neither the specific reference a brief was modelled on (the brief does keep `example_url`/`example_transcript` client-side) nor the playbook. An edit can never "look like the reference".
- Recording-time guidance (script/teleprompter, shot guidance) does not receive reference timing either.

What a rebuild needs here: download the media once; sample frames and/or pass the video to a multimodal model; keep word-level timestamps; extract a timed beat sheet (hook duration, shot changes, on-screen text with in/out times and position, caption style, B-roll/screen-recording segments, music); store real engagement metrics and the author's baseline; and make that structured object the thing both the brief writer and the editor consume.

## 4. Cross-cutting: the "company brain"

Storage (migration refs are `supabase/migrations/*_NNN_*.sql`)

| Store | Shape | Populated by | Read by generation |
|---|---|---|---|
| `brand_docs` (014:6; kinds widened 108:14) | one `content text` per (company, kind); kinds: `product_truth`, `audience_niche`, `voice`, `learnings`, `industry_research`, `reference_playbook`; `human_edited` flag | brand-ingest (first three, drafted from a site crawl), humans in the web Brain page, research-company (`industry_research`), study-reference (`reference_playbook`); nothing writes `learnings` any more (the monthly cron appends to `product_truth` instead) | Whole docs concatenated by `brandDocBlocks` (`generateBrief.ts:671-733`); caps: industry 12,000 chars, reference 7,000 chars |
| `brand_profiles` (001:27 + later columns) | legacy `tone`, `audience`, `products`, `content_pillars`, `buying_path`; plus `hashtag_bank`, `banned_phrases`, `product_type`, `sourcing` | brand-ingest, revise chat (`banned_phrases`), scrape-trends (`sourcing`) | `legacyBrandLines` fallback, hashtag bank, banned phrases |
| `product_features` (022:44) | `name, what_it_does, claim, surface, source, source_ref, approved, rejected` (+ `clip_url`, `screenshot_url`, `is_general` 117:21) | ingest-codebase, ingest-features, humans | Approved rows as "Approved claims (the ONLY source for the plug)" |
| `brain_features` + `feature_screenshots` | `name, sentence, rank, idea_title, idea_action, idea_example`; screenshots with `shape` | Not created by any migration in this repo (only RLS policies at 091:526-535); managed from the web repo | "Feature library" (max 40, only features that have screenshots, wp8.ts:870-887) |
| `media_library` (071:30) | screenshots/recordings with `title`, `description` | manager uploads | `resolvePointMedia` title/description matching |
| `company_research` (108:21) | `profile jsonb`, `playbook jsonb`, `sources jsonb` | research-company | Only via the rendered `industry_research` doc; raw JSON used for push copy niche |
| `reference_studies` (108:42) | per-URL scrape + pattern card | study-reference, ingest-brief | Only via the distilled playbook, or directly when a draft is made from that exact URL |
| `ai_learnings` (078:74) | rules with confidence, examples; `company_id null` = global | learn-from-edits, revise chat | `learningBlocks`, `managerRuleLines` |
| `companies.settings` | `product_name`, `handles`, `vertical`, `ugc_reference_handles`, `account_template.{niche,search_phrases}`, `cadence_per_week` | onboarding/admin | product name, niche wording |

Retrieval: none. There is no pgvector extension (only `pgcrypto`, `pg_cron`, `pg_net`), no embedding column, no chunk table, no similarity RPC, no full-text index, anywhere in `supabase/migrations`. `loadBrandContext` (wp8.ts:819-936) runs seven `select`s by `company_id` and returns everything. `doctrine.ts:58` describes embedding-based idea dedupe that was never built.

Injection: every brief/deck call gets the same full dump regardless of topic: all six docs, all approved claims, up to 40 features, hashtag bank, up to 22 learnings. Selection by relevance happens nowhere; the only "selection" is `String.slice`.

Problems

1. The brain is mostly machine-written guesses presented back to the model as truth. Voice "example lines" are invented by brand-ingest; audience "own words" are invented; industry facts are unverified search output with URLs dropped; the reference playbook contains on-screen text the system never saw. Humans can edit each doc (`human_edited` then freezes it against all future automation, including improvements).
2. No provenance. A fact in `product_truth` cannot be traced to a source, dated (apart from the appended "Verified from the website" sections) or expired. The only hard grounding is the approved-claims table, and it covers only the plug sentence.
3. It contains nothing Noni uniquely knows: transcripts of this company's own approved/posted creator videos, which hooks and formats actually performed, per-creator voice and credentials, sales per post, comment questions. `scrape-trends` mines `claims` and `vocabulary` from the niche (real audience language) and the live writers never read those tables.
4. Flat docs do not scale and already truncate (12k/7k caps), and one global dump prevents topical grounding: a brief about feature X gets the same context as a brief about feature Y.
5. Three overlapping feature stores (`product_features`, `brain_features`, `media_library`) with model-guessed joins between them.
6. Schema drift: two brain tables live outside this repo's migrations; `library_briefs` (v2, text ids, 121:6) is a third content model beside `briefs` and `content_tasks`, and the learning loop (`brief_ai_snapshots.brief_id -> briefs`) is not wired to it, so v2 briefs teach nothing.

## 5. Cross-cutting: the auto-edit pipeline end to end

Status first: in HEAD the auto-edit client is dead code. `runAutoEdit` / `applyAutoEdit` (`lib/auto-edit.ts:244, 302`) have no callers outside `lib/auto-edit.test.ts`; the screens that called them (`app/(creator)/make/raw/[id].tsx`, `app/(creator)/make/cut/[id].tsx`, `components/creator/briefs/raw/*`) were deleted in commit 67e8ec9. Only the caption helpers (`captionAt`, `captionLines`, `outputWords`) are still imported (`CaptionPreview.tsx:7`), and they return nothing unless `doc.autoEdit` exists. The live v2 creator flow (`components/creator/briefs/reel/{plan,sync}.ts`, `components/creator/v2/record/EditorScreen.tsx:129`) does no AI editing: its only automatic cut is on-device dead-air trimming (`sync.ts:386-413`). So "AI editing" today is: an edge function with no caller, plus a legacy per-slot cue placer.

As designed (and as it ran before 67e8ec9)

1. Per take, right after recording: `auto-edit` with `mode:'words'` -> Deepgram words cached in the document.
2. On the cut screen: `auto-edit` with all takes (+ cached words) and up to 12 features (title + description only; paths withheld) -> Deepgram for any take missing words -> one Sonnet call -> `buildAutoEdit` -> `{blocks, texts, media, cut_ms, ai}`.
3. Client `applyAutoEdit` (`lib/auto-edit.ts:302-389`) rebuilds the document from scratch:
   - every block `layout:'single', speed:1, muted:false, crop:null`;
   - hook and header get the same hard-coded style (white text, `bg:true`, size 0.052, x 0.5, y 0.2, width 0.86, `enter:'pop'`); the `role` is discarded;
   - feature media hard-coded dead centre (clip width 0.42, still 0.62, `enter:'slide'`), i.e. over the speaker's face;
   - `subtitles.enabled` forced true; `audio`, `reelPlan` and all manual overlays wiped.
4. Submit freezes the document to `submissions.edit_document`; `render-submission` -> `documentAssembly.ts` renders with hosted ffmpeg (Upload-Post), re-transcribing every asset with Deepgram for subtitles instead of reusing the words auto-edit already paid for (`documentAssembly.ts:486-507`). No Claude call in the document render path.

What the AI receives: word tokens with indexes (no timings, no pauses, no confidence), brief title/type/note/points/CTA, company name, feature titles. No frames, no audio features, no reference, no brain.

What the AI emits (complete vocabulary): `cuts[{take, from, to}]`, `hook` (one string), `headers[{take, word, text}]` (max 12), `media[{take, from, to, feature}]` (max 3).

What the editor/renderer can represent (`lib/edit-document.ts`, server mirror `fn/_shared/editDocument.ts`)

- Assets: video or image.
- Clip: `inMs/outMs`, `speed` 0.5|1|1.5|2|3, `muted`, static `crop {scale 1..3, x, y}` (punch-in).
- Block: `layout` single | split_v | split_h with 1-2 cells (split screen, image cells / B-roll).
- TextOverlay: text, colour, `bg` on/off (two fixed TikTok Sans styles), size, x, y, width, per-word colour `spans` (slides only), start/end, `enter` pop|slide.
- ImageOverlay: image or video asset, x, y, width, start/end, `enter`.
- Document: `gain` 0.5-3, `subtitles {enabled, y}`, `audio {track, start, vol, voice}` (sound with trim and mix), `reelPlan`, `autoEdit` state.
- Slideshow: aspect 9:16|4:5|1:1, slides with crop, separate Instagram crop/boxes, inset image, up to 6 pics.
- Limits: 60 blocks, 40 overlays, 20 slides, 300 ms min clip.
- Not representable at all: transitions, filters/colour, stickers on video, zoom keyframes, rotation, font choice, text alignment/exit animation, caption styling, per-clip volume, background removal in the document path (green screen exists only in the legacy slot path via Replicate RVM).

Gap: auto-edit never produces split layouts, B-roll or image blocks, speed changes, punch-ins, mute/gain, any text styling or placement decision, any media placement decision, subtitle on/off or position, sound, or anything for slideshows.

Renderer problems with what it does emit

1. Text `enter:'pop'` is ignored by the ffmpeg text stage (`ffmpegText.ts:237-241`; bubble shapes pass `enter: undefined`, `ffmpegOverlay.ts:466, 579`); only image overlays animate. Hooks and headers hard-cut in the final video while the preview animates.
2. Feature pop-ups are centred with no face/text avoidance in the document path; `fitInsetClearOfText` exists only in the legacy timeline (`renderTimeline.ts:487-504`).
3. Preview captions and burned captions use different line breakers (client 32 chars, `lib/auto-edit.ts:423-445`; server 48 chars, `renderTimeline.ts:303`), so what the creator approves is not what renders.
4. The server document parser drops `reelPlan`, `autoEdit` and `audio` (`editDocument.ts:457-468`). The chosen sound is saved to `submissions.audio` but never mixed into the rendered video; the native exporter that can mix it (`modules/video-editor`, `exportTimeline`) has no JS caller.
5. Feature asset paths are signed from `brief-assets` unless they match one pattern (`assemble.ts:324`); a library path in another bucket fails the whole render.

Two parallel edit systems

- Legacy slot model: `brief_segments`, `submission_segments`, `submissions.cues`, `lib/video-edit.ts`, `cue-clip`, `assemble.ts` (2,308 lines). The only place Claude runs at render time: `placeCue` for slots without a stored cue (`assemble.ts:1300`).
- Document model: `creator_projects.document` -> `submissions.edit_document` -> `documentAssembly.ts`.
- They have separate silence-cut logic (server `speechRangesFromWords`, ffmpeg `silencedetect`, on-device `speechBounds`), separate overlay timing, and a hand-synced duplicate of the document parser on client and server that has already diverged.

No feedback capture for edits: nothing logs how a creator or manager changed an AI edit. `doc.autoEdit` stores only `ranFor`, `cutMs`, `ai`. `lib/ai-edit-signals.ts` / `ai_feedback` are about brief copy, not video edits.

## 6. Cross-cutting: feedback loops

| Signal | Captured where | Reaches generation? |
|---|---|---|
| Manager edits between AI draft and publish | `brief_ai_snapshots` -> `brief_edit_diffs` (learn-from-edits) | Yes, as distilled rules in `ai_learnings`, injected by `learningBlocks` |
| Editor-level edits, approvals, dismissed ideas, revise notes | `ai_feedback` (`lib/ai-feedback.ts`, `lib/ai-edit-signals.ts`) | Partly: dismissals into write-deck prompts (`write-deck/index.ts:330-333`); all kinds into the nightly distil |
| "Never do that again" in revise chat | `ai_learnings` (confidence 1) and `brand_profiles.banned_phrases`, written by Haiku classification | Yes, immediately and permanently |
| Validator failures per generation | `brief_validations` | No. Write-only log; no prompt or output stored with it |
| Trend relevance labels (keep/kill) | `trend_items.is_golden/label` | Only into the trend gate few-shots; the gate feeds a dead pipeline |
| Post performance (views, likes, saves, shares, completion) | `poll-metrics` | No |
| Sales and sign-ups per post (promo codes, Stripe sync) | sales attribution tables | No |
| Creator edits to an AI edit | not captured | No |
| Which hook option the manager picked out of 8-10 | saved on the brief | No |

There is no loop from outcomes to generation. The system learns to match one manager's edits and calls that "what works".

## 7. Callers, triggers, reachability, evals

Reachability matters because much of this code is not reachable from the current mobile UI (findings from grep of `app/`, `components/`, `lib/`; the web repo `~/noni-web` was only grepped for function names).

| Function | Mobile client wrapper | Reachable in mobile UI? | Other triggers |
|---|---|---|---|
| brief-fill | `lib/brief-ai.ts:16` (`guided`, `outline`, `long_text`, `titles`) | Yes: `components/admin/v2/newbrief/*` via `app/(admin)/new-brief.tsx` | - |
| audio-search | `lib/audio-api.ts:27` | Yes: `AudioSheet.tsx` | - |
| write-deck | `lib/deck-ai.ts:33` (all modes) | Screens exist (`app/(admin)/brief/[id].tsx`, `ideas/[campaignId].tsx`) but the route helpers that open them (`components/admin/briefs/routes.ts:49-63`) have no callers | not referenced in web repo |
| ingest-brief | `lib/briefs-api.ts:267` via `lib/post-fill.ts:428` | Only from `app/(admin)/post/[id].tsx`, which nothing links to | web: `app/manager/briefs/actions.ts` |
| brief-assist | `lib/briefs-api.ts:325, 402, 588, 640, 729` | same orphaned screen + `ReviseChatSheet` | web |
| brief-review | none | No | web; `scripts/acceptance-agent4.ts` |
| study-reference | `lib/library-make.ts:319` | wrapper has no UI importer | web library actions |
| research-company | none | No | web Brain page |
| brand-ingest | `lib/admin-api.ts:672`, `lib/onboarding.ts:122` | wrappers not imported | monthly cron `0 5 1 * *` (008:44); web onboarding |
| ingest-features | `lib/admin-api.ts:1529` | no caller | - |
| ingest-codebase | none | No | none ("deliberately dormant" per `noni-build-final.md:66`) |
| auto-edit | `lib/auto-edit.ts:267` | No (callers deleted in 67e8ec9) | none |
| cue-clip | none | No | none found in either repo; legacy render calls `placeCue` directly |
| vary-copy | `lib/tasks-api.ts:140` (no caller) | No | publish-campaign, post-approved |
| learn-from-edits | none | - | nightly cron `0 4 * * *` (078:184); publish-campaign |
| scrape-trends | `lib/admin-api.ts:774` (no caller) | No | weekly cron `0 6 * * 1` (008:10) still running and still paying Apify/Deepgram/Sonnet for a corpus the writers do not read |
| auto-fill | none | No | cron removed (015_foundation:11) |
| generate-script | `lib/admin-api.ts:752` (no caller) | No | none |

Net: in the mobile app today the only AI the user can actually reach is `brief-fill` (the weakest, least grounded writer) and audio search. The heavily engineered stacks (ingest-brief/brief-assist, write-deck, auto-edit) are stranded behind retired screens or live only on the web manager. The v2 flow writes `library_briefs`, which none of the validators, the learning loop, or `vary-copy` know about.

`supabase/config.toml:395-449` sets `verify_jwt = false` for ingest-brief, brand-ingest, generate-script, scrape-trends, auto-fill, ingest-codebase, ingest-features, brief-assist, write-deck, learn-from-edits, brief-review (in-function auth only).

Evals and tests

- Unit tests (pure functions, no model): `fn/_shared/autoEdit_test.ts`, `cues.test.ts`, `documentAssembly.test.ts`, `slideSpans_test.ts`, `shuffle.test.ts`, `fn/write-deck/chat_test.ts`, `make_test.ts`, `lib/auto-edit.test.ts`, `lib/ai-edit-signals.test.ts`, `lib/idea-chat.test.ts`, `lib/library-make.test.ts`, `lib/revise-chat.test.ts`. The Deno tests are excluded from vitest and run only by hand. No CI (`.github` does not exist).
- `scripts/relevance-regression.ts`: the only thing that scores model output. It replays the trend relevance gate over hand-labelled `trend_items` and compares `score >= 6` to keep/kill. Problems: runs zero-shot while production uses 16 golden few-shots (120-132), so it does not test the production prompt; default model `claude-sonnet-4-5` (50) vs production `claude-sonnet-5-5`; one unbatched call at 4096 `max_tokens` for all goldens (truncates at 60-80 items); exits 1 on any single disagreement (165-168); no held-out split (every label is also few-shot eligible); not in `package.json`; and it evaluates a pipeline that feeds nothing live.
- `scripts/acceptance-agent2.ts` / `agent4.ts`: hit deployed functions and assert structure (point counts, hook caps, tiers returned). Not quality.
- `scripts/export-finetune-jsonl.ts`: exports (AI snapshot -> published) pairs; no consumer.
- Nothing evaluates brief quality, reference understanding, edit quality, grounding/hallucination rate, or cost/latency. `brief_validations` could have been a dataset but stores no inputs or outputs.

## 8. Dependency diagram

```
                         EXTERNAL
  Apify (tiktok-scraper, instagram-scraper, hashtag/profile/comments)   Deepgram nova-3
  Anthropic Messages (sonnet-5-5 / haiku-4-5, web_search)   OpenAI gpt-4o-mini   IG Graph   GitHub
        |                                   |
        v                                   v
  _shared/scrapeSocial.ts  <--------  _shared/cues.ts (transcribeClip, placeCue, speechRanges)
        |                                   |
        |            _shared/wp8.ts  (askClaude*, parseClaudeJson, loadBrandContext, loadLearnings)
        |                 ^   ^   ^   ^   ^
  BRAIN WRITERS           |   |   |   |   |
  brand-ingest ---------> brand_docs{product_truth,audience_niche,voice}, brand_profiles   (cron monthly)
  research-company -----> company_research -> brand_docs{industry_research}
  study-reference ------> reference_studies -> (every 3) brand_docs{reference_playbook}
  ingest-codebase ------> product_features (unapproved)
  ingest-features ------> product_features (unapproved)
  [web repo] -----------> brain_features, feature_screenshots, media_library
  learn-from-edits -----> brief_edit_diffs -> ai_learnings        (cron nightly; publish-campaign)
  brief-assist.revise --> ai_learnings (confidence 1), brand_profiles.banned_phrases

  BRAIN READ (one path):  loadBrandContext -> brandDocBlocks  (full dump, no retrieval)
        |
        +--> ingest-brief ----> generateBrief.ts (system rules) -> validateBrief -> repairLines(haiku)
        |        ^  reads reference_studies (url path)            -> resolvePointMedia -> client saves brief
        |        |                                                -> brief-assist.derive_segments -> brief_segments
        +--> brief-assist ----> regenerate_field | port_format | revise (reviseConstraints haiku) 
        +--> brief-review ----> validateBrief tier1 + reviewBrief tier2/3
        +--> write-deck ------> specs.ts/make.ts/chat.ts/checks.ts (own rules + own validator)
        |        ^  reads reference_studies (make), ai_feedback, approved briefs, week slots
        +--> brief-fill ------> own tiny prompt (reference URL as text)        [only live mobile path]
        +--> generate-script / auto-fill -> generateTaskDraft -> content_tasks   [dead]

  TREND CORPUS (write-mostly): scrape-trends (cron weekly) -> trend_items, claims, vocabulary,
        format_examples, source_accounts   --read by-->  auto-fill, generate-script, inspiration feed only

  PUBLISH:  publish-campaign -> vary-copy (haiku; per-creator wording) ; -> learn-from-edits
            post-approved    -> vary-copy

  EDIT / RENDER
  auto-edit [no caller] -> Deepgram words -> autoEditPrompt (sonnet) -> buildAutoEdit -> {blocks,texts,media}
        -> lib/auto-edit.ts applyAutoEdit [dead] -> creator_projects.document
  cue-clip [no caller]  -> Deepgram -> placeCue (sonnet)
  submissions.edit_document -> render-submission -> documentAssembly.ts (Deepgram again, ffmpeg via Upload-Post)
  legacy segments       -> render-submission -> assemble.ts (Deepgram, placeCue via Claude, Replicate RVM, Creatomate flag)

  NO EDGE:  poll-metrics / sales attribution  -X->  any generator
            reference_studies / playbook       -X->  auto-edit
            edits made to AI edits             -X->  anything
```

## 9. The 10 highest-leverage problems, ranked

1. Reference posts are understood as flat text only. No frames, timing, on-screen text, visual format, sound or metrics are extracted (`scrapeSocial.ts`, `referenceStudy.ts:66-122`), yet pattern cards and the playbook assert on-screen text and pacing, and downstream prompts say "keep the pacing". Everything the product promises ("make ours like this winner") depends on this object, and it is produced by Haiku 4.5 from a truncated transcript. Fix first: a real multimodal reference analysis with a timed beat sheet and stored metrics.
2. There is no outcome signal anywhere in generation. Views, saves, completion and per-post sales exist in the product and never reach a prompt, an example selector or an eval. The only learning signal is manager edits (`learn-from-edits`), and "what works" in the prompts is asserted from one 900-follower account (`generateBrief.ts:343`).
3. Auto-edit is not an editor and is not even wired up. Transcript-only, 4 primitives, no vision, no reference, no brain, thinking off, 1,500 tokens, silent no-op fallback (`auto-edit/index.ts:179-191`), hard-coded styling that covers the face, entrance animations the renderer ignores, sound that is never mixed, and no client caller since 67e8ec9. Needs a redesign around a richer, validated edit plan that maps onto (and extends) the edit document, with frames + word timings + the reference beat sheet as input.
4. The company brain is unverified prose dumped whole into every call. No retrieval, no provenance, invented "real" voice lines and audience quotes, unverified web "facts" promoted to ground truth (`generateBrief.ts:697`), 12k/7k character truncation, three unjoined feature stores, and none of Noni's first-party data (own creators' transcripts, performance, comments).
5. Four parallel brief writers with divergent rules, and the only one reachable from the mobile app (`brief-fill`) is the least grounded: tiny prompt, no validation, and a reference URL passed as a string the model cannot open (`brief-fill/index.ts:76`). Consolidate to one generation core and one content model (`briefs` vs `library_briefs` vs `content_tasks`).
6. Prompt strategy is rule accretion instead of examples and judgment. ~2,000-word systems of numeric hard-fails ("5 to 6 uses of you per 100 words", "15 to 22 words ... 30 is a hard fail"), contradictory rules, off-niche examples that leak and are then banned by another rule, thinking disabled, followed by regex validators and Haiku repair passes that optimise for passing regexes. This is the most direct cause of stilted output.
7. Zero quality evals. No golden set, no judge, no regression run, no CI. The single eval script tests a non-production configuration of a dead pipeline. Every prompt change so far has been validated by eyeballing; a rebuild without an eval harness will repeat this.
8. LLM plumbing is fragile: prompt-only JSON with a parser that fails on trailing text, no `stop_reason` handling (truncation looks like a parse error), no retries, no timeouts on streams, inconsistent/stale model defaults (`claude-sonnet-4-5` for vision, Haiku 4.5 for the fast tier, `gpt-4o-mini` for one button), cache breakpoints placed so brand docs rarely hit, and no stored traces or cost accounting.
9. Hallucinated product capabilities are handled after the fact. The defence is a prompt paragraph plus a regex over concatenated doc text, and the cleanup path lets a Haiku classification of one chat message write permanent company-wide rules and banned words (`reviseConstraints.ts:156-226`). Needs claim-level grounding with citations to approved features and a human-confirmed memory write.
10. Dead and duplicated code is hiding the real system and still costing money. The trend pipeline (weekly cron, six Sonnet steps, Apify, Deepgram) feeds tables no live writer reads; `remake_mode` is computed and dropped; doctrine/post-object/formats describe a generator that does not exist; scrape, Deepgram, dash-stripping, JSON parsing, caption line-breaking and the document parser each exist two or three times; two edit pipelines and three content models coexist. Delete before rebuilding.

## 10. Method and limits

- Read directly: `fn/_shared/wp8.ts`, `autoEdit.ts`, `cues.ts`, `scrapeSocial.ts`, `referenceStudy.ts`, `companyResearch.ts`, `crawlSite.ts`, `brandVoice.ts`, `doctrine.ts`, `mine-claims.ts`, `reviewBrief.ts`, `generateBrief.ts` (lines 1-989 in full, the rest with long lines clipped), and the handlers for auto-edit, cue-clip, study-reference, research-company, ingest-brief, brief-fill, brief-review. Read by outline plus targeted excerpts: brief-assist, `reviseConstraints.ts`, `validateBrief.ts`, brand-ingest, learn-from-edits, ingest-codebase, ingest-features, write-deck (all five files). `briefDiff.ts`, `plan.ts`, `credits.ts` were not read.
- Delegated to three read-only sub-audits and spot-checked: scrape-trends/vary-copy/auto-fill/generate-script/audio-search; the edit document, render path and client auto-edit; migrations, client callers, scripts and tests. The auto-edit "no caller" finding and the `brain_features` migration gap were re-verified by grep; other reachability claims (orphaned admin screens, web-repo usage) rest on the sub-audit's grep and were not independently traced.
- Nothing was executed against live services; no tests were run; production env values (which models are actually configured) were not inspected. No repo files were modified.
