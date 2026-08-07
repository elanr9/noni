# QA — Creator journey, end to end

Device test checklist. Run top to bottom on a real device (camera, mic,
notifications, and Apple sign in all need hardware). You need: a fresh
install (or wiped app storage), a Google or Apple account that has never
signed into Noni, and an admin login on a second device (or simulator) to
work the review queues.

Statuses only ever move assigned → recorded → submitted →
(changes_requested → recorded → submitted)* → approved → posted. If you
ever see a different hop, that is a bug.

## 1. Fresh install and entry routing

- [ ] Cold open on a fresh install lands on the onboarding welcome screen
      (Noni wordmark, "Get paid to post."), NOT the login screen.
- [ ] "Already have an account? Sign in" opens the login screen. Login
      offers Sign in with Apple (iOS only) and Sign in with Google. There
      is no email or phone option anywhere.
- [ ] Kill the app after answering a few questions, reopen: you land back
      in onboarding with your answers preserved (they persist locally).
- [ ] After you have finished onboarding once on this device, a signed-out
      cold open goes to login, not to onboarding.

## 2. Onboarding (Cal AI flow, pre-auth)

Walk the screens in order. Each has a thin progress bar, a back arrow, and
a Continue button that stays disabled until the question is answered.

- [ ] Welcome → Get Started → first name (text field).
- [ ] Birthday: three-column date wheel. You can proceed at any age (no
      gate, collect only).
- [ ] Phone number: types formatted as (555) 555 5555, US only.
- [ ] "What do you know about UGC?" — 4 options, selected option goes
      solid black.
- [ ] "What's been hardest about making money online?" — 4 options.
- [ ] "How many hours a week" — ~2 / ~5 / ~10 / 15+.
- [ ] Estimate screen: number animates up. 2h → $1,000, 5h → $1,500,
      10h → $2,200, 15+ → $3,000 per month. Copy names your chosen hours.
- [ ] Save your progress: Apple button on iOS, Google on all platforms.
      Cancel the OAuth sheet: you stay on the screen, no crash.
- [ ] Sign in with a BRAND NEW account: flow continues to "How did you
      hear about Noni?" (it does not bounce to the app).
- [ ] Sign in with an EXISTING onboarded account here instead: you skip
      the rest of onboarding and land in your app.
- [ ] Heard from (TikTok / Instagram / Friend / Other) → notifications
      explainer → system permission prompt. "Not now" also proceeds.
- [ ] Camera + mic permission screen → done screen ("You're in.") →
      "Let's go" lands you in the creator app.
- [ ] DB check (admin or SQL): the new profile row has full_name,
      birthday, phone (+1 digits), and onboarding_answers with
      ugc_experience, hardest_part, hours_per_week, heard_from.
- [ ] Resume check: sign in on a second device with the same new account
      BEFORE finishing onboarding: you resume at "How did you hear about
      Noni?", not at the start.

## 3. Setup gate

- [ ] Immediately after onboarding, you land on the "Get set up" checklist,
      not Home. Deep-linking or navigating to any tab bounces back to the
      checklist.
- [ ] Chat, profile, and the account setup screen are still reachable while
      gated (help link at the bottom of the checklist opens chat).
- [ ] The checklist shows 4 cards with To do / In review / Done chips and a
      "N of 4 done" counter. Pull to refresh re-derives the state.

## 4. Setup steps

Step 1 — Create your accounts:

- [ ] Card opens the account setup screen: name and username suggestions
      with Copy/Use buttons, company bio template with copy buttons, example
      screenshot if the company set one.
- [ ] Saving requires both handles AND both profile screenshots. Leading @
      is stripped from handles.
- [ ] After save, the checklist marks step 1 Done. The row is NOT in the
      admin approval queue yet (drafts hide there by design, see Known
      limitations).

Step 2 — Connect your accounts:

- [ ] Card opens the social connect flow in an in-app browser. Connect both
      TikTok and Instagram.
- [ ] With only one connected, the card subtext names which one is missing.
      Step is Done only when both are linked.

Step 3 — Warm them up:

- [ ] 4-page swipeable tutorial (what / why / what to do / prove it).
      Reaching the last page silently records warmup_tutorial_seen on the
      profile.
- [ ] Prove-it page before step 1 is saved: amber notice pointing you back
      to account setup, no upload slots.
- [ ] Upload slots enforce minimum durations: TikTok recording under ~15s
      or Instagram under ~20s is rejected with an alert.
- [ ] Submit flips the card to In review, and the row now appears in the
      ADMIN account approval queue with all four assets (2 screenshots + 2
      recordings).
- [ ] Admin send-back branch: admin requests changes with a reason. Creator
      checklist shows "Sent back: {reason}" on the warm-up card, account
      setup shows the amber "Changes needed" card, and the creator can
      replace files and resubmit. Resubmit clears the reason and returns the
      row to the admin queue.
- [ ] Admin approves: warm-up card goes Done.

Step 4 — Connect your bank:

- [ ] Card opens Stripe Connect onboarding in an in-app browser. Finish it;
      the card goes Done after refresh.
- [ ] Partial branch: abandon Stripe halfway, the step stays To do.

Gate release:

- [ ] With account approved + both socials connected + bank connected, the
      checklist shows the green "You are all set" card and Go button; Home
      is now reachable and the gate never appears again (a setup_complete
      flag is persisted, so later launches skip the checks).

## 5. Home

- [ ] Hero card shows THE next post: thumbnail, title, format pill (Reel or
      Slideshow). Tapping it opens assignment detail.
- [ ] Streak indicator renders (0 is fine for a new creator).
- [ ] Bell icon opens chat. The unread dot shows only when there are unread
      admin messages or an assignment in changes_requested, not always.
- [ ] Swap: open the swap sheet on an untouched (assigned) assignment,
      pick a different brief. The hero card updates to the new brief.
      Swap is only offered before recording starts.
- [ ] Swap-after-draft branch: record and keep one clip, back out, swap the
      brief, reopen record. You start clean at clip 1 (the old draft must
      NOT resume against the new brief).

## 6. Assignment detail

- [ ] Title, description/hook, and format chip read clean above the fold.
- [ ] "Watch the example" opens in an in-app browser sheet (you are not
      kicked out to the TikTok/Instagram app or Safari).
- [ ] Sticky CTA: "Record" for video briefs, slides CTA for photo
      carousels. Video CTA opens the record screen; carousel CTA opens the
      photo upload screen.
- [ ] Stats row: views / likes / revenue show em dashes before posting, and
      the bounty cell shows progress toward the view threshold.

## 7. Record (video, per clip)

- [ ] Clip plan matches the brief: Hook and CTA are scripted (teleprompter
      scrolls, tap to pause, speed chips 0.75x to 1.5x), Points show one
      large beat each (no script). Segment briefs drive the plan; briefs
      without segments derive hook / points / cta.
- [ ] Record a clip: 3-2-1 countdown, 90s cap with visible timer, stop
      button. Review loops the take with Retake / Keep clip.
- [ ] Keep uploads the clip immediately ("Saving your clip…") and advances
      to the next missing clip. Progress segments at the top fill in.
- [ ] Resume branch: keep 2 of 4 clips, force-kill the app, reopen the
      assignment and hit Record. You resume at clip 3 with clips 1 and 2
      already marked kept.
- [ ] Retake branch: tap a kept clip's chip, re-record it. The new take
      replaces the old one (count of kept clips does not change).
- [ ] Front flash: with Flash on and front camera, the screen brightens to
      max during recording and restores after.
- [ ] All clips kept → summary screen → "Send for review" → toast → you are
      returned Home. Assignment status now reads In review (submitted).
- [ ] Airplane-mode branch: keep a clip with no connection. You get a
      "Could not save the clip" alert and stay on review (nothing is lost).

## 8. Upload (photo carousel)

- [ ] A photo carousel brief's CTA opens the upload screen: one card per
      slide with the slide text and an Add photo slot.
- [ ] Pick a photo per slide from the library. "Swap photo" replaces any
      slide before submit.
- [ ] Submit stays disabled ("N of M photos picked") until every slide has
      a photo.
- [ ] Send for review uploads, toasts, returns Home; status is In review.
- [ ] Legacy branch: an old carousel brief with no post type records as a
      VIDEO through the record screen (script parts in the teleprompter),
      not through photo upload.

## 9. Review round trip

- [ ] Admin requests changes with a structured note. Creator sees:
      an amber "Changes requested" card at the top of assignment detail
      with the note parsed into labeled rows, the full review thread below,
      and a pinned amber card in chat that opens the assignment.
- [ ] Creator can reply in the thread on assignment detail (composer works
      both directions).
- [ ] Re-record CTA reads "Record again" (video) or the slides variant
      (carousel) and opens the same record/upload flow. Submitting again
      creates version 2 and returns status to In review.
- [ ] Admin approves: status Approved, then (automation) Posted with a live
      post URL. No creator action is possible in either state.
- [ ] Slideshow music branch: once a carousel is posted, assignment detail
      shows the add-music step; "Music added" is one tap, idempotent, and
      queues admin music approval.

## 10. Analytics tab

- [ ] Analytics tab sits between Posts and Profile. Empty state before the
      first live post: "Your numbers show up after your first post goes
      live."
- [ ] With posted assignments: MiniStat row (Views, Likes, Earned), tapping
      a stat promotes it to the 30-day AreaChart. SplitBar renders only
      when views are attributable per platform.
- [ ] TikTok | Instagram switch filters the POSTS LIST only; the stat
      totals stay combined (see Known limitations).
- [ ] Tapping a post row opens its assignment detail.

## 11. Balance and cash out

- [ ] Profile → Balance shows Available and Pending amounts plus a ledger
      (bounty credits, streak bonuses, cash outs).
- [ ] Bounty flow: when a posted assignment crosses the view threshold, a
      bounty credit lands in the ledger and Available increases.
- [ ] Streak bonus rows appear in the ledger when earned.
- [ ] WITHOUT Stripe onboarded (only possible if setup state was completed
      through other means; normally the gate requires it): the screen shows
      "Set up payouts" instead of a cash out button.
- [ ] With Stripe onboarded and Available > 0: Cash out button shows the
      exact amount, confirmation alert, then "pending until Stripe
      confirms" and a Cash out hold row in the ledger.
- [ ] With Available = 0 the button reads "Nothing to cash out" and is
      disabled.

## 12. Chat

- [ ] Chat opens from the bell, from profile, and from the setup checklist
      help link.
- [ ] Messages send both directions (test from the admin creator thread).
- [ ] Post references in messages are tappable and open the assignment.
- [ ] Assignments in changes_requested pin as amber cards above the thread
      and unpin after resubmission.

## 13. Profile

- [ ] Shows the creator's connected account status, a Payouts row (opens
      Stripe Connect), Balance row, Account setup row, and chat row.
- [ ] Sign out returns to login; signing back in lands Home (no repeated
      onboarding, no setup gate).

## Known limitations (by design, do not file as bugs)

- **Analytics is combined-platform.** The metrics poller rolls TikTok and
  Instagram into one number set. The platform switch filters the post list
  only; per-post platform is guessed from the post URL host, and posts with
  no URL show under both tabs. MiniStat deltas are blank (no historical
  snapshot to diff).
- **Account drafts are stored as needs_changes.** creator_accounts has no
  draft status, so step 1 saves the row as needs_changes with no reason to
  keep it out of the admin queue. Only the warm-up proof submit sets
  pending. A draft row therefore reads as "changes needed" at the DB level
  even though no admin has seen it.
- **Auth is Apple + Google OAuth only.** Email/password and phone auth were
  removed after round 1. There is no account recovery path outside the
  OAuth providers.
- **No real thumbnails.** Post cards and assignment detail use trend cover
  images or gradient placeholders; submitted clips and photos are not
  thumbnailed.
- **Retakes orphan storage files.** Re-recording a kept clip replaces the
  draft row entry but leaves the old file in the videos bucket. Draft files
  also remain after submit (the submission references them directly).
- **Legacy carousel briefs (no post type) record as video.** post-approved
  still expects a video on that path; only new-world carousels use photo
  upload.
- **Empty CTA fallback.** A brief with no cta gets "Close it out and tell
  them what to do next." as the outro teleprompter text.
