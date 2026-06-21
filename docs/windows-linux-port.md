# Restash — Windows + Linux cross-platform (ZERO extra downloads)

**Status:** Implemented on `feat/cross-platform-no-deps`.
**Headline constraint:** No Restash feature may depend on a user-installed
binary, package, daemon, browser extension, or system tool. Everything native
ships *inside* the app. The only thing a user is ever asked for is a **one-time
OS permission** through a native dialog already present on the OS — never a
download or install.

---

## 0. The hard constraint (zero-install bundling policy)

### BANNED at runtime
Restash must **never** `execFile`/`spawn` any of these (or detect/hint to
install them, or rely on a browser extension):

`xdotool`, `ydotool`, `ydotoold`, `xclip`, `xsel`, `wl-copy`, `wl-paste`,
`wl-clipboard`, `wmctrl`, `xprop`, `gtk-launch`, `notify-send`, and the GNOME
AppIndicator extension. The old plan's "detect & hint to install" paths are
removed.

This is enforced by CI: **`scripts/lint-no-banned-tools.js`** scans `main.js`
and `platform/*.js` and **fails the build** if any banned tool name appears as a
spawned command. Wired into `ci.yml` and the release matrix.

CI also compiles the Linux native helper on every push/PR (`ci.yml` →
`linux-build`), installing `libei-dev` + `libportal-dev` so the libei branch in
`native/build-linux-helper.sh` is exercised — a missing source file or broken
extern fails the build immediately, instead of being caught only on a tagged
release. This closes the RES-30 regression where the helper's
`extern int restash_libei_ctrl_v(void)` referred to a file that didn't exist
(`native/linux/wayland_ei.c`, now committed).

### REQUIRED — every native capability ships via one of three bundling lanes
1. **Committed/CI-built prebuilt helper binary in `bin/`** (mirrors the existing
   Swift `restash-*` pattern):
   - `bin/restash-win-helper.exe` (Windows, statically/self-contained linked)
   - `bin/restash-linux-helper` (Linux, self-contained)
   Source lives in `native/`; each is compiled **on its own OS in CI** (a Windows
   exe can't be built on macOS; a Linux ELF can't either).
2. **Prebuilt native Node module** whose `.node` prebuilds for
   win32-x64/arm64 + linux-x64/arm64 are vendored (no `node-gyp` on the user
   machine). *(Not currently needed — paste/clipboard/window use lane 1.)*
3. **Pure-JS / WASM** — `zxing-wasm` (vendored `.wasm`, no network, no native
   build) with a `jsQR` fallback for QR decode.

### Linux system libs, portably
The Linux helper links libxcb/libxcb-xtest for X11 (present on every X11 session
as part of the display server — **not** a user install) and libei/libportal for
Wayland. libei/libportal **and their transitive deps are bundled** in the
AppImage `extraResources` (`resources/lib`), and the helper's `RPATH`
(`$ORIGIN/../lib`) + `LD_LIBRARY_PATH` point at the bundled copies so nothing is
resolved from the host.

**Dep-walk — `scripts/bundle-linux-libs.sh`.** After
`native/build-linux-helper.sh` compiles the helper, it invokes the bundler,
which (1) walks the **transitive** `ldd` closure recursively, deduping through
SONAME symlinks; (2) copies every non-ABI `.so` into `vendor/linux-lib/`, named
by SONAME so `DT_NEEDED` resolves to the bundled copy; (3) `patchelf
--set-rpath '$ORIGIN'` on each bundled `.so` so inter-library deps (a bundled
`libportal` finding the bundled `libglib`) resolve from the bundle, not from
`/usr`; (4) `patchelf --set-rpath '$ORIGIN/../lib'` on the helper itself as a
belt-and-suspenders re-stamp of the gcc `-Wl,-rpath` flag; and (5) **fails the
build on `=> not found`** in any `ldd` line — silently shipping a helper with
missing deps is worse than failing the release.

**ABI allow-list (NOT bundled — must come from the host glibc).** These libs
are part of glibc / libgcc / libstdc++ and are ABI-stable across distros;
bundling them risks dynamic-loader rejection or subtle ABI drift between the
bundled copy and the kernel/glibc on the runtime host. Encoded in
`scripts/bundle-linux-libs.sh::abi_skip()`:

```
libc       libm       libpthread   libdl       librt
libresolv  libutil    libnsl       libcrypt
libgcc_s   libstdc++  ld-linux*    linux-vdso
```

Everything else (`libei`, `libportal`, `libdbus-1`, `libglib-2.0`, `libgio-2.0`,
`libgobject-2.0`, `libffi`, `libpcre*`, `libsystemd`/`libelogind`, `libcap`,
`libmount`, `libblkid`, `libz`, `libselinux`, plus the `libxcb` family) **is**
bundled.

**AppImage vs `.deb` (deb caveat).** The `linux.extraResources` mapping
(`vendor/linux-lib` → `lib`) is shared by **both** Linux targets, so the bundle
layout is identical: helper at `resources/bin/restash-linux-helper`, libs at
`resources/lib/*.so`. The AppImage mounts this read-only; the `.deb` installs the
same tree under `/opt/Restash/resources/`. Because the **relative** `bin/ ↔ lib/`
layout is preserved in both, the helper's RPATH `$ORIGIN/../lib` resolves the
bundled libs in the `.deb` exactly as in the AppImage — the zero-install
guarantee holds for both. The `.deb` does **not** declare libei/libportal as apt
`Depends:` (it ships its own copies, preferred via RPATH + `LD_LIBRARY_PATH`),
and it is **not** a single self-contained file (it unpacks to `/opt`). Auto-update
differs only in mechanism (AppImage zsync vs `.deb` re-download/apt), not in
bundling. The clean-`ubuntu:22.04` `ldd` gate in `ci.yml` reproduces this same
`bin/ + lib/` parent layout, so it covers `.deb` resolution as well.

**Bundling lint** (`scripts/lint-no-banned-tools.js`): if
`bin/restash-linux-helper` exists as a real built artifact (size > 0),
`vendor/linux-lib/` MUST contain at least one `.so*` file or the lint fails.
This runs once before the Linux build (rule no-ops — helper absent) and again
after the build in `release.yml` (rule fires — must pass). A zero-byte
placeholder is treated as not-built so the rule doesn't false-positive on
non-Linux runners.

### Permission ≠ install
The ONLY user ask is a one-time **OS permission** via a native dialog already on
the OS:
- macOS Accessibility / Apple Events (TCC)
- Wayland `org.freedesktop.portal.RemoteDesktop` / `ScreenCast` /
  `GlobalShortcuts` consent
- `/dev/uinput` udev rule via the OS's own `pkexec`/polkit dialog (Wayland
  fallback only)

`capabilities()` reports this as `needsPermissionGrant` + `permissionKind` so
the UI shows a one-time explainer. There is **never** a download or install.

---

## 1. Policy checklist (must stay green)

- [x] No `execFile`/`spawn` of any BANNED tool anywhere in `main.js` /
      `platform/*.js` (enforced by `scripts/lint-no-banned-tools.js` in CI).
- [x] Every native capability uses lane (a) committed helper, (b) vendored
      prebuilt `.node`, or (c) pure-JS/WASM.
- [x] No postinstall download of binaries; no runtime fetch of binaries.
- [x] Linux helper's **full transitive `ldd` closure** (libei/libportal +
      libdbus/libglib/libsystemd/libxcb/... — everything outside the ABI
      allow-list) is bundled in the AppImage by `scripts/bundle-linux-libs.sh`,
      with RPATH `$ORIGIN/../lib` on the helper and RPATH `$ORIGIN` on every
      bundled `.so`. Enforced post-build by the bundling lint in
      `scripts/lint-no-banned-tools.js` (helper present ⇒ `vendor/linux-lib/`
      non-empty).
- [x] The Windows helper is compiled (and, later, signed) on `windows-latest`;
      the Linux helper on `ubuntu-latest`.
- [x] The only user-facing ask is an OS permission (TCC / portal / polkit),
      surfaced via `capabilities().needsPermissionGrant`, documented as
      "permission, not install".
- [x] GNOME-without-tray never asks the user to install AppIndicator — the app
      is fully usable via the global-hotkey numpad + an always-available app menu.

---

## 2. Platform-abstraction layer

`main.js` imports **one** module (`require('./platform')`). The implementation
is chosen by `process.platform` (+ X11/Wayland via `XDG_SESSION_TYPE` /
`WAYLAND_DISPLAY`). See `platform/interface.md` for the full contract.

```
platform/
  index.js          selects darwin|win32|linux; merges shared QR + accelerators
  interface.md      the contract
  capabilities.js   session detection (x11/wayland)
  darwin.js         mechanical extraction of today's mac code — UNCHANGED behavior
  win32.js          restash-win-helper.exe (SendInput/CF_HDROP/EnumWindows) + Win paths
  linux.js          restash-linux-helper (XCB / libei-portal / uinput) + X11/Wayland branch
  qr.js             desktopCapturer region grab + zxing-wasm/jsQR decode (shared)
  chrome.js         shared Local State → profiles parse
  accelerators.js   per-OS default hotkeys + Ctrl/Alt/Shift vs ⌘/⌃/⇧ label format
```

`capabilities()` returns:
```
{ canSynthesizePaste, canListWindows, canCaptureScreen, canPositionWindows,
  supportsNativeShare, hasTray, sessionType,
  pasteBackend: 'osascript'|'win-helper'|'xcb'|'libei-portal'|'uinput'|'copy-only',
  needsPermissionGrant, permissionKind }
```
Exposed to renderers via `preload.platformCapabilities()` so the UI relabels
Paste→Copy when `!canSynthesizePaste`, hides native Share when
`!supportsNativeShare`, and shows the one-time OS-permission explainer.

`main.js` routes every inline native call through `platform.*`: `paste:active`,
`captureFrontmostApp`, multi-file clipboard, QR capture/decode, window listing,
`apps:list`, `env:open` / `chrome:profiles`, tray icon, popover/cursor
positioning, share, and accessibility/capabilities.

---

## 3. Per-feature implementation

### Paste (the core)
- **Windows** (`pasteBackend: 'win-helper'`): `writeText`/`writeFiles` →
  clipboard, hide popover, `restash-win-helper.exe --paste <HWND>` does
  `SetForegroundWindow` (with the AttachThreadInput foreground-lock workaround) +
  `SendInput` Ctrl+V in one process, then the prior clipboard is restored.
  Foreground HWND captured on hotkey-down via `--get-foreground`. No elevation
  required. **Known limitation:** `SendInput` can't target elevated/admin windows
  unless Restash is elevated. Copy-only fallback if the helper is missing.
- **Linux X11** (`pasteBackend: 'xcb'`): `--get-active` (`_NET_ACTIVE_WINDOW`) on
  hotkey-down; `--paste <id>` activates the window (`_NET_ACTIVE_WINDOW` client
  message) + XTEST FakeKeyEvent Ctrl+V. No xdotool/wmctrl.
- **Linux Wayland** (`pasteBackend: 'libei-portal'` | `'uinput'`): Wayland forbids
  arbitrary global key injection by design; the sanctioned no-install paths:
  - **PRIMARY** — `org.freedesktop.portal.RemoteDesktop` + bundled libei. First
    paste opens a RemoteDesktop session; the compositor shows its OWN one-time
    consent dialog (a PERMISSION). The `restore_token` is persisted to reconnect
    without re-prompting.
  - **FALLBACK** — `/dev/uinput` directly (the helper IS the daemon, spawned on
    demand — no `ydotoold`). `/dev/uinput` access is the one-time OS permission
    (a udev rule via the OS's pkexec/polkit dialog). `--check-uinput` detects
    when already satisfied.
  - **LAST RESORT** — copy-only: write clipboard + toast "Copied — press Ctrl+V".

### Multi-file clipboard
- **Windows:** `--clip-files` builds a CF_HDROP/DROPFILES list (double-null
  terminated) so one Ctrl+V attaches all files.
- **Linux:** `--clip-files` becomes a short-lived CLIPBOARD selection owner
  serving `text/uri-list` (file:// URIs) + `x-special/gnome-copied-files`
  (`copy\n`+URIs) on X11 (XCB selection ownership). NO xclip/wl-copy. The owner
  persists until the next clipboard change or a timeout.
- **Fallback:** copy first path as text + toast. `file:open`/`file:reveal` keep
  using Electron `shell` (already cross-platform).

### QR decode (`platform/qr.js`)
desktopCapturer region grab at full display resolution (accounting for
`display.scaleFactor`), cropped to the lens rectangle, decoded by `zxing-wasm`
(jsQR fallback). Reuses `qr-scan-overlay.html` verbatim. macOS keeps its Swift
Vision path for byte-for-byte parity; non-mac uses the bundled WASM path. On
Wayland, capture routes through the ScreenCast portal (one-time consent).

### Tray / popover / no-tray fallback
Explicit per-OS tray assets (no mac Template auto-invert): Windows `.ico` + 16px
PNG, Linux 22/24px light/dark PNG (emitted by `scripts/build-brand-assets.js`).
Left-click toggles popover; right-click → native context menu. Popover position:
Windows anchors to `tray.getBounds()` else bottom-right work area; X11 anchors to
cursor/work-area corner; Wayland self-positioning is a no-op (compositor places
it). `skipTaskbar` + `type:'toolbar'` on Win/Linux. **GNOME-without-tray:** the
app stays fully usable via the global-hotkey numpad + an always-available app
menu — never an AppIndicator install ask.

### Hotkeys
`CommandOrControl` accelerators. Win/Linux defaults move OFF Ctrl+Shift+V
(universal paste-as-plain-text) → **Ctrl+Alt+V** (summon), **Ctrl+Alt+F** (QR),
**Ctrl+Alt+S** (shelf); mac keeps ⌘⇧V / ⌃⇧F / ⌃⇧S. Customization UI +
`tryRegisterHotkey` rollback unchanged. On Wayland, `globalShortcut` may silently
fail; the bundled `GlobalShortcuts` portal path is the sanctioned fallback
(one-time bind consent), else a non-blocking "use the tray/launcher" banner —
never an install ask. Labels render Ctrl/Alt/Shift on Win/Linux vs glyphs on mac
(`platform.formatAccelerator`).

### Environments
`chromePaths()` resolves per-OS (Windows `%LOCALAPPDATA%\Google\Chrome\User
Data\Local State` + chrome.exe under PROGRAMFILES/LOCALAPPDATA; Linux
`~/.config/google-chrome/Local State` + known binary paths, NOT PATH tools; mac
unchanged). `launchApp()`: Windows `shell.openPath` / `cmd start`; Linux exec the
binary or parse `.desktop` Exec ourselves (NO gtk-launch). `listWindows`: Windows
`--list` (EnumWindows), X11 `--list` (`_NET_CLIENT_LIST`). **Wayland cannot
enumerate other clients' windows** (hard OS restriction) — degrades to a
running-app list (read `/proc` ourselves) + manual site entry; `canListWindows:
false`.

### Share + shelf
Native share sheet stays macOS-only. Win/Linux: `supportsNativeShare:false`,
`platform.share()` returns `{ fallback:true }`, renderer shows in-app
Copy/Open URL/Reveal file/Email (mailto via `shell.openExternal`). Notch shelf
top-center on Win/X11, compositor-centered on Wayland.

### Licensing
Cross-platform stable machine id: `os.hostname()` + a persisted random UUID
(`userData/machineId`, `crypto.randomUUID`) used as the Lemon Squeezy instance
basis so the 3-device limit counts consistently across OSes and survives
reinstalls. No new dependency.

---

## 4. Packaging, signing, auto-update

electron-builder targets: NSIS + portable (Windows x64/arm64), AppImage + deb
(Linux x64/arm64). All native helpers + bundled libs + `zxing-wasm` ship in
`files`/`extraResources` outside asar. `build/icon.ico` and `build/icons/*.png`
are generated by `build-brand-assets.js`. mac `afterPack`/`afterSign` are guarded
with `if (context.electronPlatformName !== 'darwin') return;`.

`electron-updater`: NSIS differential on Windows, AppImage zsync on Linux (deb
updates via apt / re-download; mac auto-update needs Squirrel.Mac signing —
out of scope). Windows ships **unsigned initially** with documented SmartScreen
"More info → Run anyway" (mirrors the current mac ad-hoc posture) until an OV/EV
cert is procured (`CSC_LINK`/`CSC_KEY_PASSWORD` slot in `release.yml`).

**CI release matrix** (`.github/workflows/release.yml`): `macos-latest`,
`windows-latest` (compiles + later signs the win helper), `ubuntu-latest`
(compiles the linux helper + vendors libei/libportal). The Windows helper +
signing **require** a Windows runner; the Linux helper **requires** a Linux
runner. CRITICAL: every native artifact is vendored at build time so the
published installer is fully self-contained.

---

## 5. What can / can't be built from this macOS dev machine (honest)

| Build | From macOS? | Reality |
|---|---|---|
| macOS DMG | ✅ | unchanged |
| Linux AppImage/deb | ⚠️ | needs a Linux host (Docker or CI) for the helper + deb tooling |
| Windows NSIS/portable | ❌ | `restash-win-helper.exe` **must** be compiled on Windows; signing too |

The native helpers' source is committed; **CI compiles them per-OS**. They
cannot be produced or runtime-verified on macOS — that requires the Windows and
Linux runners in the release matrix.
