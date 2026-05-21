# Restash Mobile — companion app (idea, parked)

> Status: **parked.** Mac ships first. Revisit as its own phase after v1.

## The idea

A Restash app for iPhone (and later Android). The trigger was the **Share a copy**
feature — sharing is fundamentally a phone behavior (iMessage, WhatsApp, DMs),
so a share link wants a mobile home.

But mobile is bigger than "share helper". It turns Restash from *a Mac utility*
into a **cross-device clipboard**:

- Copy a wallet address on Mac → it's on the phone instantly
- Snap / copy something on the phone → paste it on the Mac
- Sharing then becomes "send one of these to someone else"

**Sync is the headline; share rides along.** That's a category jump —
"menu-bar paste tool" → "your clipboard, everywhere" — and a much stronger
pricing story.

## How it makes Share better

- A shared link sent into any chat opens **straight in the Restash app** if the
  recipient has it (iOS universal / deep links).
- No app → the link opens the **temporary web page** with the content + short
  **code** fallback (same web page already mocked in `share-copy-mockup.html`).
- The web fallback means Share still works **today, Mac-only** — mobile makes
  the loop tighter, it is not a prerequisite.

## The catch — what mobile pulls in

Mobile + sync ends Restash's current serverless simplicity:

- Needs **accounts** + a **backend** (sync infra) — the thing deliberately
  avoided so far (local files + Lemon Squeezy licensing).
- App Store review, a separate codebase decision (React Native vs. native Swift).
- When this phase starts, build the backend properly — Share's link
  infrastructure becomes a small part of it.

## Sequencing

1. Ship **Mac v1** first. Share goes in with the web-page fallback.
2. **Mobile is its own phase.** Scope it as **sync**, not share.
3. Don't half-build a backend for Share now — do it once, with mobile/sync.

## Open questions for when it's un-parked

- React Native (shared code, faster) vs. native Swift (best feel, more work)?
- Sync backend: Supabase / Cloudflare / custom?
- Free vs. paid: is cross-device sync a paid feature? (Likely yes — strong hook.)
- Android timing — after iOS, or skip until demand is proven.
