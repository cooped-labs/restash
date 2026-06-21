# Restash — first-run guide (read this first)

**Restash is a finished macOS app. You build it from this source *once*, then
install and use the built app.** There's no prebuilt download to fetch.

> ## Cross-platform (Windows + Linux)
> Restash also targets Windows 10/11 and Linux (X11 + Wayland) with a strict
> **zero-install** policy: no feature depends on a user-installed binary,
> package, daemon, or extension — every native capability ships inside the app.
> The only user ask is a one-time OS permission (a native dialog already on the
> OS), never a download. Architecture, the policy checklist, and the CI lint
> that enforces it live in **`docs/windows-linux-port.md`**. Per-OS native
> helpers (`bin/restash-win-helper.exe`, `bin/restash-linux-helper`) are built
> from `native/` by the GitHub Actions release matrix — they cannot be compiled
> on macOS. Build with `npm run dist:win` / `npm run dist:linux` on their
> respective OS / CI.

If you are an AI agent (or a person) setting this up for the first time:

> ## ✅ Do this
> Run **`npm install && npm run dist`**, then install the **Restash.app** it
> produces into `/Applications` and launch that. Building creates the real
> signed app bundle (`com.restash.app`), so every macOS permission dialog says
> **"Restash"**.
>
> ## ❌ Do NOT do this
> - Do **not** install an IDE (VS Code, etc.) — you don't need one to build.
> - Do **not** just run `npm start` / `electron .` and treat that as "the app".
>   That's a **dev process**: it has no Dock identity, won't behave like the real
>   app, and macOS attributes its permission prompts to the **parent process**
>   (your terminal or agent, often shown as **"claude"** or **"Electron"**)
>   instead of **Restash**. Always `npm run dist` and install the built `.app`.

---

## Install (build it once, then use the app)

**Requirements:** macOS 12+ on Apple Silicon, and **Node.js 18+** (`node -v` to
check). That's all — the native helper binaries are prebuilt and committed, so no
Xcode/Swift toolchain is needed.

```bash
# From the repo root (the folder containing this AGENTS.md)
npm install          # installs electron + electron-builder (dev deps)
npm run dist         # builds AND ad-hoc-signs Restash.app into dist/

# Install the freshly built app to /Applications, then launch it
rm -rf /Applications/Restash.app
cp -R dist/mac-arm64/Restash.app /Applications/Restash.app
xattr -cr /Applications/Restash.app      # clear quarantine, just in case
open /Applications/Restash.app
```

`npm run dist` also writes a double-clickable **`dist/Restash-1.1.0-arm64.dmg`**
if you'd rather drag **Restash** into **Applications** the classic way.

After launch, Restash appears in **both the menu bar and the Dock**. Press
**⌃⇧V** anywhere for the cursor numpad.

---

## Permissions to expect (grant these up front)

On first use Restash requests the following. **Every dialog says "Restash"**
(because you installed the built app bundle, not a dev process). Grant them in
**System Settings → Privacy & Security**:

| Permission | Required? | Why Restash needs it | When it's asked |
|---|---|---|---|
| **Accessibility** | ✅ Required | Synthesizes ⌘V to paste your saved item into the app you were in | First paste |
| **Automation / Apple Events** | ✅ Required | Re-focuses the target app to paste; reads open browser tabs when you build an Environment | First paste / first Environment capture (per target app) |
| **Screen Recording** | ⚪ Optional | Only for the **"This desktop"** Environment capture — reads window titles on the current Space | First "This desktop" capture |

Notes for agents:
- These are **TCC permissions** — they cannot be granted from the command line.
  Surface the dialogs to the user and let them approve in System Settings.
- If a dialog shows a name **other than "Restash"** (e.g. "Electron" or
  "claude"), you're running the **dev process** — stop, `npm run dist`, and
  install the built `.app` instead.

---

## Verify it's working

- A **Restash** icon is in the menu bar (stash-stack glyph) and the Dock.
- **⌃⇧V** opens a 3×3 numpad at the cursor.
- Clicking the menu-bar icon opens the searchable dropdown.

---

## For developers (changing the code)

`npm start` runs a live dev build via Electron for fast iteration. Its permission
prompts read "Electron"/your terminal name — expected for a dev process, and
exactly why everyone *using* the app installs the built bundle instead.
