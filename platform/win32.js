// platform/win32.js — Windows implementation of the platform contract.
//
// Zero-install bundling lane: a committed/CI-built self-contained helper
// `bin/restash-win-helper.exe` (Win32 C, statically linked, no runtime deps),
// shipped in extraResources OUTSIDE asar. The helper does, in one process:
//   --get-foreground          → prints the foreground HWND
//   --paste <hwnd>            → SetForegroundWindow(hwnd) (AttachThreadInput
//                               workaround) then SendInput Ctrl+V
//   --clip-files <paths...>   → builds CF_HDROP/DROPFILES on the clipboard
//   --list                    → EnumWindows JSON [{owner,title}]
//
// NO xdotool/ydotool/etc. — none of those exist on Windows anyway, but the
// policy bans shelling out to any user-installed tool here too.

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execFile, execFileSync, spawn } = require('node:child_process');
const { app, clipboard, screen, nativeImage, shell } = require('electron');
const { getChromeProfiles } = require('./chrome');

const ROOT = path.join(__dirname, '..');
const SHADOW_PAD = 24;

// In a packaged build the helper lives in resources/bin (extraResources);
// in dev it lives in the repo bin/. Resolve whichever exists.
function helperPath() {
  const packaged = path.join(process.resourcesPath || '', 'bin', 'restash-win-helper.exe');
  const dev = path.join(ROOT, 'bin', 'restash-win-helper.exe');
  if (process.resourcesPath && fs.existsSync(packaged)) return packaged;
  return dev;
}
function helperAvailable() { try { return fs.existsSync(helperPath()); } catch { return false; } }

function capabilities() {
  return {
    canSynthesizePaste: helperAvailable(),
    canListWindows: helperAvailable(),
    canCaptureScreen: true,        // desktopCapturer
    canPositionWindows: true,
    supportsNativeShare: false,    // in-app Copy/Open/Reveal/Email fallback
    hasTray: true,
    sessionType: 'win32',
    pasteBackend: helperAvailable() ? 'win-helper' : 'copy-only',
    needsPermissionGrant: false,   // no TCC/portal; UAC only for elevated targets
    permissionKind: null,
  };
}

function captureForegroundWindow() {
  return new Promise((resolve) => {
    if (!helperAvailable()) return resolve(null);
    try {
      execFile(helperPath(), ['--get-foreground'], { timeout: 2000 }, (err, stdout) => {
        if (err) return resolve(null);
        const h = String(stdout || '').trim();
        resolve(h && /^-?\d+$/.test(h) ? h : null);
      });
    } catch { resolve(null); }
  });
}

function writeText(text) { clipboard.writeText(String(text ?? '')); return Promise.resolve({ ok: true }); }

// CF_HDROP multi-file write via the helper.
function writeFiles(filePaths) {
  const list = (filePaths || []).filter((p) => typeof p === 'string' && p);
  if (!list.length) return Promise.resolve({ ok: false, reason: 'no-files' });
  if (!helperAvailable()) {
    // Fallback: copy first path as text so the user can still act on it.
    clipboard.writeText(list[0]);
    return Promise.resolve({ ok: false, reason: 'no-helper', mode: 'copied-only' });
  }
  try { execFileSync(helperPath(), ['--clip-files', ...list]); return Promise.resolve({ ok: true }); }
  catch (err) { clipboard.writeText(list[0]); return Promise.resolve({ ok: false, reason: 'clip-failed', error: err.message, mode: 'copied-only' }); }
}

async function paste({ text, filePaths, targetWindow }, hooks = {}) {
  const files = (filePaths || []).filter((p) => typeof p === 'string' && p);
  if (!text && !files.length) return { ok: false, reason: 'bad-input' };

  const prevClipboard = clipboard.readText();

  // Place payload on the clipboard first.
  if (files.length) {
    const w = await writeFiles(files);
    if (!w.ok && !helperAvailable()) return { ok: false, reason: 'copied-only', mode: 'copied-only' };
  } else {
    clipboard.writeText(text);
  }

  if (!helperAvailable()) {
    return { ok: false, reason: 'no-helper', mode: 'copied-only' };
  }

  // Hide our popover so focus can return; then helper restores the prior HWND
  // and synthesizes Ctrl+V in one process.
  if (typeof hooks.hideApp === 'function') hooks.hideApp();
  await new Promise((r) => setTimeout(r, 60));

  const result = await new Promise((resolve) => {
    const args = ['--paste'];
    if (targetWindow) args.push(String(targetWindow));
    try {
      execFile(helperPath(), args, { timeout: 4000 }, (err) => {
        resolve(err
          ? { ok: false, reason: 'helper-error', error: err.message, mode: 'copied-only' }
          : { ok: true, mode: 'pasted' });
      });
    } catch (err) { resolve({ ok: false, reason: 'spawn-failed', error: err.message, mode: 'copied-only' }); }
  });

  // Restore the previous clipboard text after paste lands.
  setTimeout(() => { try { clipboard.writeText(prevClipboard); } catch {} }, 400);
  return result;
}

function listWindows(/* scope */) {
  return new Promise((resolve) => {
    if (!helperAvailable()) return resolve([]);
    try {
      execFile(helperPath(), ['--list'], { timeout: 5000 }, (err, stdout) => {
        if (err) return resolve([]);
        try { const a = JSON.parse(String(stdout || '[]')); resolve(Array.isArray(a) ? a : []); }
        catch { resolve([]); }
      });
    } catch { resolve([]); }
  });
}

// Best-effort running apps from /proc-equivalent: on Windows we surface the
// EnumWindows owner list (no separate installed-app scan to avoid registry
// crawling). Returns [{name}].
async function listRunningApps() {
  const wins = await listWindows('all');
  const seen = new Set();
  const out = [];
  for (const w of wins) {
    const name = (w.owner || '').trim();
    if (name && !seen.has(name)) { seen.add(name); out.push({ name }); }
  }
  return out;
}

function launchApp(target) {
  // Prefer an explicit path; else open by name via the shell. No ShellExecute
  // tool shell-out — Electron's shell.openPath is native and cross-platform.
  const p = target && (target.path || target.value);
  if (!p) return Promise.resolve({ ok: false });
  try {
    if (target.path && fs.existsSync(target.path)) { shell.openPath(target.path); return Promise.resolve({ ok: true }); }
    // start via cmd as a last resort (built-in shell, not a user tool).
    spawn('cmd', ['/c', 'start', '', String(p)], { detached: true, stdio: 'ignore' }).unref();
    return Promise.resolve({ ok: true });
  } catch { return Promise.resolve({ ok: false }); }
}

function chromePaths() {
  const localAppData = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
  const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
  const candidates = [
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  const binary = candidates.find((c) => { try { return fs.existsSync(c); } catch { return false; } }) || candidates[0];
  return {
    localState: path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Local State'),
    binary,
  };
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

// --- tray: explicit .ico / 16px PNG (no mac Template auto-invert) ---
function trayIcon(theme) {
  const dark = String(theme) === 'dark';
  const candidates = [
    path.join(ROOT, 'assets', 'brand', 'tray', 'win', 'tray.ico'),
    path.join(ROOT, 'assets', 'brand', 'tray', dark ? 'tray-dark-16.png' : 'tray-light-16.png'),
    path.join(ROOT, 'assets', 'brand', 'tray-Template.png'),
  ];
  for (const c of candidates) { try { if (fs.existsSync(c)) return nativeImage.createFromPath(c); } catch {} }
  return nativeImage.createEmpty();
}

function positionPopover(win, { anchor, tray } = {}) {
  if (!win) return;
  const winBounds = win.getBounds();
  // Windows: anchor to the tray bounds when valid, else bottom-right work area.
  if (tray) {
    try {
      const tb = tray.getBounds();
      if (tb && tb.width > 0) {
        const display = screen.getDisplayNearestPoint({ x: tb.x, y: tb.y });
        const wa = display.workArea;
        let x = Math.round(tb.x + tb.width / 2 - winBounds.width / 2);
        // Tray is at the bottom on Windows → place popover above it.
        let y = Math.round(wa.y + wa.height - winBounds.height - 6);
        x = Math.max(wa.x + 6, Math.min(x, wa.x + wa.width - winBounds.width - 6));
        win.setPosition(x, y, false);
        return;
      }
    } catch {}
  }
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const wa = display.workArea;
  if (anchor === 'cursor') {
    let x = Math.round(cursor.x + 8 - SHADOW_PAD);
    let y = Math.round(cursor.y + 8 - SHADOW_PAD);
    x = Math.max(wa.x + 6, Math.min(x, wa.x + wa.width - winBounds.width - 6));
    y = Math.max(wa.y + 6, Math.min(y, wa.y + wa.height - winBounds.height - 6));
    win.setPosition(x, y, false);
    return;
  }
  // bottom-right work-area corner
  win.setPosition(
    Math.round(wa.x + wa.width - winBounds.width - 12),
    Math.round(wa.y + wa.height - winBounds.height - 12),
    false
  );
}

function positionShelf(win) {
  if (!win) return;
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const wa = d.workArea;
  const b = win.getBounds();
  win.setPosition(Math.round(wa.x + wa.width / 2 - b.width / 2), wa.y + 6, false);
}

// No native share sheet — renderer shows in-app Copy/Open/Reveal/Email.
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
  positionShelf,
  share,
  SHADOW_PAD,
};
