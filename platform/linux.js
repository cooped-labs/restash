// platform/linux.js — Linux (X11 + Wayland) implementation of the contract.
//
// Zero-install bundling lane: a committed/CI-built C helper
// `bin/restash-linux-helper`, linked against libxcb (part of any X11 server
// runtime, also bundled with RPATH to the AppImage copy) and against
// libei/libportal (bundled in the AppImage extraResources, RPATH/LD_LIBRARY_PATH
// pointed at the bundled copies so nothing resolves from the host).
//
// Helper modes:
//   --get-active                 → prints _NET_ACTIVE_WINDOW id (X11)
//   --paste <window-id>          → activate + XTEST FakeKeyEvent Ctrl+V (X11)
//   --paste-wayland              → RemoteDesktop/libei (primary) | uinput (fallback)
//   --clip-files <paths...>      → become a short-lived clipboard owner serving
//                                  text/uri-list + x-special/gnome-copied-files
//                                  (XCB selection on X11; data-control/portal on Wayland)
//   --list                       → _NET_CLIENT_LIST JSON [{owner,title}] (X11)
//   --check-uinput               → exit 0 if /dev/uinput writable (Wayland fallback)
//
// BANNED and absent: xdotool, ydotool, ydotoold, xclip, xsel, wl-copy,
// wl-paste, wmctrl, xprop, gtk-launch, notify-send. NOTHING here shells out to
// any of those. See docs/windows-linux-port.md.

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execFile, execFileSync, spawn } = require('node:child_process');
const { app, clipboard, screen, nativeImage, nativeTheme, shell } = require('electron');
const { getChromeProfiles } = require('./chrome');
const { detectLinuxSession } = require('./capabilities');

const ROOT = path.join(__dirname, '..');
const SHADOW_PAD = 24;

function helperPath() {
  const packaged = path.join(process.resourcesPath || '', 'bin', 'restash-linux-helper');
  const dev = path.join(ROOT, 'bin', 'restash-linux-helper');
  if (process.resourcesPath && fs.existsSync(packaged)) return packaged;
  return dev;
}
function helperAvailable() { try { return fs.existsSync(helperPath()); } catch { return false; } }

// Run the helper with the bundled libs on LD_LIBRARY_PATH (so libei/libportal
// resolve from our copy, never the host). Harmless if the dir is absent.
function helperEnv() {
  const libDir = process.resourcesPath
    ? path.join(process.resourcesPath, 'lib')
    : path.join(ROOT, 'vendor', 'linux-lib');
  const existing = process.env.LD_LIBRARY_PATH || '';
  return { ...process.env, LD_LIBRARY_PATH: existing ? `${libDir}:${existing}` : libDir };
}

const session = () => detectLinuxSession(); // 'x11' | 'wayland' | 'unknown'

// Wayland fallback (uinput) availability — a one-time OS PERMISSION (udev rule),
// not an install. We just detect whether it's already satisfied.
function uinputWritable() {
  if (!helperAvailable()) return false;
  try { execFileSync(helperPath(), ['--check-uinput'], { env: helperEnv(), timeout: 1500 }); return true; }
  catch { return false; }
}

function capabilities() {
  const s = session();
  if (s === 'x11') {
    return {
      canSynthesizePaste: helperAvailable(),
      canListWindows: helperAvailable(),
      canCaptureScreen: true,
      canPositionWindows: true,
      supportsNativeShare: false,
      hasTray: true,            // best-effort; GNOME-without-tray handled by app
      sessionType: 'x11',
      pasteBackend: helperAvailable() ? 'xcb' : 'copy-only',
      needsPermissionGrant: false,
      permissionKind: null,
    };
  }
  if (s === 'wayland') {
    // PRIMARY = RemoteDesktop/libei portal (one-time consent), FALLBACK = uinput
    // (one-time udev rule). Either is a PERMISSION, never an install.
    const uinput = uinputWritable();
    return {
      canSynthesizePaste: helperAvailable(),  // via portal consent or uinput
      canListWindows: false,                  // hard OS restriction on Wayland
      canCaptureScreen: true,                 // ScreenCast portal (consent)
      canPositionWindows: false,              // compositor places windows
      supportsNativeShare: false,
      hasTray: true,
      sessionType: 'wayland',
      pasteBackend: helperAvailable() ? (uinput ? 'uinput' : 'libei-portal') : 'copy-only',
      needsPermissionGrant: true,
      permissionKind: uinput ? null : 'remote-desktop-portal',
    };
  }
  return {
    canSynthesizePaste: false, canListWindows: false, canCaptureScreen: true,
    canPositionWindows: false, supportsNativeShare: false, hasTray: true,
    sessionType: 'unknown', pasteBackend: 'copy-only',
    needsPermissionGrant: false, permissionKind: null,
  };
}

function captureForegroundWindow() {
  return new Promise((resolve) => {
    if (session() !== 'x11' || !helperAvailable()) return resolve(null); // Wayland: no API
    try {
      execFile(helperPath(), ['--get-active'], { env: helperEnv(), timeout: 2000 }, (err, stdout) => {
        if (err) return resolve(null);
        const id = String(stdout || '').trim();
        resolve(id && /^\d+$/.test(id) ? id : null);
      });
    } catch { resolve(null); }
  });
}

function writeText(text) { clipboard.writeText(String(text ?? '')); return Promise.resolve({ ok: true }); }

// Multi-file clipboard: the helper becomes a short-lived selection owner. It
// must stay alive to serve paste requests, so we spawn it detached and let it
// self-terminate on the next clipboard change or a timeout.
function writeFiles(filePaths) {
  const list = (filePaths || []).filter((p) => typeof p === 'string' && p);
  if (!list.length) return Promise.resolve({ ok: false, reason: 'no-files' });
  if (!helperAvailable()) { clipboard.writeText(list[0]); return Promise.resolve({ ok: false, reason: 'no-helper', mode: 'copied-only' }); }
  try {
    const child = spawn(helperPath(), ['--clip-files', ...list], { env: helperEnv(), detached: true, stdio: 'ignore' });
    child.unref();
    return Promise.resolve({ ok: true });
  } catch (err) { clipboard.writeText(list[0]); return Promise.resolve({ ok: false, reason: 'clip-failed', error: err.message, mode: 'copied-only' }); }
}

async function paste({ text, filePaths, targetWindow }, hooks = {}) {
  const files = (filePaths || []).filter((p) => typeof p === 'string' && p);
  if (!text && !files.length) return { ok: false, reason: 'bad-input' };
  const s = session();
  const prevClipboard = clipboard.readText();

  // Put payload on the clipboard first.
  if (files.length) await writeFiles(files);
  else clipboard.writeText(text);

  if (!helperAvailable()) return { ok: false, reason: 'no-helper', mode: 'copied-only' };

  if (typeof hooks.hideApp === 'function') hooks.hideApp();
  await new Promise((r) => setTimeout(r, 60));

  let args;
  if (s === 'x11') {
    args = ['--paste'];
    if (targetWindow) args.push(String(targetWindow));
  } else if (s === 'wayland') {
    args = ['--paste-wayland']; // helper picks libei-portal or uinput internally
  } else {
    setTimeout(() => { try { clipboard.writeText(prevClipboard); } catch {} }, 400);
    return { ok: false, reason: 'unknown-session', mode: 'copied-only' };
  }

  const result = await new Promise((resolve) => {
    try {
      execFile(helperPath(), args, { env: helperEnv(), timeout: 6000 }, (err) => {
        resolve(err
          ? { ok: false, reason: 'helper-error', error: err.message, mode: 'copied-only' }
          : { ok: true, mode: 'pasted' });
      });
    } catch (err) { resolve({ ok: false, reason: 'spawn-failed', error: err.message, mode: 'copied-only' }); }
  });

  setTimeout(() => { try { clipboard.writeText(prevClipboard); } catch {} }, 450);
  return result;
}

function listWindows(/* scope */) {
  return new Promise((resolve) => {
    if (session() !== 'x11' || !helperAvailable()) return resolve([]); // Wayland: can't enumerate
    try {
      execFile(helperPath(), ['--list'], { env: helperEnv(), timeout: 5000 }, (err, stdout) => {
        if (err) return resolve([]);
        try { const a = JSON.parse(String(stdout || '[]')); resolve(Array.isArray(a) ? a : []); }
        catch { resolve([]); }
      });
    } catch { resolve([]); }
  });
}

// Running apps: read /proc ourselves (no tools). Used on Wayland where windows
// can't be enumerated. Best-effort de-duped comm names.
function listRunningApps() {
  const out = [];
  const seen = new Set();
  try {
    for (const pid of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(pid)) continue;
      let comm = '';
      try { comm = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim(); } catch { continue; }
      if (!comm || seen.has(comm)) continue;
      // Skip kernel threads / obvious daemons.
      if (comm.startsWith('k') && /^k(worker|threadd|softirqd|swapper)/.test(comm)) continue;
      seen.add(comm);
      out.push({ name: comm });
    }
  } catch {}
  out.sort((a, b) => a.name.localeCompare(b.name));
  return Promise.resolve(out);
}

// Launch an app: explicit executable path, else parse a .desktop file ourselves
// (NO gtk-launch). target may be { path } or { desktop } or { value }.
function launchApp(target) {
  try {
    if (target && target.path && fs.existsSync(target.path)) {
      spawn(target.path, [], { detached: true, stdio: 'ignore' }).unref();
      return Promise.resolve({ ok: true });
    }
    if (target && target.desktop && fs.existsSync(target.desktop)) {
      const exec = parseDesktopExec(target.desktop);
      if (exec) { spawn(exec.cmd, exec.args, { detached: true, stdio: 'ignore' }).unref(); return Promise.resolve({ ok: true }); }
    }
    const v = target && (target.value || target.path);
    if (v) { shell.openPath(String(v)); return Promise.resolve({ ok: true }); }
  } catch {}
  return Promise.resolve({ ok: false });
}

// Minimal .desktop Exec parser (strips %f/%u field codes). We read the file
// ourselves rather than depend on gtk-launch.
function parseDesktopExec(desktopPath) {
  try {
    const text = fs.readFileSync(desktopPath, 'utf8');
    const m = text.match(/^Exec=(.+)$/m);
    if (!m) return null;
    const parts = m[1].replace(/%[fFuUdDnNickvm]/g, '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return null;
    return { cmd: parts[0], args: parts.slice(1) };
  } catch { return null; }
}

function chromePaths() {
  const config = path.join(app.getPath('home'), '.config');
  const candidates = [
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/opt/google/chrome/chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
  const binary = candidates.find((c) => { try { return fs.existsSync(c); } catch { return false; } }) || candidates[0];
  return { localState: path.join(config, 'google-chrome', 'Local State'), binary };
}

function getProfiles() { return getChromeProfiles(chromePaths()); }

function openSites(byProfile, { separate } = {}) {
  const { binary } = chromePaths();
  const hasChrome = (() => { try { return fs.existsSync(binary); } catch { return false; } })();
  let delay = 0;
  for (const [prof, urls] of byProfile) {
    const launch = (us, sep) => {
      if (prof && hasChrome) {
        if (sep) us.forEach((u) => { setTimeout(() => { try { execFile(binary, [`--profile-directory=${prof}`, '--new-window', u], () => {}); } catch {} }, delay); delay += 280; });
        else { setTimeout(() => { try { execFile(binary, [`--profile-directory=${prof}`, '--new-window', ...us], () => {}); } catch {} }, delay); delay += 220; }
      } else us.forEach((u) => { setTimeout(() => { try { shell.openExternal(u); } catch {} }, delay); delay += 200; });
    };
    launch(urls, !!separate);
  }
  return { hasChrome };
}

function trayIcon(theme) {
  const dark = theme ? String(theme) === 'dark' : nativeTheme.shouldUseDarkColors;
  const candidates = [
    path.join(ROOT, 'assets', 'brand', 'tray', dark ? 'tray-dark-24.png' : 'tray-light-24.png'),
    path.join(ROOT, 'assets', 'brand', 'tray', dark ? 'tray-dark-22.png' : 'tray-light-22.png'),
    path.join(ROOT, 'assets', 'brand', 'tray-Template.png'),
  ];
  for (const c of candidates) { try { if (fs.existsSync(c)) return nativeImage.createFromPath(c); } catch {} }
  return nativeImage.createEmpty();
}

function positionPopover(win, { anchor } = {}) {
  if (!win) return;
  const s = session();
  if (s === 'wayland') return; // compositor positions the window; do nothing
  // X11: anchor to cursor (numpad) or work-area corner.
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const wa = display.workArea;
  const winBounds = win.getBounds();
  if (anchor === 'cursor') {
    let x = Math.round(cursor.x + 8 - SHADOW_PAD);
    let y = Math.round(cursor.y + 8 - SHADOW_PAD);
    x = Math.max(wa.x + 6, Math.min(x, wa.x + wa.width - winBounds.width - 6));
    y = Math.max(wa.y + 6, Math.min(y, wa.y + wa.height - winBounds.height - 6));
    win.setPosition(x, y, false);
    return;
  }
  win.setPosition(
    Math.round(wa.x + wa.width - winBounds.width - 12),
    Math.round(wa.y + wa.height - winBounds.height - 12),
    false
  );
}

function share() { return { ok: false, fallback: true, reason: 'no-native-share' }; }

module.exports = {
  capabilities,
  captureForegroundWindow,
  paste,
  writeFiles,
  writeText,
  listWindows,
  listRunningApps,
  launchApp,
  chromePaths,
  getChromeProfiles: getProfiles,
  openSites,
  trayIcon,
  positionPopover,
  share,
  SHADOW_PAD,
};
