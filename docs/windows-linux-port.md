# Restash — Windows + Linux Port (v1.1 feature parity)

**Status:** Design for approval. No app code changes yet.
**Target:** Bring the macOS-only Restash (Electron 33, vanilla JS) to **Windows 10/11** and **Linux (X11 + Wayland)** with full **v1.1** feature parity.
**Author of record:** design draft for Kevin.

---

## 0. TL;DR

Most of Restash is already cross-platform by accident: storage (`app.getPath('userData')`), settings, Lemon Squeezy licensing (`fetch` to a public API), global hotkeys (Electron `globalShortcut`), the popover/numpad UI (BrowserWindow + HTML/CSS), themes, QR *encoding* (`qrcode` npm), and `shell.openExternal`. **These ship as-is.**

The hard part is a small, well-defined set of **macOS-native dependencies**, all spawned as Swift helpers or `osascript`:

1. **Paste into the active app** — currently `osascript` "keystroke v using command down" + AppleEvents app re-activation. This is the core interaction and the single biggest port item.
2. **Capturing the frontmost app** before the popover steals focus.
3. **QR decode** — Swift Vision helper (`restash-decode-qr`).
4. **Multi-file paste** — Swift `NSPasteboard` helper (`restash-clip-file`).
5. **Window/Space listing** for Environments — Swift `CGWindowList` helper (`restash-windows`).
6. **Native share sheet** — Swift `NSSharingServicePicker` helper (`restash-share`).
7. **Chrome profile discovery + per-profile launch** — hardcoded macOS Chrome paths.
8. **Notch shelf (RES-13)** — mac-only hardware concept.
9. **Tray icon** — currently a mac "Template" monochrome image.

**Parity headline:**
- **Easy / works as-is:** ~60% of the feature set (UI, storage, hotkeys, licensing, theming, QR encode, stashes, pinning, agent templates, crypto badges, hotkey customization).
- **Needs adaptation (solvable):** paste, frontmost-app capture, QR decode, multi-file clipboard, tray icon assets, environments/Chrome, notch fallback.
- **Hard-blocked / degraded:** **Wayland paste synthesis** (no portal for global synthetic input; needs `ydotool` + a user-installed uinput daemon, or copy-only fallback). **Native share sheet** has no clean Linux equivalent (degrade to copy/open). **Window-title capture on Wayland** is unavailable (degrade to running-app list only).

---

## 1. Feature-parity matrix

Legend: ✅ works as-is · 🔧 needs adaptation · ⚠️ degraded · ⛔ hard-blocked.

| v1.1 feature | macOS (today) | Windows | Linux (X11) | Linux (Wayland) | One-line note |
|---|---|---|---|---|---|
| 9 item kinds (data model) | ✅ | ✅ | ✅ | ✅ | Pure JS/JSON; no OS dependency. |
| Item storage (`items.json`) | ✅ | ✅ | ✅ | ✅ | `app.getPath('userData')` is cross-platform. |
| Settings / theme persistence | ✅ | ✅ | ✅ | ✅ | Same. |
| Light/dark theme | ✅ | ✅ | ✅ | ✅ | CSS only; follow `nativeTheme` per OS. |
| Cursor numpad (3×3 popover) | ✅ | ✅ | 🔧 | 🔧 | UI works; cursor-anchored positioning needs per-OS work-area math; Wayland can't set absolute window position (see §2.10). |
| Tray dropdown + search | ✅ | 🔧 | 🔧 | ⚠️ | Electron `Tray` works on Win/X11; icon assets differ; some Wayland DEs lack a tray (GNOME needs AppIndicator ext). |
| Global hotkey ⌃⇧V summon | ✅ | 🔧 | 🔧 | ⚠️ | `globalShortcut` cross-platform; remap accelerators; Wayland global shortcuts are compositor-gated. |
| Hotkey customization | ✅ | ✅ | ✅ | ⚠️ | Same UI; same Wayland caveat. |
| QR decoder ⌃⇧F | ✅ Vision | 🔧 | 🔧 | ⚠️ | Replace Vision with `zxing-wasm`/`jsQR`; region capture via `desktopCapturer`; Wayland capture needs portal. |
| **Paste into active app** | ✅ AppleEvents/AX | 🔧 SendInput | 🔧 xdotool | ⛔→⚠️ ydotool/copy-only | The core port problem. See §2.1. |
| Capture frontmost app | ✅ AppleEvents | 🔧 Win32 | 🔧 X11 | ⛔ | No Wayland API for foreground window; not needed if we don't hide-and-restore (see §2.2). |
| Multi-file paste | ✅ NSFilenames | 🔧 CF_HDROP | 🔧 file URIs | ⚠️ | Electron `clipboard` lacks multi-file write everywhere; native shim or per-OS approach (see §2.3). |
| Stashes + per-stash numpad | ✅ | ✅ | ✅ | ✅ | Pure JS. |
| Per-stash pinning to numpad | ✅ | ✅ | ✅ | ✅ | Pure JS. |
| Environments: reopen sites | ✅ | 🔧 | 🔧 | 🔧 | `shell.openExternal` for default browser; per-profile needs Chrome path per OS. |
| Environments: reopen apps | ✅ `open -a` | 🔧 | 🔧 | 🔧 | Replace `open` with per-OS launch (see §2.6). |
| Environments: Chrome profiles | ✅ | 🔧 | 🔧 | 🔧 | Chrome `Local State` path + binary path differ per OS; logic identical. |
| Environments: capture "this desktop" | ✅ CGWindowList | 🔧 | ⚠️ | ⛔ | Win32 enum / X11 EWMH; Wayland can't list other apps' windows. |
| Agent templates | ✅ | ✅ | ✅ | ✅ | Markdown text → paste; rides on the paste layer. |
| QR encode (display) | ✅ `qrcode` | ✅ | ✅ | ✅ | npm `qrcode`, cross-platform. |
| Crypto chain badges | ✅ | ✅ | ✅ | ✅ | Bundled SVG/PNG assets. |
| Native share sheet | ✅ NSSharingServicePicker | ⚠️ | ⚠️ | ⚠️ | No clean equivalent; Win has a Share contract (hard from Electron), Linux none. Degrade to copy/openExternal (see §2.7). |
| Notch shelf (RES-13) ⌃⇧S | ✅ | ⚠️ | ⚠️ | ⚠️ | Mac hardware concept; fall back to top-center shelf (already planned). |
| Lemon Squeezy licensing | ✅ | ✅ | ✅ | ✅ | `fetch` to public LS API; serverless. Machine-id for activation instance name needs a cross-platform source (see §2.9). |
| Permissions / TCC prompts | ✅ | n/a | n/a | n/a | Win/Linux have no TCC; remove AX/AppleEvents gating, replace with capability checks (see §5). |
| Auto-update | (not shipped) | 🔧 | 🔧 | 🔧 | `electron-updater` per target; see §4. |

---

## 2. Per-feature cross-platform strategy

Every macOS-native dependency below is currently invoked from `main.js` via `execFile`/`spawnSync` on `osascript` or a bundled Swift helper in `bin/`. The strategy is to route each through a new **platform abstraction layer** (§3) so `main.js` calls one API and the per-OS implementation lives in `platform/{darwin,win32,linux}.js`.

### 2.1 Paste into the active app (the core interaction)

**Today (macOS, `paste:active` handler, main.js ~1720):**
1. Check Accessibility trust (`systemPreferences.isTrustedAccessibilityClient`).
2. Write payload to clipboard (text via `clipboard.writeText`, files via `restash-clip-file`).
3. `win.hide()` + `app.hide()`.
4. Re-activate the previously-frontmost app by PID via AppleEvents.
5. `osascript` → `keystroke "v" using command down`.
6. Restore the user's previous clipboard 350 ms later.

The whole shape (clipboard-then-synthesize-paste, with clipboard save/restore) is the **right cross-platform pattern**. Only steps 1, 4, 5 are OS-specific.

**Windows strategy:**
- **Synthesize Ctrl+V** via `SendInput`. Two viable mechanisms:
  - **Preferred: a tiny native helper** mirroring the Swift helpers — a `restash-paste.exe` (C#/.NET self-contained or a few-KB C/Win32 exe) that calls `keybd_event`/`SendInput` for Ctrl+V. Ships prebuilt and committed, exactly like `bin/restash-*`. Zero node-gyp.
  - **Alternative: `nut.js`** (`@nut-tree-fork/nut-js`) — prebuilt binaries, `keyboard.type(Key.LeftControl, Key.V)`. Heavier dep but no custom exe to maintain. (`robotjs` is unmaintained / node-gyp pain — avoid.)
- **Foreground restore:** Win32 `SetForegroundWindow`. Electron alone cannot reliably return focus to the prior app, so capture the foreground `HWND` on hotkey-down (see §2.2) and restore it in the same native helper before sending Ctrl+V. The `restash-paste.exe` can take the target HWND as an arg.
- **Recommendation:** the custom `restash-paste.exe` (capture HWND + SetForegroundWindow + SendInput Ctrl+V in one call) — smallest, most reliable, matches the existing helper pattern.

**Linux strategy:**
- **X11:** `xdotool` — `xdotool key --clearmodifiers ctrl+v`, and `xdotool windowactivate <id>` to restore focus. Either shell out to a (commonly preinstalled, else apt/dnf-installable) `xdotool`, or use the `libxdo` bindings. Shelling out is simplest and dependency-light; detect presence and surface an install hint if missing.
- **Wayland:** **the hard case.** There is no portal for arbitrary global synthetic key injection.
  - **Best effort: `ydotool`** — works compositor-agnostically because it writes to the kernel `uinput` device, but requires the `ydotoold` daemon running with access to `/dev/uinput` (a one-time user/root setup). We detect `ydotool` + a live daemon and use it when present.
  - **GNOME/KDE specifics:** some compositors expose `org.freedesktop.portal.RemoteDesktop` (used by RDP/remote tools) which *can* notify keyboard events after a one-time user consent dialog; this is fragile and portal-version-dependent. Treat as an optional later enhancement, not the baseline.
  - **Fallback: copy-only.** If no injection path is available, write to clipboard and toast "Copied — press Ctrl+V". This is the graceful degrade for all unsupported environments.
- **Detection:** read `XDG_SESSION_TYPE` / `WAYLAND_DISPLAY` to branch X11 vs Wayland at runtime.

**Graceful "copy-only" fallback (all platforms):** the paste API returns a status; when synthesis is unavailable or denied, we still place the payload on the clipboard and the renderer shows a "Copied — paste with ⌘V/Ctrl+V" affordance. This is already partly implemented for the macOS no-Accessibility path and generalizes cleanly.

### 2.2 Capturing the frontmost app

**Today:** `captureFrontmostApp()` reads the frontmost process PID via AppleEvents and re-activates it before pasting, because hiding the popover doesn't deterministically return focus on macOS.

**Cross-platform:**
- **Windows:** `GetForegroundWindow()` on hotkey-down stores the target `HWND`; the paste helper restores it with `SetForegroundWindow`. Captured in the native helper or via a `getForegroundWindow()` call in the platform layer.
- **Linux X11:** `xdotool getactivewindow` (or `_NET_ACTIVE_WINDOW` via EWMH) on hotkey-down; restore with `xdotool windowactivate`.
- **Linux Wayland:** **no API to read or set the foreground window of another client.** We rely on the compositor naturally returning focus when our popover closes (it usually does, since our window is a short-lived override-redirect/utility surface). If injection works via `ydotool`, the keystroke lands wherever focus returned — acceptable. This is why Wayland paste is "best effort."

**Simplification opportunity:** on Windows/X11 we can fold capture+restore+synthesize into a single native-helper invocation (pass the saved window handle as an arg), avoiding the multi-step async dance and the 120 ms focus-settle sleep used on macOS.

### 2.3 Multi-file paste / clipboard

**Today:** `restash-clip-file` writes `NSFilenamesPboardType` + `public.file-url` + plain-text fallback so one ⌘V attaches all files.

Electron's built-in `clipboard` module **cannot write a list of files** on any platform (it does text, html, image, rtf, bookmark — no file descriptors). So a per-OS path is required:

- **Windows:** put a **`CF_HDROP`** structure on the clipboard (a `DROPFILES` header + double-null-terminated path list). Done in the same `restash-paste.exe`/`restash-clip.exe` native helper (`OpenClipboard`/`SetClipboardData(CF_HDROP, ...)`). This makes Explorer, Outlook, and most apps accept a multi-file Ctrl+V.
- **Linux X11:** the clipboard "files" convention is a `text/uri-list` target with `file://` URIs (newline-separated), plus the GNOME-specific `x-special/gnome-copied-files` target (`copy\n` + URIs) that Nautilus/Files expects. `xclip`/`wl-copy` can set custom targets: `xclip -selection clipboard -t text/uri-list`. A small wrapper sets both targets.
- **Linux Wayland:** `wl-copy --type text/uri-list` (from `wl-clipboard`). Same two-target approach where supported.
- **Fallback everywhere:** if multi-file clipboard isn't achievable, copy the **first** file (or newline-joined paths as text) and toast a notice. File items remain openable/revealable via `shell` regardless.

**Note on `shell` reveal/open:** `file:open`/`file:reveal` already use Electron `shell.openPath` / `shell.showItemInFolder`, both cross-platform — no change needed.

### 2.4 QR decode

**Today:** `restash-decode-qr` (Swift Vision) decodes a PNG; the region is captured with `screencapture -i -s` / `-R` and a custom lens overlay.

**Cross-platform replacement — pure JS, no native dep:**
- **Decoder:** **`zxing-wasm`** (ZXing compiled to WASM — robust, multi-format, actively maintained) or **`jsQR`** (lighter, QR-only, pure JS). Recommend `zxing-wasm` for parity with Vision's robustness; `jsQR` as the lightweight fallback. Both run in the renderer or main and need only an `ImageData`/pixel buffer — fully cross-platform.
- **Region capture:** replace `screencapture` with Electron **`desktopCapturer.getSources({ types: ['screen'] })`** to grab the display(s), draw to an offscreen `<canvas>`, crop to the user-dragged rectangle, hand the `ImageData` to the decoder. The existing transparent lens/overlay window (`qr-scan-overlay.html`) is reusable as-is — it's just a BrowserWindow.
- **Per-OS capture notes:**
  - **Windows / X11:** `desktopCapturer` works without extra prompts.
  - **Wayland:** screen capture goes through the **`xdg-desktop-portal` ScreenCast** flow, which shows a one-time picker/consent dialog. Electron 33 supports this via the PipeWire path, but the UX is a portal dialog rather than seamless capture. Acceptable; document it. Multi-monitor/HiDPI scaling must be handled (use `thumbnailSize` at full display resolution and account for `display.scaleFactor`).
- This change is a **net win**: it removes a native binary and unifies QR on all three platforms (we could even migrate macOS to it later to delete the Swift helper).

### 2.5 Tray / menu-bar

**Today:** Electron `Tray` with a generated monochrome "Template" `nativeImage` (auto-inverts for macOS menu bar light/dark), positioned under the menu-bar icon via `positionUnderTray()`.

**Cross-platform:**
- **Electron `Tray` is cross-platform**, but:
  - **Icon format/size:** Windows wants a **`.ico`** (16/24/32 multi-res) or a 16×16 PNG; Linux wants a **PNG** (typically 22–24 px). The mac "Template" auto-invert convention does **not** apply — provide explicit light/dark-appropriate icons. Generate them in `scripts/build-brand-assets.js` alongside the existing mac assets.
  - **No "menu bar" concept:** Windows = system tray (bottom-right, can be hidden in the overflow chevron); Linux = system tray/AppIndicator (location varies by DE; **GNOME has no tray by default** and needs the AppIndicator/KStatusNotifier extension — document this and provide a fallback entry point, e.g. a global-hotkey-only mode or a small launcher window).
  - **Popover positioning near the tray:** `tray.getBounds()` is **empty/unreliable on Linux** and bottom-anchored on Windows. Strategy: on Windows, anchor the popover to the tray bounds when available, else to the bottom-right work-area corner; on Linux, anchor to the cursor or the work-area corner. The cursor-numpad mode already positions at the cursor, which sidesteps tray geometry entirely — prefer that as the primary summon on Linux.
- **Left-click vs right-click:** macOS opens the popover on click; on Windows/Linux, left-click toggles the popover, right-click opens a native context menu (Quit, Settings, Decode QR…). Wire `tray.on('click')` and `tray.popUpContextMenu()`.

### 2.6 Environments — window listing, app launch, Chrome profiles

**App launch (`env:open`):**
- **Today:** `/usr/bin/open -a <app>` (apps) and `open`/Chrome binary (sites).
- **Windows:** launch apps via `shell.openPath` (for known paths) or `child_process.spawn('cmd', ['/c', 'start', '', target])`; store an executable path or AppUserModelID per app target. Capturing "which app" is the harder half (see below).
- **Linux:** `child_process.spawn` the executable, or `gtk-launch <desktop-id>` / `xdg-open` for `.desktop` apps.

**Chrome profile discovery (`chrome:profiles`) + per-profile launch:**
- The logic (read `Local State` → `profile.info_cache`; launch `--profile-directory=<dir> --new-window <url>`) is identical across OSes. Only the paths change:
  | | Chrome `Local State` | Chrome binary |
  |---|---|---|
  | macOS | `~/Library/Application Support/Google/Chrome/Local State` | `/Applications/Google Chrome.app/.../Google Chrome` |
  | Windows | `%LOCALAPPDATA%\Google\Chrome\User Data\Local State` | `%PROGRAMFILES%\Google\Chrome\Application\chrome.exe` (also check `%LOCALAPPDATA%\...\chrome.exe`) |
  | Linux | `~/.config/google-chrome/Local State` | `google-chrome` / `google-chrome-stable` on `PATH` |
- Note: current code reads `app.getPath('appData')` which is `~/Library/Application Support` on mac but `%APPDATA%` (Roaming) on Windows — Chrome lives under **Local**AppData on Windows, so the platform layer must resolve the correct path explicitly rather than reuse `appData`.
- Detect Chrome via existence checks; degrade to default-browser `shell.openExternal` (no profile targeting) when absent — same as the current `hasChrome` fallback.

**"This desktop" / "everything open" capture (`apps:list`, `env:capture`):**
- **Today:** `restash-windows` (CGWindowList, current Space) + AppleScript "every process whose background only is false."
- **Windows:** `EnumWindows` + `GetWindowText` + `GetWindowThreadProcessId` → process name & title (native helper `restash-windows.exe` or `ffi`-free exe). Visible top-level windows only. No "Space" concept; "this desktop" = current virtual desktop via `IVirtualDesktopManager` (best-effort) or just all visible windows.
- **Linux X11:** EWMH `_NET_CLIENT_LIST` + `_NET_WM_NAME` via `wmctrl -l` or `xdotool search`. Gives owner + title.
- **Linux Wayland:** **⛔ cannot enumerate other clients' windows or titles.** Degrade "capture this desktop" to **running-application list only** (via `/proc` scan or a portal app-chooser), and let the user pick apps/sites manually. Document this clearly as the Wayland limitation.

### 2.7 Native share sheet

**Today:** `restash-share` (NSSharingServicePicker) anchored at the mouse.

- **Windows:** there is a Share contract (`DataTransferManager`), but invoking it from Electron is awkward (needs a packaged appx identity and WinRT projection). **Not worth it for v1.** Degrade: a small in-app menu — Copy, Open URL, Reveal file, "Email…" (`mailto:`), or OS default via `shell.openExternal`.
- **Linux:** no standard share sheet. Same in-app degrade.
- **Recommendation:** keep the native share sheet **macOS-only**; on Win/Linux replace the row "Share" button with a lightweight "Copy / Open / Reveal" action set. The data model and `share:item` IPC stay; the platform layer returns `supportsNativeShare: false` and the renderer adapts.

### 2.8 Notch shelf (RES-13)

**Today:** a shelf BrowserWindow positioned over the menu-bar band / notch on notch-bearing Macs, summoned by ⌃⇧S.

- Mac hardware concept; **no Windows/Linux analog.** Fall back (already the planned behavior) to a **top-center quick-add shelf** anchored to the active display's work-area top-center. The shelf HTML/preload (`notch-shelf.html`, `notch-shelf-preload.js`) are reusable verbatim; only the positioning math in `positionShelfOnActiveDisplay()` branches per OS (notch detection → mac only; top-center → Win/Linux). Wayland can't set absolute position, so center it via the compositor's default or use a normal centered window.

### 2.9 Licensing (Lemon Squeezy)

- The flow is already serverless and cross-platform (`fetch` to `api.lemonsqueezy.com`). **Ships as-is.**
- One detail: `licenseInstanceName()` likely uses a mac-flavored machine identifier for the LS activation instance. Use a cross-platform stable id — e.g. `os.hostname()` + a persisted random UUID stored in `userData` (`machineId`), generated once. This avoids the 3-device activation limit being miscounted across reinstalls and works identically on all OSes.

### 2.10 Global hotkeys & window positioning

- **`globalShortcut`** is cross-platform. Accelerator strings: `Command+Shift+V` → use `CommandOrControl+Shift+V` so the same config maps to ⌘ on mac and Ctrl on Win/Linux, yielding **Ctrl+Shift+V** there.
- **Conflict warning — Ctrl+Shift+V:** this is the universal **"paste without formatting"** shortcut in browsers, VS Code, terminals, Slack, etc. Registering it globally on Win/Linux will **shadow** that function app-wide. **Strong recommendation:** change the default summon hotkey on Win/Linux to a non-conflicting combo (candidates: `Ctrl+Alt+V`, `Ctrl+Shift+Space`, or `Win`/`Super`-based — note `Super`+key is often reserved by the DE). The existing hotkey-customization UI already lets users change it; we just pick a safer per-OS default and let `tryRegisterHotkey` fall back if taken.
- **QR (`Control+Shift+F`)** and **shelf (`Control+Shift+S`)**: `Ctrl+Shift+F` = "find in files"/"find" in many apps, `Ctrl+Shift+S` = "Save As" in Office/browsers. Re-pick safer Win/Linux defaults (e.g. `Ctrl+Alt+F`, `Ctrl+Alt+S`).
- **Wayland:** global shortcuts are compositor-mediated. Electron's `globalShortcut` may **silently fail** on some Wayland sessions; the `org.freedesktop.portal.GlobalShortcuts` portal is the sanctioned path but Electron 33 support is partial. Degrade: surface a banner "global hotkeys unavailable on this session — use the tray" and rely on tray/click summon.
- **Window positioning:** on **Wayland, clients cannot set their own absolute screen position.** Cursor-anchored numpad and tray-anchored popover positioning **don't work** there — the compositor places the window. Degrade to a centered (or compositor-chosen) popover on Wayland. X11 and Windows support absolute positioning (`win.setPosition`).

---

## 3. Platform-abstraction architecture

Introduce a `platform/` layer. `main.js` imports **one** module and calls a stable interface; the correct implementation is chosen by `process.platform` (+ Wayland/X11 detection for Linux). This isolates every `osascript`/Swift-helper/`execFile` call that's currently inline in `main.js`.

```
platform/
  index.js          // picks darwin | win32 | linux based on process.platform
  interface.md      // the contract (this section)
  darwin.js         // wraps existing osascript + bin/restash-* helpers (refactor of today's main.js)
  win32.js          // SendInput/CF_HDROP/EnumWindows via bin/restash-win-helper.exe + Win32 paths
  linux.js          // xdotool/ydotool/xclip/wl-clipboard + X11/Wayland branch
  capabilities.js   // runtime feature flags (canSynthesizePaste, canListWindows, supportsNativeShare, canCaptureScreen, canPositionWindows, hasTray)
bin/
  restash-share, restash-clip-file, restash-decode-qr, restash-windows   // (mac, existing)
  restash-win-helper.exe        // (Windows, new — paste/foreground/CF_HDROP/window-enum)
  # Linux uses system tools (xdotool/ydotool/xclip/wl-copy/wmctrl); no committed binary
```

### Proposed interface

```js
// platform/interface — every method is async and returns a typed result object.
module.exports = {
  // --- capabilities: drives UI degradation (renderer reads these) ---
  capabilities(),
  //   → { canSynthesizePaste, canListWindows, canCaptureScreen,
  //       canPositionWindows, supportsNativeShare, hasTray, sessionType }

  // --- the core paste interaction ---
  captureForegroundWindow(),            // → opaque handle (HWND / X11 id / pid) | null
  paste({ text, filePaths, targetWindow }),
  //   writes payload to clipboard (text or multi-file), restores targetWindow
  //   focus, synthesizes the paste keystroke. Returns
  //   { ok, mode: 'pasted' | 'copied-only', reason? }.

  // --- clipboard (multi-file) ---
  writeFiles(filePaths),                // CF_HDROP / text/uri-list / NSFilenames
  writeText(text),                      // delegate to Electron clipboard (kept for symmetry)

  // --- QR ---
  captureRegion({ rect, displayId }),   // → ImageData/PNG buffer via desktopCapturer (shared impl)
  decodeQR(imageData),                  // → { payload, type } via zxing-wasm (shared impl)

  // --- environments ---
  listWindows(scope),                   // scope: 'desktop' | 'all' → [{ owner, title }]
  listRunningApps(),                    // → [{ name, path? }]
  launchApp(target),                    // open -a / start / gtk-launch
  openSites(sites, { profileMap }),     // per-profile browser launch
  chromePaths(),                        // → { localState, binary } resolved per OS
  getChromeProfiles(),                  // shared logic, per-OS path

  // --- tray / windows ---
  trayIcon(theme),                      // → nativeImage (ico/png per OS)
  positionPopover(win, { anchor }),     // tray | cursor | center, per-OS/work-area aware
  positionShelf(win),                   // notch (mac) | top-center (win/linux) | center (wayland)

  // --- share ---
  share(item),                          // native sheet (mac) | in-app fallback signal (win/linux)
};
```

`main.js` then becomes, e.g.:

```js
const platform = require('./platform');
ipcMain.handle('paste:active', async (_e, payload) => {
  const target = previousWindowHandle;             // captured on hotkey-down
  return platform.paste({ ...normalize(payload), targetWindow: target });
});
```

The renderer reads `platform.capabilities()` (exposed via preload) once on load and hides/relabels UI accordingly (e.g. "Paste" → "Copy" when `!canSynthesizePaste`, hide native Share when `!supportsNativeShare`, show a Wayland banner).

**Refactor scope:** `darwin.js` is a near-mechanical extraction of today's inline mac code, so the macOS build is unchanged in behavior — de-risking the port. New code lives only in `win32.js`/`linux.js` + the small native Windows helper.

---

## 4. Build & packaging

### electron-builder targets

Add `win` and `linux` blocks to the `build` config in `package.json`, and per-OS scripts:

```jsonc
"scripts": {
  "dist:mac":   "electron-builder --mac",
  "dist:win":   "electron-builder --win",
  "dist:linux": "electron-builder --linux",
  "dist:all":   "electron-builder -mwl"            // requires a Linux/CI host for win+linux
},
"build": {
  "win": {
    "target": [ { "target": "nsis", "arch": ["x64", "arm64"] },
                { "target": "portable", "arch": ["x64"] } ],
    "icon": "build/icon.ico",
    "extraResources": [ "bin/restash-win-helper.exe" ]
    // "signtoolOptions"/cert config added when a cert exists (see signing)
  },
  "nsis": { "oneClick": false, "perMachine": false, "allowToChangeInstallationDirectory": true },
  "linux": {
    "target": [ { "target": "AppImage", "arch": ["x64", "arm64"] },
                { "target": "deb", "arch": ["x64"] } ],
    "icon": "build/icons/",          // dir of 16..512 PNGs
    "category": "Utility",
    "desktop": { "StartupWMClass": "Restash" }
  },
  "files": [ /* + "platform/**/*", "bin/restash-win-helper.exe" */ ]
}
```

- **Drop `asar: false`** for Win/Linux is fine either way; keep helpers in `extraResources` (outside asar) so they're executable.
- The current `afterPack`/`afterSign` hooks are **mac-only** (ad-hoc sign + notarize) — guard them with `if (context.electronPlatformName !== 'darwin') return;` so cross-builds don't break.

### Icon assets needed

| OS | Asset | Notes |
|---|---|---|
| Windows | `build/icon.ico` (multi-res 16–256) + tray `.ico`/16px PNG | generate from existing 512 PNG. |
| Linux | `build/icons/{16,24,32,48,64,128,256,512}.png` + tray 22/24px PNG | AppImage/deb need a PNG set. |
| Both | tray icons in light/dark variants | no mac "Template" auto-invert. |

Extend `scripts/build-brand-assets.js` (already uses `@resvg/resvg-js`) to emit `.ico` (via a png→ico step, e.g. `png-to-ico`) and the Linux PNG set.

### Code signing

- **Windows:** unsigned installers trigger **SmartScreen** warnings. Options: an **OV/EV code-signing certificate** (EV gives instant SmartScreen reputation; ~$200–600/yr; EV historically needs a hardware token / cloud HSM). electron-builder signs via `signtool` (cert file + password as env/CI secrets) or Azure Trusted Signing. **For an initial release, ship unsigned + document the SmartScreen "More info → Run anyway" step** (mirrors today's mac ad-hoc/Gatekeeper posture), then add a cert.
- **Linux:** **no signing** for AppImage/deb (optionally GPG-sign the `.deb` for apt repos and provide a checksum). AppImage just needs `chmod +x`.

### Auto-update

- Not currently shipped. Add **`electron-updater`**:
  - Windows: NSIS supports differential auto-update from a static file host or GitHub Releases.
  - Linux: **AppImage** supports auto-update (via embedded update info + `zsync`); **deb** does not (users update via apt or re-download).
  - macOS: requires signing+notarization for Squirrel.Mac — out of scope for this port.
- Recommend a simple **"check for updates" against a JSON manifest** (latest version + URL) as the cross-platform baseline, with full `electron-updater` as a fast-follow per target. The tray already has an "Updates" entry to hang this off.

### What can/can't be built from a macOS dev machine (honest)

| Build | From macOS? | Reality |
|---|---|---|
| macOS DMG | ✅ | unchanged. |
| Linux AppImage / deb | ⚠️ usually | electron-builder can cross-build Linux from mac **via Docker** (the `electronuserland/builder` image) reliably; native (no-Docker) Linux builds from mac are flaky for `deb` (needs `dpkg`/`fakeroot`). **Use Docker or Linux CI.** |
| Windows NSIS / portable | ⚠️ needs Wine or Windows | electron-builder can build Windows installers from mac **if Wine + mono are installed**, but the **native Windows helper exe (`restash-win-helper.exe`) must be compiled on Windows** (or via cross-compile toolchain). Code-signing a Windows build is **only reliable on Windows/CI**. **Recommend GitHub Actions matrix:** `macos-latest` (mac), `windows-latest` (win build + sign + compile helper), `ubuntu-latest` (linux). |

**Bottom line:** set up a **GitHub Actions release matrix** (3 runners). Treat local mac as dev-only for non-mac targets; the Windows helper exe and Windows signing **require a Windows runner**.

---

## 5. UX/UI adaptations per OS

- **No TCC / permission prompts on Win/Linux.** Remove the Accessibility/AppleEvents gating from the paste flow on those platforms (it's mac-specific). Replace with **capability checks**: if synthetic paste isn't available (e.g. Wayland with no `ydotool`), show a one-time explainer + copy-only mode instead of a permission dialog. (Windows may show a UAC prompt only if a helper needs elevation — avoid that; `SendInput` doesn't require elevation except to send into elevated/admin windows, a known Win limitation to document.)
- **Tray behavior:** left-click toggles popover; right-click → context menu (Settings, Decode QR, Check for Updates, Quit). On GNOME-without-tray, fall back to hotkey + a "Restash is running" launcher window, and document the AppIndicator extension.
- **Window chrome/controls:** the popover/numpad are frameless transparent windows (cross-platform). On Windows, ensure no taskbar entry for the popover (`skipTaskbar: true`); on Linux set `type: 'utility'`/`skipTaskbar` so it doesn't appear in the window list. Settings/Billing windows get standard OS title-bar controls (close/min on the OS-native side).
- **Fonts:** the app bundles **Inter** (loaded in RES-13 work) — keep bundling it so typography is identical across OSes rather than depending on system fonts (Windows: Segoe UI; Linux: varies).
- **Theme following the OS:** use `nativeTheme.shouldUseDarkColors` + `nativeTheme.on('updated')` to follow OS dark/light when theme = "auto"; already CSS-driven, just wire the per-OS source. Linux dark-mode detection via `nativeTheme` is reliable on GNOME/KDE in recent Electron.
- **Layout differences:** scrollbar styling (Windows scrollbars are chunkier — keep the custom CSS thin scrollbars), and DPI scaling (Windows fractional scaling 125%/150% — verify the numpad and shelf measurements use logical px and `display.scaleFactor` where pixel-exact).
- **Keyboard glyphs:** the UI shows ⌘/⌃/⇧ glyphs; on Win/Linux render `Ctrl`/`Alt`/`Shift` text instead. Centralize accelerator → label formatting per OS.

---

## 6. Dependencies (per platform, trade-offs)

Prefer **prebuilt-binary / WASM / system tools** to avoid node-gyp.

| Dep | Platform | Purpose | Trade-off |
|---|---|---|---|
| `zxing-wasm` (or `jsQR`) | all | QR decode (replaces Vision) | WASM, no native build; `zxing-wasm` heavier but multi-format & robust; `jsQR` lighter, QR-only. |
| `png-to-ico` (dev) | build | generate Windows `.ico` | dev-only, pure JS. |
| `electron-updater` | all | auto-update | well-maintained; per-target config. |
| **`restash-win-helper.exe`** (custom, committed) | Windows | SendInput Ctrl+V, SetForegroundWindow, CF_HDROP, EnumWindows | **must compile on Windows/CI**; few KB; mirrors the Swift-helper pattern — no node-gyp. Preferred over a native node module. |
| `@nut-tree-fork/nut-js` *(alt to custom exe)* | Windows (+mac/linux) | synthetic input | prebuilt binaries, cross-platform, but a heavy dep and an extra runtime; only if we don't want to maintain a custom exe. **Avoid `robotjs`** (unmaintained, node-gyp). |
| system `xdotool` | Linux X11 | paste synthesis, window activate/list | usually preinstalled or one `apt install`; shell out, detect presence. |
| system `ydotool` + `ydotoold` | Linux Wayland | paste synthesis | requires daemon + `/dev/uinput` setup; best-effort only. |
| system `xclip` / `wl-clipboard` (`wl-copy`) | Linux | multi-file clipboard (uri-list) | tiny, common; detect & hint to install. |
| system `wmctrl` *(or EWMH via xdotool)* | Linux X11 | window listing | optional; xdotool can cover it. |
| `os` (built-in) + persisted UUID | all | stable machine id for LS activation | no dep. |

**No new dependency is mandatory on macOS** — the mac build keeps its Swift helpers and behavior.

---

## 7. Risks & open questions (for Kevin)

1. **Wayland paste is the headline risk.** There is no clean, consent-free way to synthesize a global paste keystroke on Wayland. Baseline will be **copy-only** unless the user has `ydotool` + daemon configured. **Decision needed:** is copy-only acceptable as the Wayland default, or do we gate Wayland support behind a setup guide? (X11 is fine via `xdotool`.)
2. **Ctrl+Shift+V default collision.** It's the universal "paste-as-plain-text" shortcut on Win/Linux. We must pick different defaults there. **Decision needed:** approve `Ctrl+Alt+V` (summon), `Ctrl+Alt+F` (QR), `Ctrl+Alt+S` (shelf) as the Win/Linux defaults, or propose others.
3. **Windows native helper requires a Windows build environment.** The `.exe` can't be compiled or code-signed from macOS reliably. **Decision needed:** stand up **GitHub Actions** (3-runner matrix) — confirm we can add CI and store signing secrets.
4. **Windows code-signing cost/UX.** Unsigned = SmartScreen warnings. **Decision needed:** ship unsigned at first (documented "Run anyway"), or buy an OV/EV cert now (budget + EV hardware-token/Azure-Trusted-Signing logistics)?
5. **GNOME has no system tray by default.** A meaningful share of Linux users will see no tray icon. **Decision needed:** is "hotkey-first + document the AppIndicator extension" acceptable, or do we want a persistent small launcher window as the fallback?
6. **"Capture this desktop" degrades hard on Wayland** (can't enumerate other apps' windows/titles). Environments capture there falls back to "running apps + manual site entry." **Confirm** that's acceptable; X11 keeps full capture.
7. **Native share sheet dropped on Win/Linux** in favor of Copy/Open/Reveal. **Confirm** acceptable (vs. investing in the Windows Share contract, which needs appx identity).
8. **Scope of Linux support matrix.** Officially support which? Suggest: **Ubuntu/Debian (deb) + universal AppImage; X11 fully, Wayland best-effort.** Fedora/Arch via AppImage only. **Confirm.**
9. **Decoder choice:** `zxing-wasm` (robust, heavier) vs `jsQR` (light, QR-only). **Confirm** preference; this also opens the option to later delete the mac Swift QR helper.

---

## 8. Phased implementation plan

Each milestone is independently shippable/demoable. Effort is rough dev-time for one engineer.

| Milestone | Scope | Output / demo | Effort |
|---|---|---|---|
| **M0 — Refactor: extract `platform/`** | Move all inline mac native calls in `main.js` into `platform/darwin.js` behind the §3 interface; add `capabilities()`; no behavior change on mac. | macOS build identical, but now platform-routed. De-risks everything after. | **3–5 d** |
| **M1 — Cross-platform shell builds & runs** | electron-builder `win`/`linux` targets; icon assets (ico + png set); guard mac afterPack/afterSign; stub `win32.js`/`linux.js` (capabilities report degraded). App launches on Win/Linux: tray + popover + storage + licensing + themes + stashes + QR-encode + agent templates + crypto badges all work; paste = copy-only. | Restash installs and runs on Win10/11 and Ubuntu (X11 + Wayland); ~60% parity. | **4–6 d** |
| **M2 — Tray + hotkeys + popover positioning** | Per-OS tray (left/right click, context menu), safer default hotkeys (`CommandOrControl`), Windows/X11 popover & cursor positioning + work-area math; Wayland centered fallback + "hotkeys may be unavailable" banner; GNOME-tray fallback. | Numpad summons at cursor (Win/X11), tray dropdown + search on all. | **3–5 d** |
| **M3 — Paste (the core)** | Build/commit `restash-win-helper.exe` (SetForegroundWindow + SendInput Ctrl+V + foreground capture); Linux X11 via `xdotool`; Wayland via `ydotool` when present else copy-only; foreground capture on hotkey-down; clipboard save/restore. Renderer relabels Paste→Copy when unavailable. | Press number → pastes into the prior app on Win + Linux/X11; copy-only fallback elsewhere. **This is the parity moment.** | **5–8 d** |
| **M4 — QR decode + multi-file paste** | Replace Vision: `desktopCapturer` region grab + `zxing-wasm` decode (shared impl); reuse lens overlay. Multi-file clipboard: CF_HDROP (win exe) / `text/uri-list` via xclip/wl-copy (linux). | ⌃⇧F/⌃⌥F decodes on-screen QR on all OSes; multi-file paste attaches all files. | **4–6 d** |
| **M5 — Environments** | Per-OS Chrome paths + per-profile launch; app launch (start/gtk-launch); window listing (EnumWindows / wmctrl); Wayland degrade (running-apps + manual). Native-share → Copy/Open/Reveal fallback on Win/Linux. Notch-shelf → top-center fallback positioning. | Capture & reopen environments (full on Win/X11, degraded on Wayland); shelf works top-center. | **4–6 d** |
| **M6 — Packaging, signing, auto-update, polish** | GitHub Actions 3-runner release matrix; NSIS + portable + AppImage + deb artifacts; (optional) Windows code-signing; `electron-updater` (NSIS + AppImage); DPI/scaling QA; keyboard-glyph labels; docs (install, permissions/limitations, Wayland/ydotool setup). | One-tag release producing signed-ish installers for all three OSes; auto-update on Win + AppImage. | **5–8 d** |

**Critical path:** M0 → M1 → M3 (paste) is the spine; M2/M4/M5 can parallelize after M1. **Rough total: ~5–7 weeks** for one engineer to full parity (excluding cert procurement lead time).

**Suggested first shippable:** after **M3**, Windows + Linux/X11 have the core "stash → hotkey → paste" loop working — that's a credible public beta. Wayland and the long tail (QR/multi-file/environments) follow as M4–M6.

---

## Appendix A — macOS-native dependency inventory (what each helper does)

| Mechanism | Where (today) | Does | Cross-platform replacement |
|---|---|---|---|
| `osascript` keystroke ⌘V | `paste:active`, main.js ~1788 | synthesize paste | win exe SendInput / xdotool / ydotool / copy-only |
| `osascript` get/set frontmost by PID | `captureFrontmostApp`/`activateAppByPid` | capture & restore focus | GetForegroundWindow/SetForegroundWindow / xdotool / (Wayland: none) |
| `bin/restash-clip-file` (NSPasteboard) | file-paste path | multi-file clipboard | CF_HDROP / text/uri-list |
| `bin/restash-decode-qr` (Vision) | `qr:capture-and-decode` | decode QR PNG | zxing-wasm / jsQR |
| `screencapture -i -s / -R` | QR region grab | screen region capture | `desktopCapturer` + canvas crop |
| `bin/restash-windows` (CGWindowList) | `apps:list`/`env:capture` | list current-Space windows | EnumWindows / wmctrl (Wayland: degrade) |
| `osascript` process list | env capture | running apps | /proc scan / EnumWindows / tasklist |
| `bin/restash-share` (NSSharingServicePicker) | `share:item` | native share sheet | in-app Copy/Open/Reveal (mac keeps native) |
| `/usr/bin/open -a` | `env:open` | launch apps | start / gtk-launch / shell.openPath |
| Chrome `Local State` @ `~/Library/...` | `chrome:profiles` | enumerate profiles | per-OS Local State path |
| `Google Chrome` binary @ `/Applications/...` | `env:open` | per-profile launch | per-OS chrome binary path |
| `systemPreferences.isTrustedAccessibilityClient` | paste gating | TCC check | no-op on Win/Linux; capability check instead |
| Notch detection (workArea inset) | `positionShelfOnActiveDisplay` | notch shelf placement | top-center fallback |
| Tray "Template" nativeImage | `createTrayIcon` | menu-bar auto-invert icon | explicit ico/png light+dark icons |

## Appendix B — Things that already work cross-platform (no change)

`app.getPath('userData')` storage · settings.json · Lemon Squeezy `fetch` licensing (needs only a cross-platform machine-id) · Electron `globalShortcut` (needs safer default accels) · BrowserWindow popover/numpad/settings/billing UI · CSS theming + `nativeTheme` · `qrcode` (QR *encode*/display) · crypto chain badge assets · `shell.openExternal` / `shell.openPath` / `shell.showItemInFolder` (open/reveal files & URLs) · clipboard **text** read/write · the data model for all 9 item kinds, stashes, pinning, agent templates.
