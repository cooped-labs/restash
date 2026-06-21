const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, clipboard, shell, screen, globalShortcut, systemPreferences, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const os = require('node:os');
const crypto = require('node:crypto');
const QRCode = require('qrcode');

// Single-instance lock — Restash is a menu-bar singleton. A second launch must
// NOT spin up a rival instance: duplicates race on settings.json (theme flips)
// and answer the global hotkey with their own stale window. If we don't own the
// lock, this process is a redundant duplicate — quit hard before any tray,
// window, or settings write happens. The original instance gets 'second-instance'.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// ── Lemon Squeezy licensing ──────────────────────────────────────────────
// Restash stays serverless: Lemon Squeezy mints the license keys and its
// public license API verifies them, so the app talks to LS directly — no
// backend. Two things get filled in once the LS store + products exist:
//
//   1. Checkout URLs — in renderer.js (CHECKOUT_URLS).
//   2. The VARIANT-ID → tier map below. In Lemon Squeezy open Store →
//      Products; every variant has a numeric ID. Turn ON "license keys" for
//      each product, with an activation limit (e.g. 3 devices).
const LS_LICENSE_API = 'https://api.lemonsqueezy.com/v1/licenses';
const LS_VARIANT_TIERS = {
  // 'REPLACE-MONTHLY-VARIANT-ID':      'monthly',
  // 'REPLACE-YEARLY-VARIANT-ID':       'yearly',
  // 'REPLACE-LIFETIME-VARIANT-ID':     'lifetime',
  // 'REPLACE-OTO-YEARLY-VARIANT-ID':   'yearly',
  // 'REPLACE-OTO-LIFETIME-VARIANT-ID': 'lifetime',
};

// A valid-but-unmapped variant still unlocks the app (fail open for the user).
function tierForVariant(variantId) {
  return LS_VARIANT_TIERS[String(variantId)] || 'lifetime';
}
function licenseInstanceName() {
  try { return `Restash · ${os.hostname()}`; } catch { return 'Restash'; }
}
function maskKey(key) {
  const k = String(key || '');
  return k.length <= 8 ? k : `${k.slice(0, 4)}····${k.slice(-4)}`;
}

// POST to the Lemon Squeezy license API (activate / validate / deactivate).
// These endpoints are unauthenticated — designed to be called straight from
// the client — so no API key is needed.
async function lsLicenseCall(action, params) {
  try {
    const res = await fetch(`${LS_LICENSE_API}/${action}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    });
    return (await res.json().catch(() => ({}))) || {};
  } catch (err) {
    return { error: (err && err.message) || 'network error', _network: true };
  }
}

// On launch, re-check the stored license so refunds / expiries / disabled
// keys downgrade the app. Offline → keep current state, never punish.
async function revalidateLicense() {
  const lic = readSettings().license;
  if (!lic || !lic.key) return;
  const r = await lsLicenseCall('validate', {
    license_key: lic.key,
    instance_id: lic.instanceId || '',
  });
  if (r && r._network) return;
  const lk = r && r.license_key;
  const stillValid = !!(r && r.valid && lk && lk.status === 'active');
  const s = readSettings();
  if (!s.license) return;
  if (stillValid) {
    s.license.status = 'active';
    s.license.expiresAt = (lk && lk.expires_at) || s.license.expiresAt || null;
    writeSettings(s);
  } else {
    s.license = null;
    s.tier = 'free';
    writeSettings(s);
    if (win && !win.isDestroyed()) win.webContents.send('entitlement:changed');
  }
}

// Show in Dock so users can see Restash is running and click to open it.

let tray = null;
let win = null;

const STORE_FILE = path.join(app.getPath('userData'), 'items.json');
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const CLIPBOARD_HISTORY_FILE = path.join(app.getPath('userData'), 'clipboard-history.json');

// ── Owner build ──────────────────────────────────────────────────────────
// Grants permanent full access without a license — for your own machines.
// Two ways to enable it, both safe for distributed builds (which have neither):
//   • run with the env var:  RESTASH_OWNER=1 npm start
//   • or create a marker file (works for a packaged personal build, no rebuild):
//       touch "$HOME/Library/Application Support/restash/.owner"
// Never ship a build with the marker bundled — it's read from userData, so a
// normal release on someone else's Mac simply won't have it.
const OWNER_MARKER = path.join(app.getPath('userData'), '.owner');
function isOwnerBuild() {
  if (process.env.RESTASH_OWNER === '1') return true;
  try { return fs.existsSync(OWNER_MARKER); } catch { return false; }
}

const DEFAULT_HOTKEY    = 'Command+Shift+V';
const DEFAULT_QR_HOTKEY = 'Control+Shift+F';
const DEFAULT_STASH_HOTKEY = 'Control+Shift+S';

function readStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) return [];
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeStore(items) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(items, null, 2));
}

const TRIAL_DAYS = 30;
// Free-tier ceilings, applied once the trial ends and the user hasn't paid.
const FREE_LIMITS = { stashes: 1, pins: 9, items: 15, fileBytes: 100 * 1024 * 1024 };

function readSettings() {
  const defaults = {
    hotkey: DEFAULT_HOTKEY, qrHotkey: DEFAULT_QR_HOTKEY, stashHotkey: DEFAULT_STASH_HOTKEY, theme: 'light',
    onboarded: false, stashes: [], tier: 'free',
    license: null,     // { key, instanceId, variantId, tier, status, expiresAt } once activated
    trialStartedAt: 0, // 0 = not yet stamped; ensureTrialStamp() sets it on first run
    otoShown: false,   // one-time-offer fires once, ever
    menuSize: null,    // {width,height} — user-resized list popover (null = default)
    gridSize: null,    // {width,height} — user-resized cursor numpad (null = default)
    clipboardHistoryMax: 3, // Clipboard memory: # of recent copies to auto-capture (0 = Off)
    showNotchShelf: true,    // RES-13: notch drop shelf (drag-to-reveal)
    lastUsedStashId: 'all',  // RES-13: shelf remembers last destination
  };
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return defaults;
    return { ...defaults, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
  } catch {
    return defaults;
  }
}

function writeSettings(s) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
}

// ── Clipboard memory (RES-11) ──────────────────────────────────────────────
// Auto-captures the user's most-recent text copies into a small, local,
// newest-first ring of items, stored separately from the user's saved items.
// Everything stays on-device; nothing is ever sent anywhere.
//
// FOLLOW-UP: this v1 is text-only and JS-only. A later pass should add the
// Swift "concealed pasteboard" detection (org.nspasteboard.ConcealedType /
// password-manager hints) so password copies are skipped — that needs new
// native code, so it's deferred to keep this build Xcode-free.
const CLIP_HISTORY_VERSION = 1;
const CLIP_MAX_BYTES = 100 * 1024;        // skip strings larger than 100KB
const CLIP_POLL_MS = 700;                 // clipboard watcher interval
const CLIP_WRITE_DEBOUNCE_MS = 250;       // debounce json writes
const CLIP_OWN_WRITE_WINDOW_MS = 2000;    // drop captures that match our own write
const CLIP_OWN_WRITE_RING = 8;            // cap of the own-write ring buffer

let clipHistory = [];          // in-memory items, newest-first
let clipHistoryLoaded = false;
let clipWatchTimer = null;
let clipLastHash = null;       // SHA-1 of the last clipboard text we saw
let clipOwnWrites = [];        // ring of { hash, at } for Restash-originated writes
let clipWriteTimer = null;

function sha1(text) {
  return crypto.createHash('sha1').update(String(text), 'utf8').digest('hex');
}

function readClipHistory() {
  try {
    if (!fs.existsSync(CLIPBOARD_HISTORY_FILE)) return [];
    const data = JSON.parse(fs.readFileSync(CLIPBOARD_HISTORY_FILE, 'utf8'));
    return Array.isArray(data && data.items) ? data.items : [];
  } catch {
    return [];
  }
}

function ensureClipHistoryLoaded() {
  if (clipHistoryLoaded) return;
  clipHistory = readClipHistory();
  clipHistoryLoaded = true;
}

// Debounced write of the in-memory history to disk.
function scheduleClipHistoryWrite() {
  if (clipWriteTimer) clearTimeout(clipWriteTimer);
  clipWriteTimer = setTimeout(() => {
    clipWriteTimer = null;
    try {
      fs.mkdirSync(path.dirname(CLIPBOARD_HISTORY_FILE), { recursive: true });
      fs.writeFileSync(
        CLIPBOARD_HISTORY_FILE,
        JSON.stringify({ version: CLIP_HISTORY_VERSION, items: clipHistory }, null, 2)
      );
    } catch {}
  }, CLIP_WRITE_DEBOUNCE_MS);
}

function broadcastClipHistory() {
  if (win && !win.isDestroyed()) {
    win.webContents.send('clipboard-history:updated', clipHistory);
  }
}

// Every Restash-originated clipboard write must go through this so the watcher
// doesn't capture our own paste/copy as a "recent" item (which would create a
// loop). We record the hash BEFORE writing, then drop matching captures inside
// CLIP_OWN_WRITE_WINDOW_MS.
function restashWriteClipboard(text) {
  const str = String(text ?? '');
  clipOwnWrites.push({ hash: sha1(str), at: Date.now() });
  if (clipOwnWrites.length > CLIP_OWN_WRITE_RING) {
    clipOwnWrites = clipOwnWrites.slice(-CLIP_OWN_WRITE_RING);
  }
  clipboard.writeText(str);
}

function isOwnRecentWrite(hash) {
  const now = Date.now();
  // Prune expired entries while we're here.
  clipOwnWrites = clipOwnWrites.filter((w) => now - w.at <= CLIP_OWN_WRITE_WINDOW_MS);
  return clipOwnWrites.some((w) => w.hash === hash);
}

function trimClipHistory(max) {
  if (clipHistory.length > max) clipHistory = clipHistory.slice(0, max);
}

// Read the clipboard and, if it changed to something new and capturable,
// prepend it to the history. No-op when the feature is Off.
function checkClipboard() {
  const max = readSettings().clipboardHistoryMax || 0;
  if (max <= 0) return;
  let text = '';
  try { text = clipboard.readText() || ''; } catch { return; }
  if (!text) return;                                  // skip empty
  const hash = sha1(text);
  if (hash === clipLastHash) return;                  // unchanged since last poll
  clipLastHash = hash;
  if (isOwnRecentWrite(hash)) return;                 // our own paste/copy — ignore
  if (Buffer.byteLength(text, 'utf8') > CLIP_MAX_BYTES) return; // too large
  ensureClipHistoryLoaded();
  if (clipHistory[0] && clipHistory[0].text === text) return;   // dup of top

  clipHistory.unshift({
    id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    text,
    capturedAt: Date.now(),
  });
  trimClipHistory(max);
  scheduleClipHistoryWrite();
  broadcastClipHistory();
}

// Start/stop the polling watcher based on the current setting. Idempotent.
function syncClipboardWatcher() {
  const max = readSettings().clipboardHistoryMax || 0;
  if (max > 0) {
    if (!clipWatchTimer) {
      // Seed clipLastHash with the current clipboard so we don't capture
      // whatever happened to be there before the watcher started.
      try { clipLastHash = sha1(clipboard.readText() || ''); } catch { clipLastHash = null; }
      clipWatchTimer = setInterval(checkClipboard, CLIP_POLL_MS);
    }
  } else if (clipWatchTimer) {
    clearInterval(clipWatchTimer);
    clipWatchTimer = null;
  }
}

// Stamp the trial start the first time the app runs. Idempotent.
function ensureTrialStamp() {
  const s = readSettings();
  if (!s.trialStartedAt) {
    s.trialStartedAt = Date.now();
    writeSettings(s);
  }
  return s.trialStartedAt;
}

// While Restash is given away with full access (pre-open-source), EVERY install
// gets complete access — no trial countdown, no caps, no license needed. Flip
// this to false to restore the trial / free-tier / paid plans below.
const OPEN_ACCESS = true;

// Resolve what the user can actually do right now:
//   - OPEN_ACCESS (current)          → complete access for everyone
//   - paid (monthly/yearly/lifetime) → full access
//   - within the 30-day window      → full access (trial)
//   - otherwise                     → limited free tier
// Returns { tier, effective: 'full'|'free', trialDaysLeft, trialActive }.
function resolveEntitlement() {
  // Everyone (and any owner build) gets permanent complete access.
  if (OPEN_ACCESS || isOwnerBuild()) {
    return {
      tier: 'complete',
      effective: 'full',
      trialDaysLeft: 0,
      trialActive: false,
      limits: FREE_LIMITS,
      license: { status: 'open', tier: 'complete', keyMasked: 'COMPLETE ACCESS', expiresAt: null },
    };
  }
  const s = readSettings();
  // An activated Lemon Squeezy license is the source of truth for paid status.
  const lic = s.license;
  const licensed = !!(lic && lic.status === 'active');
  const tier = licensed ? (lic.tier || 'lifetime') : 'free';
  const started = s.trialStartedAt || Date.now();
  const msLeft = (started + TRIAL_DAYS * 864e5) - Date.now();
  const trialDaysLeft = Math.max(0, Math.ceil(msLeft / 864e5));
  const trialActive = !licensed && msLeft > 0;
  return {
    tier,
    effective: (licensed || trialActive) ? 'full' : 'free',
    trialDaysLeft,
    trialActive,
    limits: FREE_LIMITS,
    license: lic
      ? { status: lic.status, tier: lic.tier, keyMasked: maskKey(lic.key), expiresAt: lic.expiresAt || null }
      : null,
  };
}

let currentHotkey   = DEFAULT_HOTKEY;      // popover summon
let currentQRHotkey = DEFAULT_QR_HOTKEY;   // QR decoder
let currentStashHotkey = DEFAULT_STASH_HOTKEY; // RES-13 notch shelf summon

// Forward references — these get assigned inside app.whenReady() once the
// real implementations are defined. registerHotkeySlot is called before then
// (at module load), so we wrap them in a thunk that resolves at call time.
let qrTrigger = null;

// Generic per-slot registration. Each slot ('summon' | 'qr' | 'stash') has its
// own accelerator + handler. Re-registering a slot unregisters the previous
// one, preserves the other slots, and rolls back if the new combo is in use.
function registerHotkeySlot(slot, accel) {
  let handler;
  if (slot === 'qr') handler = () => { if (typeof qrTrigger === 'function') qrTrigger(); };
  else handler = togglePopoverAtCursor;
  const prev = slot === 'qr' ? currentQRHotkey : currentHotkey;
  if (prev) globalShortcut.unregister(prev);
  const ok = accel ? globalShortcut.register(accel, handler) : false;
  if (ok) {
    if (slot === 'qr') currentQRHotkey = accel;
    else currentHotkey = accel;
    return { ok: true, hotkey: accel };
  }
  // Rollback to the prior accel for this slot so we don't lose it entirely.
  if (prev && prev !== accel) globalShortcut.register(prev, handler);
  return { ok: false, hotkey: prev, reason: 'in-use' };
}

// Back-compat shim — the popover-summon recorder in Settings still calls this.
function tryRegisterHotkey(accel) {
  return registerHotkeySlot('summon', accel);
}

// ============================================================
// QR content-type detection — shared between the test helper and the IPC.
// Recognizes payment URI schemes (solana:, bitcoin:, ethereum:) so QRs
// generated by wallets/payment processors come through as proper crypto
// items, not raw text. The address gets extracted into `value` and any
// payment params (amount, label, message) go on a `payment` object.
// ============================================================
function parseURIParams(qs) {
  const out = {};
  String(qs || '').split('&').forEach((pair) => {
    const eq = pair.indexOf('=');
    if (eq > 0) {
      try { out[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1)); }
      catch { out[pair.slice(0, eq)] = pair.slice(eq + 1); }
    } else if (pair) {
      out[pair] = '';
    }
  });
  return out;
}

function detectQRType(raw) {
  const v = String(raw || '').trim();
  if (!v) return { type: 'unknown', value: v };

  // Wi-Fi: WIFI:S:<ssid>;T:<auth>;P:<password>;[H:<hidden>];;
  if (/^WIFI:/i.test(v)) {
    const fields = {};
    v.replace(/^WIFI:/i, '').split(';').forEach((p) => {
      const eq = p.indexOf(':');
      if (eq > 0) fields[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
    });
    return { type: 'wifi', value: v, ssid: fields.S || '', password: fields.P || '', security: fields.T || '' };
  }

  // vCard
  if (/^BEGIN:VCARD/i.test(v)) return { type: 'vcard', value: v };

  // --- Payment URI schemes ----------------------------------------------
  // Solana Pay: solana:<base58-addr>?amount=…&label=…&spl-token=…&reference=…
  let m = v.match(/^solana:([1-9A-HJ-NP-Za-km-z]{32,44})(?:\?(.*))?$/i);
  if (m) {
    return {
      type: 'crypto', chain: 'SOL', value: m[1],
      payment: { uri: v, ...(m[2] ? parseURIParams(m[2]) : {}) },
    };
  }
  // BIP21 Bitcoin: bitcoin:<addr>?amount=…&label=…&message=…
  m = v.match(/^bitcoin:([a-zA-HJ-NP-Z0-9]+)(?:\?(.*))?$/i);
  if (m) {
    return {
      type: 'crypto', chain: 'BTC', value: m[1],
      payment: { uri: v, ...(m[2] ? parseURIParams(m[2]) : {}) },
    };
  }
  // EIP-681 Ethereum: ethereum:<addr>[@<chainId>][?value=…&gas=…]
  m = v.match(/^ethereum:(0x[0-9a-fA-F]{40})(?:@(\d+))?(?:\?(.*))?$/);
  if (m) {
    return {
      type: 'crypto', chain: 'ETH', value: m[1],
      payment: { uri: v, chainId: m[2] || '1', ...(m[3] ? parseURIParams(m[3]) : {}) },
    };
  }

  // Plain URL (with protocol).
  if (/^https?:\/\//i.test(v)) {
    let host = '';
    try { host = new URL(v).hostname; } catch {}
    return { type: 'url', value: v, host };
  }
  // Bare hostname or hostname/path — no protocol, but clearly a website.
  // Pattern: optional "www.", one or more domain labels separated by dots,
  // optional port, optional path. At least one dot required, which rules out
  // bare base58 / hex crypto addresses (none of those contain dots).
  if (/^(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?::\d+)?(?:\/[^\s]*)?$/i.test(v)) {
    const normalized = `https://${v}`;
    let host = '';
    try { host = new URL(normalized).hostname; } catch {}
    return { type: 'url', value: normalized, host };
  }

  // Bare crypto addresses (order matters: ETH first because of 0x prefix).
  if (/^0x[0-9a-fA-F]{40}$/.test(v)) return { type: 'crypto', chain: 'ETH', value: v };
  if (/^(bc1|tb1)[a-z0-9]{25,87}$/i.test(v) || /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(v)) {
    return { type: 'crypto', chain: 'BTC', value: v };
  }
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) return { type: 'crypto', chain: 'SOL', value: v };

  return { type: 'text', value: v };
}

// ============================================================
// Site metadata + heuristic safety check for QR-decoded URLs.
// Fetches og:title / description / image / favicon from the destination, plus
// flags any heuristic warnings (HTTP-only, URL shortener, sketchy TLD, etc.).
// Results cached by hostname for 10 minutes so repeat decodes are instant.
// ============================================================

const SITE_META_CACHE = new Map(); // host -> { meta, flags, ts }
const SITE_META_TTL_MS = 10 * 60 * 1000;
const SITE_FETCH_TIMEOUT_MS = 3500;
const SITE_FETCH_MAX_BYTES   = 256 * 1024;

// Hosts that hide their real destination behind a redirector. Not "unsafe"
// per se, but the user should know they can't see where they're going.
const URL_SHORTENERS = new Set([
  'bit.ly', 't.co', 'ow.ly', 'tinyurl.com', 'goo.gl', 'is.gd', 'buff.ly',
  'short.io', 'rebrand.ly', 'tiny.cc', 'lnkd.in', 'tinurl.com', 'cutt.ly',
  'soo.gd', 'fb.me', 'youtu.be', 's.id',
]);
// TLDs commonly abused by phishing / malware campaigns (per Spamhaus + ICANN).
const SUSPICIOUS_TLDS = new Set([
  'zip', 'mov', 'top', 'tk', 'ml', 'ga', 'cf', 'gq', 'xyz', 'click',
  'work', 'support', 'country', 'kim', 'science', 'review',
]);

function safetyHeuristics(rawUrl) {
  const flags = [];
  let u;
  try { u = new URL(rawUrl); } catch { return flags; }
  // NOTE: we used to flag HTTP-only as a warning. Removed — false-positive
  // rate is too high (lots of legit QRs encode http:// for sites that
  // auto-redirect, e.g. Wikipedia). The system browser surfaces the actual
  // insecure-transport warning when it matters.
  if (u.hostname.includes('xn--')) {
    flags.push({ code: 'punycode', text: 'Punycode hostname (possible look-alike)' });
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) {
    flags.push({ code: 'ip', text: 'IP address used as hostname' });
  }
  const baseHost = u.hostname.replace(/^www\./, '').toLowerCase();
  if (URL_SHORTENERS.has(baseHost)) {
    flags.push({ code: 'shortener', text: 'URL shortener — destination hidden' });
  }
  const tld = u.hostname.split('.').pop().toLowerCase();
  if (SUSPICIOUS_TLDS.has(tld)) {
    flags.push({ code: 'tld', text: `Unusual TLD (.${tld})` });
  }
  return flags;
}

async function fetchSiteMeta(rawUrl) {
  const u = new URL(rawUrl);
  const host = u.hostname.toLowerCase();
  const cached = SITE_META_CACHE.get(host);
  if (cached && Date.now() - cached.ts < SITE_META_TTL_MS) {
    // Re-run heuristics for the current URL (they're per-URL, not per-host).
    return { meta: cached.meta, flags: safetyHeuristics(rawUrl) };
  }

  const meta = { title: '', description: '', image: '', favicon: '', host };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SITE_FETCH_TIMEOUT_MS);
    const res = await fetch(rawUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Be a polite citizen — identify ourselves clearly.
        'User-Agent': 'Restash/0.1 (+https://restash.app; link preview)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);

    if (res.ok && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8', { fatal: false });
      let html = '';
      let bytes = 0;
      while (bytes < SITE_FETCH_MAX_BYTES) {
        const { value, done } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        bytes += value.length;
        // Stop once we've seen </head> — all we care about lives in there.
        if (/<\/head>/i.test(html)) break;
      }
      try { await reader.cancel(); } catch {}

      // og:title / og:description / og:image take precedence over generic tags.
      const og = (prop) => {
        const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)`, 'i');
        const m = html.match(re); return m ? m[1].trim() : '';
      };
      const ogTitle = og('og:title');
      const ogDesc  = og('og:description');
      const ogImage = og('og:image');
      const metaDesc = og('description');

      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      meta.title = (ogTitle || titleMatch?.[1] || '').trim().slice(0, 200);
      meta.description = (ogDesc || metaDesc || '').trim().slice(0, 320);
      if (ogImage) {
        try { meta.image = new URL(ogImage, rawUrl).href; } catch {}
      }

      // Favicon: prefer apple-touch-icon → icon link → /favicon.ico → Google fallback.
      const linkIcon = (rel) => {
        const re = new RegExp(`<link[^>]+rel=["']${rel}["'][^>]+href=["']([^"']+)`, 'i');
        const m = html.match(re); return m ? m[1] : '';
      };
      const touchIcon = linkIcon('apple-touch-icon');
      const icon      = linkIcon('icon') || linkIcon('shortcut icon');
      const chosen = touchIcon || icon;
      if (chosen) {
        try { meta.favicon = new URL(chosen, rawUrl).href; } catch {}
      }
    }
  } catch (_err) {
    // Network error / timeout / non-2xx — fall through with whatever we got.
  }

  // Always provide some kind of favicon: Google's s2 service is a reliable
  // fallback for any host that resolves DNS.
  if (!meta.favicon) {
    meta.favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  }

  SITE_META_CACHE.set(host, { meta, ts: Date.now() });
  return { meta, flags: safetyHeuristics(rawUrl) };
}

// Tray icon — Concept A "Stash Stack" mark, generated by
// `scripts/build-brand-assets.js` from `assets/brand/mark.svg`.
// The "-Template" suffix tells AppKit this is a template image, so it'll
// auto-invert for dark menu bars and apply selection tinting.
function createTrayIcon() {
  const p = path.join(__dirname, 'assets', 'brand', 'tray-Template.png');
  const img = nativeImage.createFromPath(p);
  img.setTemplateImage(true);
  return img;
}

// Transparent gutter (logical px) around the visible card on every side.
// The window is this much bigger than the card so our CSS drop-shadow has
// room to render. Must match `body { padding }` in styles.css.
const SHADOW_PAD = 24;

function createWindow() {
  win = new BrowserWindow({
    width: 280 + SHADOW_PAD * 2,
    height: 348 + SHADOW_PAD * 2,
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    backgroundColor: '#00000000',
    // Native shadow OFF — we draw a softer custom shadow in CSS (.shell).
    // roundedCorners OFF — the card is rounded via CSS border-radius.
    hasShadow: false,
    roundedCorners: false,
    skipTaskbar: true,
    fullscreenable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Keep the renderer warm while hidden — without this, Chromium throttles
      // background tabs and the next show feels laggy as the JS thread spins up.
      backgroundThrottling: false,
    },
  });

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // 'pop-up-menu' level lets the window frame sit ABOVE the work area —
  // i.e. its transparent top gutter can overlap the menu bar, so the visible
  // card lands flush under the bar with no gap. At the default level macOS
  // clamps the frame below the menu bar.
  win.setAlwaysOnTop(true, 'pop-up-menu');
  win.loadFile('index.html');

  // Hide on blur (acts like a popover) — but only when the window had focus
  // to begin with (showInactive means we never had it). Also suppressed when
  // we explicitly delegated to a native helper (share sheet, etc.) so the
  // popover stays open after the helper takes focus.
  win.on('blur', () => {
    if (!win || win.webContents.isDevToolsOpened()) return;
    if (suppressBlurHideUntil > Date.now()) return;
    if (weTriggeredHide) {
      // We hid the window ourselves; this blur is the follow-up, not a click-out.
      weTriggeredHide = false;
      return;
    }
    lastExternalHideAt = Date.now(); // user clicked outside — record for race fix
    win.hide();
  });

  // Each time the popover appears, tell the renderer. `activated` differentiates
  // between an explicit "open and take focus" (tray click) and a passive cursor
  // summon (hotkey), so the renderer knows whether to auto-focus search.
  win.on('show', () => {
    win.webContents.send('popover:shown', { activated: showWasActive });
  });
}

// Tracks whether the most recent show() was activating or inactive. Set before
// each call to win.show() / win.showInactive().
let showWasActive = true;
// Suppress the blur-hide handler for this many ms after we hand focus to a
// native helper (share sheet, etc.). Without this, the helper steals focus
// and we'd hide our popover right after the user clicked Share.
let suppressBlurHideUntil = 0;

// Two distinct UI modes share one BrowserWindow:
//   'grid' — Option B numpad (3x3 of top 9 items), summoned at cursor by hotkey
//   'list' — Option C full list + management footer, opened from the tray
let currentMode = 'list';

const SIZE_GRID    = { width: 240, height: 332 };  // grid (numpad) default
const SIZE_LIST    = { width: 300, height: 428 };  // list (menu) default
const SIZE_QR      = { width: 300, height: 380 };  // QR preview — compact card layout
const SIZE_BILLING = { width: 300, height: 532 };  // billing modal — fits Option B, no scroll
const SIZE_EDITOR  = { width: 340, height: 500 };  // add/edit-item modal — roomier than the list

// Resize bounds for the user-customisable modals (visible card, no gutter).
// Both list and grid can be freely dragged within these limits.
const MENU_BOUNDS = { minW: 280, maxW: 580, minH: 360, maxH: 780 };
const GRID_BOUNDS = { minW: 200, maxW: 380, minH: 280, maxH: 520 };

function clampCard(sz, b) {
  return {
    width:  Math.max(b.minW, Math.min(b.maxW, Math.round((sz && sz.width)  || 0))),
    height: Math.max(b.minH, Math.min(b.maxH, Math.round((sz && sz.height) || 0))),
  };
}

// Visible card size for a mode — user-customised for list/grid (persisted in
// settings.json), fixed for qr/billing.
function cardSize(mode) {
  const s = readSettings();
  if (mode === 'grid')    return clampCard(s.gridSize || SIZE_GRID, GRID_BOUNDS);
  if (mode === 'qr')      return SIZE_QR;
  if (mode === 'billing') return SIZE_BILLING;
  return clampCard(s.menuSize || SIZE_LIST, MENU_BOUNDS);
}

function setMode(mode) {
  currentMode = mode;
  const size = cardSize(mode);
  if (!win) return;
  // Window = card size + the transparent shadow gutter on all sides.
  // setBounds (vs setSize) is more reliable on macOS when also repositioning.
  const cur = win.getBounds();
  win.setBounds({
    x: cur.x, y: cur.y,
    width:  size.width  + SHADOW_PAD * 2,
    height: size.height + SHADOW_PAD * 2,
  }, false);
}

// Tracks the PID of whichever app was frontmost when the hotkey was pressed.
// Used to reactivate that app right before posting ⌘V, so the paste lands in
// the intended text field instead of whatever has focus after our modal is
// dismissed.
let previousAppPid = null;

function captureFrontmostApp() {
  return new Promise((resolve) => {
    execFile(
      'osascript',
      ['-e', 'tell application "System Events" to get unix id of first application process whose frontmost is true'],
      (err, stdout) => {
        if (err) { resolve(null); return; }
        const pid = parseInt(stdout.trim(), 10);
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

function positionUnderTray() {
  if (!tray || !win) return;
  const trayBounds = tray.getBounds();
  const winBounds = win.getBounds();
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });

  // Window is centered on the tray (card is centered inside the window, so
  // the card lands centered too). y subtracts SHADOW_PAD so the visible card
  // — not the transparent window edge — sits flush against the menu bar with
  // no gap.
  let x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
  let y = Math.round(trayBounds.y + trayBounds.height - SHADOW_PAD);

  // Clamp X to the work area. For Y, allow the window to rise SHADOW_PAD above
  // the work-area top — that band is just the transparent shadow gutter, so
  // the visible card still sits flush under the menu bar.
  const wa = display.workArea;
  x = Math.max(wa.x + 6, Math.min(x, wa.x + wa.width - winBounds.width - 6));
  y = Math.max(wa.y - SHADOW_PAD, y);

  win.setPosition(x, y, false);
}

function togglePopover() {
  if (!win) return;
  // Tray-click race: if a recent EXTERNAL blur (user clicked somewhere outside
  // the popover) auto-hid the window in the last 250ms, treat this tray click
  // as the close action and don't reopen.
  const justAutoClosed = (Date.now() - lastExternalHideAt) < 250;
  if (justAutoClosed && !win.isVisible()) return;
  if (win.isVisible()) {
    weTriggeredHide = true; // flag so the follow-up blur doesn't re-stamp
    win.hide();
  } else {
    // Capture the user's previously-active app BEFORE we steal focus, so
    // paste flows can reactivate it before posting ⌘V. (Same as the hotkey
    // path; without this, file paste lands in Finder.)
    captureFrontmostApp().then((pid) => { previousAppPid = pid; });
    setMode('list');
    win.webContents.send('mode:set', 'list');
    positionUnderTray();
    showWasActive = true;
    win.show();
    win.focus();
  }
}

// Set when we hide the window ourselves; the blur that follows is internal,
// not a user-blur, so the blur handler should ignore it.
let weTriggeredHide = false;
// Timestamp of the most recent EXTERNAL blur-driven hide (user clicked outside
// the popover). Used to defeat the tray-click race in togglePopover().
let lastExternalHideAt = 0;

function positionAtCursor() {
  if (!win) return;
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const winBounds = win.getBounds();
  const wa = display.workArea;

  // Anchor the popover so the visible CARD's top-left is just under-right of
  // the cursor. Subtract SHADOW_PAD because the card is inset that far inside
  // the (larger, transparent-gutter) window. Then clamp on-screen.
  let x = Math.round(cursor.x + 8 - SHADOW_PAD);
  let y = Math.round(cursor.y + 8 - SHADOW_PAD);
  x = Math.max(wa.x + 6, Math.min(x, wa.x + wa.width - winBounds.width - 6));
  y = Math.max(wa.y + 6, Math.min(y, wa.y + wa.height - winBounds.height - 6));

  win.setPosition(x, y, false);
}

// ============================================================
// Tutorial / onboarding window
// ============================================================
let tutorialWin = null;

function createTutorialWindow() {
  // If one's already open, just focus it.
  if (tutorialWin && !tutorialWin.isDestroyed()) {
    tutorialWin.focus();
    return tutorialWin;
  }

  // Suspend the global hotkey while the tutorial is open. Otherwise the
  // OS-level globalShortcut eats ⌘⇧V before the tutorial window's renderer
  // can see it — which means pressing the hotkey opens the real popover
  // instead of triggering the in-tutorial confirmation.
  globalShortcut.unregisterAll();

  const cursorScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { width: sw, height: sh } = cursorScreen.workAreaSize;
  // Big-enough modal to feel like a real onboarding moment, capped so it
  // doesn't dominate small displays.
  const w = Math.min(1100, Math.round(sw * 0.85));
  const h = Math.min(760, Math.round(sh * 0.85));

  tutorialWin = new BrowserWindow({
    width: w,
    height: h,
    x: cursorScreen.bounds.x + Math.round((sw - w) / 2),
    y: cursorScreen.bounds.y + Math.round((sh - h) / 2),
    title: 'Welcome to Restash',
    backgroundColor: '#1c1c1e',
    frame: false,             // no title bar, no traffic lights — one clean surface
    hasShadow: true,
    roundedCorners: true,
    minimizable: false,
    maximizable: false,
    resizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'tutorial-preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  tutorialWin.loadFile('onboarding-fullscreen.html');
  tutorialWin.once('ready-to-show', () => tutorialWin.show());
  tutorialWin.on('closed', () => {
    tutorialWin = null;
    // Restore BOTH hotkeys now that the tutorial is gone. unregisterAll()
    // above killed the summon AND the QR shortcut — re-register each, or
    // ⌃⇧F stays dead until the user re-sets it in Settings.
    const s = readSettings();
    registerHotkeySlot('summon', s.hotkey || DEFAULT_HOTKEY);
    registerHotkeySlot('qr', s.qrHotkey || DEFAULT_QR_HOTKEY);
  });
  return tutorialWin;
}

// ============================================================
// Stash edit window — separate BrowserWindow so the editor isn't
// cramped inside the menu-bar popover.
// ============================================================
let stashEditWin = null;

function createStashEditWindow(stashId) {
  if (stashEditWin && !stashEditWin.isDestroyed()) {
    stashEditWin.focus();
    return stashEditWin;
  }
  if (!stashId) return null;

  const cursorScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const W = 480, H = 620;
  stashEditWin = new BrowserWindow({
    width: W,
    height: H,
    x: cursorScreen.bounds.x + Math.round((cursorScreen.workAreaSize.width - W) / 2),
    y: cursorScreen.bounds.y + Math.round((cursorScreen.workAreaSize.height - H) / 2),
    title: 'Edit stash',
    backgroundColor: '#1c1c1e',
    frame: false,
    hasShadow: true,
    roundedCorners: true,
    minimizable: false,
    maximizable: false,
    resizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'stash-edit-preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  stashEditWin.loadFile('stash-edit.html', { hash: stashId });
  stashEditWin.once('ready-to-show', () => stashEditWin.show());
  stashEditWin.on('closed', () => {
    stashEditWin = null;
    // Notify the main popover so it refreshes stash list + active items.
    if (win && !win.isDestroyed()) {
      win.webContents.send('stashes:changed');
    }
  });
  return stashEditWin;
}

// ============================================================
// RES-13: Notch drop / quick-add shelf.
// A transparent always-on-top BrowserWindow parked over the notch. Idle
// = just the cam strip; drag-enter expands the window (via shelf:expand
// IPC) and the renderer animates the body unfolding. Drop pre-fills the
// inputs from files / uri-list / plain text and the user adjusts
// name / stash / pin before saving.
// "nook" panel that visually flows from the camera strip.
// ============================================================
// v7: the shelf is ALWAYS present at the notch's bounds and expands on
// drag-enter. Idle = just the cam strip (~notch width × 30pt). Expanded =
// a wider drawer that drops down with the body. There is no hotkey trigger;
// drag-to-reveal is the only entry path.
let shelfWin = null;
let shelfExpanded = false;
// Collapsed = the catch-zone parked over the real notch. We size it to the
// physical notch (read from NSScreen via bin/restash-notch) so the black sliver
// disappears into the hardware notch. The constants are fallbacks only, used
// when the helper can't report exact geometry.
const SHELF_IDLE_WIDTH  = 200;   // fallback collapsed catch-zone width
const SHELF_IDLE_HEIGHT = 30;    // fallback collapsed catch-zone height
const SHELF_OPEN_WIDTH  = 380;
const SHELF_OPEN_HEIGHT = 320;

// RES-37: exact notch geometry from the built-in display. macOS does not expose
// the notch x-range through Electron's Display API; bin/restash-notch reads it
// from NSScreen auxiliaryTopLeft/RightArea + safeAreaInsets and returns it in
// top-left point coordinates that line up with Electron's screen bounds. Cached
// and invalidated whenever the display config changes.
let notchGeometry = undefined; // undefined = not read yet; null = no notch
function readNotchGeometry() {
  if (notchGeometry !== undefined) return notchGeometry;
  try {
    const { execFileSync } = require('node:child_process');
    const helper = path.join(__dirname, 'bin', 'restash-notch');
    const out = execFileSync(helper, [], { timeout: 2000 }).toString().trim();
    const g = JSON.parse(out);
    notchGeometry = (g && g.hasNotch && g.notch) ? g : null;
  } catch {
    notchGeometry = null;
  }
  return notchGeometry;
}
function invalidateNotchGeometry() { notchGeometry = undefined; }

function isNotchDisplay(display) {
  // Notch macs have a taller-than-standard menu-bar inset. The standard menu
  // bar is ~24pt; on notch displays it's ~37pt+. workArea.y is offset by that
  // inset, so `(workArea.y - bounds.y) > 30` reliably tags a notch.
  return (display.workArea.y - display.bounds.y) > 30;
}

function activeShelfDisplay() {
  // RES-37: the shelf must emerge from the *physical* notch, which only ever
  // lives on the built-in display. Always prefer the built-in / notch display
  // regardless of where the cursor or focused window is, so the shelf never
  // gets centered on an external monitor.
  try {
    const displays = screen.getAllDisplays();
    const notchDisp = displays.find((d) => d.internal && isNotchDisplay(d))
                   || displays.find((d) => isNotchDisplay(d))
                   || displays.find((d) => d.internal);
    if (notchDisp) return notchDisp;
  } catch {}
  return screen.getPrimaryDisplay();
}

function shelfBoundsFor(display, expanded) {
  // Center on the *notch* center. With exact notch geometry we anchor on the
  // real notch's midpoint; otherwise we center on the display (the notch is
  // horizontally centered on the built-in panel, so this is a safe baseline).
  const g = readNotchGeometry();
  let notchCenterX;
  let collapsedW;
  let collapsedH;
  if (g && g.notch && g.display && g.display.x === display.bounds.x) {
    notchCenterX = g.notch.x + g.notch.w / 2;
    collapsedW = Math.round(g.notch.w);
    collapsedH = Math.max(SHELF_IDLE_HEIGHT, Math.round(g.notch.h));
  } else {
    notchCenterX = display.bounds.x + display.bounds.width / 2;
    collapsedW = SHELF_IDLE_WIDTH;
    collapsedH = SHELF_IDLE_HEIGHT;
  }
  const w = expanded ? SHELF_OPEN_WIDTH : collapsedW;
  const h = expanded ? SHELF_OPEN_HEIGHT : collapsedH;
  // Flush to the true top of the display (y=0), NOT workArea.y (which starts
  // below the menu bar). Re-center for the current width so collapsed and
  // expanded both stay centered on the notch.
  const x = Math.round(notchCenterX - w / 2);
  const y = display.bounds.y;
  return { x, y, width: w, height: h };
}

// RES-37: a borderless window can't legally cover the menu bar / notch unless
// its window level sits above the system menu bar; at the default 'pop-up-menu'
// level macOS shoves the frame down below the bar (the reported bug). Raise it
// so the shelf renders flush at y=0 over the notch.
function pinShelfAboveMenuBar() {
  if (!shelfWin || shelfWin.isDestroyed()) return;
  try { shelfWin.setAlwaysOnTop(true, 'screen-saver'); } catch {}
  try { shelfWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false }); } catch {}
}

function positionShelfOnActiveDisplay() {
  if (!shelfWin || shelfWin.isDestroyed()) return;
  const d = activeShelfDisplay();
  if (!isNotchDisplay(d)) {
    // v7: notch-only. Hide the window when the active display has no notch.
    if (shelfWin.isVisible()) shelfWin.hide();
    return;
  }
  pinShelfAboveMenuBar();
  shelfWin.setBounds(shelfBoundsFor(d, shelfExpanded), false);
  if (!shelfWin.isVisible()) shelfWin.showInactive();
}

function createShelfWindow() {
  if (shelfWin && !shelfWin.isDestroyed()) return shelfWin;
  const d = activeShelfDisplay();
  if (!isNotchDisplay(d)) return null;
  const bounds = shelfBoundsFor(d, false);
  shelfWin = new BrowserWindow({
    width:  bounds.width,
    height: bounds.height,
    x: bounds.x, y: bounds.y,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // RES-40: parked/collapsed the shelf must NOT be focusable. A focusable,
    // screen-saver-level, visible-on-all-workspaces window steals key focus from
    // the menu-bar popover the instant the popover shows — the popover's blur
    // handler then hides it (menu "instant-close"). It also caused an infinite
    // browser-window-focus → re-pin → focus loop. We flip focusable on only
    // while the shelf is EXPANDED (quick-add inputs need to accept typing).
    focusable: false,
    show: false,
    // RES-37 ROOT CAUSE FIX: without this, macOS constrains the window frame so
    // it cannot overlap the menu bar — it shoves the frame down to y=workArea.y
    // (~33pt below the top), which is exactly why the shelf rendered BELOW the
    // menu bar instead of flush at the notch. enableLargerThanScreen lifts that
    // constraint so the window sits at y=0 over the real notch.
    enableLargerThanScreen: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'notch-shelf-preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  // RES-37: above the menu bar so the borderless window can sit flush at y=0
  // over the real notch (a lower level gets clamped below the bar). Visible
  // across spaces but hidden in fullscreen.
  pinShelfAboveMenuBar();
  shelfWin.loadFile('notch-shelf.html');
  shelfWin.on('closed', () => { shelfWin = null; });
  return shelfWin;
}

// Show the shelf at idle bounds. Called on app start and whenever display
// configuration changes back to a notch display.
function ensureShelfAtIdle() {
  if (!readSettings().showNotchShelf) return;
  if (!shelfWin || shelfWin.isDestroyed()) {
    const created = createShelfWindow();
    if (!created) return;   // non-notch display — bail out cleanly
  }
  shelfExpanded = false;
  positionShelfOnActiveDisplay();
}

function expandShelf() {
  if (!shelfWin || shelfWin.isDestroyed()) return;
  const d = activeShelfDisplay();
  if (!isNotchDisplay(d)) return;
  shelfExpanded = true;
  // RES-40: only an EXPANDED shelf may take focus (for the quick-add inputs).
  try { shelfWin.setFocusable(true); } catch {}
  // Recompute x for the expanded width so the panel stays centered on the notch
  // as it grows downward — it should read as the notch itself expanding.
  shelfWin.setBounds(shelfBoundsFor(d, true), false);
  // Make the panel focusable so the quick-add inputs accept typing. We can't
  // grab focus during the in-flight drag (it would cancel the drop), so the
  // renderer focuses the field itself on `drop` via shelf.focusWindow().
  try { shelfWin.setHasShadow(true); } catch {}
  try { shelfWin.webContents.send('shelf:expanded'); } catch {}
}

// Bring the expanded shelf to the foreground so its inputs receive keystrokes.
// Called from the renderer after a drop completes (not mid-drag).
function focusShelf() {
  if (!shelfWin || shelfWin.isDestroyed() || !shelfExpanded) return;
  // RES-40: focus() is a no-op on a non-focusable window; ensure it's focusable
  // (expandShelf already does this, but a drop can race ahead of expand).
  try { shelfWin.setFocusable(true); } catch {}
  try { shelfWin.show(); shelfWin.focus(); } catch {}
}

function collapseShelf() {
  if (!shelfWin || shelfWin.isDestroyed()) return;
  const d = activeShelfDisplay();
  if (!isNotchDisplay(d)) return;
  shelfExpanded = false;
  // RES-40: collapsed shelf must not be focusable (see createShelfWindow).
  try { shelfWin.setFocusable(false); } catch {}
  // Recompute x for the collapsed width so it re-centers on the notch.
  shelfWin.setBounds(shelfBoundsFor(d, false), false);
  try { shelfWin.setHasShadow(false); } catch {}
}

// Push stash-list changes to the shelf so its dropdown stays fresh.
function notifyShelfStashesChanged() {
  if (shelfWin && !shelfWin.isDestroyed()) {
    try { shelfWin.webContents.send('shelf:stashes-changed'); } catch {}
  }
}

// Sort + shape stashes for the shelf dropdown. The synthetic "All" pseudo-
// stash is always first. The rest are user stashes, sorted by lastUsedAt
// desc when present (falling back to createdAt).
function shelfStashList() {
  const s = readSettings();
  const all = { id: 'all', name: 'All' };
  const user = (s.stashes || []).slice().sort((a, b) => {
    const av = a.lastUsedAt || a.createdAt || 0;
    const bv = b.lastUsedAt || b.createdAt || 0;
    return bv - av;
  }).map((x) => ({ id: x.id, name: x.name }));
  return [all, ...user];
}

function newItemId() {
  return 'i_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Compute the next free pin slot for a given stash id. Matches renderer
// semantics (`nextPinOrder`): max existing order + 1, or 0 if none. Returns
// -1 when all 9 slots are taken.
function shelfNextPinSlot(items, stashId) {
  const used = items
    .filter((it) => it && it.pins && Object.prototype.hasOwnProperty.call(it.pins, stashId))
    .map((it) => it.pins[stashId])
    .filter((v) => typeof v === 'number');
  const next = used.length ? Math.max(...used) + 1 : 0;
  return next > 8 ? -1 : next;
}

async function togglePopoverAtCursor() {
  if (!win) return;
  // Any time the popover is already on-screen, treat the hotkey as "cycle
  // to the next stash" — applies to both the cursor grid AND the menu-bar
  // list. Close path is Esc / click-outside / tray-click.
  if (win.isVisible()) {
    win.webContents.send('stash:cycle', { direction: 1 });
    return;
  }
  // First press — capture which app was frontmost so we can paste back into it,
  // then open the grid at the user's last-active stash.
  previousAppPid = await captureFrontmostApp();

  setMode('grid');
  win.webContents.send('mode:set', 'grid');
  positionAtCursor();
  showWasActive = true;
  win.show();
  win.focus();
}

app.whenReady().then(() => {
  // Show in the Dock like a normal app. Forced at runtime so it's reliable even
  // if LaunchServices has a stale LSUIElement=true cached from an earlier build.
  if (process.platform === 'darwin' && app.dock) app.dock.show();

  // About panel (Apple menu → "About Restash").
  if (process.platform === 'darwin') {
    app.setAboutPanelOptions({
      applicationName: 'Restash',
      applicationVersion: app.getVersion(),
      copyright: 'Stash once, paste anywhere.',
      iconPath: path.join(__dirname, 'assets', 'brand', 'app', '512.png'),
    });
  }

  createWindow();

  // Open the tutorial on first launch only.
  if (!readSettings().onboarded) setTimeout(() => createTutorialWindow(), 600);

  tray = new Tray(createTrayIcon());
  tray.setToolTip('Restash');
  tray.setTitle(' Restash');
  tray.on('click', togglePopover);

  // Clicking the Dock icon opens/toggles the popover (same as tray click).
  app.on('activate', () => togglePopover());

  // A second launch (Spotlight, double-click, `npm start`) is bounced by the
  // single-instance lock above — when it happens, surface THIS instance instead.
  app.on('second-instance', () => togglePopover());

  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Open Restash', click: togglePopover },
      { type: 'separator' },
      // QR decoder entry point — captures a screen region, decodes, then
      // opens the popover under the tray in 'qr' mode with the result.
      // (Will move to a global hotkey in Phase 4.)
      { label: '🔍 Decode QR…', click: () => decodeQRAndShowPreview() },
      { type: 'separator' },
      { label: 'Settings…', accelerator: 'Cmd+,', click: () => { togglePopover(); setTimeout(() => win?.webContents.send('open:settings'), 120); } },
      { label: 'Check for Updates…', click: () => win?.webContents.send('open:updates') },
      { label: 'Billing & Account…', click: () => win?.webContents.send('open:billing') },
      { type: 'separator' },
      { label: 'Quit Restash', accelerator: 'Cmd+Q', click: () => app.quit() },
    ]);
    tray.popUpContextMenu(menu);
  });

  // End-to-end QR flow: capture → decode → show in popover.
  // ============================================================
  // Spotlight Lens scan overlay — replaces `screencapture -i -s`.
  // Opens a fullscreen transparent window with a circular lens following
  // the cursor; on click we screencapture -R a small region around the
  // cursor and run that through the decoder.
  // ============================================================
  let scanOverlayWin = null;
  // Padding (in logical px) added to the lens diameter when computing the
  // capture rect — buys a little margin in case the QR's quiet-zone is tight.
  const SCAN_REGION_PAD = 24;

  function openScanOverlay() {
    if (scanOverlayWin && !scanOverlayWin.isDestroyed()) {
      scanOverlayWin.focus();
      return;
    }
    const cursorScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const { x, y, width, height } = cursorScreen.bounds;
    scanOverlayWin = new BrowserWindow({
      x, y, width, height,
      transparent: true,
      frame: false,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      // 'normal' level + setAlwaysOnTop 'screen-saver' lets us sit above the
      // menu bar / Dock without taking app focus weirdly.
      backgroundColor: '#00000000',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'qr-scan-overlay-preload.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    scanOverlayWin.setAlwaysOnTop(true, 'screen-saver');
    scanOverlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    scanOverlayWin.setIgnoreMouseEvents(false);
    scanOverlayWin.loadFile('qr-scan-overlay.html');
    scanOverlayWin.once('ready-to-show', () => {
      scanOverlayWin.show();
      scanOverlayWin.focus();
    });
    scanOverlayWin.on('closed', () => { scanOverlayWin = null; });
  }

  function closeScanOverlay() {
    if (scanOverlayWin && !scanOverlayWin.isDestroyed()) {
      scanOverlayWin.close();
    }
    scanOverlayWin = null;
  }

  ipcMain.handle('scan:cancel', () => {
    closeScanOverlay();
    return { ok: true };
  });

  // User clicked inside the lens. {x, y} are window-local logical pixels;
  // we translate to absolute screen coords using the overlay window's bounds,
  // then capture a small rect around that point with `screencapture -R`.
  ipcMain.handle('scan:capture', async (_e, { x, y, radius } = {}) => {
    if (!scanOverlayWin || scanOverlayWin.isDestroyed()) return { ok: false };
    const bounds = scanOverlayWin.getBounds();
    const r = Math.max(40, Math.min(360, Number(radius) || 80));
    const size = r * 2 + SCAN_REGION_PAD;
    const half = size / 2;
    const rectX = Math.round(bounds.x + (x || 0) - half);
    const rectY = Math.round(bounds.y + (y || 0) - half);
    const rect  = `${rectX},${rectY},${Math.round(size)},${Math.round(size)}`;

    // Close the overlay BEFORE screencapture so the dim mask isn't in the image.
    closeScanOverlay();
    // Tiny delay so macOS finishes hiding the overlay window before capture.
    await new Promise((r) => setTimeout(r, 80));

    const { spawnSync } = require('node:child_process');
    const tmpPath = path.join(app.getPath('temp'), `restash-qr-${Date.now()}.png`);
    // -R<rect>  region capture, no UI
    // -x        silent (no shutter sound)
    // -o        no shadow
    const cap = spawnSync('/usr/sbin/screencapture', ['-x', '-R' + rect, '-o', tmpPath]);
    if (cap.status !== 0 || !fs.existsSync(tmpPath)) {
      showQRPreview({ ok: false, reason: 'capture-failed', message: 'Could not capture that area.' });
      return { ok: false };
    }
    const helper = path.join(__dirname, 'bin', 'restash-decode-qr');
    const decode = spawnSync(helper, [tmpPath]);
    try { fs.unlinkSync(tmpPath); } catch {}
    if (decode.status === 2) {
      showQRPreview({ ok: false, reason: 'no-qr', message: 'No QR code in that area. Try centring the lens directly over it.' });
      return { ok: false };
    }
    if (decode.status !== 0) {
      showQRPreview({ ok: false, reason: 'decode-failed' });
      return { ok: false };
    }
    const payload = (decode.stdout || Buffer.alloc(0)).toString('utf8');
    showQRPreview({ ok: true, ...detectQRType(payload) });
    return { ok: true };
  });

  async function decodeQRAndShowPreview() {
    // Spotlight Lens overlay replaces the system region selector. The IPC
    // handlers above (`scan:capture` / `scan:cancel`) drive everything else.
    openScanOverlay();
  }

  async function _legacyDecodeQRAndShowPreview_unused() {
    const result = await runQRDecodeTest(); // shared decode helper

    if (!result.ok) {
      // Friendly inline feedback in the popover for non-cancellation failures.
      // Cancellation (Esc during region select) is silent — user knows.
      if (result.reason === 'cancelled') return;
      const reasonMsg = result.reason === 'no-qr'
        ? 'No QR code found in that area. Try a tighter selection.'
        : `Couldn't decode — ${result.reason || 'unknown error'}.`;
      showQRPreview({ ok: false, reason: result.reason, message: reasonMsg });
      return;
    }
    showQRPreview(result);
  }
  // Expose the QR trigger to the module-scope hotkey registrar via the
  // forward-reference variable declared at the top of this file.
  qrTrigger = decodeQRAndShowPreview;

  function showQRPreview(payload) {
    if (!win) return;
    setMode('qr');
    win.webContents.send('mode:set', 'qr');
    win.webContents.send('qr:result', payload);
    positionUnderTray();
    showWasActive = true;
    win.show();
    win.focus();
  }

  // Internal helper that does the actual capture + decode. Used by the tray
  // menu and (later) the global hotkey.
  async function runQRDecodeTest() {
    const tmpPath = path.join(app.getPath('temp'), `restash-qr-${Date.now()}.png`);
    const { spawnSync } = require('node:child_process');
    const cap = spawnSync('/usr/sbin/screencapture', ['-i', '-s', '-o', tmpPath]);
    if (cap.status !== 0) return { ok: false, reason: 'capture-failed' };
    if (!fs.existsSync(tmpPath)) return { ok: false, reason: 'cancelled' };
    const helper = path.join(__dirname, 'bin', 'restash-decode-qr');
    const decode = spawnSync(helper, [tmpPath]);
    try { fs.unlinkSync(tmpPath); } catch {}
    if (decode.status === 2) return { ok: false, reason: 'no-qr' };
    if (decode.status !== 0) return { ok: false, reason: 'decode-failed', code: decode.status };
    const payload = (decode.stdout || Buffer.alloc(0)).toString('utf8');
    return { ok: true, ...detectQRType(payload) };
  }

  // --- IPC: storage ---
  // ---------- File items ----------
  // Files saved to Restash live in userData/files/. We copy in on save so
  // items don't break if the user moves or deletes the source.
  const FILES_DIR = path.join(app.getPath('userData'), 'files');
  const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB ceiling

  function ensureFilesDir() {
    if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });
  }

  // Map common extensions to MIME types — kept minimal; we only need this to
  // pick the right icon in the UI and offer sensible share-sheet behavior.
  function guessMime(ext) {
    const e = ext.toLowerCase();
    const map = {
      '.pdf':  'application/pdf',
      '.png':  'image/png',  '.jpg': 'image/jpeg',  '.jpeg': 'image/jpeg',
      '.gif':  'image/gif',  '.webp': 'image/webp', '.svg':  'image/svg+xml',
      '.heic': 'image/heic',
      '.mp4':  'video/mp4',  '.mov':  'video/quicktime', '.webm': 'video/webm',
      '.mp3':  'audio/mpeg', '.wav':  'audio/wav',  '.m4a':  'audio/mp4',
      '.doc':  'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls':  'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt':  'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.txt':  'text/plain', '.md': 'text/markdown',
      '.html': 'text/html',  '.htm': 'text/html',
      '.json': 'application/json',
      '.zip':  'application/zip',
    };
    return map[e] || 'application/octet-stream';
  }

  ipcMain.handle('file:pick', async () => {
    // The OS file dialog blurs Restash; suppress our auto-hide so the editor
    // stays open underneath while the user picks.
    suppressBlurHideUntil = Date.now() + 5 * 60_000;
    const parentWin = BrowserWindow.getFocusedWindow() || win;
    try {
      const result = await dialog.showOpenDialog(parentWin || undefined, {
        title: 'Choose file(s) to add',
        properties: ['openFile', 'multiSelections'],
        buttonLabel: 'Add',
      });
      if (result.canceled || !result.filePaths?.length) return null;
      // Return one entry per picked file. Renderer batch-creates items.
      return result.filePaths.map((p) => {
        try {
          const stat = fs.statSync(p);
          return {
            path: p,
            name: path.basename(p),
            size: stat.size,
            mime: guessMime(path.extname(p)),
          };
        } catch {
          return null;
        }
      }).filter(Boolean);
    } finally {
      // Reset the suppression once the dialog has returned.
      suppressBlurHideUntil = 0;
    }
  });

  // Copy the picked file into Restash's data dir. Returns the stored metadata.
  ipcMain.handle('file:add', async (_e, srcPath) => {
    if (typeof srcPath !== 'string' || !srcPath) return { ok: false, reason: 'bad-input' };
    try {
      const stat = fs.statSync(srcPath);
      if (stat.size > MAX_FILE_BYTES) {
        return {
          ok: false,
          reason: 'too-large',
          size: stat.size,
          originalName: path.basename(srcPath),
          limit: MAX_FILE_BYTES,
        };
      }
      ensureFilesDir();
      const ext = path.extname(srcPath);
      const base = path.basename(srcPath, ext);
      // Generate a stable on-disk name: <timestamp>_<safebase><ext>
      const safeBase = base.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60);
      const storedName = `${Date.now().toString(36)}_${safeBase}${ext}`;
      const destPath = path.join(FILES_DIR, storedName);
      fs.copyFileSync(srcPath, destPath);
      return {
        ok: true,
        storedPath: destPath,
        storedName,
        originalName: path.basename(srcPath),
        size: stat.size,
        mime: guessMime(ext),
      };
    } catch (err) {
      return { ok: false, reason: 'copy-failed', error: err.message };
    }
  });

  // Open a stored file in its default app (preview/edit). Used by the editor's
  // "Open" button on the picked-file zone.
  ipcMain.handle('file:open', (_e, storedPath) => {
    if (typeof storedPath === 'string' && storedPath) shell.openPath(storedPath);
    return { ok: true };
  });

  // Reveal in Finder.
  ipcMain.handle('file:reveal', (_e, storedPath) => {
    if (typeof storedPath === 'string' && storedPath) shell.showItemInFolder(storedPath);
    return { ok: true };
  });

  ipcMain.handle('items:load', () => readStore());
  ipcMain.handle('items:save', (_e, items) => {
    writeStore(items);
    return true;
  });

  // --- IPC: clipboard / external ---
  ipcMain.handle('clipboard:write', (_e, text) => {
    restashWriteClipboard(String(text ?? ''));
    return true;
  });
  ipcMain.handle('shell:open', (_e, url) => shell.openExternal(String(url)));

  // Scan the standard app folders for .app bundles → [{ name, path }].
  function scanInstalledApps() {
    const dirs = [
      '/Applications',
      '/Applications/Utilities',
      '/System/Applications',
      '/System/Applications/Utilities',
      path.join(os.homedir(), 'Applications'),
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
    return apps;
  }

  // --- IPC: installed apps ---
  ipcMain.handle('apps:list', () => scanInstalledApps());

  // Run an AppleScript via osascript, async (never blocks the main process).
  // Resolves the stdout string, or null on any error / timeout / denial.
  const runOsa = (script, timeout = 8000) => new Promise((resolve) => {
    try {
      execFile('/usr/bin/osascript', ['-e', script], { timeout }, (err, stdout) => {
        resolve(err ? null : String(stdout || ''));
      });
    } catch { resolve(null); }
  });

  // Browsers whose tab list we can read (Chromium family + Safari share the
  // windows→tabs→URL shape). Firefox/Arc don't expose tabs → captured as apps.
  const BROWSERS = ['Safari', 'Google Chrome', 'Brave Browser', 'Microsoft Edge', 'Vivaldi', 'Opera'];
  const CAPTURE_EXCLUDE = new Set([
    'Restash', 'Electron', 'Finder', 'System Events', 'loginwindow', 'Dock',
    'SystemUIServer', 'Control Center', 'Control Centre', 'Notification Center',
    'NotificationCenter', 'Spotlight', 'WindowManager', 'Window Server',
    'TextInputMenuAgent', 'universalaccessd',
  ]);

  // AppleScript reading a browser's windows → "##WIN##<title>" then its tab URLs.
  // Title is best-effort (needs the active tab); tabs are captured regardless.
  const windowTabsScript = (name) => {
    const safe = name.replace(/[^A-Za-z0-9 .]/g, '');
    const titleExpr = safe === 'Safari' ? 'name of w' : 'title of active tab of w';
    return `if application "${safe}" is running then
  set out to ""
  tell application "${safe}"
    repeat with w in windows
      set wt to ""
      try
        set wt to (${titleExpr})
      end try
      set out to out & "##WIN##" & wt & linefeed
      try
        repeat with t in tabs of w
          set out to out & (URL of t) & linefeed
        end repeat
      end try
    end repeat
  end tell
  return out
else
  return ""
end if`;
  };
  // Parse the ##WIN## stream into [{ title, urls }].
  const parseWindows = (out) => {
    const windows = [];
    let cur = null;
    for (const raw of String(out || '').split('\n')) {
      const line = raw.replace(/\r$/, '');
      if (line.startsWith('##WIN##')) {
        cur = { title: line.slice(7).trim(), urls: [] };
        windows.push(cur);
      } else if (cur && /^https?:\/\//i.test(line.trim())) {
        cur.urls.push(line.trim());
      }
    }
    return windows;
  };
  const titleMatch = (a, b) => {
    const x = String(a || '').trim().toLowerCase();
    const y = String(b || '').trim().toLowerCase();
    if (!x || !y) return false;
    return x === y || x.includes(y) || y.includes(x);
  };
  // Windows on the CURRENT macOS Desktop (Space), via the Swift helper.
  const currentDesktopWindows = () => new Promise((resolve) => {
    try {
      execFile(path.join(__dirname, 'bin', 'restash-windows'), [], { timeout: 5000 }, (err, stdout) => {
        if (err) return resolve([]);
        try {
          const arr = JSON.parse(String(stdout || '[]'));
          resolve(Array.isArray(arr) ? arr : []);
        } catch { resolve([]); }
      });
    } catch { resolve([]); }
  });

  // --- IPC: capture the workspace (open browser tabs + running apps) ---
  // scope 'desktop' = only what's on the current Desktop/Space (via the window
  // helper); 'all' = every running foreground app + all open tabs (machine-wide).
  // Returns { sites: [url…], apps: [{ name, path }], scope }. Browser tabs are
  // read by AppleScript (guarded by `is running`, never launches a closed app);
  // a browser whose tabs we captured isn't also listed as an app.
  ipcMain.handle('env:capture', async (_e, scopeArg) => {
    const scope = scopeArg === 'desktop' ? 'desktop' : 'all';
    const result = { sites: [], apps: [], scope };
    const seenUrl = new Set();
    const capturedBrowsers = new Set();

    // Decide which apps + browsers to consider for this scope.
    let appNames = [];
    let candidateBrowsers = BROWSERS.slice();
    let desktopWindows = [];
    if (scope === 'desktop') {
      desktopWindows = await currentDesktopWindows();
      appNames = [...new Set(desktopWindows.map((w) => w.owner).filter(Boolean))];
      candidateBrowsers = BROWSERS.filter((b) => appNames.includes(b));
    } else {
      const namesOut = await runOsa(
        'tell application "System Events" to get name of every process whose background only is false',
        5000,
      );
      appNames = namesOut ? namesOut.split(',').map((s) => s.trim()).filter(Boolean) : [];
    }

    // Read tabs from the candidate browsers.
    for (const name of candidateBrowsers) {
      const out = await runOsa(windowTabsScript(name), 8000);
      if (out == null) continue; // not running, denied, or timed out
      let windows = parseWindows(out);
      if (scope === 'desktop') {
        const onScreen = desktopWindows
          .filter((w) => w.owner === name)
          .map((w) => (w.title || '').trim())
          .filter(Boolean);
        // Scope tabs to this Desktop's windows by title. If titles are
        // unavailable (no Screen Recording), keep all the browser's tabs.
        if (onScreen.length) {
          windows = windows.filter((win) => onScreen.some((t) => titleMatch(t, win.title)));
        }
      }
      let got = 0;
      for (const win of windows) {
        for (const u of win.urls) {
          if (seenUrl.has(u)) continue;
          seenUrl.add(u);
          result.sites.push(u);
          got++;
        }
      }
      if (got > 0) capturedBrowsers.add(name);
    }

    // Apps = candidate app names minus captured browsers + excluded system UI.
    const appMap = new Map(scanInstalledApps().map((a) => [a.name, a.path]));
    const seenApp = new Set();
    for (const name of appNames) {
      if (CAPTURE_EXCLUDE.has(name)) continue;
      if (capturedBrowsers.has(name)) continue; // its tabs already represent it
      if (seenApp.has(name)) continue;
      seenApp.add(name);
      result.apps.push({ name, path: appMap.get(name) || '' });
    }
    return result;
  });

  // --- IPC: open an Environment (a set of sites + apps) in one shot ---
  // Sites: 'window' mode = one `open` call with every URL → tabs in one browser
  // window; 'separate' = `open -n` per URL → a new window each. Apps: launched
  // by bundle path (or by name as a fallback).
  // Chrome's main binary — used to open URLs in a SPECIFIC profile via
  // --profile-directory (the only reliable way to target a profile).
  const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

  // --- IPC: list the user's Chrome profiles (dir → display name + account) ---
  // Read from Chrome's Local State so Environment sites can be assigned a
  // profile to reopen in. Empty array when Chrome isn't installed.
  ipcMain.handle('chrome:profiles', () => {
    try {
      const lp = path.join(app.getPath('appData'), 'Google', 'Chrome', 'Local State');
      const d = JSON.parse(fs.readFileSync(lp, 'utf8'));
      const cache = (d && d.profile && d.profile.info_cache) || {};
      const out = Object.entries(cache).map(([dir, info]) => ({
        dir,
        name: (info && info.name) || dir,
        account: (info && info.user_name) || '',
      }));
      out.sort((a, b) => a.name.localeCompare(b.name));
      return out;
    } catch { return []; }
  });

  ipcMain.handle('env:open', (_e, env) => {
    const OPEN = '/usr/bin/open';
    const targets = Array.isArray(env?.targets) ? env.targets : [];
    const urlMode = env?.urlMode === 'separate' ? 'separate' : 'window';
    const hasChrome = fs.existsSync(CHROME_BIN);

    const normalizeUrl = (u) => {
      const s = String(u || '').trim();
      if (!s) return '';
      // Already has a scheme (http://, https://, mailto:, etc.) — leave it.
      if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
      return 'https://' + s;
    };

    const apps  = targets.filter((t) => t && t.type === 'app');
    const sites = targets.filter((t) => t && t.type === 'site' && (t.value || '').trim());

    // Launch apps first (so browsers aren't stealing focus mid-launch).
    for (const a of apps) {
      const args = a.path ? [a.path] : ['-a', String(a.value || '')];
      if (!args[0]) continue;
      try { execFile(OPEN, args, () => {}); } catch {}
    }

    // Group sites by Chrome profile dir; '' = default browser / last profile.
    const byProfile = new Map();
    for (const t of sites) {
      const url = normalizeUrl(t.value);
      if (!url) continue;
      const prof = hasChrome ? String(t.profile || '').trim() : '';
      if (!byProfile.has(prof)) byProfile.set(prof, []);
      byProfile.get(prof).push(url);
    }

    // Open each profile's group, staggered so windows spawn reliably.
    let delay = 0;
    for (const [prof, urls] of byProfile) {
      const launch = (us, sep) => {
        if (prof && hasChrome) {
          // Target a specific Chrome profile. --new-window groups the set.
          if (sep) {
            us.forEach((u) => { setTimeout(() => { try { execFile(CHROME_BIN, [`--profile-directory=${prof}`, '--new-window', u], () => {}); } catch {} }, delay); delay += 280; });
          } else {
            setTimeout(() => { try { execFile(CHROME_BIN, [`--profile-directory=${prof}`, '--new-window', ...us], () => {}); } catch {} }, delay); delay += 220;
          }
        } else {
          // Default browser / profile via `open`.
          if (sep) {
            us.forEach((u) => { setTimeout(() => { try { execFile(OPEN, ['-n', u], () => {}); } catch {} }, delay); delay += 280; });
          } else {
            setTimeout(() => { try { execFile(OPEN, us, () => {}); } catch {} }, delay); delay += 220;
          }
        }
      };
      launch(urls, urlMode === 'separate');
    }
    return { ok: true };
  });
  ipcMain.handle('qr:dataurl', (_e, text) => QRCode.toDataURL(String(text ?? ''), {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 320,
    color: { dark: '#000000', light: '#ffffff' },
  }));

  // --- IPC: native macOS share sheet ---
  // Spawns a small Swift helper that calls NSSharingServicePicker. Electron's
  // built-in shareMenu role only gives a nested NSMenu — this gives the real
  // share popover with AirDrop targets and full app icons.
  ipcMain.handle('share:item', (e, { text, url, filePath, label, iconPath } = {}) => {
    const helper = path.join(__dirname, 'bin', 'restash-share');
    const args = [];
    if (label) args.push(`--title=${String(label)}`);
    if (iconPath) {
      const abs = path.isAbsolute(iconPath) ? iconPath : path.join(__dirname, iconPath);
      args.push(`--icon=${abs}`);
    }
    // File-first: pass the file path so the Swift helper treats it as an
    // NSURL fileURL (real attachment in Mail/Messages/AirDrop). Skip text
    // for file items unless explicitly provided.
    if (filePath) args.push(String(filePath));
    if (text)     args.push(String(text));
    if (url)      args.push(String(url));
    if (!args.length || (args.length === 1 && args[0].startsWith('--'))) {
      return { ok: false, reason: 'no-content' };
    }

    try {
      // Suppress blur-hide so the popover stays visible while the share sheet
      // is open and the user interacts with it.
      suppressBlurHideUntil = Date.now() + 60_000;

      // Temporarily drop Restash to normal window level so the system
      // NSSharingServicePicker (which runs at pop-up-menu level) floats above it.
      if (win) win.setAlwaysOnTop(false);

      const child = require('node:child_process').spawn(helper, args, {
        detached: false,  // keep reference so we know when the sheet is gone
        stdio: 'ignore',
      });

      // Restore pop-up-menu level and blur-hide once the share sheet closes.
      const restore = () => {
        suppressBlurHideUntil = 0;
        if (win) win.setAlwaysOnTop(true, 'pop-up-menu');
      };
      child.once('exit', restore);
      // Safety: restore after 65 s even if the process somehow never exits.
      setTimeout(restore, 65_000);
      child.unref();

      return { ok: true };
    } catch (err) {
      return { ok: false, reason: 'spawn-failed', error: err.message };
    }
  });

  // --- IPC: window control ---
  ipcMain.handle('window:hide', () => {
    if (win) win.hide();
  });

  // --- IPC: row right-click menu. Renderer passes the item id; main returns
  // the chosen action, which the renderer then dispatches. ---
  ipcMain.handle('row:menu', (e, item) => new Promise((resolve) => {
    const template = [
      { label: 'Paste',           click: () => resolve('paste') },
      { label: 'Show QR code',    click: () => resolve('qr') },
      { type: 'separator' },
      { label: 'Edit…',           click: () => resolve('edit') },
      { label: item?.pinned ? 'Unpin' : 'Pin', click: () => resolve(item?.pinned ? 'unpin' : 'pin') },
      { type: 'separator' },
      { label: 'Delete',          click: () => resolve('delete') },
    ];
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: win, callback: () => resolve(null) });
  }));

  // --- IPC: accessibility (required for synthetic keystrokes) ---
  ipcMain.handle('accessibility:check', (_e, prompt = false) =>
    systemPreferences.isTrustedAccessibilityClient(!!prompt)
  );
  ipcMain.handle('accessibility:open', () => {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  });

  // --- IPC: paste value into whichever app had focus before the popover opened ---
  // Site preview + heuristic safety flags for a QR-decoded URL. Renderer
  // calls this AFTER the popover is shown so the loading skeleton can render
  // first; the result re-renders the preview block.
  ipcMain.handle('qr:fetch-site-meta', async (_e, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return { ok: false, reason: 'bad-url' };
    }
    try {
      const { meta, flags } = await fetchSiteMeta(url);
      return { ok: true, meta, flags };
    } catch (err) {
      return { ok: false, reason: 'fetch-failed', error: err.message };
    }
  });

  ipcMain.handle('qr:capture-and-decode', async () => {
    const tmpPath = path.join(app.getPath('temp'), `restash-qr-${Date.now()}.png`);
    const { spawnSync } = require('node:child_process');

    // 1) Region selection screenshot. `-i` interactive, `-s` rect-only,
    //    `-o` no shadow. Returns immediately with exit 0 even on Esc, but
    //    won't have written a file in that case.
    const cap = spawnSync('/usr/sbin/screencapture', ['-i', '-s', '-o', tmpPath]);
    if (cap.status !== 0) return { ok: false, reason: 'capture-failed' };
    if (!fs.existsSync(tmpPath)) return { ok: false, reason: 'cancelled' };

    // 2) Decode via the Swift helper.
    const helper = path.join(__dirname, 'bin', 'restash-decode-qr');
    const decode = spawnSync(helper, [tmpPath]);
    try { fs.unlinkSync(tmpPath); } catch {}

    if (decode.status === 2) return { ok: false, reason: 'no-qr' };
    if (decode.status !== 0) return { ok: false, reason: 'decode-failed', code: decode.status };

    const payload = (decode.stdout || Buffer.alloc(0)).toString('utf8');
    return { ok: true, ...detectQRType(payload) };
  });

  ipcMain.handle('paste:active', async (_e, payload) => {
    // Accept either a plain string (legacy: text-paste) or an object
    // `{ text?, filePath? }` (new: file-paste support). File paste uses a
    // small Swift helper that writes a real NSURL to NSPasteboard so ⌘V in
    // Finder/Mail/Slack behaves correctly.
    let text = null;
    let filePaths = [];
    if (typeof payload === 'string') {
      text = payload;
    } else if (payload && typeof payload === 'object') {
      if (typeof payload.text === 'string') text = payload.text;
      if (Array.isArray(payload.filePaths)) {
        filePaths = payload.filePaths.filter((p) => typeof p === 'string' && p);
      } else if (typeof payload.filePath === 'string') {
        // Back-compat: single filePath also accepted.
        filePaths = [payload.filePath];
      }
    }
    if (!text && !filePaths.length) return { ok: false, reason: 'bad-input' };

    // Check accessibility FIRST, before any destructive action. This way if
    // it's denied we keep the popover visible so the banner is reachable and
    // we can trigger the macOS native prompt.
    const trusted = systemPreferences.isTrustedAccessibilityClient(false);
    if (!trusted) {
      // Still copy so the user can ⌘V manually as a fallback. For file items
      // we put all file URLs on the pasteboard via the Swift helper.
      if (filePaths.length) {
        try {
          require('node:child_process').execFileSync(
            path.join(__dirname, 'bin', 'restash-clip-file'),
            filePaths
          );
        } catch {}
      } else if (text) {
        restashWriteClipboard(text);
      }
      systemPreferences.isTrustedAccessibilityClient(true);
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
      return { ok: false, reason: 'no-accessibility' };
    }

    // Preserve the user's previous clipboard text so we can restore it afterwards.
    const prevClipboard = clipboard.readText();
    if (filePaths.length) {
      try {
        require('node:child_process').execFileSync(
          path.join(__dirname, 'bin', 'restash-clip-file'),
          filePaths
        );
      } catch (err) {
        return { ok: false, reason: 'clip-file-failed', error: err.message };
      }
    } else {
      restashWriteClipboard(text);
    }

    // Hide our window, then explicitly reactivate the app that was frontmost
    // when the hotkey was pressed. This is more reliable than relying on
    // macOS to "naturally" return focus.
    if (win && win.isVisible()) win.hide();
    if (process.platform === 'darwin') app.hide();

    await activateAppByPid(previousAppPid);

    // Let focus settle on the previous app, then post ⌘V via System Events.
    await new Promise((r) => setTimeout(r, 120));
    const result = await new Promise((resolve) => {
      execFile(
        'osascript',
        ['-e', 'tell application "System Events" to keystroke "v" using command down'],
        (err) => {
          if (err) resolve({ ok: false, reason: 'osascript-error', error: err.message });
          else resolve({ ok: true });
        }
      );
    });

    // Restore the previous clipboard after the paste has time to land. Goes
    // through restashWriteClipboard so the watcher doesn't recapture the
    // restored value as a brand-new copy (which would dup-log the user's
    // pre-paste clipboard into Recent every time they paste).
    setTimeout(() => {
      try { restashWriteClipboard(prevClipboard); } catch {}
    }, 350);

    return result;
  });

  // Stamp the trial clock on first run.
  ensureTrialStamp();

  // Global hotkey: summon the popover at the cursor location.
  // Load user-saved hotkey, fall back to default if unset or in-use.
  const settings = readSettings();
  let attempt = tryRegisterHotkey(settings.hotkey || DEFAULT_HOTKEY);
  if (!attempt.ok && settings.hotkey !== DEFAULT_HOTKEY) {
    console.warn(`[Restash] Saved hotkey ${settings.hotkey} unavailable — falling back to default ${DEFAULT_HOTKEY}.`);
    attempt = tryRegisterHotkey(DEFAULT_HOTKEY);
  }
  if (!attempt.ok) {
    console.warn(`[Restash] No global hotkey could be registered. Open the menu bar icon instead.`);
  }
  // QR-decoder hotkey — independent slot, separately customizable.
  let qrAttempt = registerHotkeySlot('qr', settings.qrHotkey || DEFAULT_QR_HOTKEY);
  if (!qrAttempt.ok && settings.qrHotkey !== DEFAULT_QR_HOTKEY) {
    console.warn(`[Restash] Saved QR hotkey ${settings.qrHotkey} unavailable — falling back to ${DEFAULT_QR_HOTKEY}.`);
    qrAttempt = registerHotkeySlot('qr', DEFAULT_QR_HOTKEY);
  }
  if (!qrAttempt.ok) {
    console.warn(`[Restash] QR hotkey couldn't be registered. Use the tray menu's "Decode QR…" item.`);
  }

  // RES-13 v7: drag-to-reveal — the shelf is permanently parked at the notch
  // and expands on drag-enter. No hotkey trigger.
  ensureShelfAtIdle();
  try {
    const refresh = () => { invalidateNotchGeometry(); ensureShelfAtIdle(); };
    screen.on('display-added', refresh);
    screen.on('display-removed', refresh);
    screen.on('display-metrics-changed', refresh);
    app.on('browser-window-focus', (_e, focusedWin) => {
      // Follow the active display so the shelf moves to wherever the user is
      // looking. No-op if that display has no notch.
      if (!shelfWin || shelfWin.isDestroyed()) return;
      // RES-40: never re-pin/re-show the shelf in response to the shelf itself
      // gaining focus — that re-asserts always-on-top + visible-on-all-workspaces,
      // which re-fires browser-window-focus and spins an infinite focus loop.
      if (focusedWin === shelfWin) return;
      // RES-40: never re-pin while the menu-bar popover (or a modal sharing `win`)
      // is on screen. Re-pinning a screen-saver-level shelf steals key focus from
      // the popover, whose blur handler then hides it — the menu "instant-close"
      // bug. The shelf is already parked; it doesn't need repositioning here.
      if (win && win.isVisible()) return;
      positionShelfOnActiveDisplay();
    });
  } catch {}

  // Settings IPC
  ipcMain.handle('settings:load', () => ({
    ...readSettings(),
    currentHotkey,
    currentQRHotkey,
    entitlement: resolveEntitlement(),
  }));
  // Renderer asks for a fresh entitlement read (e.g. after the billing modal).
  ipcMain.handle('entitlement:get', () => resolveEntitlement());

  // ── Clipboard memory IPC (RES-11) ──────────────────────────────────────
  ipcMain.handle('clipboardHistory:load', () => {
    ensureClipHistoryLoaded();
    return clipHistory;
  });
  ipcMain.handle('clipboardHistory:remove', (_e, id) => {
    ensureClipHistoryLoaded();
    clipHistory = clipHistory.filter((it) => it.id !== id);
    scheduleClipHistoryWrite();
    broadcastClipHistory();
    return clipHistory;
  });
  ipcMain.handle('clipboardHistory:clear', () => {
    ensureClipHistoryLoaded();
    clipHistory = [];
    // Wipe: remove the on-disk history entirely (also cancel any pending write
    // so it can't recreate the file). This is the app's clipboard-data reset.
    if (clipWriteTimer) { clearTimeout(clipWriteTimer); clipWriteTimer = null; }
    try { fs.unlinkSync(CLIPBOARD_HISTORY_FILE); } catch {}
    broadcastClipHistory();
    return clipHistory;
  });
  ipcMain.handle('clipboardHistory:setMax', (_e, n) => {
    let max = parseInt(n, 10);
    if (!Number.isFinite(max) || max < 0) max = 0;
    const s = readSettings();
    s.clipboardHistoryMax = max;
    writeSettings(s);
    ensureClipHistoryLoaded();
    if (max === 0) {
      // Off — stop capturing. History on disk is left intact; the renderer
      // simply hides the section. (Use "Clear history" to wipe it.)
    } else {
      trimClipHistory(max);
      scheduleClipHistoryWrite();
    }
    syncClipboardWatcher();
    broadcastClipHistory();
    return { ok: true, max };
  });

  // Load history into memory and start the watcher per the saved setting.
  ensureClipHistoryLoaded();
  syncClipboardWatcher();

  // ── Lemon Squeezy license activation ──────────────────────────────────
  // Activate a license key on this device; on success the entitlement flips
  // to the matching paid tier and is persisted to settings.json.
  ipcMain.handle('license:activate', async (_e, rawKey) => {
    const key = String(rawKey || '').trim();
    if (!key) return { ok: false, error: 'Enter your license key.' };
    const r = await lsLicenseCall('activate', {
      license_key: key,
      instance_name: licenseInstanceName(),
    });
    if (r && r.activated) {
      const variantId = r.meta && r.meta.variant_id;
      const lk = r.license_key || {};
      const s = readSettings();
      s.license = {
        key,
        instanceId: (r.instance && r.instance.id) || null,
        variantId: variantId != null ? String(variantId) : null,
        tier: tierForVariant(variantId),
        status: 'active',
        expiresAt: lk.expires_at || null,
        activatedAt: Date.now(),
      };
      s.tier = s.license.tier;
      writeSettings(s);
      return { ok: true, entitlement: resolveEntitlement() };
    }
    let error = (r && r.error) || 'That license key could not be activated.';
    if (r && r._network) error = 'Could not reach Lemon Squeezy — check your connection.';
    return { ok: false, error };
  });

  // Release this device's activation slot and drop back to the free tier.
  ipcMain.handle('license:deactivate', async () => {
    const s = readSettings();
    const lic = s.license;
    if (lic && lic.key && lic.instanceId) {
      await lsLicenseCall('deactivate', { license_key: lic.key, instance_id: lic.instanceId });
    }
    s.license = null;
    s.tier = 'free';
    writeSettings(s);
    return { ok: true, entitlement: resolveEntitlement() };
  });

  // Fire-and-forget: re-verify the stored license against Lemon Squeezy.
  revalidateLicense();
  // Mark the one-time offer as shown so it never fires again.
  ipcMain.handle('oto:markShown', () => {
    const s = readSettings();
    s.otoShown = true;
    writeSettings(s);
    return { ok: true };
  });
  // Billing is an overlay inside the existing window — no resize needed.
  ipcMain.handle('billing:window', (_e, _open) => { return { ok: true }; });

  // The add/edit-item modal needs more room than the list. While it's open,
  // grow the window to SIZE_EDITOR — but never below the user's current list
  // size — then restore the focused mode's size on close.
  ipcMain.handle('editor:window', (_e, open) => {
    if (!win) return;
    let size;
    if (open) {
      const list = cardSize('list');
      size = {
        width:  Math.max(list.width,  SIZE_EDITOR.width),
        height: Math.max(list.height, SIZE_EDITOR.height),
      };
    } else {
      size = cardSize(currentMode);
    }
    const cur = win.getBounds();
    win.setBounds({
      x: cur.x, y: cur.y,
      width:  size.width  + SHADOW_PAD * 2,
      height: size.height + SHADOW_PAD * 2,
    }, false);
  });

  // Live resize from the in-window drag handles (and the Settings presets).
  // payload: { mode:'list'|'grid', width, height, commit }. The window only
  // physically resizes for the mode that's on screen; the other mode's size
  // is just persisted, taking effect next time it opens.
  ipcMain.handle('window:resize', (_e, payload = {}) => {
    if (!win) return null;
    const mode = payload.mode === 'grid' ? 'grid' : 'list';
    const bounds = mode === 'grid' ? GRID_BOUNDS : MENU_BOUNDS;
    const card = clampCard({ width: payload.width, height: payload.height }, bounds);

    if (payload.commit) {
      const s = readSettings();
      if (mode === 'grid') s.gridSize = card; else s.menuSize = card;
      writeSettings(s);
    }
    if (mode === currentMode) {
      const winW = card.width  + SHADOW_PAD * 2;
      const winH = card.height + SHADOW_PAD * 2;
      const cur = win.getBounds();
      // list keeps its top-RIGHT corner fixed (tray sits near the right edge);
      // grid keeps its top-LEFT corner fixed (anchored at the cursor).
      let x = mode === 'list' ? (cur.x + cur.width - winW) : cur.x;
      let y = cur.y;
      const wa = screen.getDisplayNearestPoint({ x: cur.x, y: cur.y }).workArea;
      x = Math.max(wa.x, Math.min(x, wa.x + wa.width - winW));
      win.setBounds({ x, y, width: winW, height: winH }, false);
    }
    return card;
  });
  ipcMain.handle('qrHotkey:set', (_e, accel) => {
    const result = registerHotkeySlot('qr', String(accel || '').trim());
    if (result.ok) {
      const s = readSettings();
      s.qrHotkey = result.hotkey;
      writeSettings(s);
    }
    return result;
  });
  ipcMain.handle('qrHotkey:reset', () => {
    const result = registerHotkeySlot('qr', DEFAULT_QR_HOTKEY);
    if (result.ok) {
      const s = readSettings();
      s.qrHotkey = DEFAULT_QR_HOTKEY;
      writeSettings(s);
    }
    return result;
  });
  ipcMain.handle('theme:set', (_e, theme) => {
    const t = theme === 'dark' ? 'dark' : 'light';
    const s = readSettings();
    s.theme = t;
    writeSettings(s);
    return { ok: true, theme: t };
  });
  ipcMain.handle('tutorial:complete', () => {
    const s = readSettings();
    s.onboarded = true;
    writeSettings(s);
    if (tutorialWin && !tutorialWin.isDestroyed()) tutorialWin.close();
    return { ok: true };
  });

  // ---------- Stash CRUD ----------
  // Stashes live in settings.json as a flat array of { id, name }. Items
  // reference them by id via item.stashIds (an array — items can belong to
  // multiple stashes). The "All" stash is virtual and never stored.
  ipcMain.handle('stash:list',   () => readSettings().stashes || []);
  ipcMain.handle('stash:create', (_e, name) => {
    const clean = String(name || '').trim();
    if (!clean) return { ok: false, reason: 'empty-name' };
    const s = readSettings();
    s.stashes = s.stashes || [];
    if (s.stashes.some((x) => x.name.toLowerCase() === clean.toLowerCase())) {
      return { ok: false, reason: 'duplicate-name' };
    }
    const id = 's_' + Math.random().toString(36).slice(2, 10);
    const stash = { id, name: clean, createdAt: Date.now(), pinnedItemIds: [] };
    s.stashes.push(stash);
    writeSettings(s);
    notifyShelfStashesChanged();
    return { ok: true, stash };
  });
  ipcMain.handle('stash:rename', (_e, { id, name }) => {
    const clean = String(name || '').trim();
    if (!clean) return { ok: false, reason: 'empty-name' };
    const s = readSettings();
    s.stashes = s.stashes || [];
    const target = s.stashes.find((x) => x.id === id);
    if (!target) return { ok: false, reason: 'not-found' };
    target.name = clean;
    writeSettings(s);
    notifyShelfStashesChanged();
    return { ok: true };
  });
  ipcMain.handle('stash:delete', (_e, id) => {
    const s = readSettings();
    s.stashes = (s.stashes || []).filter((x) => x.id !== id);
    writeSettings(s);
    // NOTE: items still reference the deleted id; renderer cleans up on save.
    notifyShelfStashesChanged();
    return { ok: true };
  });
  ipcMain.handle('stashEdit:open', (_e, stashId) => {
    createStashEditWindow(String(stashId || ''));
    return { ok: true };
  });
  // Set the ordered pinned-item ids for a specific stash. Index in the array
  // corresponds to slot N+1 (so [a, b, ...] pins a→1, b→2, etc.). Up to 9.
  ipcMain.handle('stash:setPinned', (_e, { stashId, itemIds } = {}) => {
    if (!stashId || !Array.isArray(itemIds)) return { ok: false, reason: 'bad-input' };
    const s = readSettings();
    const target = (s.stashes || []).find((x) => x.id === stashId);
    if (!target) return { ok: false, reason: 'not-found' };
    // Dedup + cap at 9 (defensive)
    const seen = new Set();
    target.pinnedItemIds = itemIds
      .filter((id) => typeof id === 'string' && id && !seen.has(id) && seen.add(id))
      .slice(0, 9);
    writeSettings(s);
    return { ok: true, stash: target };
  });
  // Persist a new order for the user stashes. Any ids missing from the input
  // are appended at the end (defensive — keeps stashes from vanishing).
  ipcMain.handle('stash:reorder', (_e, idsInOrder) => {
    if (!Array.isArray(idsInOrder)) return { ok: false, reason: 'bad-input' };
    const s = readSettings();
    const byId = new Map((s.stashes || []).map((x) => [x.id, x]));
    const ordered = [];
    for (const id of idsInOrder) {
      if (byId.has(id)) { ordered.push(byId.get(id)); byId.delete(id); }
    }
    for (const remaining of byId.values()) ordered.push(remaining);
    s.stashes = ordered;
    writeSettings(s);
    return { ok: true, stashes: s.stashes };
  });
  ipcMain.handle('hotkey:set', (_e, accel) => {
    const result = tryRegisterHotkey(String(accel || '').trim());
    if (result.ok) {
      const s = readSettings();
      s.hotkey = result.hotkey;
      writeSettings(s);
    }
    return result;
  });

  // ── RES-13: Notch shelf IPC ─────────────────────────────────────────────
  ipcMain.handle('shelf:list-stashes', () => shelfStashList());

  ipcMain.handle('shelf:get-last-used-stash', () => {
    const s = readSettings();
    return s.lastUsedStashId || 'all';
  });

  ipcMain.handle('shelf:create-stash', (_e, name) => {
    const clean = String(name || '').trim();
    if (!clean) return { ok: false, reason: 'empty-name' };
    const s = readSettings();
    s.stashes = s.stashes || [];
    if (s.stashes.some((x) => x.name.toLowerCase() === clean.toLowerCase())) {
      return { ok: false, reason: 'duplicate-name' };
    }
    const id = 's_' + Math.random().toString(36).slice(2, 10);
    const stash = { id, name: clean, createdAt: Date.now(), pinnedItemIds: [] };
    s.stashes.push(stash);
    writeSettings(s);
    // Both surfaces stay in sync.
    if (win && !win.isDestroyed()) win.webContents.send('stashes:changed');
    notifyShelfStashesChanged();
    return { ok: true, stash: { id: stash.id, name: stash.name } };
  });

  // Renderer asks to collapse back into the notch (Esc, after-save timeout, etc.)
  ipcMain.handle('shelf:hide', () => { collapseShelf(); return { ok: true }; });

  // Create an item from the quick-add path. Honors the Pin toggle by
  // computing the next free pin slot for the destination stash; if full,
  // saves the item un-pinned and reports it back so the saved card can
  // adjust its copy.
  ipcMain.handle('shelf:add-from-quick', (_e, payload = {}) => {
    const kind  = String(payload.kind || 'text');
    const value = String(payload.value || '').trim();
    if (!value) return { ok: false, reason: 'empty-value' };
    const label = String(payload.label || value).slice(0, 200);
    const tag   = payload.tag ? String(payload.tag) : undefined;
    const rawStash = String(payload.stashId || 'all');
    const wantPin = !!payload.pinned;

    const settings = readSettings();
    const validStashIds = new Set(['all', ...(settings.stashes || []).map((x) => x.id)]);
    const stashId = validStashIds.has(rawStash) ? rawStash : 'all';
    const stashIds = stashId === 'all' ? [] : [stashId];

    const items = readStore();
    let pinIndex = -1;
    if (wantPin) {
      pinIndex = shelfNextPinSlot(items, stashId);
    }
    const pins = (wantPin && pinIndex >= 0) ? { [stashId]: pinIndex } : {};

    const item = {
      id: newItemId(),
      kind, label, value,
      ...(tag ? { tag } : {}),
      stashIds,
      createdAt: Date.now(),
      lastUsedAt: null,
      pins,
    };
    items.push(item);
    writeStore(items);

    // Remember last-used stash so the next summon defaults sensibly.
    settings.lastUsedStashId = stashId;
    // Bump stash recency too (so the dropdown sort matches user intent).
    if (stashId !== 'all') {
      const st = (settings.stashes || []).find((x) => x.id === stashId);
      if (st) st.lastUsedAt = Date.now();
    }
    writeSettings(settings);

    if (win && !win.isDestroyed()) {
      // Refresh the popover so the new item is visible if it's open.
      try { win.webContents.send('stashes:changed'); } catch {}
    }

    return { ok: true, id: item.id, pinned: pinIndex >= 0, pinSlotFull: wantPin && pinIndex < 0 };
  });

  // Undo the most recent shelf add. Cleanly drops both the item and its pin.
  ipcMain.handle('shelf:undo-add', (_e, itemId) => {
    const id = String(itemId || '');
    if (!id) return { ok: false };
    const items = readStore();
    const idx = items.findIndex((it) => it.id === id);
    if (idx < 0) return { ok: false };
    items.splice(idx, 1);
    writeStore(items);
    if (win && !win.isDestroyed()) {
      try { win.webContents.send('stashes:changed'); } catch {}
    }
    return { ok: true };
  });

  // Drop-zone ingest: copy each path into the data dir and create file items.
  // Reuses the same per-file size/copy logic as the main file:add handler.
  ipcMain.handle('shelf:ingest-files', (_e, { paths, stashId, pinned } = {}) => {
    const list = Array.isArray(paths) ? paths.filter((p) => typeof p === 'string' && p) : [];
    if (!list.length) return { ok: false, reason: 'empty' };
    const settings = readSettings();
    const validStashIds = new Set(['all', ...(settings.stashes || []).map((x) => x.id)]);
    const dest = validStashIds.has(String(stashId || '')) ? String(stashId) : 'all';
    const stashIds = dest === 'all' ? [] : [dest];

    const items = readStore();
    const results = [];

    // Local copy of the file:add logic so we don't need to round-trip the
    // existing handler per file. (Shelf ingest happens in batch.)
    const FILES_DIR = path.join(app.getPath('userData'), 'files');
    const MAX_FILE_BYTES = 100 * 1024 * 1024;
    if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });

    for (const srcPath of list) {
      try {
        const stat = fs.statSync(srcPath);
        if (stat.size > MAX_FILE_BYTES) {
          results.push({ ok: false, reason: 'too-large', originalName: path.basename(srcPath), size: stat.size, limit: MAX_FILE_BYTES });
          continue;
        }
        const ext = path.extname(srcPath);
        const base = path.basename(srcPath, ext);
        const safeBase = base.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60);
        const storedName = `${Date.now().toString(36)}_${safeBase}${ext}`;
        const destPath = path.join(FILES_DIR, storedName);
        fs.copyFileSync(srcPath, destPath);
        const wantPin = !!pinned;
        const pinIndex = wantPin ? shelfNextPinSlot(items, dest) : -1;
        const pins = (wantPin && pinIndex >= 0) ? { [dest]: pinIndex } : {};
        const fileMeta = { storedPath: destPath, storedName, originalName: path.basename(srcPath), size: stat.size };
        const item = {
          id: newItemId(),
          kind: 'file',
          label: base.slice(0, 80) || path.basename(srcPath),
          value: destPath,
          stashIds,
          files: [fileMeta],
          createdAt: Date.now(),
          lastUsedAt: null,
          pins,
        };
        items.push(item);
        results.push({ ok: true, id: item.id, originalName: path.basename(srcPath), pinned: pinIndex >= 0 });
      } catch (err) {
        results.push({ ok: false, reason: 'copy-failed', originalName: path.basename(srcPath || ''), error: err && err.message });
      }
    }

    writeStore(items);
    settings.lastUsedStashId = dest;
    if (dest !== 'all') {
      const st = (settings.stashes || []).find((x) => x.id === dest);
      if (st) st.lastUsedAt = Date.now();
    }
    writeSettings(settings);
    if (win && !win.isDestroyed()) {
      try { win.webContents.send('stashes:changed'); } catch {}
    }
    return { ok: true, results };
  });

  // Notch shelf hotkey rebind (mirrors hotkey:set / qrHotkey:set patterns).
  // RES-13 v7: drag-to-reveal — the shelf expands when the renderer detects a
  // drag-enter on the notch, and collapses when the user drags away (with a
  // 400ms grace) or after a save.
  ipcMain.handle('shelf:expand',   () => { expandShelf();   return { ok: true }; });
  ipcMain.handle('shelf:collapse', () => { collapseShelf(); return { ok: true }; });
  // After a drop, the renderer asks main to bring the panel forward so the
  // quick-add fields take keystrokes (focusing mid-drag would cancel the drop).
  ipcMain.handle('shelf:focus',    () => { focusShelf();    return { ok: true }; });

  ipcMain.handle('shelf:set-enabled', (_e, enabled) => {
    const s = readSettings();
    s.showNotchShelf = !!enabled;
    writeSettings(s);
    if (s.showNotchShelf) ensureShelfAtIdle();
    else if (shelfWin && !shelfWin.isDestroyed()) { try { shelfWin.close(); } catch {} }
    return { ok: true, showNotchShelf: s.showNotchShelf };
  });
  // --- Stubs for menu-bar dropdown actions ---
  ipcMain.handle('app:check-updates', async () => {
    // TODO: wire to a real updater (electron-updater, GitHub releases, etc.)
    return { ok: true, status: 'up-to-date', version: app.getVersion() };
  });

  ipcMain.handle('app:open-billing', async () => {
    // TODO: open a billing URL once we have one. For now just a placeholder.
    return { ok: true, status: 'coming-soon' };
  });

  ipcMain.handle('app:quit', () => {
    app.quit();
  });

  ipcMain.handle('hotkey:reset', () => {
    const result = tryRegisterHotkey(DEFAULT_HOTKEY);
    if (result.ok) {
      const s = readSettings();
      s.hotkey = DEFAULT_HOTKEY;
      writeSettings(s);
    }
    return result;
  });

  // Auto-open the popover on first launch so it's discoverable.
  setTimeout(togglePopover, 400);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', (e) => {
  // Keep app alive even with no windows — it's a menu bar app.
  e.preventDefault?.();
});
