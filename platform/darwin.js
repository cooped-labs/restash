// platform/darwin.js — macOS implementation of the platform contract.
//
// This is a near-mechanical extraction of the inline mac native code that used
// to live in main.js (osascript + the committed bin/restash-* Swift helpers),
// so macOS behavior is byte-for-byte unchanged. New cross-platform code lives
// only in win32.js / linux.js.
//
// Bundling lane: committed prebuilt Swift helpers in bin/ (restash-clip-file,
// restash-decode-qr, restash-windows, restash-share) + the OS's own osascript.

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execFile, execFileSync, spawn } = require('node:child_process');
const { clipboard, screen, nativeImage, systemPreferences, shell } = require('electron');
const { getChromeProfiles } = require('./chrome');

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'bin');
const SHADOW_PAD = 24; // must match styles.css body padding / main.js

const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function capabilities() {
  return {
    canSynthesizePaste: true,
    canListWindows: true,
    canCaptureScreen: true,
    canPositionWindows: true,
    supportsNativeShare: true,
    hasTray: true,
    sessionType: 'darwin',
    pasteBackend: 'osascript',
    needsPermissionGrant: true,          // Accessibility/Apple Events (TCC)
    permissionKind: 'accessibility',
  };
}

// --- foreground capture / restore (osascript by PID, unchanged) ---
function captureForegroundWindow() {
  return new Promise((resolve) => {
    execFile(
      'osascript',
      ['-e', 'tell application "System Events" to get unix id of first application process whose frontmost is true'],
      (err, stdout) => {
        if (err) { resolve(null); return; }
        const pid = parseInt(String(stdout).trim(), 10);
        resolve(Number.isFinite(pid) ? pid : null);
      }
    );
  });
}

function activateAppByPid(pid) {
  if (!pid) return Promise.resolve();
  return new Promise((resolve) => {
    execFile(
      'osascript',
      ['-e', `tell application "System Events" to set frontmost of (first application process whose unix id is ${pid}) to true`],
      () => resolve()
    );
  });
}

// --- multi-file clipboard via the committed Swift NSPasteboard helper ---
function writeFiles(filePaths) {
  const list = (filePaths || []).filter((p) => typeof p === 'string' && p);
  if (!list.length) return Promise.resolve({ ok: false, reason: 'no-files' });
  try {
    execFileSync(path.join(BIN, 'restash-clip-file'), list);
    return Promise.resolve({ ok: true });
  } catch (err) {
    return Promise.resolve({ ok: false, reason: 'clip-file-failed', error: err.message });
  }
}

function writeText(text) {
  clipboard.writeText(String(text ?? ''));
  return Promise.resolve({ ok: true });
}

// --- the core paste interaction (unchanged macOS flow) ---
// hooks: { win, hideApp } supplied by main.js so we can hide its windows.
async function paste({ text, filePaths, targetWindow }, hooks = {}) {
  const files = (filePaths || []).filter((p) => typeof p === 'string' && p);
  if (!text && !files.length) return { ok: false, reason: 'bad-input' };

  const markOwnWrite = (payload) => {
    if (typeof hooks.markOwnWrite === 'function') {
      try { hooks.markOwnWrite(payload); } catch {}
    }
  };

  const trusted = systemPreferences.isTrustedAccessibilityClient(false);
  if (!trusted) {
    if (files.length) { try { execFileSync(path.join(BIN, 'restash-clip-file'), files); } catch {} }
    else if (text) { markOwnWrite(text); clipboard.writeText(text); }
    // NB: do NOT also fire isTrustedAccessibilityClient(true) here — the
    // non-prompting check above already established the app is untrusted, and
    // the System Settings deep-link below is the single actionable surface.
    // Prompting as well would double-surface the native TCC dialog.
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    return { ok: false, reason: 'no-accessibility', mode: 'copied-only' };
  }

  // Format-aware snapshot so we don't silently wipe a copied image/file/RTF.
  // Electron can round-trip text/html/rtf/image; file lists are not captured
  // here, so when the prior clipboard was richer than plain text we skip the
  // text-only restore rather than degrade/destroy it.
  const prevFormats = clipboard.availableFormats();
  const hadText = prevFormats.some((f) => f === 'text/plain' || f.startsWith('text/'));
  const prevText = hadText ? clipboard.readText() : '';
  const prevHtml = prevFormats.includes('text/html') ? clipboard.readHTML() : '';
  const prevRtf = prevFormats.some((f) => f.includes('rtf')) ? clipboard.readRTF() : '';
  const prevImage = prevFormats.some((f) => f.startsWith('image/')) ? clipboard.readImage() : null;
  const prevHadImage = !!(prevImage && !prevImage.isEmpty());
  // file lists (public.file-url) cannot be round-tripped via Electron's clipboard
  const prevHadFiles = prevFormats.some((f) => f.includes('file-url') || f.includes('NSFilenamesPboardType'));

  if (files.length) {
    try { execFileSync(path.join(BIN, 'restash-clip-file'), files); }
    catch (err) { return { ok: false, reason: 'clip-file-failed', error: err.message }; }
  } else {
    markOwnWrite(text);
    clipboard.writeText(text);
  }

  if (typeof hooks.hideApp === 'function') hooks.hideApp();
  await activateAppByPid(targetWindow);
  await new Promise((r) => setTimeout(r, 120));

  const result = await new Promise((resolve) => {
    execFile(
      'osascript',
      ['-e', 'tell application "System Events" to keystroke "v" using command down'],
      (err) => resolve(err
        ? { ok: false, reason: 'osascript-error', error: err.message }
        : { ok: true, mode: 'pasted' })
    );
  });

  setTimeout(() => {
    try {
      // If the prior clipboard held content we can't faithfully round-trip
      // (file URLs), leave the injected item in place rather than clobber the
      // user's clipboard with a degraded text-only copy or an empty string.
      if (prevHadFiles && !hadText && !prevHadImage && !prevHtml && !prevRtf) return;
      // Restore the richest representations we captured, recording each as an
      // own-write so the restore isn't re-captured into clipboard history.
      const restore = {};
      if (prevText) restore.text = prevText;
      if (prevHtml) restore.html = prevHtml;
      if (prevRtf) restore.rtf = prevRtf;
      if (Object.keys(restore).length) {
        markOwnWrite(prevText || prevHtml || prevRtf);
        clipboard.write(restore);
      } else if (prevHadImage) {
        // Record the restored image as an own-write so the image watcher in
        // main.js doesn't re-capture it on its next poll.
        try { markOwnWrite(prevImage.toPNG()); } catch {}
        clipboard.writeImage(prevImage);
      } else if (hadText) {
        // text was present but empty — preserve original empty-text state
        markOwnWrite(prevText);
        clipboard.writeText(prevText);
      }
    } catch {}
  }, 350);
  return result;
}

// --- QR (mac keeps the Swift Vision helper for byte-for-byte parity) ---
// captureRegion/decodeQR are intentionally NOT overridden here so callers can
// keep the existing screencapture+Vision path on mac. The shared platform/qr.js
// is still available for the future unified path.

// --- window listing (current Space) via the Swift helper ---
function listWindows(/* scope */) {
  return new Promise((resolve) => {
    try {
      execFile(path.join(BIN, 'restash-windows'), [], { timeout: 5000 }, (err, stdout) => {
        if (err) return resolve([]);
        try {
          const arr = JSON.parse(String(stdout || '[]'));
          resolve(Array.isArray(arr) ? arr : []);
        } catch { resolve([]); }
      });
    } catch { resolve([]); }
  });
}

function listRunningApps() {
  const dirs = [
    '/Applications', '/Applications/Utilities',
    '/System/Applications', '/System/Applications/Utilities',
    path.join(require('node:os').homedir(), 'Applications'),
  ];
  const apps = [];
  const seen = new Set();
  for (const dir of dirs) {
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch { continue; }
    for (const e of entries) {
      if (!e.endsWith('.app')) continue;
      const name = e.slice(0, -4);
      if (seen.has(name)) continue;
      seen.add(name);
      apps.push({ name, path: path.join(dir, e) });
    }
  }
  apps.sort((a, b) => a.name.localeCompare(b.name));
  return Promise.resolve(apps);
}

function launchApp(target) {
  const args = target && target.path ? [target.path] : ['-a', String((target && target.value) || '')];
  if (!args[args.length - 1]) return Promise.resolve({ ok: false });
  try { execFile('/usr/bin/open', args, () => {}); return Promise.resolve({ ok: true }); }
  catch { return Promise.resolve({ ok: false }); }
}

function chromePaths() {
  return {
    localState: path.join(require('electron').app.getPath('appData'), 'Google', 'Chrome', 'Local State'),
    binary: CHROME_BIN,
  };
}

function getProfiles() { return getChromeProfiles(chromePaths()); }

// per-profile / default launch (unchanged staggered open logic)
function openSites(byProfile, { separate } = {}) {
  const hasChrome = fs.existsSync(CHROME_BIN);
  const OPEN = '/usr/bin/open';
  let delay = 0;
  for (const [prof, urls] of byProfile) {
    const launch = (us, sep) => {
      if (prof && hasChrome) {
        if (sep) us.forEach((u) => { setTimeout(() => { try { execFile(CHROME_BIN, [`--profile-directory=${prof}`, '--new-window', u], () => {}); } catch {} }, delay); delay += 280; });
        else { setTimeout(() => { try { execFile(CHROME_BIN, [`--profile-directory=${prof}`, '--new-window', ...us], () => {}); } catch {} }, delay); delay += 220; }
      } else if (sep) us.forEach((u) => { setTimeout(() => { try { execFile(OPEN, ['-n', u], () => {}); } catch {} }, delay); delay += 280; });
      else { setTimeout(() => { try { execFile(OPEN, us, () => {}); } catch {} }, delay); delay += 220; }
    };
    launch(urls, !!separate);
  }
  return { hasChrome };
}

// --- tray icon (mac Template auto-invert) ---
function trayIcon(/* theme */) {
  const p = path.join(ROOT, 'assets', 'brand', 'tray-Template.png');
  const img = nativeImage.createFromPath(p);
  img.setTemplateImage(true);
  return img;
}

function positionPopover(win, { anchor, tray } = {}) {
  if (!win) return;
  if (anchor === 'cursor') return positionAtCursor(win);
  return positionUnderTray(win, tray);
}

function positionUnderTray(win, tray) {
  if (!tray || !win) return;
  const trayBounds = tray.getBounds();
  const winBounds = win.getBounds();
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  let x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
  let y = Math.round(trayBounds.y + trayBounds.height - SHADOW_PAD);
  const wa = display.workArea;
  x = Math.max(wa.x + 6, Math.min(x, wa.x + wa.width - winBounds.width - 6));
  y = Math.max(wa.y - SHADOW_PAD, y);
  win.setPosition(x, y, false);
}

function positionAtCursor(win) {
  if (!win) return;
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const winBounds = win.getBounds();
  const wa = display.workArea;
  let x = Math.round(cursor.x + 8 - SHADOW_PAD);
  let y = Math.round(cursor.y + 8 - SHADOW_PAD);
  x = Math.max(wa.x + 6, Math.min(x, wa.x + wa.width - winBounds.width - 6));
  y = Math.max(wa.y + 6, Math.min(y, wa.y + wa.height - winBounds.height - 6));
  win.setPosition(x, y, false);
}

// --- native share sheet via the committed Swift helper ---
function share({ text, url, filePath, filePaths, label, iconPath } = {}, hooks = {}) {
  const helper = path.join(BIN, 'restash-share');
  const args = [];
  if (label) args.push(`--title=${String(label)}`);
  if (iconPath) {
    const abs = path.isAbsolute(iconPath) ? iconPath : path.join(ROOT, iconPath);
    args.push(`--icon=${abs}`);
  }
  // Push every file path as a positional arg — the Swift helper wraps each as a
  // fileURL. Prefer the multi-file array; fall back to the single filePath.
  const paths = (Array.isArray(filePaths) && filePaths.length)
    ? filePaths.filter((p) => typeof p === 'string' && p)
    : (filePath ? [String(filePath)] : []);
  for (const p of paths) args.push(String(p));
  if (text) args.push(String(text));
  if (url) args.push(String(url));
  if (!args.length || (args.length === 1 && args[0].startsWith('--'))) {
    return { ok: false, reason: 'no-content' };
  }
  try {
    if (typeof hooks.beforeShare === 'function') hooks.beforeShare();
    const child = spawn(helper, args, { detached: false, stdio: 'ignore' });
    const restore = () => { if (typeof hooks.afterShare === 'function') hooks.afterShare(); };
    child.once('exit', restore);
    setTimeout(restore, 65_000);
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'spawn-failed', error: err.message };
  }
}

module.exports = {
  capabilities,
  captureForegroundWindow,
  activateAppByPid,
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
