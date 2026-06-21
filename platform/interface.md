# Restash platform-abstraction contract

`main.js` imports **one** module (`require('./platform')`) and calls a stable
interface. The correct implementation is chosen at load time by
`process.platform` (+ X11/Wayland detection on Linux). This isolates every
`osascript` / Swift-helper / `execFile` call that used to be inline in
`main.js`, and — critically — guarantees the **zero-install bundling policy**
(see `docs/windows-linux-port.md`): every native capability ships *inside* the
app (committed/CI-built helper binary, vendored prebuilt `.node`, or pure
JS/WASM). No Restash feature shells out to a user-installed tool.

Every method is async (returns a Promise) unless noted, and returns a typed
result object so the renderer can degrade the UI.

```js
module.exports = {
  // --- capabilities: drives UI degradation (renderer reads these) ---
  capabilities(),
  //   → { canSynthesizePaste, canListWindows, canCaptureScreen,
  //       canPositionWindows, supportsNativeShare, hasTray,
  //       sessionType: 'darwin'|'win32'|'x11'|'wayland'|'unknown',
  //       pasteBackend: 'osascript'|'win-helper'|'xcb'|'libei-portal'|'uinput'|'copy-only',
  //       needsPermissionGrant: bool,   // a one-time OS portal/udev consent (NOT an install)
  //       permissionKind: 'accessibility'|'remote-desktop-portal'|'uinput-udev'|null }

  // --- the core paste interaction ---
  captureForegroundWindow(),            // → opaque handle (pid / HWND / X11 id) | null
  paste({ text, filePaths, targetWindow }),
  //   → { ok, mode: 'pasted'|'copied-only', reason? }

  // --- clipboard (multi-file) ---
  writeFiles(filePaths),                // CF_HDROP / text/uri-list / NSFilenames
  writeText(text),                      // Electron clipboard (kept for symmetry)

  // --- QR (shared impl in platform/qr.js) ---
  captureRegion({ rect, displayId }),   // → { ok, pngBuffer } via desktopCapturer
  decodeQR(imageDataOrPng),             // → { ok, payload } via zxing-wasm / jsQR

  // --- environments ---
  listWindows(scope),                   // 'desktop'|'all' → [{ owner, title }]
  listRunningApps(),                    // → [{ name, path? }]
  launchApp(target),                    // open -a / ShellExecute / exec / .desktop Exec
  openSites(sites, { profileMap }),     // per-profile browser launch
  chromePaths(),                        // → { localState, binary } per OS
  getChromeProfiles(),                  // shared logic, per-OS path

  // --- tray / windows ---
  trayIcon(theme),                      // → nativeImage (ico/png per OS/theme)
  positionPopover(win, { anchor }),     // tray|cursor|center, work-area aware

  // --- share ---
  share(item),                          // native sheet (mac) | { ok:false, fallback:true } (win/linux)
};
```

## Permission ≠ install

The ONLY thing a user may ever be asked for is a **one-time OS permission**
granted through a native dialog already present on the OS:

- macOS Accessibility / Apple Events (TCC)
- Wayland `org.freedesktop.portal.RemoteDesktop` / `ScreenCast` / `GlobalShortcuts` consent
- `/dev/uinput` udev rule via the OS's own `pkexec`/polkit dialog (fallback only)

`capabilities().needsPermissionGrant` + `permissionKind` tell the renderer to
show a one-time explainer. There is never a download or package install.
