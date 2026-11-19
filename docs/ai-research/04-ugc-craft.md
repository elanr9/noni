# 04 — UGC Craft Knowledge Base: Short-Form Video for Apps and SaaS (TikTok + Instagram Reels)

Compiled 18 November 2026. Purpose: source material for system prompts and judge rubrics for an AI that writes, edits and analyses UGC-style short-form video for SaaS and consumer apps.

## How to read this document

Every claim carries one of four evidence labels. Keep the labels when distilling; they tell a prompt writer how hard to lean on a rule.

- **[OFFICIAL]** Stated by the platform or regulator (TikTok help center, Instagram/Mosseri, FTC). Read directly in this pass unless marked "via secondary".
- **[DATA]** A study with a stated sample (Buffer, AppsFlyer, Billo, OpusClip). Mostly vendor-run; method quality varies.
- **[OPERATOR]** Reported by named founders/operators running app UGC programs, mostly collected in the Airbridge UGC Handbook (which itself compiles Superwall, Sub Club and RevenueCat interviews). Self-reported, small-n, survivorship-biased, but the most specific evidence available.
- **[HEURISTIC]** Practitioner consensus or my synthesis. No measured backing. Use as defaults, not laws.

Two global caveats:

1. Almost everything published on this topic is written by a vendor selling UGC tools, analytics or creators. Numbers such as "84% of views are predicted by second 3" or "UGC performs 93% better" have no traceable source and are deliberately excluded.
2. I could not verify playbook details for several apps commonly cited in this space (Turbo AI, Quittr, Umax, Rizz). Where they appear below it is only for what a source actually said.

---

## 1. The landscape: what "UGC" means for apps in 2025–2026

### 1.1 Seven distinct things people call "UGC"

| Mode | What it is | Who posts | Job | Typical economics |
|---|---|---|---|---|
| **Organic creator-account program** ("UGC farm", "creator army") | 5–60+ hired creators each run a new account dedicated to the app, post 1–2x/day in a proven format | Creator, on a fresh account (sometimes brand-owned logins) | Cheap top-of-funnel reach; format discovery | $15–50/video or ~$500/month base + view bonuses |
| **Influencer integration** | Existing creator with an audience posts about the app on their main account | Creator's main | Trust transfer to a tight community | Flat fee, hundreds to thousands per post |
| **Paid UGC ads** | Creator-made video run as an ad from the brand handle | Brand ad account | Direct-response installs | $150–500/video (vendor estimate) + media |
| **Spark Ads (TikTok) / Partnership Ads (Meta)** | Paid spend behind the creator's original post, from the creator's handle | Creator handle, brand pays | Amplify organic winners with social proof intact | Media spend; creator authorization |
| **Founder-led** | Founder films on own or brand account | Founder | Cheapest hook testing; trust asset | Time only |
| **Faceless / slideshow** | Photo carousels, text-on-B-roll, screen recordings; no on-camera person | Brand-run multi-account | Volume at near-zero cost | Tool cost |
| **AI-avatar UGC** | Synthetic presenter or digital twin | Brand | Variant generation, localization | ~$20/variant vs ~$500 human (one app's figure) |

Cal AI's founder draws the cleanest line between the first two: UGC is "mass spray and pray" on volume; influencer marketing is "a sniper approach" aimed at tight communities [OPERATOR, via secondary]. An AI system should know which one it is writing for, because the scripts differ: an influencer integration leans on the creator's existing voice and audience; a creator-account video has zero audience trust and must earn the watch from a cold start.

### 1.2 How the organic creator-account program actually runs [OPERATOR]

- **The unit of work is a format, not a video.** Find one format that works, hold its mechanics fixed (hook mechanic, length, audio, shot order), and vary only angle, opening line and situation. One $2M/yr app founder: "80% has to be copying what's already gone viral, because that's what's going to go viral again." The other ~20% is new experiments.
- **Hit rate is low and that is normal.** Tolan (AI companion): "one out of maybe 20 videos kind of pops off." Locket: ~10% of videos beat the median by 10x, ~3% by 50x. Nomad Table: 5–10K average views, roughly 1 in 10 past 500K. In paid, one team found 1 in 85 creatives was a true winner. Commit to 20+ variations of a format before judging it.
- **Founder films first, creators remake winners.** Jay (Nomad Table: ~60 creators, 44M views/month, ~$65K/month) tests every hook on his own account and "only [has] creators remake the ones that hit." A paid creator video that flops costs $2–3K in some deals; a founder flop costs an afternoon.
- **Scale by adding accounts, not posts per account.** 1–2 posts/day per account is the norm. One founder posted 9x/day on Instagram without penalty but the same volume cut TikTok views sharply.
- **Rollout sequence (Locket, per Shortimize):** small influencers on their own profiles → internal growth team posts the same format daily → hire dedicated creators for the format, cut weak accounts, double down on strong ones. Validate a format on a second account before hiring for it.
- **Account profile:** a person's photo, never a logo; name can be real or random; brand may be in the bio. New accounts warm up 3–5 days (scroll, like, comment in-niche at human speed) before the first post; the exact number of days is admitted to be "a little arbitrary."
- **Sourcing creators:** 2K–10K followers, 1–5 videos over 100K views, face on camera, not already saturated with UGC work. US-based college students are the dominant labor pool (Sideshift claims ~150K). Larger apps poach; pure-CPM pay burns creators out.
- **Team size:** Coconote kept the creator team small ("Navy SEALs, not the Navy") and met each creator 1:1 to share what converts.

### 1.3 Pay structures [OPERATOR]

| Model | Numbers reported | Notes |
|---|---|---|
| Flat per-video test | $15–20/video for 3–5 videos | The standard "crawl" stage |
| Experienced creator per-video | $30–40, up to $50 | |
| Monthly base + bonus | ~$500/month for 5–7 posts/week | Described as the April 2026 going rate |
| Threshold bonuses | $100 per 100K views; $250 per 250K | |
| Milestone ladder (Halo AI) | $20 base; +$60 at 20K, +$200 at 100K, +$500 at 500K, +$800 at 1M views | Averages under $1 CPM; 29 of 30 creators chose it over a slightly higher straight CPM |
| CPM with cap | ~$1 per 1,000 views | Must be capped |
| Rev share + vested equity | Fitted: one creator drove ~95% of 500M+ views / 600K downloads, moved from $20/video to rev share + equity | Only for proven top 1–2 creators |

**The disagreement that matters:** Lightreel's guide treats view bonuses as the core incentive; the Airbridge handbook and David Barnard (Sub Club) argue per-view pay "backfires" because it rewards entertaining content that does not convert, and is uncapped. Reconciliation: a small base plus capped view tiers, with conversion data fed back to creators every two weeks, and Spark-boosted views excluded from bonuses. Never uncapped per-view.

### 1.4 Views are not revenue: the "toy trap" [OPERATOR]

- Coconote's side product pdftobrainrot got one video to 41M views / 4.5M likes and across 100–200M views produced ~3,000 trials and ~$25K. Diagnosis from the co-founder: "framing your product as a novel toy and not a solution to a problem."
- Nomad Table: a 300K-view video with 174 likes and 8 comments. The clickbait hook held watch time, then the video cut to an app and nobody cared.
- **Toy test:** would people share this video without wanting the product? If yes, the framing is wrong.
- **Problem sentence every video must make legible in the first seconds:** "My app kills (expensive, annoying problem) for (specific person)."
- **Leading indicator of conversion:** "what's the app?" comments. Their absence means views will not convert.
- **Engagement rate** = (likes + comments + saves + shares) ÷ views. Sideshift's thresholds: ≥7.5–8% good, >12% viral, <5% kill. (Derived from TikTok Spark work; treat as directional elsewhere.)

### 1.5 Apps and their documented playbooks

| App | What is documented | Confidence |
|---|---|---|
| **Cal AI** (calorie tracking; acquired by MyFitnessPal Dec 2025) | Influencer-first, 150–300+ fitness creators, ~50K follower minimum, tight communities. Creator discovery by training a fresh TikTok account on fitness content and DMing everyone the feed surfaces. Influencers took it to ~$2M/month, then plateau; paid ads on IG/TikTok/FB broke the ceiling. | Medium; revenue figures conflict across sources |
| **Coconote** (AI notes; ~$6.7M ARR, acquired by Quizlet) | Small creator team; 18M-view video = short hook → few seconds of lecture hall → app. Organic winners did not convert as ads; agency recuts did better but never hit first-purchase profitability. | Medium-high (founder interviews) |
| **Locket** | Three-beat format: face to camera 2–3s → hook text overlay → screen recording of the app. Influencers → employees → dedicated creators. | Medium (third-party analysis) |
| **Tolan** (AI companion) | Many angles (cooking, makeup, relationship talk) showing the AI inside everyday habits; mix of per-video and retainer creators; ~1 in 20 pops; one cooking video ~10M views. | Medium |
| **Nomad Table** | On-screen text hooks ("imagine being scared of solo traveling when this literally exists") that work across creators regardless of acting ability; 3-second retention as the gating metric. | Medium (single founder) |
| **Fitted** (AI closet) | One creator, rev share + equity, 500M+ views. | Medium |
| **Massive** (job applications, ~$2M ARR) | "Stop using LinkedIn to apply to jobs" pulled the right audience; "Stop using Indeed" pulled a hostile, wrong one. The named incumbent selects the audience. | Medium |
| **Pushcroll** | Odd visual scenarios (push-ups at 2 a.m., in the rain), product demo by second 2–3. | Medium |
| **Photogenic** | One creator, 46 posts, 35M views; App Store page conversion reportedly rose from 5–10% to 50%+. | Low-medium (secondhand) |
| **Casper's app** | Never says the app name aloud; "comment [keyword] and I'll send it" drew ~13K comments, ~50% of requesters clicked, ~6.7–7% download-to-paid. | Medium |
| **Mojo** (video editor) | Best ad: 30s split-screen of their PM explaining over a screen recording, 23% trial-to-paid. Detailed AI-avatar tests (see 1.6). | Medium-high (RevenueCat guest post) |
| **Natal** (postpartum fitness) | Founder-led, unflattering clips, replies to every comment/DM within 24h; self-reported 17% download-to-trial vs 6% category average. | Low-medium (self-reported, not causal) |
| **Duolingo** | Brand-owned mascot entertainment; a different game (brand affinity, not creator-army UGC). | High that it happened; low transferability |
| **Tea** (dating safety) | Investigated by Indicator: a dozen-plus sole-purpose accounts, one creator ~300 confession-style videos in ~8 months, 60M+ views, no paid-partnership labels. Content removed after TikTok was contacted. | High (journalism) |

Formats reported as currently working for apps (Lightreel weekly report, early Nov 2026; vendor, directional): prank-as-demo (AI app generates something fake, the reaction sells it), scan-and-score reveals, performative-distress alarm-app challenges, GRWM hybrids for language apps, competitor-critique stories ("Discord doesn't want you to know this"), story-drama where the app is revealed after the payoff. Reported as cooling: generic mini-vlogs, "come with me", numbered advice lists ("three things I learned"), and polished endorsement language.

### 1.6 AI-avatar UGC: what the one detailed test shows [OPERATOR — Mojo]

- Fully synthetic invented presenters: "80% failure rate." Causes: studio staging, stock-model casting, lip-sync errors. One 0.2-second sync slip on a key word cut click-through 68%.
- What worked: a digital twin of the real person whose human video had already won, matched to his raw facecam framing. 87% of the human conversion rate at ~$20 vs ~$500, 31% lower CPA. Dubbing the original into Portuguese beat local creators re-shooting it (40% lower acquisition cost) because timing, pauses and gestures were preserved.
- Rule: "Use AI to explain, and use humans to convince." Walkthroughs, demos and tutorials tolerate AI; testimonials, storytimes and founder intros do not.
- Worked in Brazil and Spanish-speaking markets, failed in France and Germany.
- Deliberately degrade: slightly lower resolution, keep room tone. Flawless output reads as a commercial.
- Vendor field data elsewhere claims AI UGC reaches 85–110% of human CTR with the gap appearing at conversion, and that teams use AI for hook testing and humans for scaling [DATA, weak].
- Disclosure is covered in section 6.8.

**Sources (section 1):**
- https://www.airbridge.io/en/resources/handbook/ugc (lessons 01, 04, 05, 06, 07, 09, 10, 11, 13)
- https://lightreel.ai/blogs/ugc-guide
- https://lightreel.ai/blogs/viral-ugc-trends
- https://www.shortimize.com/blog/locketapps-tiktok-influencer-strategy-for-gaining-250m-views
- https://www.netinfluencer.com/cal-ai-founder-zach-yadegari-breaks-down-the-influencer-playbook-behind-his-apps-growth/
- https://founder-playbooks.pages.dev/insight/influencer-to-paid-ads-growth-ladder
- https://indicator.media/p/crying-girls-will-make-you-rich-how-marketers-trick-users-with-mass-produced-organic-content-ugc-und
- https://playkit.substack.com/p/ai-companion-app
- https://segwise.ai/blog/ai-ugc-vs-human-ugc-meta-ads-roas-2026

---

## 2. Format taxonomy

Conventions used below: timings assume a 20–35 second video unless stated. "Product moment" = first frame the app is visible. Example hooks are illustrative and written for invented apps; they are templates, not quotes, unless attributed.

One finding to hold above the whole taxonomy: AppsFlyer's analysis of 1.1M ad creatives ($2.4B spend) found that for social apps, tutorial and app-review formats delivered 45% higher installs per mille and 17% better day-7 retention than testimonials, while testimonials still received most of the budget [DATA, via Airbridge]. Teams fund familiar formats, not the best ones. Demonstration beats assertion.

### 2.1 Talking-head story / confession
- **Beats:** 0–2s cold open mid-moment ("So I got called into my manager's office...") · 2–10s stakes and the specific bad moment · 10–20s turn: what changed · 20–28s product shown in use, one concrete result · 28–32s soft close or loop line.
- **Why it works:** narrative gap; viewers identify with the problem before any pitch. Best when the product is not visually scroll-stopping.
- **Use when:** emotional or socially consequential problem (money shame, relationship, health, career).
- **Hooks:** "I almost got fired over a spreadsheet." · "I haven't told my boyfriend how much debt I'm in."
- **Footage:** single handheld selfie take, eye-level, real room; 2–4s screen insert.
- **Fails when:** slow intro ("hey guys so"), story is not specific, the pivot to product sounds like an ad read, the benefit is asserted rather than shown. Fabricated personal stories are both a trust and a legal problem (section 6.8).

### 2.2 "I found this app" discovery
- **Beats:** 0–2s discovery claim + phone toward camera · 2–6s the annoying old way · 6–18s screen recording of the one magic action · 18–25s reaction/result · close.
- **Why:** "gatekept secret" curiosity plus instant proof. "Today years old when I found out..." is reported to break out more than "you need to try this" or "my newest obsession."
- **Use when:** the app has a single visually obvious magic moment.
- **Hooks:** "The budgeting app nobody talks about." · "Today years old when I found out you can scan a syllabus."
- **Footage:** selfie + clean screen recording; over-the-shoulder phone shot.
- **Fails when:** it lists features, the magic moment takes more than ~5 seconds to land, or the delivery uses endorsement adjectives ("amazing", "obsessed").

### 2.3 Problem–agitate–solution (PAS)
- **Beats (30s):** 0–3s hook naming the person and pain · 3–10s agitate with one vivid consequence · 10–22s solution demo + proof · 22–28s second benefit or objection · 28–30s CTA.
- **Why:** the direct-response default; maps cleanly to ads.
- **Use when:** paid ads, or organic where the audience already feels the pain.
- **Hooks:** "If you forget everything you studied the night before, this is for you." · "Stop tracking your workouts in the notes app."
- **Fails when:** agitation is generic, or the solution is introduced before the viewer agrees they have the problem. Sources disagree on proportion: one guide gives problem ~5s of 30, another 12–15s of 30. Default: agitate only until the pain is specific, then move.

### 2.4 Green-screen over screenshot / article / comment
- **Beats:** 0–2s creator in lower third pointing at the artifact; the artifact is the visual hook · 2–8s read or react to the key line (highlight it) · 8–20s take or explanation · 20–28s swap background to the app as the answer.
- **Why:** the artifact supplies proof and novelty in frame one; reads as native commentary. Instagram explicitly counts green-screen commentary as original transformation.
- **Use when:** there is a headline, stat, tweet, review, pricing page, competitor screen, or user comment worth reacting to. Excellent for SaaS and finance.
- **Hooks:** "This one line in my lease cost me $1,400." (lease on screen) · "Okay, why is nobody talking about this chart."
- **Footage:** legible screenshot cropped to the relevant line, creator cutout bottom-left or bottom-right occupying ~1/3 of frame.
- **Fails when:** screenshot text is unreadable at phone size, the creator covers the important line, or the background never changes.

### 2.5 Reply-to-comment
- **Beats:** 0–2s comment sticker on screen, creator reads or reacts to it · 2–20s answer by showing · close with invitation for the next question.
- **Why:** built-in social proof and context; turns "what's the app?" into the next video; generates a series.
- **Use when:** a prior video produced questions, skepticism or objections. Objection comments ("this is just ChatGPT", "is it free?") make the best prompts.
- **Hooks:** "'There's no way this works on handwriting.' Okay, watch."
- **Fails when:** the comment is obviously planted or too flattering, or the reply does not actually answer it.

### 2.6 POV / skit
- **Beats:** 0–2s "POV:" text sets the situation · 2–12s enacted moment, one or two characters played by the same person · 12–20s turn where the app changes the outcome · tag line.
- **Why:** relatability and shareability ("this is so you"). Sends are a top Reels signal.
- **Use when:** the pain is a recognizable social or workplace situation. The main vehicle for making B2B relatable.
- **Hooks:** "POV: your manager asks for the report you forgot existed." · "POV: you're the friend who always splits the bill."
- **Fails when:** the joke works without the product (toy trap), acting is forced, setup runs past ~5s. B2B operators caution that skits should sit on top of proof content, not replace it.

### 2.7 Listicle ("3 apps that...")
- **Beats:** 0–2s promise with number and audience · each item 5–8s with screen recording · the promoted app in slot 2 or 3, never slot 1, and given the best demo · close on save prompt.
- **Why:** save-worthy; the app borrows credibility from genuinely useful neighbors.
- **Use when:** search-driven categories (study, productivity, AI tools, travel).
- **Hooks:** "3 apps that feel illegal to know as a nursing student." · "Websites I'd gatekeep if I were still in college."
- **Fails when:** the other items are filler or fake; the list is long; generic numbered advice ("three things I learned") is reported as a cooling format, so the list must be of specific tools or finds, not advice.

### 2.8 Screen-recording demo with voiceover
- **Beats:** 0–2s the end result on screen first · 2–5s "here's how" · 5–22s three or four taps, each punched-in · 22–28s result again · CTA.
- **Why:** highest information density; proves the claim. Mojo's best ad was a PM explaining over a screen recording (split-screen), 23% trial-to-paid.
- **Use when:** SaaS, AI tools, anything with a visible output. Tolerates AI voice or a digital twin better than any other format.
- **Hooks:** "This is my whole week of meals, planned in five minutes." · "Watch me turn a 40-page PDF into flashcards in 30 seconds."
- **Footage:** native-resolution screen capture, cursor or tap indicators, zooms on the tapped element, optional picture-in-picture face.
- **Fails when:** it starts on a login or home screen, shows full UI at unreadable scale, narrates clicks instead of outcomes, or includes loading time.

### 2.9 Before/after transformation
- **Beats:** 0–2s the "after" (result first) · 2–6s cut to "before" · 6–18s process with the app · 18–24s after again, held slightly longer.
- **Why:** frame one answers "why should I care"; the reveal-process-reveal structure is spreading across categories.
- **Use when:** there is a visible or numeric delta (screen-time, savings balance, inbox, physique, room, grade).
- **Hooks:** "My screen time in January vs now." · "He said no, so I did it anyway." (conflict-before-transformation variant)
- **Fails when:** the delta is implausible, the "perfect life" casting undermines belief, or the category prohibits it (health, finance claims; section 9).

### 2.10 Reaction / duet / stitch style
- **Beats:** 0–3s the source clip's strongest second (or a split-screen) · 3–5s interrupt: "Wait." · 5–20s take, correction or demonstration · close.
- **Why:** borrows a proven hook; the reaction itself can be the demo ("prank-as-demo").
- **Use when:** there is a viral clip, a common bad-advice video, or a result worth reacting to. Filming someone's real reaction to the app's output is the strongest variant.
- **Fails when:** the borrowed clip does the work and the added content is thin. On Instagram, accounts that mostly repost others' content lose recommendation eligibility; the reaction must be substantive.

### 2.11 Day-in-the-life integration
- **Beats:** 0–2s a specific identity + time stamp ("6:40am, ICU nurse, night 3") · 4–6 quick routine beats of 2–3s each · the app appears as one beat, in use, without comment or with one line · end of day.
- **Why:** aspirational routine; the product reads as part of a life rather than a pitch. GRWM hybrids (language practice while doing hair) are a current working variant.
- **Use when:** habit apps, productivity, health, language, finance check-ins.
- **Fails when:** generic. Generic mini-vlogs and "come with me" framing are reported as cooling; winners have an event, unusual access, or a specific identity.

### 2.12 Text-on-screen with trending sound (no talking)
- **Beats:** 0–1s visual + one line of text · 1–7s hold or one cut, optional second line as payoff · product visible in-frame or as the second shot. Often 6–12s total and designed to loop.
- **Why:** lowest production cost; any creator can execute; text hooks transfer across creators regardless of acting. Nomad Table's best performers were on-screen text hooks.
- **Use when:** creator armies with mixed on-camera ability; relatable one-liners.
- **Hooks (text):** "imagine being scared of solo traveling when this literally exists" (Nomad Table, attributed) · "me after finding out my friends can see how much I've been procrastinating"
- **Fails when:** more than ~15 words on screen, text in the UI zone, or a trending track used on a business account without rights (section 5.7).

### 2.13 Photo slideshow / carousel
- **Beats:** Slide 1 hook (decides whether slide 2 is ever seen) · slides 2–5 substance, one idea each · app as one of the tips on slide 3–5 of ~6–7, never slide 1 · last slide close/save prompt. 5–8 slides is the commonly recommended range.
- **Why:** swipes and dwell count as engagement; saves; near-zero production; scales across many accounts. On Instagram, Buffer reports carousels earn about double the engagement rate by reach of Reels (6.90% vs 3.31%) but less reach [DATA, via secondary].
- **Use when:** tips, lists, "things I wish I knew", relationship/astrology/self-improvement niches, aesthetic categories.
- **Hook slide examples:** "Things that got me from a 2.8 to a 3.9" · "Texts to send when he goes quiet"
- **Footage:** Pinterest-style or own photos; consistent text style; one short line per slide readable in ~2 seconds.
- **Fails when:** the list is fake and only exists to carry the app; walls of text; app on slide 1. All structural numbers here come from tool vendors; no founder-published conversion data was found. Confidence: low-medium.

### 2.14 Street interview
- **Beats:** 0–2s the question on screen and asked aloud, mid-stride · 2–15s 2–4 rapid answers, cut on the punchline · 15–25s the turn: interviewer shows the app or the subject uses it and reacts · close.
- **Why:** strangers' reactions are social proof; high visual energy.
- **Use when:** the app produces an instant, show-a-stranger result (score, scan, quiz, AI output), or the question exposes a common misconception.
- **Hooks:** "How much do you think you spend on subscriptions a month?" · "What's your screen time? Be honest."
- **Fails when:** answers are staged, audio is poor, or the product arrives as a non sequitur. Requires release/consent. Confidence on app-specific performance: low (no data found).

### 2.15 "Controversial take"
- **Beats:** 0–2s the claim, stated flat · 2–6s "here's why" · 6–20s evidence on screen · 20–28s the alternative (product) · close with a question.
- **Why:** triggers comments; a named incumbent selects the audience (Massive: LinkedIn vs Indeed drew different crowds).
- **Use when:** there is a recognized incumbent with verifiable shortcomings, or a category habit that is defensibly wrong.
- **Hooks:** "Stop using LinkedIn to apply to jobs." (Massive, attributed) · "Discord doesn't want you to know this." (Root, attributed) · "To-do lists are why you're behind."
- **Fails when:** the take is not defensible, the evidence is not shown, or it attracts a hostile non-buyer audience. Comparative claims must be true and substantiable.

### 2.16 Tutorial / how-to
- **Beats:** 0–2s outcome + time promise · steps as numbered on-screen labels, 4–7s each · result · "save this".
- **Why:** search intent, saves, and (per AppsFlyer) the best install and retention profile for social apps.
- **Use when:** the viewer wants an outcome the app is a step in ("how to split rent fairly", "how to study for the MCAT in 6 weeks").
- **Fails when:** it is a feature tour rather than an outcome; steps cannot be followed from the video; no end result is shown.

### 2.17 Founder story
- **Beats:** 0–3s credential-free specific opener ("I quit my job to build an app for people who hate budgeting") · why, anchored in a personal problem · a build moment or number · the product in 3–5s · ask for feedback, not download.
- **Why:** founders are the cheapest hook testers and a trust asset; early users "largely liked him and stayed when the app wasn't perfect" (Nomad Table). Willingness to be on camera is a differentiator as more apps go faceless.
- **Use when:** early stage, build-in-public, or the founder is the user persona.
- **Fails when:** it becomes a vanity revenue flex unrelated to the user's problem, or it is outsourced (Natal's attempts to outsource founder content did not work).

### 2.18 Format selection quick table

| Situation | First choice | Second |
|---|---|---|
| Instant visual magic moment | Discovery / screen demo | Reaction (film someone seeing it) |
| Emotional or private pain | Story/confession | POV skit |
| Search-driven utility | Tutorial | Listicle |
| Known incumbent | Controversial take | Green-screen over competitor |
| Creators can't act | Text + sound | Slideshow |
| Skeptical comments exist | Reply-to-comment | Green-screen over comment |
| "Boring" B2B | POV skit of the pain + screen demo | Green-screen over an artifact |
| Paid ad | PAS, screen demo | Recut of organic winner |

**Sources (section 2):** Airbridge handbook lessons 01, 04, 07; https://lightreel.ai/blogs/viral-ugc-trends; https://viral.app/ugc-course/creators/briefs-and-hooks; https://www.shortimize.com/blog/locketapps-tiktok-influencer-strategy-for-gaining-250m-views; https://appslideshow.com/blog/tiktok-slideshow-ideas-hooks-slide-outlines; https://reelsfarm.com/blog/10-slideshow-hook-formats-that-sell-without-selling; https://www.sweetfishmedia.com/blog/b2b-video-skits-strategy; https://buffer.com/resources/data-best-content-format-social-media/. Beat timings are [HEURISTIC] synthesized from these; no source publishes measured per-format timings.

---

## 3. Hooks

### 3.1 Anatomy: three channels that must agree

A hook is the first 1–3 seconds across three simultaneous channels:

1. **Visual hook** — what is in frame 1. Should land within ~1.5 seconds. Motion, an unusual object, an artifact, a result, a face mid-expression.
2. **Text hook** — on-screen words. 5–10 words. On screen from frame 1 (not animated in late).
3. **Verbal hook** — the first spoken clause. Starts within the first half-second; no breath, no greeting.

**Stacking rules [HEURISTIC]:**
- The three channels should carry complementary, not identical, information: the visual shows the situation, the text names the person or stakes, the voice opens the loop. Text that merely transcribes the voice wastes a channel (captions do that job separately).
- They must never contradict or compete. If the text hook is a full sentence, the visual should be simple.
- The video must still hook with sound off (text + visual) and with eyes off (voice).

**Three jobs a hook must do [OPERATOR — Airbridge lesson 04]:**
1. **Call out the person** (the right one; the named incumbent or situation selects the audience).
2. **Open a loop** (a question the viewer needs closed).
3. **Get to the product fast** (demo visible by second 2–3 in the fastest formats).

**Pre-filming test:** complete "In the first 3 seconds the viewer must think: ___." "That's a cool app" is a failed hook. "That's me" or "wait, why is he doing that?" is a working one. Second test: would a stranger who has never seen this creator keep watching?

**Text beats acting:** on-screen text hooks transfer across creators, including weak actors; on-camera gimmicks (sipping a drink) were dropped.

### 3.2 Hook archetypes with templates

| # | Archetype | Template | App example |
|---|---|---|---|
| 1 | Pain-point callout | "If you [specific painful behavior], this is for you." | "If you re-read the same page four times, this is for you." |
| 2 | Identity qualifier | "If you're a [identity], stop scrolling." / "[Identity]s, you need to see this." | "Night-shift nurses, look at this." |
| 3 | Gatekept secret | "The [category] app nobody talks about." | "The study site my TA told us not to share." |
| 4 | Mistake / warning | "Stop [common behavior]." / "Don't [x] until you [y]." | "Stop using LinkedIn to apply to jobs." |
| 5 | Story cold-open | "[Person] just [did surprising thing]..." | "My roommate just caught me practicing Spanish with my phone at 2 a.m." |
| 6 | Proof-first / result | "This is [result], done in [time]." | "This is my whole week of meals, planned in five minutes." |
| 7 | Lazy hack | "The lazy way to [outcome]." | "The lazy way to stick to a grocery budget." |
| 8 | Discovery | "Today years old when I found out..." | "...you can photograph a receipt and it splits itself." |
| 9 | Skeptic | "I did not expect this to work." / "I thought this was a scam." | Only with a real surprising result. |
| 10 | Honest verdict | "Brutally honest review of [x]." | "Brutally honest review after 30 days of [app]." |
| 11 | Incumbent attack | "[Incumbent] doesn't want you to know this." | Requires displayed evidence. |
| 12 | Imagine/irony | "Imagine being [afraid of / stuck with x] when this literally exists." | Nomad Table's pattern. |
| 13 | POV | "POV: [situation the viewer has lived]." | "POV: you open your banking app after a weekend away." |
| 14 | Challenge / time-box | "Watch me [outcome] in 30 seconds." | "Watch me build a landing page before my coffee's done." |
| 15 | Rate / score | "Rate your [x] from 1 to 10." / scan-and-score | Viewer answers internally. |
| 16 | Direct command | "Don't move." / "Try this with me." / "Count with me." | Tiny compliance action produces the payoff. |
| 17 | Odd-visual curiosity | No line needed; strange scene | Push-ups at 2 a.m. in the rain. |
| 18 | Consequence remains | "The [problem] is gone, but [consequence] isn't." | "I paid the card off. My score still hasn't moved." |
| 19 | Question to the lens | "How much did you spend on food last month? No, actually." | |
| 20 | Number shock | "[Specific odd number] [unit]. That's [what]." | "$312. That's what I was paying for apps I forgot about." |
| 21 | Comment reply | Comment sticker + "Okay, watch." | |
| 22 | Teaser splice | Best 1–2s of the payoff cut to the front | Editing hook; use sparingly. |

Tick openers ("HUH?", "Bro what?") are used by some operators as verbal starters; they are cheap and wear out. Treat as a variant to test, not a default.

### 3.3 What kills hooks

- Greetings, self-introductions, throat-clearing ("Hey guys", "So today I want to talk about").
- Logo, brand intro, or app name in the first second (branded intros appear in ~1% of clips in OpusClip's 13.5M-clip set; practitioners do not use them).
- Starting on a static frame, a blank stare, or silence; nothing moving in the first second.
- A hook that calls out everyone ("Want to be more productive?").
- "That's a cool app" hooks: leading with the product instead of the person or the tension.
- Text that appears after second 1, exceeds ~10 words, or sits under the UI.
- Clickbait that the body does not pay off: holds watch time, destroys engagement and conversion (the 300K-view / 174-like case).
- Endorsement language in the hook ("I'm obsessed with", "game-changer").
- Hook and body mismatch in tone (dramatic hook → cheerful ad read).
- Reusing an exact hook line past its life; formats die and must be copied "before it dies."

### 3.4 Retention thresholds

| Metric | Threshold | Evidence |
|---|---|---|
| 3-second retention, organic TikTok/IG | Kill <60–70%; iterate 70–75%; keep and vary ≥75%; best formats 75–80% | [OPERATOR] one founder's rule (Nomad Table) + Airbridge worksheet. Not a guarantee: he posted a month at 81% with no viral hit. |
| Early skip rate | Pushcroll's best IG video lost only 19% in the first 3s | [OPERATOR] single data point |
| Meta ad hook rate (3s views ÷ impressions) | Average 25.44% across 88,329 Meta sales video ads, H1 2026 | [DATA] Billo |
| TikTok ad hook rate | No benchmark with a published method. TikTok counts 2-second views, so it is not comparable to Meta's 3-second rate. Vendor baseline "25–35%" is unsourced. | Low confidence |
| Engagement rate | ≥7.5% good, >12% viral, <5% kill | [OPERATOR] Sideshift |
| Views vs account average | Boost at 3–5x account average | [OPERATOR] |
| Reels views vs followers | ~10% okay, ≥25% good, ≥1x strong, ≥5x outlier | [HEURISTIC] viral.app |
| Record time | Read 3-second retention ~48h after posting | [OPERATOR] |

Note the two different denominators: organic "3-second retention" is the share of viewers who started the video and stayed; ad "hook rate" divides by impressions. 75% and 25% are not in conflict.

TikTok's own guidance: "prioritize your hook in the first 6 seconds" and "introduce the content proposition in the first 3 seconds"; the SMB playbook calls "the first 3–6 seconds" crucial [OFFICIAL]. The frequently repeated "first 6 seconds capture 90% of ad recall" could not be traced to a TikTok page.

Platform nuance: one founder observes TikTok rewards total watch time more than the hook; "the hook buys 3 seconds; the rest must earn the following seconds" [OPERATOR].

**Sources (section 3):** https://www.airbridge.io/en/resources/handbook/ugc/04-hooks-and-soft-cta; https://www.airbridge.io/en/resources/handbook/ugc/05-founders-film-first; https://viral.app/ugc-course/creators/briefs-and-hooks; https://lightreel.ai/blogs/ugc-guide; https://billo.app/blog/hook-rate-to-hold-rate; https://ads.tiktok.com/help/article/creative-best-practices; https://ads.tiktok.com/business/library/SMB_Creative_Playbook.pdf; https://www.opus.pro/blog/video-editing-tips

---

## 4. Script craft

### 4.1 Spoken-language rules [HEURISTIC unless marked]

- **Write for the mouth.** Read it aloud; if you would not say the sentence to a friend across a table, rewrite it.
- **Sentence length:** mostly 4–12 words. One idea per sentence. Fragments are good. "Three taps. Done."
- **Contractions always.** "I'm", "it's", "didn't". "I am" and "do not" are scripted tells.
- **Reading level:** roughly grade 5–7. Common words. No nominalizations ("the optimization of my workflow" → "I stopped wasting Mondays").
- **Specific beats general:** a number, a name, a place, a time. "$312", "at 2 a.m.", "my anatomy final", "the night before rent was due".
- **Odd numbers and un-round figures** read as real ("47 tabs", "$312", not "50", "$300").
- **First person, past tense for stories; second person, present tense for instructions.**
- **One viewer, not an audience.** "you", never "you guys", "everyone", "people out there".
- **Verbs over adjectives.** Show what happened; delete "amazing", "incredible", "super easy".
- **Pace:** conversational speech runs ~130–150 wpm; short-form delivery commonly 150–180 wpm (≈2.5–3 words/second) after silences are cut [DATA-weak, calculator sources]. Planning targets: 15s ≈ 35–45 words; 30s ≈ 70–90 words; 45s ≈ 110–130; 60s ≈ 150–175. If the script exceeds the budget, cut words; do not ask the speaker to rush.
- **Front-load meaning:** put the important word early in the sentence; viewers leave mid-sentence.
- **A re-hook every 5–15 seconds:** a new question, a turn ("but here's the thing"), a visual change, or a mini-payoff. This is "hook stacking": each section (problem, value, proof, CTA) opens with its own small hook rather than a transition [OPERATOR].
- **End early.** Stop on the payoff or loop line. No "thanks for watching", no summary.

### 4.2 Integrating the product natively

- **Problem before product.** Brief template line: "Every video shows (the problem, in the viewer's words) before it shows (our app)."
- **Show a "magic moment" and withhold enough** that the video does not feel like a paid ad; the app appears on screen, nobody says "download this", viewers ask for it [OPERATOR].
- **Screen time for the product:** as short as 2–3 seconds in creator-army formats (routine → "how long have you been doing this the hard way" → 2–3s of the fix). Longer for tutorials and demos.
- **One value point per video.** Feature laundry lists are a named failure mode.
- **The pivot is the highest-risk sentence.** A strong hook is wasted if the next seconds sound like an ad. The product should arrive as the next event in the story ("so I tried the thing my lab partner uses") not as a segue ("that's where X comes in").
- **Set expectations honestly.** Over-promising creates installs that churn (the "trust tax").

**When to reveal — two valid patterns and the tradeoff [OPERATOR]:**

| Pattern | Product visible | Best for | Tradeoff |
|---|---|---|---|
| **Demo-first** | By second 2–3 | Apps with an instantly legible, visual magic moment; hook-rate-sensitive ads | Higher click-through, lower intent |
| **Method-first / emotional-premise-first** | After 15–20s of how/why, or several seconds into an intimate opener | Products that are not scroll-stopping on their own; higher-consideration subscriptions | Slightly lower click-through, "much higher intent and lifetime value" |

Rule for the system: choose by whether the product's first screen is itself a hook. If a stranger would stop for the screen recording alone, go demo-first. Otherwise earn it with the person and the problem.

### 4.3 CTA styles

**Organic (soft CTA) [OPERATOR]:**
- **Do not say the app's name.** "This app", "the one I use", app visible on screen. One creator-founder has never said his app's name aloud. The goal is "what's the app?" comments, described as very high converting; then answer in comments.
- **Comment-keyword → DM link:** "comment PLAN and I'll send it." ~13K comments, ~50% link click, ~6.7–7% download-to-paid in one case.
- **App Store search / name on screen in the UI:** converts but cannot be attributed to a video.
- **Engagement closes that fit the content:** "save this for finals week", "send this to the friend who never pays you back", a genuine question.
- Tradeoff to state plainly: unnamed/soft CTAs maximize native feel and comments; links in bio/comments/DMs are traceable; name-search is not.
- **Disclosure interacts with this.** Paid creators still must disclose the material connection (section 6.8). "Don't name the app" is a persuasion tactic, not a way to hide sponsorship.

**Ads (hard CTA):**
- TikTok's official guidance wants "a clear call-to-action that tells viewers what to think, feel, or do" [OFFICIAL].
- State the action and the reason or offer: "Download it free and scan your first receipt." Match the CTA to the promise made in the hook.
- With an offer (trial, discount), the CTA can appear early, in the first 5–10 seconds, verbally or as an on-screen callout, and again at the end [OPERATOR].
- Organic winners often flop as ads because an organic post asks for nothing and a boosted repost carries a click target it wasn't built for. Recut: keep the opening seconds identical, rebuild the rest for a viewer who can tap one button, show a reason to tap early [OPERATOR — Coconote].

### 4.4 Length by format [HEURISTIC, with data notes]

| Format | Target |
|---|---|
| Text + sound, scan/score reveals | 6–12s (some skincare-scan clips are under 7s) |
| Discovery, POV skit, before/after | 12–25s |
| PAS, screen demo, green-screen, reply-to-comment | 20–40s |
| Story/confession, listicle, tutorial, controversial take, street interview | 30–60s |
| Founder story, deep tutorial, case study | 45–90s |
| Slideshow | 5–8 slides |

Data that cuts against "shorter is always better": Buffer's study of 1.1M TikToks (March 2025) found videos over 60s had higher median views (+43% vs 30–60s; +96% vs 5–10s) and more watch time, while Fanpage Karma (32K TikToks) found completion falls roughly linearly with length and engagement peaks at 30–90s [DATA]. Reconciliation: completion rate favors short; total watch time and reach can favor long if retention holds. Rule: use the shortest length that delivers the payoff, and never pad. TikTok's Creator Rewards requires videos of at least one minute (via secondary), which biases creator behavior toward 60s+; that incentive does not apply to brand-paid UGC.

### 4.5 Sounding like a person, not an ad

Do:
- Give talking points and a hook, not a word-for-word script, when the creator is good; 80% structure / 20% creator freedom. Annotate scripts with delivery and shot type ("sarcastic", "eye-roll", "close-up") — stage directions, not just lines.
- Keep one small imperfection: a self-correction, a laugh, a "wait, no", a real pause before the reveal.
- Use the creator's own slang and the viewer's words for the problem.
- Include one honest limitation or skeptical beat ("I thought it'd be annoying"). Disappointment made specific and inspectable is what makes "honest review" formats work.
- Vary vocal pitch and volume; eye contact with the lens.

Avoid (the ad tells):
- Brand name in the first sentence; full product name with tagline; saying the name more than once or twice.
- Benefit stacks of three ("faster, easier, and smarter").
- Endorsement vocabulary: "game-changer", "obsessed", "life-saver", "must-have", "highly recommend", "seamless", "powerful", "all-in-one", "revolutionary", "take it to the next level".
- Feature names and marketing nouns ("AI-powered insights") instead of what happened.
- "Link in bio" with a pointing gesture as the entire close on an organic post.
- Perfect lighting, studio audio, three-quarter angle; anything a viewer reads as an ad "within a second."

### 4.6 Tells that a script is AI-written [HEURISTIC; evidence thin]

Evidence note: a small UCLA student study found viewers split roughly evenly on whether a TikTok script was AI-written and none were highly confident, so detection by audiences is unreliable. The tells below matter less because viewers "detect AI" and more because they make delivery stiff and ad-like.

- Every sentence grammatically complete and the same length; no fragments, no interruptions.
- Rhetorical-question-then-answer openers: "Tired of X? Meet Y." / "Ever wondered why...? Here's the thing."
- "Not just X, it's Y" / "It's not about X. It's about Y." constructions.
- Rule-of-three lists everywhere; alliteration; slogans ("Empower your best self").
- Signposting: "Here's the thing", "Let's dive in", "Let me break it down", "The best part?", "But wait, there's more", "Trust me".
- Abstract benefits with no number, name, place or time.
- Tidy moral or summary line at the end; "So if you're ready to..., give it a try."
- Emoji and hashtags inside spoken lines; em-dash-heavy sentences that cannot be spoken; written-register words ("utilize", "effortlessly", "streamline", "elevate", "unlock", "journey", "navigate").
- Uniform enthusiasm; no negative or neutral beat.
- Generic persona ("as a busy professional").

Fix procedure for the system: after drafting, (1) read each line as speech and break one in three sentences into a fragment, (2) replace every adjective claim with an observed event or number, (3) delete the first and last sentence and check if the script still works, (4) confirm the word count against the time budget.

**Sources (section 4):** Airbridge lessons 04, 09, 13; https://ugcsocial.substack.com/p/hook-stacking-the-secret-to-longer; https://viral.app/ugc-course/creators/briefs-and-hooks; https://buffer.com/resources/longer-tiktoks-get-more-views-data/; https://www.fanpagekarma.com/insights/optimal-tiktok-video-length/; https://ads.tiktok.com/help/article/creative-best-practices; https://languagedlife.ucla.edu/?p=3854; https://www.usetwirl.com/ugc-diaries/how-to-script-better-ugc-videos-tips-to-nail-your-next-creation; https://captions.ai/blog/how-to-write-short-form-video-scripts

---

## 5. Editing craft

Evidence note: there is almost no rigorous public research on cut frequency or caption style versus retention. One academic working paper (Dost) reports a positive effect of jump cuts on continued watching that diminishes beyond a maximum frequency. OpusClip's 13.5M-clip analysis is descriptive (what editors do), not causal. Everything numeric below that is not labelled is [HEURISTIC].

### 5.1 Cut pacing
- **Remove all dead air:** breaths, pauses, "um/uh/like/so", false starts, restarts. Tighten gaps to ~0–0.15s between phrases. Keep one deliberate pause per video, before the reveal.
- **Something changes every 2–4 seconds:** a cut, a punch-in, an insert, a text change, or a move. "No silence; something always happening."
- **Vary shot length** to avoid a metronome; short-short-long.
- **End a beat early,** while energy is rising.
- **Do not over-edit.** Stacked whooshes, constant zooms and transitions read as an ad or as fatigue. UGC editing should be invisible; one operator's founder-test protocol uses "only captions for editing."
- **Jump cuts** are the backbone. Hide them with a punch-in (scale 110–125%), a reframe, or an insert. Cut on action or on the first syllable of the next phrase.

### 5.2 Zooms and punch-ins
- Punch in on the key claim, the number, or the turn; cut back out for the next thought.
- 110–130% scale; instant cut or a very fast ease (≤6 frames). Slow "Ken Burns" zooms on a talking head feel produced.
- On screen recordings, zoom until the tapped element is readable at phone size (target UI text ≥ ~40px tall in a 1080-wide frame) and follow the tap.

### 5.3 B-roll and screen-recording inserts
- **"Show the thing whenever you mention it."** If the voice says "it scanned the receipt," the receipt scan is on screen at that word.
- Inserts 1.5–4s each. Use them to cover jump cuts.
- Screen recordings: trim loading, speed-ramp typing and waits (2–4x), start on the action not the home screen, hide notifications/personal data, show a tap indicator, crop to the region that matters.
- Hand-held over-the-shoulder phone footage reads more native than a clean capture; a clean capture reads clearer. Use hand-held for discovery/story formats and clean capture for tutorials.
- Picture-in-picture or split-screen (face top, screen bottom) is a proven ad layout (Mojo).
- B-roll is rare in practice (6% of clips in OpusClip's set), so even light, relevant inserts differentiate.

### 5.4 Captions (burned-in speech captions)
- **Use them.** Captions appear in ~80% of analyzed clips and animated word/phrase captions in ~79% [DATA]. TikTok's official guidance also recommends captions/text overlays [OFFICIAL].
- **Style defaults:** 1–3 words on screen at a time for high-energy talking head; up to one short line (≤5–6 words, ≤2 lines) for calmer content. Bold sans-serif, white with dark stroke or shadow (or a rounded dark box), mixed case, all-caps only for one or two emphasis words.
- **Highlight** the stressed keyword in one accent color as it is spoken. One accent color per video.
- **Sync** to speech within ~1–2 frames; captions that lag read as cheap.
- **Placement:** horizontally centered; vertically around 55–70% of frame height (below the face, above the caption/UI block). Never in the bottom ~25% or under the right-side button column. If a text hook occupies the upper area, keep captions low-center; never overlap the two.
- **Accuracy:** correct product names and numbers by hand; auto-caption errors on the brand name are common.
- Native vs burned-in: TikTok and Instagram both offer auto-captions. One source claims TikTok search only reads text made with in-app tools; unconfirmed. Safe practice: burn in styled captions for retention and put keywords in the post caption and spoken audio for search.

### 5.5 Safe zones (1080×1920)

No single official organic spec exists; TikTok says the ad safe zone "depends on the video's dimensions, the caption length and any extra formats" and ships template files [OFFICIAL, via secondary]. Published measurements disagree.

| Edge | TikTok (ad template, long caption) | TikTok (common organic estimates) | Reels (estimates) |
|---|---|---|---|
| Top | 240px | ~110–155px | ~220–270px |
| Bottom | 660px | ~270–320px | ~310–670px |
| Right | 120px | ~100–120px | ~90–120px |
| Left | 120px | ~60px | ~60px |

**Cross-platform default for an AI editor [HEURISTIC]:** keep all text, faces, and key UI inside a centered box of about 900×1350px: stay out of the top ~250px, the bottom ~480px (25%), the right ~130px and the left ~60px. For paid placements, check against the platform's current template. Also keep the hook text inside the center 4:5 (and ideally 3:4) crop so it survives Instagram's profile-grid thumbnail.

### 5.6 On-screen text (titles, hook text, labels)
- **Length:** 3–7 words per idea; hook text 5–10 words; never more than ~15 words on screen at once; max 2–3 lines.
- **Duration:** hook text on from frame 1 for at least ~2–3 seconds, commonly held through the first beat. General rule: at least 0.3–0.4s per word plus ~0.5s, minimum 1.5s. (Subtitling practice of ~17–20 characters/second for adults implies about 3 words/second as a ceiling.) TikTok's help page says "5–10 words per second," which is much faster than subtitling norms; treat it as an upper bound for glanceable phrases, not a target.
- **Change text when the scene changes,** not mid-shot.
- **Position:** hook text upper-middle (roughly 15–35% from top, below the top UI) or center; labels near the thing they label.
- **Style:** native-looking fonts (TikTok "Classic"-style white with black outline or box; Instagram-native styles on Reels). "Snapchat-style" text bars are reported to work. Branded lower-thirds and logo bugs read as ads.
- **One text system:** hook text, captions and labels must be visually distinct from each other and never stacked three deep.
- **Search:** put the main keyword in on-screen text and in the first spoken sentence (section 6.4).

### 5.7 Sound and music
- **Original voice audio** is the default for storytimes, reviews, app explainers.
- **Music bed under voice:** well below dialogue; target voice around −6 to −3 dBFS peaks and music roughly 18–24 dB below it (about 5–12% volume in mobile editors), ducked further under key lines [HEURISTIC]. Normalize loudness across clips. Keep room tone under cuts.
- **Trending audio** matters most for no-talking formats, where the sound is the template (edit to its beat; text change on the beat drop).
- **Licensing constraint that changes the default:** TikTok business accounts are limited to the Commercial Music Library, and TikTok's music terms say general sounds should not be used to promote a brand without rights. Sources say TikTok can classify accounts as commercial by activity. Licenses do not carry across platforms. Practical rule: for brand-owned accounts and anything that will run as an ad, use commercial-library or licensed audio, or original audio. Creator personal accounts have access to trending sounds, but using them for paid promotion is a legal gray area that the brand inherits. Confidence: medium (vendor-heavy sources; verify against TikTok's CML help page).
- OpusClip found music in under 2% of clips in its set, which skews to clipped talking content; do not read that as "music doesn't matter."
- **Sound design:** minimal. A single pop or click on a text reveal is fine; whoosh stacks are not.

### 5.8 Green-screen conventions
- Use the platform-native green-screen look: creator cutout in the lower third, ~25–40% of frame, placed bottom-left or bottom-right, never covering the line being discussed.
- Background artifact cropped so the key line is readable; highlight, circle or zoom to it as it is read.
- Swap the background at each new point (every 4–8 seconds).
- Point or glance toward the artifact; start already pointing.
- Slightly rough cutout edges read native; a perfect key with studio light reads produced.

### 5.9 Opening frame and cover
- Frame 1 must be a usable thumbnail: no black frame, no fade-in, no mid-blink face. Motion or the artifact already in frame.
- Text hook present on frame 1.
- Cover: on TikTok the cover matters mainly for profile visits and series navigation; on Instagram it matters more (grid, and Reels shown in feed). Use a frame with the hook text inside the center 3:4 crop; for series, a consistent cover title ("Day 14").
- Never open on the app's logo or splash screen.

### 5.10 Loopability
- Rewatches count as watch time on both platforms. Build loops where natural:
  - Last line grammatically flows into the first ("...and that's why" → hook).
  - End on the same visual as frame 1 (reveal-process-reveal).
  - Cut the final beat a fraction early so there is no "ending" cue.
  - For 6–12s text videos, make the text take slightly longer to read than a single pass comfortably allows.
- Do not sacrifice a clear payoff or CTA for a loop in conversion-oriented videos.

**Sources (section 5):** https://www.opus.pro/blog/video-editing-tips; https://ads.tiktok.com/help/article/creative-best-practices; https://www.manypixels.co/blog/social-media-design/tiktok-ad-specs; https://reap.video/blog/short-form-video-safe-zones; https://adaptlypost.com/blog/social-media-safe-zones-2026-complete-guide; https://merginit.com/tools/safe-zone-checker; https://cursa.app/en/page/scripting-ugc-style-tiktok-ads-hooks-structure-and-on-screen-communication; https://www.soundstripe.com/blogs/tiktok-music-licensing-rules; https://usethirdchair.com/blog/tiktok-commercial-music-library-what-it-covers-and-what-it-doesn-t; https://archives.marketing-trends-congress.com/2026/pages/PDF/paper_professor_DOST_HUANG.pdf; https://lightreel.ai/blogs/ugc-guide

---

## 6. Platform mechanics in 2026

### 6.1 TikTok: what is rewarded
- Official framing (via secondary summaries of TikTok's newsroom explanation): signals fall into user interactions (strongest), video information (captions, sounds, hashtags), and device/account settings (weakest). Finishing a longer video is cited as a strong interest signal. Exact weights are not published; any percentage breakdown found online is invented.
- Working model [HEURISTIC]: distribution is tested in expanding batches; early retention (not skipping in the first seconds), total watch time/completion, rewatches, then shares, comments, saves and follows decide whether it expands. Follower count matters little; each video is judged on its own, which is why fresh creator accounts can hit millions.
- One operator's observation: TikTok weights total watch time more than the hook alone.
- "Shadowban" is not an official state; reach drops usually trace to content marked ineligible for the For You feed, which is shown in the post's analytics and can be appealed (via secondary).

### 6.2 Instagram Reels: what is rewarded
- Adam Mosseri (January 2025, via Social Media Today as reported): "the top three signals that matter most for ranking are watch time, likes and sends." Likes per reach matter slightly more for connected reach (followers); sends per reach matter slightly more for unconnected reach (non-followers) [OFFICIAL, via secondary]. Sends are "one of the biggest signals we use."
- Design implication: Reels content should give a reason to DM it to one specific person ("send this to the friend who..."). Relatable POVs and useful lists do this; pure product demos do not.
- Separate ranking systems for Feed, Stories, Explore and Reels.
- **Originality rules:** applied to Reels from 2024 and extended to photos and carousels on 30 April 2026. Low-effort edits (speed change, watermark, borders, subtitles, screenshot of someone's post, caption credit) do not count as original. Accounts whose posts are mostly others' content within a rolling 30-day window become ineligible for recommendations. Instagram says about 75% of US recommendations now come from original posts. Commentary, green-screen reaction and remix count as transformation [OFFICIAL, via trade press]. One blog cites a "10+ unoriginal posts in 30 days" threshold; unverified.
- Mosseri's year-end 2025 memo is reported as saying "the polished, perfect aesthetic is dead" and signalling preference for raw human content over AI-generated material (via secondary).
- Background knowledge, not re-verified in this pass: Instagram has long stated that Reels visibly recycled from other apps (watermarks/logos) are deprioritized in recommendations; "Trial Reels" (shown first to non-followers) exist for testing; Instagram moved to a small cap on hashtags per post in late 2025. Treat as medium confidence.

### 6.3 TikTok vs Reels: practical differences

| Dimension | TikTok | Instagram Reels |
|---|---|---|
| Cold-start reach for new accounts | Strong; fresh accounts routinely reach non-followers | Weaker but real; judge views relative to followers |
| Key lever | Watch time/completion, rewatches | Watch time + likes + sends (DM shares) |
| Aesthetic tolerance | Rawest; lo-fi wins | Slightly cleaner, still native; raw is now explicitly favored |
| Posting volume tolerance | 1–2/day per account; heavy volume reported to hurt | One founder posted 9/day without penalty |
| Carousels | Photo Mode (up to 35 images) is a major app-growth format | Carousels earn higher engagement per reach than Reels, lower reach |
| Search | Heavily used as search engine; captions, speech, on-screen text indexed | Keyword captions matter; hashtags limited |
| Music | Business accounts restricted to Commercial Music Library | Separate licensing; TikTok sounds do not transfer |
| Paid amplification | Spark Ads | Partnership Ads |
| Disclosure tool | Content disclosure setting / branded content toggle → "Paid partnership" label | Paid partnership label |
| View definition for hook metrics | 2-second views | 3-second views |

Cross-posting: operators cross-post every video to every platform the same day [OPERATOR]. Export clean (no platform watermark), re-select audio natively per platform, and re-check safe zones. Expect the same video to perform differently; a format should be validated per platform.

### 6.4 Search / SEO
- TikTok indexes the post caption/description, spoken words (transcribed) and on-screen text (OCR), plus hashtags [practitioner consensus; "confirmed" per several guides, not read in an official doc here].
- Put the primary keyword phrase, as a user would type it ("how to split rent with roommates"), in: the first spoken sentence, the on-screen hook or a label, and the first line of the caption. Do not stuff.
- Captions: one or two natural sentences containing the keyword and a reason to watch or save; 3–5 focused hashtags mixing one broad and several niche. On Instagram, keep to a handful.
- Captions for organic creator posts should read like the creator wrote them (lowercase, casual), not like ad copy.
- Tutorials and listicles are the formats that earn search traffic; name the category and audience explicitly ("apps for nursing students").

### 6.5 Posting cadence and account warm-up [OPERATOR / vendor consensus]
- Warm-up: 3–5 days of in-niche scrolling, liking, commenting, following 10–30 accounts, at human speed, zero posts. Vendor recommendations range from 3 to 21 days; no official requirement exists. Optionally post unbranded content first and add app branding once posts perform.
- First posts on a fresh account typically reach ~100 views, then ~1,000; a warmed account "averages 500+ views per post."
- 1–2 posts/day per account; consistent spacing; add accounts to add reach.
- One account per device is the common advice; identical content across accounts and bot-like behavior are the commonly cited flags. (Proxy/anti-detect tooling advice is vendor marketing; excluded.)
- Commit ~90 days before judging the channel; one operator was 60 days in without a hit.
- Weekly review: Scale (views rising and installs follow), Iterate (views fine, installs flat: change hook or CTA, not rhythm), Watch (account under 2 weeks or under 1K views but climbing), Kill (views collapsed after a volume increase: cut volume first).
- Posting-time claims (e.g., "2–4 a.m. EST gives 60% more engagement") are unsourced; ignore.

### 6.6 Paid amplification
- Gate: do not spend until there are at least five winning formats (Conch AI). Boost only what has organic traction (a video at ~10K views can be worth testing; or 3–5x account average).
- Spark rules (Sideshift): ≥10% engagement gets Spark money; at 7.5–8% test $20; then $50–100/day for a week; kill under 5% engagement. Do not spark while organic views are still climbing.
- Budget: 70–80% proven winners, 20–30% testing, 2–3 new creatives every 2–3 days. Winners take 80–95% of spend; a creative under 50% of budget after two days is likely a loser (RevenueCat).
- TikTok official: 3–5 creatives per ad group; make test creatives "differ significantly from each other" [OFFICIAL].
- Spark vs non-Spark lift figures (+142% engagement, +43% CVR, etc.) circulate without a dated source. TikTok's Creative Center does state Spark Ads drive more comment engagement. Direction is consistent; magnitude unverified.
- Optimizing for trial starts can over-deliver to 18–24-year-olds who try but rarely pay; judge on paid conversion.

### 6.7 Originality and watermarks
- Never upload a file carrying another platform's watermark or an editor's outro logo. Export clean masters.
- Creator armies posting the same script: each creator must film their own version. Identical files across accounts are a commonly cited spam trigger, and on Instagram reposted material risks recommendation eligibility.
- Reaction/stitch content must add substantive commentary.
- A blog-reported TikTok "unoriginal content" classifier and a QR-code rule could not be verified against TikTok's own text.

### 6.8 Disclosure (FTC and platform rules) — read directly from the FTC's FAQ unless marked

**When:** any material connection the audience would not expect (payment, free product, employment, equity, rev share) must be disclosed. This covers hired UGC creators posting on fresh accounts, employees posting about the company's app, and founders where the relationship is not obvious. Each paid post needs its own disclosure.

**Where and how in short video:**
- In the video itself, not only the caption/description ("a TikTok or YouTube description alone is unlikely to be enough").
- If the endorsement is spoken, disclose in audio; if visual, disclose visually; if both, both.
- At the start, not the end. Superimposed text must be large, readable, high-contrast and not covered by UI.
- Platform tools (TikTok's branded-content/"Paid partnership" label, Instagram's paid partnership label) are "not sufficient by themselves"; add your own.
- Not adequate: disclosure only in bio/profile, in comments, behind a link, or buried among hashtags.

**Wording:** acceptable — "#ad", "Ad:", "Paid ad", "Sponsored by [brand]", "[Brand] partner", "#[Brand]Partner", "#[Brand]_Ambassador", "Gifted by [brand]" (if only a free product). Not acceptable — "#ambassador"/"partner" alone, "#collab"-style vague tags, "#client", "#freeproduct", "thanks [brand]" alone, run-together hashtags. Employees must state the employment relationship in the post.

**Brand liability:** the brand is responsible for what its paid creators post. It should instruct creators on claims and disclosure, monitor posts during and for a period after the engagement, and pre-approve where possible. Endorsements must reflect real use; fake reviews and testimonials from people without product experience are deceptive.

**Platform policy:** TikTok's Branded Content Policy requires the commercial content label for paid promotion; TikTok says it may block content from the For You feed, ban accounts, or apply the label itself [OFFICIAL, via Indicator's reporting].

**The live tension, stated honestly.** The dominant creator-army playbook is designed so viewers "can't really tell the difference" between paid and spontaneous posts, and many programs do not label. Indicator's 2026 investigation of 2B+ views of such campaigns documented this, shared 60+ accounts with TikTok and the FTC, and content was removed. Guidance for the AI system:
- Default to including a compliant disclosure for any paid creator output: the platform toggle plus a short on-screen "ad" / "[Brand] partner" in the first seconds and in the caption's first line; spoken if the endorsement is spoken.
- Never write first-person experience claims the creator has not had (fabricated confessions, invented results, fake "I found this").
- "Don't say the app name" and "soft CTA" are compatible with disclosure; hiding the paid relationship is not.
- Expect some reach cost from labels; no reliable public measurement of it was found.

**AI-generated content:** TikTok requires labelling realistic AI-generated content; reports say TikTok's ad policies were updated on 21 July 2026 to make disclosure mandatory for AI-generated content in ads (toggle at ad creation), that C2PA metadata triggers automatic labels, and that enforcement is uneven. All via vendor blogs and trade press; verify against TikTok's ad policy before relying on specifics. Meta has parallel AI-label rules. A photorealistic AI presenter delivering a "testimonial" combines the AI-label issue with the FTC's fake-endorsement problem; do not generate it.

**Sources (section 6):** https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking; https://indicator.media/p/crying-girls-will-make-you-rich-how-marketers-trick-users-with-mass-produced-organic-content-ugc-und; https://buffer.com/resources//instagram-algorithms/; https://www.socialpilot.co/blog/instagram-reels-algorithm; https://petapixel.com/2026/04/30/new-instagram-policies-target-reposted-content/ (fetched via search summary; page itself returned 403); https://planoly.com/blog/instagram-updates-its-original-content-policy; https://metricool.com/tiktok-seo/; https://www.airbridge.io/en/resources/handbook/ugc/06-account-setup-and-posting-rhythm; https://www.airbridge.io/en/resources/handbook/ugc/13-amplify-winners-recut; https://www.airbridge.io/en/resources/handbook/ugc/11-dont-boost-the-most-views; https://ads.tiktok.com/creative/blog/return-on-influence-tiktok-creative-impact; https://billo.app/blog/ai-labeling/; https://newsroom.tiktok.com/tiktok-ssa-shares-more-ways-to-spot-shape-and-understand-ai-generated-content?lang=en-ZA; https://blog.hootsuite.com/tiktok-algorithm/

---

## 7. Analyzing a reference video and transplanting it

### 7.1 Before analysis: is this a format or a fluke?
- A single viral video is not a trend. Confirm the pattern across 5–20 videos from different accounts.
- Prefer references where a **small account** got outsized views (views ≫ followers); that isolates format from audience. Reels scale: 1x followers = strong, 5x = outlier.
- Check the same account's other posts in the format. A repeatable format shows multiple above-median posts.
- Check engagement quality, not just views: engagement rate, and whether comments ask about the product ("what app is this") or only about the joke/creator. A reference with huge views and comments unrelated to the product is a toy-trap reference: borrow its hook mechanic, not its product integration.
- Check age. Formats die; a format saturated months ago has less life left.
- Note whether views were boosted (Spark) if detectable.

### 7.2 Breakdown schema (fill every field)

```
META
  platform, length (s), account size, views, likes, comments, shares, saves
  engagement_rate = (likes+comments+saves+shares)/views
  views_to_followers ratio
  comment themes (top 10): product-asking / relating / arguing / tagging friends / off-topic
  format label (from taxonomy) + sub-variant
  funnel role: reach / consideration / conversion

HOOK (0–3s)
  visual: what is in frame 1; motion; artifact; framing
  text: exact words, word count, position, on-screen duration
  verbal: exact first sentence, word count, start time
  archetype (from 3.2); who is called out; what loop is opened
  channel relationship: complementary / redundant / conflicting

BEAT MAP (timestamped)
  for each beat: start–end, function (hook / context / agitate / turn / demo /
  proof / payoff / CTA / loop), words spoken, shot type, on-screen text, cut count

RETENTION DEVICES
  open loops and where each closes; re-hooks and their timestamps;
  pattern interrupts; withheld information; escalation; payoff timing;
  loop construction

EMOTIONAL ARC
  starting emotion → turn → ending emotion; the share trigger
  ("this is me", "send to X", useful/save, outrage, awe, humor)

PRODUCT INTEGRATION
  first product frame (s and % of runtime); total product screen time;
  named aloud? (y/n, count); what the product is shown DOING (one action);
  role: hero / tool in a story / one item in a list / punchline;
  pivot sentence (exact words)

CTA
  type: none / soft (unnamed) / comment-keyword / link / hard;
  exact words; placement

CRAFT
  words total; words/sec; avg shot length; caption style; music/sound role;
  setting, wardrobe, props; creator archetype and delivery (energy, register)

WHY IT WORKED (hypotheses, ranked, each tied to evidence above)
WHAT IS INCIDENTAL (creator fame, timing/news hook, trend audio, luck)
```

Transcript-only analysis limits: without visuals you cannot assess the visual hook, the text hook, cut pacing or the product frame. State those as unknown rather than inferring; infer structure from the transcript (beat functions, word count per beat, pivot sentence, CTA) and flag confidence.

### 7.3 What transfers and what does not

**Transfers (the skeleton — keep fixed):**
- Hook mechanic/archetype and its grammatical shape ("Stop using [incumbent] to [job]").
- Beat order and the proportion of runtime per beat.
- Length and words-per-second.
- Shot grammar: framing, shot sequence, where inserts fall, text placement and style family.
- Position of the product moment as a percentage of runtime, and the product's role (hero vs tool vs list item).
- Emotional arc and share trigger.
- CTA type.
- Audio role (original voice vs sound-led).

Mojo's evidence for how literal this is: preserving a winner's exact timing, pauses, gestures and energy (via dubbing) beat local creators re-performing the same message; "execution mechanics matter just as much as the message." Operators say to copy a viral format "word by word, second by second" at the level of mechanics.

**Does not transfer (the flesh — must be rebuilt):**
- The specific pain, audience and vocabulary. The new product needs its own problem sentence, in its viewers' words.
- The incumbent/enemy named in the hook. It selects the audience; choose the one whose users are the new product's buyers.
- The magic moment. If the reference depends on an instantly visible result (scan → score) and the new product's value is slow or invisible, the format does not fit; pick a format where the product's real first-win is showable in the same time.
- Claims and proof. Every number and result must be true for the new product.
- The creator's credibility, identity and audience relationship.
- Trend-dependent parts (a sound, a meme, a news moment) past their window.
- Category-specific compliance latitude (what a study app can claim, a finance or health app cannot).

**Never copy:** exact wording of lines, the creator's personal story, footage, original audio/voice, on-screen text verbatim, distinctive bits or characters. Format mechanics are common practice; expression is not yours. On Instagram, near-copies also risk the originality rules.

### 7.4 Transplant procedure

1. **Abstract** the reference into a slot template, e.g. `[IDENTITY callout] + [hard-way routine, 4s] + ["how long have you been doing it this way" turn] + [2–3s fix on screen] + [reaction] + [no CTA]`.
2. **Write the new product's problem sentence:** "My app kills (expensive, annoying problem) for (specific person)."
3. **Fit test** (all must pass, else choose another reference):
   - Can the new product's magic moment be shown in the seconds the template allots?
   - Does the same emotion apply to the new problem?
   - Is there an equivalent enemy/old way?
   - Does the new audience use this platform and this register?
   - Can every claim be substantiated and is the format allowed in the category?
4. **Fill slots** with the new product's specifics, in the viewer's language. Keep word counts per beat within ±15% of the reference.
5. **Match mechanics:** same length band, same first-product-frame percentage, same text style family, same shot order.
6. **Toy test and "what's the app" test:** would someone share it without wanting the product? Would a viewer plausibly comment asking what it is?
7. **Originality check:** no sentence shared with the reference beyond the generic hook frame; different setting and story.
8. **Produce 3–5 hook variants** on the same body (change only the first line/text), and plan 20 variations of angle and situation before judging the format.
9. **State in the output** which elements were kept, which were changed, and why.

**Worked micro-example.** Reference (study app): text "POV: you find out your friend hasn't taken notes all semester" → friend's phone recording the lecture (2s) → app turning the recording into notes (3s) → raised eyebrows, no CTA. Skeleton: `POV social-discovery hook → evidence object → 3s magic moment → wordless reaction`. Transplant to an expense-splitting app: text "POV: you find out your roommate never does the math after groceries" → roommate photographs the receipt (2s) → items auto-assigned to people (3s) → same wordless look. Kept: hook archetype, beat order, timings, product role, no-CTA close. Changed: situation, object, magic moment, wording.

**Sources (section 7):** https://viral.app/ugc-course/creators/briefs-and-hooks; Airbridge lessons 01, 04, 07, 09, 11; https://www.shortimize.com/blog/locketapps-tiktok-influencer-strategy-for-gaining-250m-views. The schema and procedure are [HEURISTIC] synthesis.

---

## 8. Quality rubric for an AI judge

Scoring: each criterion 0–2 (0 = fails, 1 = partial, 2 = clearly meets). Hard fails cap the total regardless of other scores. Thresholds are starting points and should be calibrated against real performance data.

### 8.1 Hook rubric (max 16; ship ≥12, no hard fail)

| # | Criterion | 2 looks like | 0 looks like |
|---|---|---|---|
| H1 | Calls out a specific person or situation | "If you re-read the same page four times" | "Want to be more productive?" |
| H2 | Opens a loop the body closes | "I almost got fired over a spreadsheet." | "This app helps you manage spreadsheets." |
| H3 | Speed: meaning lands in ≤2s; verbal ≤12 words; text 5–10 words | 7-word text on frame 1 | "Hey guys, so today I wanted to..." |
| H4 | Visual hook specified and non-static | "Frame 1: phone held to lens showing a $312 total" | "Creator sits and talks" |
| H5 | Channels complementary, not redundant or conflicting | Visual = receipt; text = "nobody checks this line"; voice = "This cost me $1,400." | Text repeats the voiceover word for word |
| H6 | Specificity (number, name, time, object) | "at 2 a.m.", "$312", "anatomy final" | "a lot of money", "so much time" |
| H7 | Native register, no ad language, no brand name | "the lazy way to..." | "Introducing Flowly, the all-in-one..." |
| H8 | Honest: the body can pay it off; claim is true | Promise matches demo | Clickbait unrelated to product |

Hard fails: greeting/intro opener; brand or logo in first second; hook the product cannot pay off; unsubstantiable or prohibited claim; text exceeding ~12 words or placed in a UI zone.

Pass-check sentence: "In the first 3 seconds the viewer thinks: ___." If the honest fill is "that's a cool app," score H1 and H2 at 0.

**Good:** Text: "imagine still doing this by hand" · Visual: hands highlighting a bank statement with a marker · Voice: "I did this every month for two years."
**Bad:** Text: "The Best Budgeting App of 2026!" · Visual: app logo animation · Voice: "Are you tired of struggling with your finances? Meet Pennywise."

### 8.2 Script rubric (max 24; ship ≥18, no hard fail)

| # | Criterion | 2 looks like | 0 looks like |
|---|---|---|---|
| S1 | Problem sentence is legible: who, and what painful problem | Viewer can restate it after 5s | Features with no problem |
| S2 | Problem shown before product (or deliberate demo-first with a visual magic moment) | Pain → then app | App named in line one of an organic post with nothing to see |
| S3 | One value point | One action, one result | Three or more features |
| S4 | Show, don't claim: the product is seen doing the thing; a concrete result | "It pulled 14 charges I'd forgotten" over a screen insert | "It's super powerful and easy" |
| S5 | Spoken language: contractions, 4–12-word sentences, fragments, grade 5–7 | Reads aloud cleanly | Written-register sentences |
| S6 | Specificity density: ≥1 concrete detail per ~15 words | Numbers, names, times | Abstractions |
| S7 | Pivot to product is an event in the story, not a segue | "so I tried the thing my lab partner uses" | "That's where X comes in." |
| S8 | Retention: a re-hook or turn at least every 5–15s; payoff withheld until late | Open loop closes in final third | Front-loads everything, then lists |
| S9 | Word budget fits length (≈2.5–3 w/s) and length fits format | 80 words for 30s | 140 words for 30s |
| S10 | CTA fits the channel: soft/unnamed/comment-led for organic; clear, single action matched to the hook for ads | "comment PLAN and I'll send it" / "Download free and scan your first receipt" | "Link in bio! Follow for more! Download now!" |
| S11 | Free of ad and AI tells (4.5, 4.6) | None present | "game-changer", "Tired of X? Meet Y", triads |
| S12 | Truthful and compliant: no fabricated first-person experience, claims substantiable, disclosure present where creator is paid, category rules respected | Disclosure line + real, checkable claims | Invented testimonial; "guaranteed"; no disclosure |

Hard fails: fabricated testimonial or result; missing disclosure on paid creator content; prohibited category claim (medical cure, guaranteed returns); copying a reference's lines; script cannot be filmed with the stated footage.

Additional tests the judge should run: the toy test (shareable without wanting the product → cap S1 at 1); the "what's the app?" test (would a viewer plausibly ask?); delete the first and last sentences (if nothing is lost, they were filler).

**Good (28s, ~75 words):** "I did not expect my screen time to embarrass me. [beat] Seven hours, forty minutes. On a Tuesday. So my sister and I made a bet, and she showed me this thing where your friends can literally see your number. [insert: leaderboard] First week I was last. Dead last. Now I'm at three-twelve and she's furious. If you want in, comment 'bet' and I'll send it."
**Bad:** "Are you tired of wasting time on your phone? Meet ScreenWise, the revolutionary app that helps you take control of your digital life. With powerful insights, smart limits, and seamless tracking, ScreenWise makes it easy to build better habits. Download now and start your journey today!"

### 8.3 Edit rubric (max 24; ship ≥18, no hard fail)

| # | Criterion | 2 looks like | 0 looks like |
|---|---|---|---|
| E1 | Frame 1: motion or artifact in frame, text hook present, no black/fade/logo | Usable as thumbnail | Fade from black to a seated creator |
| E2 | Voice starts ≤0.5s; no dead air; fillers removed | Gaps ≤0.15s | Breaths and "um"s remain |
| E3 | Visual change every 2–4s, varied rhythm | Cut/punch-in/insert cadence | 12s static shot |
| E4 | Inserts match speech ("show the thing when mentioned") | Screen insert lands on the word | B-roll unrelated or late |
| E5 | Screen recordings legible at phone size, trimmed, zoomed on action | Tapped element fills ~1/3 width | Full UI, tiny text, loading spinner |
| E6 | Captions: synced, 1–3 words (or ≤1 short line), high contrast, keyword highlight, accurate | Brand name spelled right | Lagging 3-line paragraphs |
| E7 | All text inside safe zone and readable; no overlap between hook text, captions, labels | Within centered ~900×1350 | Text under buttons or caption block |
| E8 | On-screen text length and duration readable (≥0.3–0.4s/word, min 1.5s; ≤15 words at once) | 6 words held 2.5s | 20 words for 1s |
| E9 | Audio: voice clear and dominant, music ducked, consistent loudness, licensed-appropriate audio | Music ~20 dB under voice | Music competes with voice; unlicensed trend audio on a brand ad |
| E10 | Native feel: no brand intro/outro, no heavy transitions, no stock footage look | Looks like a person made it on a phone | Logo sting, lower-thirds, whooshes |
| E11 | Product moment at the planned time, long enough to register (≥2s), in the right role | Demo at 0:08 for 3s | Product never clearly visible |
| E12 | Ending: stops on payoff/CTA, loops if format calls for it, no trailing frames; correct specs (9:16, ≥720p, no watermark) | Last word → cut | 2s of silence, editor watermark |

Hard fails: watermark from another platform/editor; critical text outside safe zone; unreadable product demo; caption errors on product name or numbers; missing required disclosure overlay; AI-generated realistic presenter without the platform's AI label.

### 8.4 Overall gate
A deliverable ships only if hook, script and edit each pass, and these four are true: (1) the problem sentence can be stated from the video alone; (2) it passes the toy test; (3) every claim is true and disclosed as required; (4) it is recognizably one format from the taxonomy executed with fixed mechanics, so it can be iterated.

**Sources (section 8):** rubric is [HEURISTIC] synthesis of sections 3–6; thresholds are uncalibrated.

---

## 9. Category nuances

Evidence note: this section has the thinnest sourcing. No rigorous case study isolating TikTok/Reels for B2B SaaS was found; most category-specific guidance is agency opinion. Treat as [HEURISTIC] unless marked.

### 9.1 Consumer vs prosumer vs B2B: what changes

| | Consumer app | Prosumer / AI tool | B2B SaaS |
|---|---|---|---|
| Buyer | The viewer, tonight | The viewer, for their work/side project | Someone on a team; the viewer may be a user or champion |
| Conversion path | Install → trial | Web signup / freemium | Awareness → search → demo/trial later |
| Winning emotion | Relief, belonging, vanity, curiosity | "I can do that now" capability | Recognition ("this is my Monday"), status, relief |
| Best formats | Story, discovery, POV, slideshow, text+sound, scan/score | Screen demo, "watch me build X in 30s", tutorial, listicle, green-screen | POV office skit, founder-led, green-screen over artifact, customer mini-story, screen demo |
| CTA | Soft/unnamed, comment-led | Named is fine; "search X" or comment keyword | Soft; follow/series; link for a template or resource |
| Volume model | Creator army | Creator seeding + founder | Founder/employee-led + a few niche creators |
| Metric | Installs, trials, paid | Signups, activation | Qualified traffic, branded search, pipeline (hard to attribute) |

Skits work in B2B "because buyers are people," but should sit on top of proof content rather than replace it (Sweetfish, May 2026). A 20-second captioned customer clip (problem, what changed, result) is the cheapest proof unit.

### 9.2 By category

**AI tools (generators, assistants, companions)**
- Formats: prank-as-demo and reaction (the output's effect on a real person sells it), "watch me [output] in 30 seconds," before/after of the artifact, everyday-habit integration (Tolan: cooking, makeup, relationship talk), green-screen over the output.
- Lead with the output, never the model or the word "AI." "AI-powered" is not a hook in 2026.
- Risk: toy trap is highest here. Tie the output to a real job (the pdftobrainrot lesson).
- Lightreel advises creators to avoid some AI startups' UGC programs; signal of a crowded, poach-heavy labor market.

**Productivity / study / notes**
- Formats: tutorial and listicle (search + saves), "stop doing X in the notes app," day-in-the-life, POV procrastination skits, screen demo with a time promise, lecture-hall discovery (Coconote).
- Students are both the audience and the creator pool; academic calendar hooks (midterms, finals, syllabus week).
- Avoid aesthetic-setup content with no problem; pretty desk videos get saves, not installs.

**Finance / fintech**
- Formats: green-screen over statement/chart/fee line, number-shock hooks, confession stories about money shame, "how much do you think you spend on..." street interviews, tutorials on a single task.
- Use the viewer's own numbers and small specific sums; avoid income/returns claims.
- Compliance: TikTok ad policy disallows exaggerated financial claims and get-rich-quick framing; financial services ads face category-specific policies and, in places, pre-approval [OFFICIAL, partial read]. Sector regulators' rules on testimonials and performance claims also apply. Before/after net-worth transformations and "this app made me $X" are out. Disclosures must be prominent.

**Health / fitness / wellness**
- Formats: founder-led and practitioner-led (trust), routine integration, scan-and-score reveals, progress missions with a visible counter, honest "30 days of" reviews.
- Compliance: TikTok ad creatives "should not make medical claims to treat, cure, heal, or prevent any medical condition" [OFFICIAL]; weight-loss before/afters and body-shaming hooks are restricted. Frame around behavior and feeling ("I finally stopped skipping breakfast"), not outcomes promised.
- Mental health and companion apps: avoid implying treatment; avoid exploiting distress.
- Founder trust effect is reported strongest here (Natal), self-reported.

**Education / language**
- Formats: story-drama with delayed payoff (the overheard-insult-then-fluent-reply structure), GRWM hybrids, street interviews, challenge/progress series ("day 14 of learning Korean"), reply-to-comment.
- The benefit is a social outcome; dramatize the moment the skill changes something.

**Dev tools / technical SaaS**
- Formats: "built this in N minutes" screen demo with the result first, green-screen over a diff/error/terminal, controversial takes on tooling habits, founder build-in-public, short tutorials solving one error.
- Audience punishes hype and inaccuracy; show real code and real output, speed-ramp honestly, admit limits. No stock "hacker" B-roll.
- Creator-army UGC fits poorly; credible practitioners and founders fit well. Confidence: low (no data found).

**Social / dating / relationship**
- Formats: POV and confession, slideshow lists ("texts to send when..."), comment-bait questions, couple/friend dynamic.
- Highest disclosure risk category in practice (Tea investigation): scripted personal-life confessions on paid sole-purpose accounts.

### 9.3 Making "boring" software interesting

1. **Film the moment before the product,** not the product. The 4:55 p.m. request, the Slack ping, the spreadsheet with 14 tabs. The software is the release.
2. **Find the artifact.** Every boring tool touches something people have feelings about: an invoice, a calendar, a rejection email, a pay stub, a bug, a churned customer. Put it on screen in frame 1 (green-screen).
3. **Name the enemy.** The incumbent tool, the manual workaround, or the meeting. "Stop using [x] to [job]" selects the audience.
4. **Convert to a number.** Time, money, count, score. "47 tabs." "Four hours every Friday."
5. **Use the user's status stakes.** Looking good in front of a boss/client, not getting caught, leaving on time.
6. **Shrink the demo to one action.** One input, one visible output, under 5 seconds on screen.
7. **Give it a person.** Founder, a specific employee, or a recurring character; faces outperform dashboards for trust, and being on camera is itself differentiating as apps go faceless.
8. **Make it a mission.** A finite series with a visible counter ("automating one annoying task a day for 30 days") gives a reason to return.
9. **Borrow a consumer format.** POV, "day in the life of a [role]," "rate my [setup/stack/dashboard]," reply-to-comment.
10. **Teach one thing** that is useful without buying. Tutorials carry the best install/retention profile in the one large dataset available.
11. **Apply the hook test.** If the first 3 seconds make a viewer think "that's a cool tool," redo it until they think "that's me."

**Sources (section 9):** https://www.sweetfishmedia.com/blog/b2b-video-skits-strategy; https://lightreel.ai/blogs/viral-ugc-trends; https://lightreel.ai/blogs/ugc-guide; https://ads.tiktok.com/help/article/ad-policy-handbook-north-america?lang=en; https://ads.tiktok.com/help/article/tiktok-ads-policy-financial-services; Airbridge lessons 01, 05, 07; https://www.reap.video/blog/saas-founders-shorts-traffic

---

## 10. Where sources disagree (summary table)

| Question | Position A | Position B | Working resolution |
|---|---|---|---|
| Pay creators on views? | Yes, base + view bonuses is standard (Lightreel) | Per-view "backfires"; rewards unconverting content (Barnard, Airbridge) | Small base + capped tiers; feed back conversion data; never uncapped |
| When to show the product | By second 2–3 (Pushcroll, Locket) | After 15–20s of method, or after an emotional premise (RevenueCat test, Lightreel) | Demo-first only if the screen itself is a hook; otherwise problem-first |
| Name the app? | Never say it; drive "what's the app" comments (Casper, Fowler) | Clear CTA telling viewers what to do (TikTok official, ads) | Soft/unnamed for organic; explicit for ads; disclose in both |
| Optimal length | Shorter = higher completion (Fanpage Karma) | >60s = more median views and watch time (Buffer) | Shortest length that delivers the payoff; length follows format |
| Hook benchmark | 70–80% 3s retention organic | ~25% hook rate (Meta ads) | Different denominators; no reliable TikTok ad benchmark |
| Scripts vs freedom | Follow proven script word for word (scripted briefs; "copy second by second") | Talking points/content bank, 80/20 | Fix structure and hook; free the delivery and wording |
| AI avatars | Match human CTR, cheap testing layer (vendors) | 80% failure for invented personas; use only to replicate human winners (Mojo) | AI to explain/translate/vary; humans to convince |
| Warm-up length | 3–5 days | 14–21 days | 3–5 days; evidence for longer is absent |
| Safe-zone numbers | Bottom 270–320px | Bottom 660px (ad template) | Conservative centered box; check templates for ads |
| Carousels vs Reels reach (IG) | Reels win reach (Buffer) | Carousels edge reach (Socialinsider) | Reels for reach, carousels for engagement/saves; test |
| Disclosure | Industry practice: often unlabelled, built to look organic | FTC + platform policy: must disclose in-video | Disclose; this is not optional for the system |

## 11. Known gaps

- No verified playbook details for Turbo AI, Quittr, Umax, Rizz; several Cal AI/App Mafia claims come from sales-oriented secondary sources.
- No causal public data on cut frequency, caption style, or label impact on reach.
- No reliable TikTok organic or ad hook-rate benchmark.
- Slideshow guidance is entirely vendor-sourced.
- 2026 TikTok policy specifics (AI ad disclosure date, unoriginal-content classifier, CML scope for creator accounts) were read through secondary sources only.
- Instagram's official originality post and Mosseri's statements were read through trade coverage, not the primary posts.
- B2B/dev-tool short-form evidence is opinion-level.
