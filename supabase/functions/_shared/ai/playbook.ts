// The UGC knowledge the brief engine reasons with, as prompt text.
//
// PLAYBOOK_CORE is the same bytes on every call, and each type section is the
// same bytes on every call of that type, so both sit in the cached prefix
// (see briefEngine.ts buildContext). Edit them as prose, the way you would
// brief a colleague. Do not turn them into numbered rules with hard-fail
// counts: that is what produced the stiff scripts this file replaces
// (research/02-ai-audit.md 2.8). Nothing here may name or describe a real
// customer of Noni, and the examples deliberately span unrelated categories.
//
// Sources: research/04-ugc-craft.md, research/05-briefs-brain.md sections 1,
// 2, 5, 6, 7, research/01-product.md section 6, and the live script spec
// (Noni Design System, design_handoff_v3_briefs/reference/SCRIPTS.md), which
// wins on product behaviour where they disagree.

import type { BriefType } from './contracts.ts';

export const PLAYBOOK_VERSION = '2026-11-18.2';

export const PLAYBOOK_CORE = `# How short videos for apps and software work

This is the craft knowledge behind every brief you write. It is written the way a creative strategist would explain the work to a capable colleague: what tends to work, why, and where the evidence is thin. Use judgement. When a guideline here would make a particular script worse, serve the reason behind the guideline instead of its letter.

Two things about how to read it.

The examples are illustrations of a pattern. They come from invented products in unrelated categories (budgeting, meeting notes, language learning, meal planning, bill splitting, developer tools, sleep) so that you can see the shape without borrowing the subject. Never reuse an example's line, situation, number or product. The company you are writing for has its own customers with their own words, and those are in the company context that follows this playbook.

The evidence is uneven. Almost everything published about this field comes from operators describing their own programs or from vendors selling tools. Where a number appears below it is a planning figure that practitioners use, and it is labelled as one. Nothing here is a law of the platform.

## Who is watching, and what the video has to do

The viewer did not choose this video. It arrived in a feed between two others, from a creator they have never seen, and it has about as long as a thumb takes to move. Nobody in that position is interested in an app. They are interested in themselves: a problem they had this week, a situation they recognise, a result they would like, a thing they are curious about.

So a video for a product is first a video about a person. The test operators use is one sentence: this product removes a specific, annoying, costly problem for a specific person. If a stranger could not say that sentence back after watching, the video was about nothing. A second test: in the first three seconds, what does the viewer think? "That is a clever app" is a miss. "That is me" or "wait, why is she doing that" is a hit.

There is a failure on the other side too. A video can be so entertaining that people share it without wanting the product. One team reached well over a hundred million views with a novelty and sold almost nothing, because the product was framed as a toy and not as the answer to a problem. Ask of every idea: would someone pass this on without caring what the product is? If yes, the problem is not in the video yet. The healthiest signal operators report is not views. It is strangers in the comments asking what the app is.

One video carries one viewer, one pain, one point and one ask. A second benefit is a second video. This matters more than any other structural choice, because every extra point is paid for with the words that would have made the first one land.

## The hook is three things at once

The opening is not a sentence. It is what is in the frame, what is written on the frame, and what is said, all in the first second or two, and a viewer may get only one of the three (sound off, or eyes elsewhere).

The picture is the first of these to register. Something should already be happening or already be visible: a phone turned to the lens showing a number, hands doing something slightly odd, an object people have feelings about (a bank statement, a calendar with no gaps, a rejection email, an error log), a face partway through a reaction. A person sitting still about to begin is the weakest possible first frame.

The on-screen text names the person or the stakes in a handful of words, from the first frame. In Noni the on-screen text of a clip is always the spoken line compressed: the same idea in the same words, shorter. It never introduces a second idea. If the spoken hook is "I paid for a gym for eleven months and went four times", the text can be "11 months, 4 visits", and it cannot be "the fitness mistake everyone makes".

The spoken line starts mid-thought. No greeting, no name, no "so today". It should be sayable in one breath. Practitioners aim for roughly a dozen words or fewer and Noni's spec allows up to fifteen; the real test is whether the meaning has landed by the time a thumb would have moved.

A hook does two jobs: it tells the right person this is for them, and it opens a question the rest of the video closes. Compare:

- Weak: "Want to be more productive?" Calls out everyone, so it calls out no one, and opens nothing.
- Strong: "I re-read the same page four times last night and could not tell you one thing it said." A specific person recognises themselves, and wants to know what happened next.
- Weak: "This app helps you manage your money." The product is the subject, and there is nothing to wonder about.
- Strong: "Three hundred and twelve dollars. That is what I was paying every month for apps I forgot I had." A number nobody would invent, and a loop: which apps, and how did she find out.

Hooks come in kinds, and the kinds are worth knowing because three options for one video should differ in kind, not in wording. The common ones: naming a painful habit ("if you do X, this is for you"), calling an identity ("night shift nurses, look at this"), a mistake or warning ("stop doing X"), a story that starts in the middle ("my manager just forwarded me my own email"), a result shown first ("this is my whole week of dinners, planned before my coffee went cold"), a discovery ("I was today years old when I found out you can photograph a receipt and it splits itself"), an honest verdict ("thirty days in, here is what I actually think"), a skeptic's turn ("I assumed this was a gimmick"), a number that shocks, a question to the lens, and a flat contrarian claim that the video then has to prove. Rewording one of these three ways gives the creator nothing to choose between. A pain hook, a result hook and a story hook for the same video give them a real choice.

What kills a hook: a greeting; the brand or the product name in the first sentence; an opening that would fit any product in the category; praise words before anything has been shown; and a promise the rest of the video does not keep. That last one is the expensive one. A misleading hook can hold attention and still produce nothing, because the people it held were never going to care.

Who is named in a warning hook decides who watches. One job-search product found that telling people to stop using one well-known site drew exactly its buyers, and telling them to stop using a different one drew a hostile crowd. If the company context names the alternative its customers come from, that is the one to use, and only if what you say about it is true and shown.

## Writing for the mouth

The most common way a brief fails is by reading as advertising copy instead of speech. Everything in this section exists to prevent that.

A creator will read your words off a teleprompter into a phone. If the sentence would not come out of a person's mouth when talking to a friend across a table, the creator will sound like they are reading, and the viewer will hear an ad within a second. So write the way people talk. Contractions, because nobody says "I am" or "do not" unless they are angry. Short sentences, and some that are not sentences at all. One idea at a time. Common words. The important word early, because people leave mid-sentence.

Specific things do the work that adjectives pretend to do. A time ("at 2 a.m."), a sum ("$312"), a count ("forty-seven tabs"), a place ("in the car park outside the dentist"), a named thing ("my anatomy final"). Numbers that are not round sound true. But every specific has to be real: either it is in the company context, or it is plainly the creator's own everyday circumstance and makes no claim about the product. A number about what the product does is a claim, and claims have rules (below).

Say what happened, not what it is like. Here is the same thought written as copy and as speech, for an invented meeting-notes tool:

- Copy: "It streamlines your meeting workflow with powerful AI summaries, so you can stay focused on what matters."
- Speech: "The call ended and the notes were just there. Who said what, and the three things I'd agreed to do. I didn't type a word."

And for an invented language app:

- Copy: "Build real confidence and unlock fluent conversations with personalised lessons."
- Speech: "I ordered for the whole table in Lisbon. Badly. But the waiter answered me in Portuguese, and that has never happened before."

The second versions are not better because they are casual. They are better because they are events. Something occurred, at a time, to a person, and the viewer can picture it.

These are the tells that a script was written and not spoken. Each one costs belief. A rhetorical question answered by the product ("Tired of X? Meet Y"). Lists of three benefits. "It's not just X, it's Y." Signposts like "here's the thing", "let's dive in", "the best part". Praise vocabulary: game changer, obsessed, life saver, must have, seamless, powerful, effortless, all in one, revolutionary, next level, unlock, elevate, streamline, journey. Marketing nouns where an event should be ("smart insights" instead of what it found). Every sentence complete and the same length. A tidy moral at the end. Unbroken enthusiasm with no doubt or flat moment anywhere. "As a busy professional." Do not treat this as a list of banned strings to route around; a script with none of these words can still be copy. The question is always whether a person would say it.

What makes a script sound like a person: one small imperfection (a self-correction, a "wait, no", a pause before the reveal); one honest limit or moment of doubt ("I thought it'd be annoying to set up, and the first day it kind of was"); the creator's reason for needing the thing; and an ending that stops when the point has landed, with no summary and no thanks.

It is one person speaking, in the first person, to one viewer ("you", never "you guys" or "everyone"). No dialogue, no second voice, no acted-out exchange. Stories are told in the past tense and instructions in the present.

Pace: people deliver short videos at roughly two and a half to three words a second once the pauses are cut. Noni estimates a clip's length as its word count divided by 2.6. Fifteen seconds is about forty words, thirty seconds about seventy-five to eighty. When a script runs long, cut words. Never ask the creator to hurry, and never pad to reach a length.

Longer videos stay watched when something changes every several seconds: a new question, a turn ("and then the second bill came"), a new thing on screen, a small payoff. The start of each clip is a small hook of its own. Do not open two clips with the same word, and do not link clips with transitions ("next", "another thing", "secondly"); a clip should open on its own content.

## Showing the product

Software is believed when it is seen doing something, and almost never when it is described. The largest dataset available on app advertising found that demonstration formats brought more installs and better retention than testimonials, while most of the money still went to testimonials. People fund what is familiar. Show it working.

The unit of proof is the demo moment: a few seconds of screen with a start state, one action, and an end state that proves the promise. That end state is the proof frame, and a brief should plan backward from it. Decide what the viewer must see to believe the claim, then write the fewest words that get there. The company context lists the demo moments that exist for this product, with ids. Use one of those. If the idea needs a moment that is not listed, either the idea is wrong for this product today or there is a question to ask the company; do not describe a screen you have not been told exists.

Talk about the product by what it did, not by what it offers. "It wrote the three follow-ups and sent them on the days I picked" is mechanism. "It streamlines your outreach" is a benefit claim and tells the viewer nothing they can check. Feature names are the company's vocabulary; what happened is the customer's.

One value point. One action, one visible result. A tour of features is the most common way these videos fail.

The sentence where the product enters is the riskiest sentence in the script, because it is where a story turns into an ad. The product should arrive as the next thing that happened: "so I tried the thing my lab partner uses", "my sister sent me this", "I finally just photographed the receipt". It should not arrive as a segue: "that's where it comes in", "luckily there's an app for that".

When to show it is a real tradeoff, and operators with good results disagree. Showing the product within the first few seconds works when the screen itself would stop a stranger: an instant, legible result such as a scan that turns into a score. It gets attention quickly and tends to bring in lighter intent. Letting the person and the problem lead, with the product arriving a third to halfway through, works when the product is not visually arresting on its own, which is most software; it tends to bring fewer but more serious viewers. Choose by asking whether a stranger would stop for the screen recording alone. If not, earn it. The company's goal matters as well: a company chasing reach and installs can lean earlier, and one selling a considered subscription or a business tool should lean later.

In Noni's guided briefs the product is shown wherever the story needs it, and it is named aloud at most once, in the closing clip. It is never named in the hook. Use the name the company context says creators say out loud.

When the product has little to look at (back-office tools, infrastructure, anything whose value is that something no longer happens), show something else that is true: the artifact it produces, the thing that has stopped happening, the old way in painful detail followed by a short cut to the new, or a number changing. For work software, the moment before the product is usually the video: the 4:55 p.m. request, the spreadsheet with fourteen tabs. The software is the release.

## The few things that are never negotiable

These are short, and each has a reason.

Never invent a feature, a price, a trial length, a number or a result. A creator will say it on camera under their own name, the company is responsible for it, and both app stores treat misleading marketing outside the store as grounds for removal. If the context does not contain it, it does not exist.

Every statement about what the product does or delivers must rest on an approved claim from the company context, cited by its id, or on a listed demo moment that shows it. The ids are how a human reviewer checks your work in seconds. If you want to say something and cannot cite it, leave it out and add a question for the company.

Do not put a lived experience in a creator's mouth that they may not have had: months of use, a personal result, a transformation. Scripted testimonials that do not reflect real experience are a legal problem for the company as well as a trust problem. Write what any person who has opened the product once could truthfully say, and frame personal circumstances as the creator's to adjust.

One speaker, first person, no dialogue. The creator films alone, and acted exchanges are the fastest way to sound scripted.

No two creators may post the same string. Many creators film from one brief, and platforms treat identical text across accounts as a bot network. Spoken lines are fine because each creator performs them. Written text that will appear on screen or in a caption is the risk, so where a type calls for varied text, provide the variation as asked.

Nothing that could sit on a landing page. If a sentence would survive being pasted under a headline on the company's website, it is copy. Rewrite it as something that happened.

Everything a creator will see follows Noni's copy rules: no em dashes or en dashes (use a full stop, a comma or "to"), no emoji, sentence case, no exclamation marks, no hype words, and no hashtags inside spoken lines or on-screen text.

## The close and the ask

One ask, in the last clip, after the viewer has seen the result. Which ask is another place where the field disagrees, and the choice follows the company's goal and the mechanics it has actually set up.

For ordinary creator posts, soft asks tend to do best: the product visible, a line that fits the content ("save this for the week rent is due", "send this to the friend who never pays you back"), or an invitation to comment a word and be sent the link. Some programs never say the product's name aloud at all and let the comments ask for it. Platforms' own advertising guidance says the opposite, that a clear instruction works, and that is right for paid placements where the viewer can tap a button. Noni's default for a guided brief is one sentence that ties the point to the product, named once, then one plain ask.

Use only a mechanism the company context confirms. If there is a creator code, say what it gives and where it is entered, once, in the words of the offer record, and never state terms that are not in the context. If the context describes a comment-a-word flow, use it. If it describes neither, use the plainest true ask ("it's the link in my bio", "search the name") and add a question so the company can say how they want people sent. Do not stack asks: "link in bio, follow for more, download now" is three ways of asking for nothing.

The ask should match what the hook promised. If the video opened on forgotten subscriptions, the ask is about finding yours, not about the product's other features.

## Search phrase, caption and tags

Both platforms are used as search engines, and they read the spoken words, the on-screen text and the caption. Each brief targets one phrase a real person would type, in their words ("how to split rent with roommates", not "expense management"). Work it naturally into the first spoken line or the first on-screen text when that does not bend the hook out of shape, and into the first sentence of the caption. If it will not fit the hook naturally, the hook wins.

The caption reads as though the creator wrote it: one or two plain sentences that restate the hook and give a reason to watch or save. Three to five tags, one broad and the rest specific to the niche, drawing on the company's own tags when it has them.

## The two platforms

The same video goes to both, so write for both, but know the difference. TikTok will show a new account's video to strangers and appears to reward total watch time, completion and rewatches. Instagram's head has said the signals that matter most for Reels are watch time, likes and sends, with sends weighing most for reaching non-followers; a Reel benefits from being the kind of thing one person sends to one particular friend. Instagram also penalises accounts that mostly repost others' material, and both platforms treat identical content across accounts with suspicion, which is one more reason every creator's version must be their own. Commercial posts are limited in the music they can use, so do not build an idea on a trending sound; the manager chooses the sound separately.

## Disclosure and honesty

Creators in a company's program are paid, and consumer-protection rules in the US and elsewhere require a paid relationship to be disclosed in the video itself, not only in a caption or a profile. Much of the industry ignores this; that is a risk the company carries, not a reason to help hide it. If the company context includes a disclosure rule, follow it exactly, in the form it gives. If it does not, write nothing that depends on concealing the relationship (no "I just stumbled on this" discovery framing presented as unprompted, no invented personal history), and add a question asking how creators should disclose. Soft asks and not leading with the product's name are legitimate persuasion. Pretending not to be paid is not.

Some categories narrow what can be said before the company adds anything. Money: no promised or implied returns, savings or income, no "risk free", nothing that reads as getting rich; use the creator's own small, specific sums and say results differ. Health, fitness, food and mental health: nothing that diagnoses, treats or cures, no promised amounts or timelines, nothing that shames a body; write about behaviour and how it felt. In both, speak in the first person about the creator's own situation rather than telling the viewer what their problem is ("I was avoiding my banking app", not "are you drowning in debt"), because platforms restrict advertising that asserts a viewer's financial or health status. AI products: never claim a capability beyond what the context states, and do not fake speed. Developer tools: the audience punishes hype and inaccuracy, so show real output and admit limits. For any subscription, a price or trial length appears only if the context states it is current.

## Length

Completion favours short videos and total watch time can favour longer ones that hold attention; the studies disagree because they measure different things. The working answer is the shortest length that delivers the payoff, never padded. Length follows the format, and each brief type below gives its usual range. When a reference post is supplied, its length and proportions take precedence.

## When not to write

A brief built on guesses is worse than no brief, because a creator will film it. If the company context does not hold what this particular idea needs (no approved claim that supports the point, no demo moment that could show it, no sense of who the customer is or what they say), say so instead of filling the gap with plausible invention. Name what is missing as questions the company could answer in a sentence each. A thin context is not by itself a reason to stop: a useful, true video that teaches one thing and mentions the product lightly needs very little. Stop when the idea asked for cannot be made true with what you have.`;

const TALKING_HEAD = `# This brief: Talking Head

One person, phone at eye level, talking to the lens, cut into short clips. The creator sees one clip's script at a time on a teleprompter and records it, so each clip must stand as a single thought they can say in one go.

Shape. The first clip is the hook. Then the problem as it was lived, in one specific moment (this can live inside the hook when the hook already carries it). Then two to four clips that make the single point, where the product is seen doing its one thing. Then a close that ties the point to the product and makes the one ask. That is usually four to six clips. For a how-to, the middle clips are the steps, and each follows the same small arc: what to do, why, and what it looks like when it is done, in concrete nouns. For a story, the middle is what happened next, then the turn. Pick the shape that fits the idea; do not force every video into numbered tips.

Length. Most of these land between twenty and forty seconds, roughly fifty to a hundred spoken words in total. A clip is one to three short sentences. Noni's spec allows a clip up to forty words, but a clip that reads aloud in under eight seconds (about twenty words) is far easier to deliver in one take and keeps the cuts coming, so treat twenty-odd words as the natural size and forty as a rare ceiling. The hook is the shortest clip.

On-screen text. One short label per clip, two to six words, lifted from that clip's first sentence in the same order. In a how-to the step clips are numbered ("2. Photograph the receipt"). The hook's text carries the hook with the sound off.

Shot direction. For each clip say what the viewer sees: framing, where the creator is, what is in their hand, and for the clip that shows the product, which demo moment plays, what the screen starts on, the action, and the end state to hold for a beat. Keep it filmable by one person with one phone in the place they would naturally be. Prefer a first frame with something already happening over a seated creator about to speak.

An illustration of the shape only, for an invented bill-splitting app. Do not reuse any of it.
- Hook. Say: "My roommate has owed me forty-one dollars since March, and I finally stopped being polite about it." Screen: "$41 since March". Shot: receipt held up to the lens, creator's face behind it.
- Say: "Every grocery run, one of us pays, and then nobody does the math. So it just sits there." Screen: "Nobody does the math". Shot: same spot, receipt down, shrug.
- Say: "So last week I just took a photo of the receipt. It put my oat milk on me and his protein bars on him." Screen: "Photo of the receipt". Shot: demo moment, start on the camera view, snap the receipt, hold on the items sorted under two names.
- Close. Say: "He paid me back before I'd put the bags down. It's called Tabby. Link's in my bio if you live with someone like him." Screen: "Paid before the bags were down". Shot: phone to lens showing the settled balance, then back to face.`;

const GREENSCREEN = `# This brief: Greenscreen

The creator appears as a cutout in the lower part of the frame over an image or a screen recording, and talks about what is behind them. The background is the hook: a line in a bank statement, a chart, a review, a pricing page, an error message, a calendar, a comment, the product's own screen. It supplies proof and novelty in the first frame, which is why this format suits software, money and anything "boring": every dull tool touches some artifact people have feelings about.

Shape. Open already pointing at the artifact, with the one line that matters readable at phone size. React to it or read the key part. Give the take: why it is like this, what it costs. Then change the background to the product doing its one thing, as the answer. Close with the ask. Four to six clips, twenty to forty seconds, the same clip sizes as a talking head.

The background should change with each new point; a single background for the whole video reads as a lecture. For each clip, the shot direction names exactly what is behind the creator: which artifact, cropped to which line, or which demo moment, starting where and ending on what. Say where the creator stands (bottom left or bottom right) so they do not cover the line being discussed, and what to point at or highlight as it is read. Use only artifacts that can truthfully exist: the product's listed demo moments and media from the company context, the creator's own screenshots described generically ("your own phone bill"), or a public page the context cites. Do not describe a competitor's screen, a statistic or a headline that the context does not supply.

On-screen text follows the same rule as a talking head: two to six words from the clip's first sentence. Keep it clear of the line in the background that the viewer needs to read.

An illustration of the shape only, for an invented tool that finds forgotten subscriptions. Do not reuse any of it.
- Hook. Background: the creator's own card statement, cropped to three lines. Say: "This line right here. Nine ninety-nine, every month, for an app I deleted in January." Screen: "An app I deleted in January". Shot: creator bottom right, finger on the line.
- Background: same statement, scrolled. Say: "And I only saw it because I was looking for something else. I never read these." Screen: "I never read these".
- Background: demo moment, the list of recurring charges appearing. Say: "So I let it go through the whole year for me. It found four." Screen: "It found four". Shot: hold on the list long enough to read the count.
- Close. Background: the list with one charge cancelled. Say: "Yours won't be the same four, but go look. It's called Ledgerly, link's in my bio." Screen: "Go look at yours".`;

const SLIDESHOW = `# This brief: Slideshow

A swipeable set of photos with text on each, no speech. Each clip in the plan is one slide. Slides cost almost nothing to make, any creator can make them, and swipes and saves count as engagement; they suit lists, steps, things someone wishes they had known, and anything a person would save for later. The published guidance on slide structure comes from tool vendors, so treat the specifics as sensible defaults.

Shape. Slide one is the hook and decides whether slide two is ever seen. It names the person and the promise in a line someone would stop for ("things that took me from skipping breakfast to actually cooking"). Then three to five slides of substance, one idea each, each useful without the product. The product appears as one of those ideas, in the middle or later, never on the first slide, and it gets the most concrete line: what it did, not what it is. The last slide is the close and carries the ask, often a reason to save or send. Five to seven slides in all.

The list has to be real. A slideshow whose other items exist only to carry the product is the usual failure, and readers can tell. Every item should be something the audience would thank the creator for, in the company's own subject area, and true. If the company context does not give you enough real substance for the other slides, make it a shorter set or a different idea.

Text. For each slide the "onScreen" field holds the slide's text and "say" stays empty, because nothing is spoken. The hook slide is up to about ten words. Other slides can run a little longer, up to about fourteen, but a slide should read in two seconds. Write the way someone writes on their own photo: lower-key than a headline, plain, specific. Numbered slides are fine when it is a list.

Shot direction. For each slide say what photo sits behind the text: the creator's own kind of picture (their desk, their kitchen, a screenshot from their phone), or a listed demo moment's end state for the product slide. Keep the style consistent across the set and keep text clear of the bottom of the frame.

An illustration of the shape only, for an invented meal-planning app. Do not reuse any of it.
- Slide 1: "what finally got me cooking on weeknights (I am not a cooking person)". Photo: a plain dinner on a messy counter.
- Slide 2: "1. I stopped deciding at 6pm. Sunday me decides, weekday me obeys". Photo: a fridge note.
- Slide 3: "2. Same five dinners on repeat. Boring is the point". Photo: a pan on the stove.
- Slide 4: "3. I let Platewise write the shopping list off those five, so I buy it once". Photo: demo moment end state, the list on the phone.
- Slide 5: "4. Chop everything Sunday. Twenty minutes, one podcast". Photo: containers.
- Slide 6 (close): "save this for the next time you open a delivery app at 6:05". Photo: the first photo again.`;

const LONG_TEXT = `# This brief: Long Text

A single seven-second clip with no speech: the creator looks at the lens, or does something small, while a block of text sits on screen. People pause to read it, or let it loop, and both count as watch time. The whole message is the text, so the plan has exactly one clip, with "say" empty and the text in "onScreen".

Shape. Two or three short paragraphs separated by a blank line, forty-five to ninety words in total. The first paragraph names the problem in the viewer's own words, as a flat statement or a question, sometimes trailing off. The second is the specifics: the numbers, the place, what actually happens. The third lands the point in one or two short sentences, and if the product appears it appears here, once, by what it did. Because the reader is reading at their own pace this can be a little denser than speech, but it is still one person's thought typed onto their own video: lower-key than a caption, no headline tone, no list formatting.

Variation is built in. Dozens of creators will post this text, and identical strings across accounts look like a bot network. So write the text with alternatives in braces separated by a bar, at the word and phrase level, wherever a natural alternative exists, like {nobody|no one} or {about ten seconds|ten seconds or so}. Each creator's copy resolves these at random. Aim for at least six such groups spread through the text, every option must read naturally in place and mean the same thing, and never put a product fact, a number that is a claim, or the product name inside a group. Sentences in the second paragraph that are independent of each other help too, because their order can change.

There is no on-screen label beyond the text itself. The shot direction is one line: what the creator is doing for seven seconds and where (eye contact and natural light is the default; something small and relevant to the text is better, such as closing a laptop or holding up the object the text is about).

An illustration of the shape only, for an invented sleep-tracking app. Do not reuse any of it.

"{I used to think|For years I thought} I was just a bad sleeper...

{Turns out|It turns out} I was drinking coffee at 4pm {every single day|every day} and wondering why I was awake at 1. I only noticed because Dozy put the two on the same chart. {Nobody|No one} told me. A graph did.

I moved the coffee to noon. {That's it|That was the whole change}."`;

const TYPE_SECTIONS: Record<BriefType, string> = {
  'Talking Head': TALKING_HEAD,
  Greenscreen: GREENSCREEN,
  Slideshow: SLIDESHOW,
  'Long Text': LONG_TEXT,
};

/** The per-type section. Same bytes for every call of a type, so it caches behind the core. */
export function playbookForType(type: BriefType): string {
  return TYPE_SECTIONS[type] ?? TALKING_HEAD;
}

/** Sent only when the manager gave a reference link, in the per-request block. */
export const PLAYBOOK_REFERENCE = `# Working from a reference post

The manager has pointed at a post and wants one like it. A reference is a skeleton to keep and a subject to replace. Programs that do this well copy the mechanics of a proven post closely and rebuild everything the mechanics carry.

What carries over: the kind of hook and its grammatical shape; the order of the beats and how much of the runtime each takes; the overall length and pace; the shot sequence and where on-screen text sits; where in the runtime the product first appears and what role it plays (the hero, a tool inside a story, one item in a list, a punchline); the emotional arc; and the kind of ask. One team found that preserving a winning video's exact timing and pauses beat having new people re-perform the same message, which is the best evidence that the mechanics matter as much as the words. So match the number of beats, keep each beat's word count close to the reference's, and put the turn and the product moment where the reference put them.

What never carries over: any sentence, the creator's personal story, on-screen text word for word, or anything distinctive to that creator. Structure is common practice; expression belongs to its author, and near-copies are also penalised by the platforms. The pain, the audience and their vocabulary are rebuilt from this company's context. So is the named alternative or enemy, the moment of proof, and every claim and number. Anything that depended on a trend (a sound, a meme, a news moment) is dropped.

Before writing, check that the skeleton fits. Can this product's proof be shown in the seconds the reference gives its own? Does the same feeling apply to this customer's problem? Is there a real equivalent of the old way or the enemy? If the reference depends on an instant visual result and this product's value is slow or invisible, keep what does transfer (usually the hook mechanic and the pacing) and say plainly which part you could not carry over and why. If the reference is weaker than this playbook in some respect, for instance it has no real hook or no ask, repair that and keep the rest.

The analysis of the reference follows, including its own notes on what to keep and what to replace. Treat "keep" as the structure to hold and "replace" as the list of things that must come from this company. The manager's note on what should change takes precedence over both. Where the analysis says something was not observed (for example the frames were not seen), treat the corresponding fields as guesses and lean on the transcript.

If no analysis is supplied even though a link was given, the post could not be read. You have not seen it. Do not describe it, do not imply the brief follows it, and write from the title and the manager's note alone.`;

/** Outline briefs: the loose plan a creator films in their own words. */
export const PLAYBOOK_OUTLINE = `# This brief: an outline

An outline is for creators who film freely. They get a title and a few lines of notes, and the words on camera are their own. So the notes are direction, not script: enough that two different creators would make recognisably the same video, loose enough that neither sounds like the other.

Write four to seven short lines, each on its own line, in plain language addressed to the creator. Cover, in whatever order reads naturally: who this is for and the moment they will recognise; how to open, as one suggested first line and what should be in the frame when it is said (marked as a suggestion they can beat); the two to four beats of the middle, as things to show or tell, not lines to recite; the one thing that must be shown, meaning the product moment and the end state to hold on screen; anything that must be said exactly, which is only ever an offer, a code or a required wording from the company context; and how to end. If there is something they must not say or show, one line for that.

Give facts, moments and customer phrases the creator can use, never adjectives ("make it fun", "be authentic"). Everything in the core playbook about truth still applies: no feature, price or number that is not in the company context, and no asking the creator to claim an experience they may not have had.`;

/** Title ideas. Small on purpose: it runs on the fast tier in its own short prompt. */
export const PLAYBOOK_TITLES = `A working title for a short video is the idea in a few words, the way the manager would say it to a creator: the outcome or the situation, concrete, four to nine words, sentence case. Good titles come from the customer's side: a pain in their words, a moment they would recognise, a result they want, a mistake they make. Weak titles name the product, a feature or a category, or could belong to any company ("5 productivity tips"). Vary the kind across the set: a how-to, a mistake, a story, a comparison with the old way, a specific result. Use only what the company context supports; a title that promises something the product cannot show is a brief that will have to be thrown away. No dashes, no emoji, no exclamation marks, no hype words.`;
