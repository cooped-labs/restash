# Restash — Idea backlog

A running list of features brainstormed but not yet built. Roughly grouped by theme. Recommendations marked **★**.

---

## 1. Clipboard memory ★ (Kevin's pick to build later)

Auto-capture the last N copied items, configurable in Settings.

- Setting: `Off / 1 / 2 / 3 / 5 / 10`
- Storage: separate from saved items (e.g. `clipboard-history.json`); eviction is FIFO by setting
- UI: a "Recent" section at the top of the list-mode popover (hidden in grid mode)
- Per-row actions: paste, save-to-Restash (promote), share, QR
- Privacy: must skip our own clipboard writes (paste flow already overwrites the clipboard); also a "Clear history" button
- Default: 3

**Why it matters:** the single feature most users assume Restash already does. Turns it from a "saved items" tool into a "default-install" Mac utility.

---

## 2. Site stacks / presets ★ (Kevin's idea)

One click → open multiple URLs (or apps) at once. New item kind: `stack`.

- `Morning Trading` = Coinbase + TradingView + ETH gas tracker + portfolio dashboard
- `Workday start` = Slack + Linear + Notion + Calendar
- Variations to consider later: app launch groups, mixed action chains (open + paste + share), time-triggered presets, full "workspace" switcher

Smallest first version: just URL stacks via `shell.openExternal(url)`, capped at ~6 with a "throttle if more" warning.

---

## 3. Live crypto wallet USD value (stashed)

Show the live USD balance next to each crypto wallet item.

- BTC / ETH / SOL covered with free public APIs (Blockstream, Cloudflare ETH RPC, Solana mainnet)
- Price: CoinGecko `simple/price` (no key)
- Fetches in main process (no CORS), 30s balance cache + 5min price cache
- UI: USD value right-aligned, swap with `⌘1–9` key indicator on hover
- Privacy: disclose in Settings (sending addresses to third parties); default on with toggle to disable

---

## 4. 2FA code interception

Watch macOS Messages / Mail for incoming 6-digit codes, surface them at the top of the popover for ~60s. Reads from the Messages SQLite DB on disk; regex-match new entries.

**Why it matters:** solves a daily pain that no clipboard tool ships. Differentiator.

---

## 5. URL cleaner on paste

When pasting a saved URL, strip `utm_*`, `fbclid`, `?si=…`, etc. One toggle in Settings. Makes Restash silently the cleanest version of every link you share.

---

## 6. Variable templates

Save snippets with `{name}`, `{date}`, `{amount}` etc. On paste, prompt for the variables inline. Pairs well with the crypto/business context (paste a customer-specific message with the right wallet inlined).

Example: `Hi {name}, the wallet for {project} is {wallet}`.

---

## 7. Drop zone (drag-to-save) ★

Drag any file, URL, or selected text onto the menu bar icon → save it. Changes the cost of saving new items from "open editor" to "drag." Half a day's work.

---

## 8. AI rewrite before paste

Select a saved snippet, hold ⌥ on paste → opens an inline transform menu (formal / casual / translate / shorter). Calls Claude/GPT in main process. Optionally save the rewritten version as a new item.

---

## 9. Per-app paste rules

Detect target app via Accessibility. Apply rules:

- Pasting to Slack → strip markdown
- Pasting to Notion → preserve markdown
- Pasting to a wallet form → strip whitespace and newlines

---

## 10. Burner items

Save an item with "auto-delete after first paste." Perfect for one-time verification codes, single-use share addresses, temporary links.

---

## 11. Anti-duplicate on save

When the user enters an item value in the editor that already exists, surface "you already have this as 'My ETH wallet'" instead of creating a dupe.

---

## 12. Browser companion

Tiny Chrome / Safari extension or bookmarklet: right-click any page / selection → "Save to Restash." Removes the alt-tab to save URLs.

---

## 13. Screenshot → QR decoder

Hotkey selects a region of the screen, decodes any QR inside, saves the result. Great for receiving wallet addresses from someone else's phone.

---

## 14. URL templates with variables

Save `Search Etherscan for {address}` as a "launcher" item. Triggering prompts for the address and opens the right page. Pairs nicely with wallet items: hover a wallet → "look up on Etherscan" action.

---

## 15. AppleScript / Shortcuts integration

Expose Restash items as primitives in macOS Shortcuts. `Get Restash item by name → use in next step`. Lets power users build their own automations on top of Restash.

---

## 16. iOS handoff / sync

Items sync via iCloud Drive. Tap on iPhone to copy. No backend needed; iCloud Drive folder reads/writes JSON. Eventually pair with an iOS app.

---

## 17. Personal info auto-fill

Name, phone, address, signature — quick paste into web forms. Could add a "form mode" that auto-detects field type via Accessibility and offers the right item.

---

## 18. Smart paste / smart address detection

When saving a crypto address, detect the chain from address format (BTC `bc1…`, ETH `0x…`, SOL base58 length-44) and auto-tag.

---

## 19. Multi-account / workspaces

Separate "spaces" for work / personal / clients. Each space has its own items, pinned set, and (optionally) hotkey.

---

## 20. Transaction history snapshot

For wallet items, expand on hover to show the last 5 on-chain transactions (via Helius / Alchemy / Blockstream). Builds on the live-USD-value idea.

---

## 21. WalletConnect sign / send (advanced)

Turn Restash into a quick-action layer for hot wallets — sign messages or send transactions to known counterparties from the popover. Cryptographically risky; would need careful UX and per-action confirmation.

---

## 22. Bulk export / sharing

- Export a folder of items as a `.restash` file → onboard a teammate with all the addresses/links they need
- Read-only public share links: "here's the wallet" → hosted page with QR + chain badge
- Encrypted items (API keys, passwords) with TouchID unlock

---

## 23. Quick send via Messages / Slack

Pick a contact + an item = send. Could use macOS Messages.app via AppleScript, or Slack's webhook URL system. Reduces "open Messages, paste, send" to one keystroke.

---

## Priority order (my read)

1. **Clipboard memory** — universal value, completes the "Spotlight for things you reuse" mental model
2. **Site stacks** — small scope, immediate utility, generalizes the "preset" idea
3. **Drop zone** — drops the cost of saving new items
4. **2FA interception** — unique differentiator
5. **URL cleaner on paste** — silent quality-of-life win
6. **Live wallet USD value** — leans into the crypto angle (Kevin's domain)

Everything below 6 is genuinely interesting but more scope or more niche. Revisit when the top 6 ship.
