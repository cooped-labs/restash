<div align="center">

<img src="assets/brand/app/256.png" width="104" alt="Restash" />

# Restash

### Stash anything. Paste it anywhere.

A macOS menu-bar app that keeps the things you reach for — wallet addresses,
links, snippets, commands, contacts, files, even AI agent prompts — one hotkey
away from any app you're in.

`v1.0.0` &nbsp;·&nbsp; macOS 12+ &nbsp;·&nbsp; Electron &nbsp;·&nbsp; Private

</div>

---

## Why Restash

Your clipboard holds **one** thing and forgets it the moment you copy the next.
Restash is the opposite: a small, fast vault for the things you paste over and
over. Summon it at your cursor, press a number, and it's pasted into whatever
app had focus — Mail, a terminal, a wallet, a DM.

No window juggling. No re-typing your ETH address. No digging through Notes.

## Features

| | |
|---|---|
| 🎯 **Cursor numpad** | Press the global hotkey and a 3×3 pad appears at your cursor. Keys `1`–`9` paste instantly. |
| 📋 **Menu-bar dropdown** | A searchable list in the menu bar — type, hit `↵`, it's pasted. Fully resizable. |
| 🗂 **Stashes** | Group items into profiles (Work, Wallets, Personal…). Each stash has its own 9-slot numpad. Cycle them with one hotkey. |
| 🤖 **Agent templates** | Save Markdown AI personas (Strategist, Researcher, CEO…) and drop them into Claude / ChatGPT / Cursor in a tap. Ships with a curated starter pack. |
| 🔳 **QR decoder** | Drag a box around any QR code on screen — Restash decodes it and detects what it is (URL, crypto, Wi-Fi, contact). |
| 📎 **Multi-file items** | Stash a set of files; one paste attaches all of them in Finder, Mail, or Slack. |
| 🪙 **Crypto-aware** | Wallet items show authentic chain badges (BTC, ETH, SOL +7) and middle-truncate long addresses. |
| ↗ **Share a copy** | Turn any item into a Restash-branded share link. |
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
`File` · `Agent template`

## Build & run

```bash
git clone git@github.com:pue-llo/restash.git
cd restash
npm install
npm start
```

> macOS only. Restash needs **Accessibility** permission to paste into other
> apps — it'll prompt you on first run.

## Roadmap

- 📱 **Mobile companion** — cross-device clipboard sync (parked, see `ideas/`)
- 🕘 **Clipboard memory** — auto-capture the last *N* copies
- 🪟 Windows / Linux ports

## Tech

Electron 33 · a trio of Swift helper binaries (native share sheet, multi-file
pasteboard, Vision QR decoding) · zero servers — items live in a local file,
licensing is handled by Lemon Squeezy.

## License

Restash is **proprietary** — © Restash. All rights reserved. This repository is
private; the code is not licensed for reuse or redistribution.
