<div align="center">

<img src="assets/brand/app/256.png" width="104" alt="Restash" />

# Restash

### Stash anything. Paste it anywhere.

A macOS menu-bar + Dock app that keeps the things you reach for — wallet
addresses, links, snippets, commands, contacts, files, AI agent prompts, even
whole browser/app *environments* — one hotkey away from any app you're in.

`v1.1.0` &nbsp;·&nbsp; macOS 12+ &nbsp;·&nbsp; Apple Silicon &nbsp;·&nbsp; Private

</div>

---

> ### 📦 To use it: **build it once, then install the built app.**
> Run `npm install && npm run dist`, then install the **Restash.app** it produces.
> Building gives you the real signed bundle, so permissions say **"Restash"**.
> Do **not** treat `npm start` as the app, and don't open an IDE to do this.
>
> **AI agents:** read **[`AGENTS.md`](AGENTS.md)** first — it has the exact
> build/install steps and the permissions to expect.

---

## Install (build it once, then use the app)

Requires **Node.js 18+** on Apple Silicon (macOS 12+). No Xcode needed — the
native helpers are prebuilt and committed.

```bash
# From the repo root
npm install
npm run dist          # builds + ad-hoc-signs Restash.app into dist/

rm -rf /Applications/Restash.app
cp -R dist/mac-arm64/Restash.app /Applications/Restash.app
xattr -cr /Applications/Restash.app && open /Applications/Restash.app
```

`npm run dist` also writes a drag-to-Applications **`dist/Restash-1.1.0-arm64.dmg`**.
Restash then lives in the **menu bar and the Dock**. Press **⌃⇧V** for the
cursor numpad. Full first-run details: **[`AGENTS.md`](AGENTS.md)**.

### Permissions (all dialogs say "Restash")

| Permission | Required? | Why |
|---|---|---|
| **Accessibility** | ✅ | Paste saved items into the app you're in |
| **Automation / Apple Events** | ✅ | Focus the target app to paste; read open tabs for Environments |
| **Screen Recording** | ⚪ | Only for "This desktop" Environment capture |

## Why Restash

Your clipboard holds **one** thing and forgets it the moment you copy the next.
Restash is the opposite: a small, fast vault for the things you paste over and
over. Summon it at your cursor, press a number, and it's pasted into whatever
app had focus — Mail, a terminal, a wallet, a DM.

## Features

| | |
|---|---|
| 🎯 **Cursor numpad** | Press the global hotkey and a 3×3 pad appears at your cursor. Keys `1`–`9` paste instantly. |
| 📋 **Menu-bar dropdown** | A searchable list — type, hit `↵`, it's pasted. Fully resizable. |
| 🗂 **Stashes** | Group items (Work, Wallets, Personal…). Each stash has its own 9-slot numpad; cycle with one hotkey. |
| 🌐 **Environments** | Save a set of sites + apps and open them in one click. Capture **this desktop** (current Space) or **everything open**, and reopen each tab in its assigned **Chrome profile**. |
| 🤖 **Agent templates** | Save Markdown AI personas (Strategist, Researcher, CEO…) and drop them into Claude / ChatGPT / Cursor in a tap. |
| 🔳 **QR decoder** | Drag a box around any on-screen QR code — Restash decodes it and detects the type (URL, crypto, Wi-Fi, contact). |
| 📎 **Multi-file items** | Stash a set of files; one paste attaches all of them in Finder, Mail, or Slack. |
| 🪙 **Crypto-aware** | Wallet items show authentic chain badges (BTC, ETH, SOL +7) and middle-truncate long addresses. |
| 🌗 **Light & dark** | A clean off-white flat design, both modes. |

## How it works

```
1.  ⌃⇧V            →  numpad appears at your cursor
2.  press 1–9      →  item is pasted into the app you were in
3.  ⌃⇧V again      →  cycle to the next stash
```

Restash captures the frontmost app before it opens, then re-focuses it and
posts `⌘V` — so the paste always lands where you meant it to.

## Item types

`URL` · `Crypto wallet` · `Address` · `Text` · `Command` · `Contact` ·
`File` · `Agent template` · `Environment`

## Roadmap

- 📱 **Mobile companion** — cross-device clipboard sync (parked, see `ideas/`)
- 🕘 **Clipboard memory** — auto-capture the last *N* copies
- 🔏 **Signed & notarized builds** — one-click install with no Gatekeeper step

## Tech

Electron 33 · Swift helper binaries (native share sheet, multi-file pasteboard,
Vision QR decoding, current-Space window list) · zero servers — items live in a
local file; licensing via Lemon Squeezy.

## Developing (changing the code)

> Only for working *on* Restash. To **use** it, build & install it (above).

```bash
git clone git@github.com:pue-llo/restash.git
cd restash
npm install
npm start          # dev build via Electron (prompts read "Electron", not "Restash")
npm run dist       # build a DMG into dist/
```

## License

Restash is **proprietary** — © Restash. All rights reserved. This repository is
private; the code is not licensed for reuse or redistribution.
