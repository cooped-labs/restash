<div align="center">

<img src="assets/brand/app/256.png" width="104" alt="Restash" />

# Restash

### Stash anything. Paste it anywhere.

A macOS menu-bar + Dock app that keeps the things you reach for — wallet
addresses, links, snippets, commands, contacts, files, AI agent prompts, even
whole browser/app *environments* — one hotkey away from any app you're in.

[![Latest release](https://img.shields.io/github/v/release/cooped-labs/restash?label=release&color=2ea44f)](https://github.com/cooped-labs/restash/releases/latest)
[![Stars](https://img.shields.io/github/stars/cooped-labs/restash?color=f0b400)](https://github.com/cooped-labs/restash/stargazers)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
![Platform: macOS](https://img.shields.io/badge/macOS%2012%2B-Apple%20Silicon-black)

</div>

---

> ### Install in one line:
> ```sh
> brew install --cask cooped-labs/restash/restash
> ```
> Prefer a direct download? Grab **`Restash-1.2.0-arm64.dmg`** from the
> [Releases](https://github.com/cooped-labs/restash/releases) page and drag **Restash** into **Applications**.
> Building from source? See [Building from source](#building-from-source).

---

## Install

Requires **macOS 12+ on Apple Silicon**. No Node, Xcode, or other tooling needed.

**Homebrew (recommended):**

```sh
brew install --cask cooped-labs/restash/restash
```

**Or download the DMG:**

1. Download **`Restash-1.2.0-arm64.dmg`** from the
   [Releases](https://github.com/cooped-labs/restash/releases) page.
2. Open the DMG and drag **Restash** into **Applications**.
3. Launch **Restash** from Applications.

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
| 🕘 **Clipboard memory** | Auto-capture your last *N* copies — text, images (with thumbnails), and files. Videos are kept by-reference with one-tap Save. |
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

- 📱 **Mobile companion** — cross-device clipboard sync (parked)
- 🔏 **Signed & notarized builds** — one-click install with no Gatekeeper step

## Tech

Electron 33 · Swift helper binaries (native share sheet, multi-file pasteboard,
Vision QR decoding, current-Space window list) · zero servers — items live in a
local file. Free and open source under **AGPL-3.0** (commercial license available).

## Building from source

> Only for working *on* Restash, or building your own bundle. To simply **use**
> it, download the DMG (above).

Requires **Node.js 18+** on Apple Silicon (macOS 12+). No Xcode needed — the
native helpers are prebuilt and committed.

```bash
git clone https://github.com/cooped-labs/restash.git
cd restash
npm install
npm start          # dev build via Electron (prompts read "Electron", not "Restash")
npm run dist       # builds Restash.app + Restash-1.2.0-arm64.dmg into dist/
```

The built app behaves like the release: install it to `/Applications` and every
permission dialog reads **"Restash"**.

## License

Restash is **dual-licensed**:

- **Open source — [GNU AGPL-3.0](LICENSE).** Free to use, modify, and self-host. If you
  distribute Restash or a derivative, or run a modified version as a network service, you
  must make your source available under the AGPL.
- **Commercial license.** For companies that want to embed Restash in a closed-source or
  SaaS product without AGPL obligations, or that need enterprise terms and support, a
  commercial license is available — contact **coopedlabs@gmail.com**.

Copyright © 2026 Progress with Puello LLC.

Contributions are accepted under the [Contributor License Agreement](CLA.md); see
[CONTRIBUTING.md](CONTRIBUTING.md).
