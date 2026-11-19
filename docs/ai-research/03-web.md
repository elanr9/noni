# 03 — Noni web app audit (noni-web)

Repo: `/Users/elanromo/noni-web` (branch `master`, clean). Next.js 16.3.0 App Router, React 19.2, Tailwind 4, `@supabase/ssr`, `stripe`, `framer-motion`, `lucide-react`, `tus-js-client`, vitest. No component library, no form library, no AI SDK (all AI is raw `fetch`).
All paths below are relative to `/Users/elanromo/noni-web` unless they start with `noni/` (= `/Users/elanromo/noni`).

Read-only audit; nothing was modified. Things I did not verify are marked "not verified".

---

## 1. Route map and who logs in

### Who uses the web
`src/lib/auth.ts:142-146` — "The web dashboards serve company admins (/admin), campaign managers (/manager), and the platform account (/ops). Creators live in the iOS app."

| Role | Source of role | Home |
|---|---|---|
| Platform admin (ops) | `profiles.role = 'admin'`, auto-promoted from `PLATFORM_ADMIN_EMAILS` (`src/lib/auth.ts:78-122`) | `/ops` |
| Company admin (owner) | `current_role()` RPC on active `company_members` row = `company_admin` (`src/lib/auth.ts:41-54`) | `/admin` (after `/onboarding`) |
| Campaign manager | `current_role()` = `campaign_manager`; per-member `company_members.permissions` (`src/lib/auth.ts:151-174`) | `/manager` |
| Company admin who is also a manager | `companies.self_is_manager` | can switch between `/admin` and `/manager` (`src/app/manager/layout.tsx:58`) |
| Creator | n/a | friendly "app only" gate (`src/app/admin/layout.tsx:33-47`) |

Sign-in: Google and Apple OAuth via Supabase, PKCE (`src/app/login/page.tsx:20-27`, `src/lib/supabase/client.ts`). Invite acceptance is Google only (`src/app/invite/[token]/InviteAuth.tsx:86`). `/dash` (`src/app/dash/route.ts`) claims pending invites (`claim_pending_invite` RPC) then routes by role. `src/proxy.ts` (Next 16's renamed middleware) refreshes the session and only redirects unauthenticated `/admin` and `/ops`; every other gate is in layouts and server actions.

Multi-company: `profiles.active_company_id`, `company_status_summary` and `set_active_company` RPCs, `CompanySwitcher` and `AccountSwitcher` in the sidebar.

### Routes
Marketing / public
- `/` → `src/components/landing/LandingPage.tsx` (For Businesses / For Creators, lead forms)
- `/pricing`, `/about`, `/privacy`, `/terms` (markdown in `content/`)
- `/internal` — old landing variant, 404 in production (`src/app/internal/layout.tsx`)

Auth / invite
- `/login`, `/auth/callback`, `/dash`
- `/invite/[token]`, `/invite/[token]/accept` — calls edge fn `invite-campaign-manager` accept (`src/app/invite/[token]/actions.ts:12`)

Onboarding
- `/onboarding` — company admin question flow (section 2)

`/admin/*` (company admin; nav in `src/components/admin/AdminShell.tsx:36-49`)
- `/admin` — setup to-do checklist ("Onboarding" tab, retires when complete; `src/lib/admin/setup.ts`)
- `/admin/analytics`, `/admin/team`, `/admin/team/[memberId]`, `/admin/posts`
- `/admin/brain` — Company Brain (section 3)
- `/admin/media` — shared media library (same component as `/manager/media`)
- `/admin/billing` — plan checkout, monthly creator budget, top-ups, Stripe Connect, Supabase connect

`/manager/*` (campaign manager; nav in `src/components/manager/ManagerShell.tsx:33-40`)
- `/manager` Review home; `/manager/review/[id]`, `/manager/music/[id]`, `/manager/accounts/[accountId]`
- `/manager/briefs`, `/manager/briefs/setup`, `/manager/briefs/week/[id]`, `/manager/briefs/[id]` (brief editor)
- `/manager/creators`, `/manager/creators/[id]`, `/manager/creators/[id]/chat`
- `/manager/library`, `/manager/media`, `/manager/analytics`

`/ops/*` (platform admin; `src/components/ops/OpsShell.tsx:28-31`)
- `/ops` overview, `/ops/companies`, `/ops/companies/[id]`, `/ops/users`, `/ops/users/[userId]`, `/ops/invites`, `/ops/posts/[postId]`, `/ops/kit-demo` (component gallery)

`/api/*` (only four route handlers; everything else is server actions)
- `POST /api/leads` — public lead forms → `public.leads` via service role (`src/app/api/leads/route.ts`)
- `GET /api/stripe/connect` — Stripe Connect OAuth callback (`src/app/api/stripe/connect/route.ts`)
- `POST /api/stripe/webhook` — subscription + budget invoice events (`src/app/api/stripe/webhook/route.ts`)
- `GET /api/supabase/connect` — Supabase OAuth callback (`src/app/api/supabase/connect/route.ts`)

There is no `/api` route for AI. AI runs in server actions (direct OpenAI) or Supabase edge functions (Anthropic).

---

## 2. Company onboarding today

### How a company comes to exist
There is no self-serve sign-up. Ops creates the company in `/ops/companies` (`src/components/ops/companies/NewCompanyModal.tsx:89-138`): Company name, Website, Company admin name, Admin email (+ logo). `src/app/ops/actions.ts:36-100` calls edge fns `ops-create-company` then `invite-campaign-manager` (action `invite`). Admin opens `/invite/[token]`, signs in with Google, lands on `/onboarding` because `profiles.onboarded` is false (`src/app/admin/layout.tsx:49`).

### The question flow
UI: `src/components/admin/onboarding/OnboardingFlow.tsx` (585 lines, one client component, local `useState` only, nothing saved until the very end). Server action: `src/app/onboarding/actions.ts`. Page: `src/app/onboarding/page.tsx` (prefills name from profile → invite `invited_name` → Google metadata; website from `companies.website`).

| # | Step id | Question | Input | Lines |
|---|---|---|---|---|
| 0 | welcome | "Hi {first}, welcome to Noni!" | button | 294-332 |
| 1 | name | "Who are you?" / "How your team sees you inside Noni." | text | 334-353 |
| 2 | role | "What do you do?" | 6 choice cards: Founder, Marketing, Content, Growth, Operations, Something else | 355-379, 43-50 |
| 3 | website | "What's your website?" / "We'll scan your site to learn your company and brand." | text (required) | 381-400 |
| 4 | ugc | "Do you already do UGC marketing?" | Yes / Not yet (Not yet jumps to done) | 402-432 |
| 5 | creators | "How many creators do you have?" | stepper | 434-453 |
| 6 | managers | "And how many campaign managers?" | stepper | 455-474 |
| 7 | selfManager | "Are you the campaign manager?" | Yes / No (only if managers > 0) | 476-508 |
| 8 | download | Get the Noni app | TestFlight/App Store CTA (only if self manager) | 510-555 |
| 9 | done | "That's it." → "Look around" | submits everything, then `/admin?tour=1` | 557-584, 274-292 |

That is the entire survey: 7 answers, of which exactly one (website) is about the company. Nothing about product, audience, goals, voice, competitors, platforms, budget, proof, or what must never be said.

### Where answers go (`src/app/onboarding/actions.ts:30-91`)
- `companies.website`
- `companies.admin_role`, `does_ugc`, `creator_count`, `manager_count`, `self_is_manager` (migration `supabase/migrations/20260812000100_company_onboarding_answers.sql`; the update is unchecked on purpose)
- `profiles.full_name`, `profiles.onboarded = true`

The answers are only used to shape the setup checklist (`src/lib/admin/setup.ts:51-55`) and the dual-role switcher. None of them reach any prompt.

### What is triggered
- Exactly one thing: `callEdgeFunction("research-company", { website })` (`src/app/onboarding/actions.ts:84`), fire and forget; failure only logs.
- `brand-ingest`, `ingest-codebase`, `ingest-features` are never called from web (grep across `src/` finds no reference). They are referenced from the mobile repo (`noni/lib/admin-api.ts`, `noni/lib/onboarding.ts`).
- After the flow: spotlight tour (`src/components/admin/tour/TourHost.tsx`) and the setup to-do on `/admin`. Step 1 "Fill in your company brain" is done only when BOTH the Product and Audience docs are non-empty (`src/lib/admin/setup.ts:42-44`).

### The broken promise
The website step says "We'll scan your site to learn your company and brand", and the done screen says "While we read your website to learn your brand". But `research-company` (`noni/supabase/functions/_shared/companyResearch.ts:149-236`) only writes `company_research` (profile + playbook JSON) and `brand_docs` kind `industry_research`. It never fills `product_truth` or `audience_niche`. So the admin arrives at a Brain page with two empty docs and a checklist telling them to write both by hand, even though the research already extracted `one_liner`, `audience`, `problems`, `features`, `pricing`, `differentiators`.

---

## 3. Company Brain at /admin/brain

Page: `src/app/admin/brain/page.tsx`. View: `src/components/admin/brain/BrainView.tsx` (1015 lines) + `ResearchCards.tsx` (583). Actions: `src/app/admin/brain/actions.ts` (1047) and `research-actions.ts` (117). Read layer: `src/lib/admin/data.ts:440-530, 847-1011`.

Header copy: "Noni writes every hook, script and caption from this. The better it is, the better every brief." (`BrainView.tsx:873-874`)

### Sections, top to bottom (`BrainView.tsx:870-885`)

1. Company logo card (`BrainView.tsx:758`) → `companies.logo_path`, bucket `company-logos`.

2. Two doc cards: Product and Audience (`DocCard` 716, `DocEditorModal` 548-715).
   - A plain textarea in a modal. Placeholder "Write it the way you'd explain it to a new hire."
   - Hints (`BrainView.tsx:57-66`): Product = "What you sell, what it costs, why it wins"; Audience = "Who buys, where they hang out, what they already believe."
   - "Speak": browser `MediaRecorder` → `speakBrainDoc` (`actions.ts:175-195`) → OpenAI transcription → rewrite.
   - "Clean up with AI": `cleanUpBrainDoc` (`actions.ts:162-173`) → `rewriteBrainDoc`.
   - Save: `saveBrainDoc` (`actions.ts:110-160`) writes `brand_docs` with `human_edited: true`.

3. Industry research card (`ResearchCards.tsx:301-425`): website field, Start / Run again, polls `getCompanyResearch` every 4s while `status = running`, shows `stage`. Nine tabs (`ResearchCards.tsx:26-36`): Overview, Audience, Calendar, Insider facts, Problems, Myths, Vocabulary, Post ideas, Sources. Read only: no item can be edited, deleted, pinned or corrected.

4. Learned from your references (`ResearchCards.tsx:462-583`): pattern cards for each Library reference plus the distilled playbook text. Button "Study N new" / "Rebuild playbook" → edge fn `study-reference` `{ backfill: true, distill: true }` (`research-actions.ts:104-117`). Read only.

5. Features card (`FeaturesCard` 227, `FeatureModal` 93-225): add a feature = one sentence ("One sentence. What it does, in the buyer's words.") + up to 6 screenshots (8 MB each). Every add or remove re-ranks ALL features with a vision call and re-stamps "This week's briefs" (`actions.ts:419-434, 513-580`).

6. Noni screenshot library (`LibraryCard` 408): per feature, generate a polished phone or laptop shot with an image model (`makeNoniScreenshot`, `actions.ts:620-715`).

7. Inspiration accounts (`BrainView.tsx:886-1010`): add @handle on TikTok or Instagram, mute, remove. Pulls top 5 posts and labels each with hook + why (`actions.ts:875-930`).

### Data model

`brand_docs` (`noni/supabase/migrations/20260730150000_014_inspiration_engine.sql:6-14`, kinds widened in migration 108)
```
id uuid, company_id uuid, kind text, content text default '', human_edited boolean, updated_at timestamptz, unique (company_id, kind)
kind in ('product_truth','audience_niche','voice','learnings','industry_research','reference_playbook')
```
Web maps `product → product_truth`, `audience → audience_niche` (`actions.ts:41-44`). `voice` and `learnings` exist in the schema but have no editor on `/admin/brain`. Ops sees the raw docs in `src/components/ops/company/CompanyBrain.tsx`.

`company_research` (`noni/supabase/migrations/20260929180000_108_research_and_reference_studies.sql`) — one row per company:
```
company_id pk, website, status ('idle'|'running'|'done'|'failed'), stage, profile jsonb, playbook jsonb, sources jsonb, error, started_at, finished_at, updated_at
```
JSON shapes, quoted from `src/lib/admin/research.ts:5-47`:
```ts
export type ProductProfile = {
  product_name: string;
  one_liner: string;
  industry: string;
  niche: string;
  audience: Array<{ who: string; situation: string }>;
  problems: string[];
  features: Array<{ name: string; what_it_does: string }>;
  pricing: string | null;
  differentiators: string[];
  research_questions: string[];
};

export type IndustryPlaybook = {
  market: { summary: string; trends: string[] };
  audience: Array<{ who: string; moment: string; fears: string[]; their_words: string[] }>;
  calendar: Array<{ when: string; what: string; why_it_matters: string }>;
  insider_facts: Array<{ fact: string; source_url: string | null }>;
  problems: Array<{ problem: string; in_their_words: string; how_it_is_solved_today: string; cost_of_getting_it_wrong: string }>;
  myths: Array<{ myth: string; truth: string }>;
  vocabulary: Array<{ term: string; meaning: string }>;
  product_fit: Array<{ problem: string; how_the_product_helps: string }>;
  alternatives: Array<{ name: string; what_it_is: string }>;
  content_angles: Array<{ title: string; search_phrase: string; hook: string; why: string }>;
  never_say: string[];
};
// sources: Array<{ url: string; title: string }>
```

`reference_studies` (same migration): `id, company_id, url, library_item_id, status, platform, format, caption, transcript, slide_texts jsonb, pattern jsonb, error, created_at, studied_at, unique (company_id, url)`. `pattern` shape (`src/lib/admin/research.ts:49-62`):
```ts
export type PatternCard = {
  topic: string; hook_spoken: string | null; hook_on_screen: string | null; hook_type: string;
  structure: string[]; on_screen_text: string[]; insider_details: string[]; phrases: string[];
  product_mention: string | null; cta: string | null; why_it_works: string; quality: number;
};
```

`brain_features` and `brief_templates` (`supabase/migrations/20260813000300_brain_features.sql`, web repo):
```
brain_features: id, company_id, name, sentence, screenshot_path, score int, reason, rank int, idea_title, idea_example, idea_action, created_at, updated_at
brief_templates: id, company_id, feature_id, week_start date, title, format, type_label, example, description, action, phrase, sort_order
```
`feature_screenshots` (`supabase/migrations/20260813001000_feature_screenshots.sql`): `company_id, feature_id, path, source ('upload'|'noni'), shape ('phone'|'laptop'), sort_order`; bucket `product-features` (public).

`source_accounts` (mobile migration 014) and `source_posts` (`supabase/migrations/20260813000400_source_posts.sql`): `platform, handle, external_id, url, caption, thumbnail_url, views, likes, shares, comments, score, hook, why, format, fetched_at`.

TS view types: `src/lib/admin/types.ts:201-264` (`BrainDoc`, `InspirationPost`, `InspirationAccount`, `FeatureScreenshot`, `ProductFeature`, `BriefTemplate`).

### Embeddings / search
None. No pgvector, no embedding column, no `match_*` RPC, no embedding API call in either repo (grep of `noni/supabase/migrations` and functions for `vector|embedding` only hits an ffmpeg file). The brain reaches the writer as whole text blobs concatenated into the prompt (`noni/supabase/functions/_shared/wp8.ts` ~830-860 loads `companies.settings`, `brand_profiles`, all `brand_docs`, `product_features`, `brain_features`, `feature_screenshots`).

### What is weak or shallow

1. Two free-text boxes are the core. The "brain" the owner authors is two unstructured paragraphs. The rewrite prompt even asks for "a clean 4 to 8 sentence" brief (`src/lib/admin/brain-cleanup.ts:26, 45`), which caps depth by design.
2. Research output is not connected to the docs. The deep dive produces a rich `ProductProfile` and `IndustryPlaybook`, but never pre-fills Product or Audience, and the owner cannot confirm, correct or reject any item. It is display only; errors in it flow straight into generation through `industry_research`.
3. No provenance or confidence. A fact is either owner text or AI text in a blob; only `insider_facts` carry a `source_url`. `human_edited` is one boolean per doc.
4. No structure for the things generation most needs: pricing, proof points and numbers, claims that are allowed vs forbidden, competitors and positioning against each, brand voice, offers/CTAs/links, goals and KPIs, target platforms, creator persona, legal/compliance limits. `never_say` exists only as AI output, with no owner editor. `voice` and `learnings` doc kinds have no web UI.
5. Three overlapping feature stores: `brain_features` (web, sentence + screenshot), `product_features` (mobile, claims approval), and `company_research.profile.features` (AI). No reconciliation.
6. `brief_templates` is a dead end. It is written on every re-rank and shown as "This week's briefs" on the Brain page, but nothing reads it: no reference in `/manager`, in the mobile app, or in any edge function. `source_posts` is likewise only read back into the web feature ranking; no edge function reads it.
7. Two inspiration pipelines. Web scrapes with unauthenticated `tikwm.com` and Instagram's private `web_profile_info` endpoint (`src/lib/admin/inspiration-fetch.ts:89, 142`), which are fragile; the backend uses Apify (`noni/supabase/functions/_shared/scrapeSocial.ts`).
8. Two AI stacks. Web calls OpenAI directly with prompts living in the web repo; the backend uses Anthropic. Prompts, guardrails, logging and cost tracking are split.
9. No versioning or history, no "what changed", no completeness score. The setup step passes on any non-empty text in both docs.
10. Re-rank on every feature add downloads every screenshot and sends up to 12 images in one request (`actions.ts:342-364`, `feature-analyze.ts:139`); slow and it rewrites names, scores and ideas each time.
11. Only the company admin can edit docs and features (`requireCompanyAdmin`, `actions.ts:68-80`); managers with `manage_brand` can only touch logo, research and references (`research-actions.ts:26-36`).
12. Possible stale RLS: `brain_features`/`brief_templates` select policies reference `profiles.company_id` (migration lines ~55-70), a column later renamed to `active_company_id` (web commit b8d7992). Web reads through the service client so it is not visible in the UI. Not verified against the live DB.

---

## 4. Every AI call made from web

### A. Direct from the Next.js server (OpenAI, raw fetch, `OPENAI_API_KEY`)

| # | Where | Model (fallback) | Prompt summary | In → out |
|---|---|---|---|---|
| 1 | `rewriteBrainDoc`, `src/lib/admin/brain-cleanup.ts:150-182` (prompts 10-46) | `gpt-5.4-mini` → `gpt-5-mini`, chat completions, 1200 tokens | Product guide: category noun, what we sell and cost, problem in buyer words, why we win with proof, named alternative, what not to say. Audience guide: who buys, psychographics, beliefs, language, hangouts, trigger, who it is not for. Keep every fact, invent nothing, no dashes | draft text → rewritten text (not saved until the user saves) |
| 2 | `transcribeBrainAudio`, `brain-cleanup.ts:114-148` | `gpt-4o-mini-transcribe` → `whisper-1` | none | audio blob → transcript, then call 1 |
| 3 | `rankProductFeatures`, `src/lib/admin/feature-analyze.ts:111-196` (prompt 29-52) | `gpt-5.4-mini` → `gpt-4o`, vision, JSON mode, 2500 tokens | "Rank a company's product features for UGC virality"; score 1-100 harshly; per feature also write a brief stamp | Product doc + Audience doc + inspiration digest + up to 12 (sentence, screenshot) → `{features:[{id,name,score,reason,format,typeLabel,title,example,description,action,phrase}]}` → `brain_features` + `brief_templates` |
| 4 | `analyzeInspirationPosts`, `src/lib/admin/inspiration-fetch.ts:192-257` (prompt 181-190) | `gpt-5.4-mini` → `gpt-4o`, JSON | Name the opening hook and why each post traveled | Product + Audience + post captions/stats → `{posts:[{id,hook,why,format}]}` → `source_posts` |
| 5 | `renderNoniScreenshot`, `src/lib/admin/feature-screenshot.ts:50-93` | `gpt-image-1`, `/v1/images/edits`, quality high, 1024x1536 or 1536x1024 | Recreate the referenced screenshot as a flawless UI shot, keep real layout and copy, strip personal data | up to 4 reference images + sentence + 600 chars of Product doc → PNG → `product-features` bucket + `feature_screenshots` |

### B. Edge functions invoked from web (`callEdgeFunction`, `src/lib/edge.ts:32-66`, user JWT as bearer)
Backend model tiers (`noni/supabase/functions/_shared/wp8.ts:201-212`): draft = `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), fast = `ANTHROPIC_FAST_MODEL` (default `claude-haiku-4-5`), research = `ANTHROPIC_RESEARCH_MODEL` (default `claude-sonnet-5-5`) with the `web_search` server tool. Live env overrides not verified. Prompt internals belong to the backend audit; summarized here only.

| Edge fn | Called from | What it does |
|---|---|---|
| `research-company` | `src/app/onboarding/actions.ts:84`; `src/app/admin/brain/research-actions.ts:58` (`{website, force}`) | Returns at once, runs in `EdgeRuntime.waitUntil`. Crawl site → fast tier profiles the product (uses Product/Audience docs if present, first 3000 chars each) → research tier with web search, max 12 searches → playbook JSON + markdown into `brand_docs.industry_research` (skipped if `human_edited`) |
| `study-reference` | `src/app/manager/library/actions.ts:115` (`{library_item_id}`); `research-actions.ts:110` (`{backfill, distill}`) | Scrape (Apify) + transcribe one TikTok/IG reference, fast tier writes a `PatternCard`; draft tier distills all cards into `brand_docs.reference_playbook` |
| `ingest-brief` | `fillBrief`, `src/app/manager/briefs/actions.ts:514-570` | The main writer. Body: `query` (idea) or `url` (example post) or `media_id` (library media), plus `post_type`, `family`, `context`. Returns title, hook_options, talking_points, point_media, hashtags, search_phrase, script, caption, why_it_works, cta, overlay_labels, generation_id, warnings, or `kill_reason` |
| `brief-assist` | `actions.ts:420` `derive_segments`; `actions.ts:756` `regenerate_field`; `src/app/manager/library/actions.ts:363` `port_format` | Split a brief into clips with overlay text; regenerate one field; port one of our finished posts into another post type |
| `brief-review` | `runBriefReview`, `actions.ts:853-879` | AI review: `checks`, `scores {overall, hook, talking_points, cta}`, `tier3 {spoken, worst_line}` |
| `library-link` | `library/actions.ts:67` | Link preview (thumbnail, title) for a pasted reference; no LLM seen in imports |

Non-AI edge calls from web: `publish-campaign`, `notify`, `invite-campaign-manager`, `ops-create-company`, `sync-conversions`.

Never called from web: `brand-ingest`, `ingest-codebase`, `ingest-features`, `auto-fill`, `brief-fill`, `generate-script`, `scrape-trends`, `learn-from-edits`, `vary-copy`, `write-deck`.

---

## 5. Brief / campaign / template / reference UIs on web

All under `/manager` (company admins with `self_is_manager` can use it too).

- Weeks (campaigns): `src/components/manager/briefs/BriefsIndexView.tsx`, `WeekSetupView.tsx` (posts per day, drop date), `WeekDetailView.tsx`. `startWeek`, `saveWeekTargets`, `publishWeek` in `src/app/manager/briefs/actions.ts:109-285`. Publishing checks plan and creator cap, then edge fn `publish-campaign`.
- Brief editor: `src/components/manager/briefs/BriefEditor.tsx` (1681 lines). Fields: title, search phrase, hook options (pick or write your own), talking points with per-point media, script, caption, hashtags, CTA, subtitles toggle, per-clip overlay text and screenshots/recordings.
  - "Fill with AI" modal (`BriefEditor.tsx:1488-1520`): an idea, or an example URL, or a pick from the media library, plus "Optional context for the writer" → `fillBrief` → `ingest-brief`, then `derive_segments`, overlay boxes seeded, idea saved to `library_items`, `snapshot_ai_brief` RPC.
  - Per-field "Regenerate" (`BriefEditor.tsx:434`) → `brief-assist regenerate_field`.
  - "Run AI review" (`BriefEditor.tsx:1200`) → `brief-review`; confirm writes `reviewed_at`, review events and banned phrases (`actions.ts:886-960`).
  - Kill path: the writer can refuse with `kill_reason` ("Generation refused: …").
- Post types: read from `post_types` (`src/lib/manager/briefs.ts:33-40`); no web UI to create or edit them.
- Library: `src/components/manager/library/LibraryView.tsx` (1001 lines). Lanes: Ideas, References, Media, Our posts. Pasting one URL creates a reference with optional notes, fetches a preview and queues `study-reference`. `MakePostModal.tsx` → `makePostFromLibrary` (`src/app/manager/library/actions.ts:529`) fills an empty slot in the planning week via `ingest-brief` or `brief-assist port_format`.
- Media library: `src/components/company/MediaLibraryView.tsx`, `/manager/media` and `/admin/media`. Named screenshots/recordings with a "What it shows" description (`media_library.description`) that the writer reads. Resumable uploads via tus.
- Templates: only `brief_templates` on the Brain page, which nothing consumes (section 3, item 6).
- Admin side has no brief authoring; `/admin/posts` and `/admin/analytics` are read only.

---

## 6. Integrations that could feed a brain

| Integration | State on web | Where | Feeds the brain today? |
|---|---|---|---|
| Website crawl + web research | Live | `research-company` (`noni/.../_shared/crawlSite.ts`, `companyResearch.ts`) | Yes, `company_research` + `industry_research` doc |
| Stripe Connect (company's own Stripe) | Live, OAuth `read_write` scope, read only in practice | `src/app/api/stripe/connect/route.ts`, `src/lib/admin/billing.ts` | No. Only sales analytics via `sync-conversions`. Products, prices, plan names, top-selling plans, promo codes are all available and unused |
| Supabase OAuth (company's own project) | Live, read only | `src/lib/admin/supabase-connect.ts`, `src/app/api/supabase/connect/route.ts`, `SignupTrackingCard.tsx`; refresh token to Vault via `set_supabase_refresh_token` RPC | No. Only daily sign-up counts from `auth.users` |
| TikTok / Instagram inspiration handles | Live | `src/lib/admin/inspiration-fetch.ts` (tikwm + IG web endpoint) | Partly: only the web feature ranking reads `source_posts` |
| TikTok / Instagram reference posts | Live | Library → `study-reference` (Apify + transcription) | Yes, `reference_playbook` doc |
| Screenshots | Live | Brain features, media library | Yes, `brain_features` + `media_library.description` |
| Voice note | Live | Brain doc editor | Yes, into the two docs |
| GitHub / codebase | Not on web | edge fn `ingest-codebase` exists, mobile only | No web UI at all |
| Feature ingest from site | Not on web | edge fn `ingest-features`, mobile only | No |
| Brand ingest (voice etc.) | Not on web | edge fn `brand-ingest`, mobile only | No |
| App Store / Play links | None | Only Noni's own app link (`NEXT_PUBLIC_IOS_APP_URL`) | No field for the company's app listing, reviews or screenshots |
| Uploaded documents (PDF, deck, brand guide, docs) | None | — | No upload, no parsing |
| Company's own social accounts | None on web | creators connect accounts in the app (`social-connect`) | No field for the company's own TikTok/IG/X/YouTube |
| Own post performance | Displayed | `/admin/analytics`, `library_our_posts` RPC | Not written back into the brain from web (backend `learn-from-edits` / `learnings` doc not surfaced) |
| Leads | Live | `/api/leads` → `public.leads` (name, email, company, website, message, source) | Not linked to company creation; ops retypes it |

---

## 7. Design system and UI conventions

- Tailwind 4 with tokens in `src/app/globals.css` (`@theme` blocks, lines 18-198), mapped from `design_handoff_*/tokens/*.css`. Rule from the handoff: never hardcode a hex that exists as a token.
  - Color: `ink`, `ground` (#f7fafd page), `line`, `fill-quiet`, `blue-50…700` (primary `blue-500` #1ba6ee), `slate-300/400/500`, status `amber`, `green`, `danger` each with `-soft`.
  - Radius: `rounded-ops-sm/md/xl`, `rounded-pill`. Shadow: `shadow-card`, `shadow-raised`, `shadow-accent`. Focus: `var(--ring-focus)`.
  - Motion: `animate-om-rise` (step change), `animate-om-pop` (modals, hero), `animate-om-fade`; easing `ease-om`, 160ms.
- Fonts (`src/app/layout.tsx`): Manrope body, Syne display (marketing only, self-hosted), Poppins for the app surfaces via the `font-ops` utility. Onboarding and dashboards are `font-ops`.
- In-house kit, `src/components/kit/` (`index.ts`): `Card`, `Pill` (variants primary/tint/quiet/danger/ghost, sizes sm/md), `Chip` (tones), `Field` (label + text input only), `Label`, `Modal` (portal on `document.body`, Esc closes, default width 460), `Tabs`, `PageHead`, `Avatar`, `HoverPeek`, `CommandSearch`, `SortDropdown`, `FiltersDropdown`, `AreaChart`, `BarRow`, `MonthCal`. Live gallery at `/ops/kit-demo`. Icons: `lucide-react` only.
- Missing from the kit (hand-rolled per screen today): textarea, select, checkbox, radio, multi-select chips, slider, file drop zone, toast, progress bar. `ChoiceCard`, `CountPicker` and `OnbStep` are private to `OnboardingFlow.tsx:65-238` and would need extracting to reuse.
- Onboarding pattern (`design_handoff_admin_app_web/README.md`, `AdminOnbFlow.jsx`): one question per screen, 440px column, top aligned, segmented progress dashes, 28px bold question, 14.5px slate subtitle, text steps use a full-width primary `Pill` "Next", choice steps flash blue and auto-advance after 120ms with no checkmark and no Next, quiet text "Back".
- Typography habits: explicit pixel sizes (`text-[14.5px]`), `font-bold` / `font-semibold`, negative tracking on headings, `whitespace-nowrap` on pills and tabs. Copy: sentence case, no em or en dashes (also enforced in prompts).
- Forms: no form library and no schema validation. Controlled `useState` inputs, server actions returning `{ ok: true } | { ok: false; error: string }`, `useTransition` for pending, inline `text-danger` error line, `revalidatePath("/admin", "layout")` after writes. Long jobs: action starts the job, client polls a read action with `setInterval` (4s).
- Shell: 236px sidebar, top center ⌘K search, content max width 1100, mobile drawer. Tour anchors use `data-tour="…"` attributes.
- Mock mode: `NODE_ENV=development` + `ADMIN_QA_MOCK=1` serves `src/lib/admin/mock-data.ts` and mutations write the mock in place; new screens are expected to support it. `qa-screens/adm-drive.mjs` drives screenshots.
- Design handoff folders in the repo: `design_handoff_admin_app_web`, `design_handoff_ops_console`, `design_handoff_pricing_plans`, `design_handoff_landing_page`. Per project memory, later v2 specs live outside the repo in `~/Noni Design System`.

---

## 8. Deployment and env conventions

- Hosting: Vercel (`.vercel/` linked, `README.md`), deploys on push to `master` (per project memory; no CI config in the repo). `next.config.ts` only raises the server action body limit to 8 MB, which is the ceiling for screenshot and audio uploads through actions.
- Supabase project is shared with mobile (ref in `SUPABASE_ACCESS.md`). Three clients:
  - Browser: `src/lib/supabase/client.ts`, anon key, PKCE. Used for auth, realtime, direct storage uploads.
  - Server (cookie session, RLS applies): `src/lib/supabase/server.ts`.
  - Service role (bypasses RLS): `src/lib/supabase/service.ts`. Convention: gate in the action first (`requireCompanyAdmin`, `requireBrainAccess`, `requireManager`), then use the service client and always filter by `company_id` by hand. Most brain and brief writes go this way, so RLS is not the safety net on web.
- Edge functions: `callEdgeFunction` posts to `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/<name>` with the user's access token. Edge `authenticate` reads `profiles.role` and maps `admin`/`company_admin` to `campaign_manager` (`noni/supabase/functions/_shared/wp8.ts:154-172`).
- Env names (values not printed). Public: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_IOS_APP_URL`, `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_BOOKING_URL`. Server only: `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` (4), `STRIPE_CONNECT_CLIENT_ID`, `SUPABASE_OAUTH_CLIENT_ID`, `SUPABASE_OAUTH_CLIENT_SECRET`, `PLATFORM_ADMIN_EMAILS`, `ADMIN_QA_MOCK`.
  - `SUPABASE_OAUTH_*` and `STRIPE_CONNECT_CLIENT_ID` are used in code but `SUPABASE_OAUTH_*` is missing from `.env.example` and both are missing from local `.env.local`, so those flows only work where Vercel has them.
  - There is no Anthropic key on web. Anthropic, Apify and transcription keys live in Supabase edge function secrets.
- Migrations: the web repo has its own `supabase/migrations/` (11 files, Aug 2026: onboarding answers, billing, `brain_features`, `source_posts`, `feature_screenshots`, pricing) alongside the mobile repo's 140. They are not auto-applied; applied by hand through the Management API (`SUPABASE_ACCESS.md`, `AGENTS.md`). `src/lib/supabase/database.types.ts` (5135 lines) is regenerated from the live schema. New tables for the brain should pick one repo as owner.
- Framework notes: `AGENTS.md` warns Next 16 differs and to read `node_modules/next/dist/docs/`. Middleware is `src/proxy.ts` exporting `proxy`. `cookies()` is awaited.

---

## 9. Gaps: what a great onboarding + brain needs that is not there

Onboarding
1. A survey about the company. Today zero questions cover product, customer, goal, voice, competitors, platforms, proof or limits.
2. Use the scan while the owner is still in the flow. Research is kicked off only on the last click. Start it at the website step and turn later steps into "we found this, confirm or fix it" using `ProductProfile` (one_liner, audience, problems, features, pricing, differentiators).
3. Pre-fill Product and Audience from research so the checklist step is a review, not a blank page.
4. Save progress. All state is in React memory; a refresh loses everything, and nothing is persisted per step. No resumable or revisitable survey, and the raw answers are not stored as a record.
5. Adaptive follow-ups (SaaS vs consumer app vs marketplace; has app store listing or not; B2B vs B2C).
6. Source connectors inside onboarding: app store URL, the company's own social handles, competitors, a few posts they love, document upload (deck, brand guide, positioning doc), GitHub. Edge functions for codebase, features and brand ingest already exist but have no web entry point.
7. Reuse what is already connected: Stripe (products, prices, best-selling plan) and Supabase are OAuth-connected for analytics only.
8. Self-serve company creation. Today ops must create the company and invite the admin; the lead form data is not carried over.
9. Goals and constraints: what a post should drive (sign-ups, installs, sales), the CTA and link, offers and promo codes, regulated-claims limits, words never to use.

Brain
10. A structured, typed knowledge model (facts with category, source, confidence, owner-verified flag, timestamps) instead of two blobs plus a read-only JSON. Per-item edit, approve, reject, pin.
11. Provenance everywhere: which answer, page, document or post each fact came from.
12. One feature model in place of `brain_features` + `product_features` + `profile.features`.
13. Owner-editable voice, never-say list, proof points, competitors, pricing, CTAs. `voice` and `learnings` kinds exist with no web editor.
14. Retrieval. No embeddings or search exist; everything is stuffed into the prompt. A larger brain needs selection per brief.
15. A learning loop visible to the owner: what the brain learned from edits, reviews and post performance, with the ability to correct it.
16. Completeness and freshness: a score, "what's missing" prompts, stale-research detection, scheduled re-crawl, change history and versions.
17. One AI stack. Move the five direct OpenAI calls behind the same backend as the writer so prompts, models, logging and cost live in one place; retire the scraping shortcuts in `inspiration-fetch.ts` in favor of the backend scraper.
18. Wire or delete dead outputs: `brief_templates` and `source_posts` are produced and never consumed by the writer.
19. Permissions: let managers with `manage_brand` edit the brain, not only the admin.
20. Kit additions needed for a richer survey: textarea, multi-select chips, file drop, progress, toast; extract `OnbStep`, `ChoiceCard`, `CountPicker` from `OnboardingFlow.tsx`.
