# QA checklist

Run on an iPhone-size device. Every item must pass.

## Review queues
- [ ] Three segments with live counts; empty lanes show their empty states
- [ ] Music rows: no Approve button, full title and meta visible, whole row opens music approval, chevron right

## Post review
- [ ] Default view is the post as it will appear: 9:16, handle, caption, Request changes / Approve
- [ ] Approve shows the Approved takeover with the 3 automation steps
- [ ] Revision mode lists spoken sections ONLY (no caption card)
- [ ] Tapping a section opens the clip sheet: Back / Request changes → note → Save note
- [ ] Footer disabled at zero notes; label "Send back · N notes"; Sent back takeover correct

## Music approval
- [ ] Slideshow pager with dots and arrows; Check the live post rows for both platforms
- [ ] No song player card
- [ ] Accept Song → Song approved takeover (earnings unlocked copy)
- [ ] Request Changes → sheet with 3 multi-select reasons + note, Send back disabled until one is set, Sent back takeover

## Account approval
- [ ] Creator card + 2-column grid of 5 even cards, each with thumb, label, meta, green check
- [ ] Tap card → sheet with the right content (clip / two screenshots / feed test copy / handle rows)
- [ ] Request changes in sheet → note saves, card gets blue border + "Changes" tag
- [ ] Footer: "Send back · N" (disabled at 0) + "Approve and link"; both takeovers correct

## Briefs
- [ ] List: Next week card on top ("Not planned yet..."), then completed weeks only, no incomplete live week
- [ ] Current week chip: green "Day N of 7" computed from today; past weeks "Done"
- [ ] Every completed/current card: $/day avg, views/day, posts/day pills + "N creators" right-aligned
- [ ] Calendar toggle steps weeks; same day/Done status line

## Library
- [ ] Ideas composer placeholder "Type a post idea"
- [ ] Format chip selection: blue-500 fill, white text, small scale-up transition

## Chat
- [ ] Plus button toggles Photos / Camera / Video options (blue-50 tiles)
- [ ] Image and video bubbles render with the light blue placeholder, play disc and duration for video
- [ ] Picking an option opens the native picker/camera and sends the media as a bubble

## Analytics (Stripe gating)
- [ ] Paid out stat shows "since <connect date>"
- [ ] Calendar: $ badges only on days on/after the connect date; footnote explains it
- [ ] Day detail before the connect date: no sales in the summary, note "No money data for this day. Stripe was connected <date>."
- [ ] Post rows/detail before the connect date show no earnings ("Not tracked" in detail)
- [ ] Views, posts, sign-ups unaffected everywhere

## Auth
- [ ] New welcome screen matches AuthScreens.jsx: logo, "Welcome to Noni!", "UGC Made Easy", invite line, Continue with Google
- [ ] App icon updated to the new rocket (white background)

## Global
- [ ] No em or en dashes anywhere in copy
- [ ] All money green; all hit targets 44px+; loading skeletons everywhere data loads
