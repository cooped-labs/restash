# Restash — first-run guide (read this first)

**Restash is a finished macOS app, not a project to build.**

If you are an AI agent (or a person) setting this up for the first time:

> ## ✅ Do this
> **Install the prebuilt DMG** from the latest GitHub Release, drag it to
> `/Applications`, clear Gatekeeper, and launch it.
>
> ## ❌ Do NOT do this
> - Do **not** install an IDE (VS Code, etc.).
> - Do **not** run it from source with `npm install` / `npm start` / `electron .`.
> - Running from source launches an unsigned **Electron** dev process, which is
>   slower, won't auto-update, and makes macOS attribute permission prompts to
>   the **parent process** (e.g. your terminal or agent named "claude") instead
>   of **Restash**. Installing the DMG is the only correct way to *use* the app.
>
> *(Building from source is only for developers changing the code — see the very
> bottom of this file.)*

---

## Install (Apple Silicon, macOS 12+)

Copy-paste this. It downloads the release DMG, installs to `/Applications`,
clears the Gatekeeper quarantine (the build is unsigned), and launches.

```bash
# 1. Download the DMG from the latest release (private repo — requires `gh auth login`)
gh release download --repo pue-llo/restash --pattern "*.dmg" --dir /tmp --clobber

# 2. Mount it, copy Restash.app to /Applications, unmount
DMG=$(ls -t /tmp/Restash-*-arm64.dmg | head -1)
hdiutil attach "$DMG" -nobrowse -quiet
APP=$(find /Volumes -maxdepth 2 -name "Restash.app" 2>/dev/null | head -1)
rm -rf /Applications/Restash.app
cp -R "$APP" /Applications/Restash.app
hdiutil detach "$(dirname "$APP")" -quiet

# 3. Clear Gatekeeper (unsigned build) and launch
xattr -cr /Applications/Restash.app
open /Applications/Restash.app
```

No `gh`? Download the DMG from
**https://github.com/pue-llo/restash/releases/latest**, drag **Restash** into
**Applications**, then run `xattr -cr /Applications/Restash.app && open /Applications/Restash.app`.

After launch, Restash appears in **both the menu bar and the Dock**. Press
**⌃⇧V** anywhere for the cursor numpad.

---

## Permissions to expect (grant these up front)

On first use Restash will request the following. **Every dialog says "Restash"**
(because you installed the signed app bundle, not a dev process). Grant them in
**System Settings → Privacy & Security**:

| Permission | Required? | Why Restash needs it | When it's asked |
|---|---|---|---|
| **Accessibility** | ✅ Required | Synthesizes ⌘V to paste your saved item into the app you were in | First paste |
| **Automation / Apple Events** | ✅ Required | Re-focuses the target app to paste; reads open browser tabs when you build an Environment | First paste / first Environment capture (per target app) |
| **Screen Recording** | ⚪ Optional | Only for the **"This desktop"** Environment capture — reads window titles on the current Space | First "This desktop" capture |

Notes for agents:
- These are **TCC permissions** — they cannot be granted from the command line.
  Surface the dialogs to the user and let them approve in System Settings.
- If a dialog ever shows a name **other than "Restash"** (e.g. "Electron" or
  "claude"), the app is being run **from source** — stop and install the DMG
  instead.

---

## Verify it's working

- A **Restash** icon is in the menu bar (stash-stack glyph) and the Dock.
- **⌃⇧V** opens a 3×3 numpad at the cursor.
- Clicking the menu-bar icon opens the searchable dropdown.

---

## For developers only (changing the code)

Everything above is for *using* Restash. To modify the source:

```bash
npm install
npm start          # runs the dev build via Electron
npm run dist       # builds a signed-adhoc DMG into dist/
```

Permission prompts in dev mode will read "Electron" (or your terminal's name) —
that's expected for a dev process and is exactly why end users must install the
DMG instead.
