const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, clipboard, shell, screen, globalShortcut, systemPreferences, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const os = require('node:os');
const QRCode = require('qrcode');
// Platform-abstraction layer — every native call routes through this so main.js
// is OS-agnostic and the zero-install bundling policy is enforced in one place.
// See platform/interface.md and docs/windows-linux-port.md.
const platform = require('./platform');

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
// Cross-platform stable machine id for the Lemon Squeezy activation instance.
// os.hostname() + a persisted random UUID (generated once, stored in userData)
// so the 3-device activation limit counts consistently on every OS and survives
// reinstalls within the same userData. No new dependency (crypto + os built-in).
const MACHINE_ID_FILE = path.join(app.getPath('userData'), 'machineId');
function getMachineId() {
  try {
    if (fs.existsSync(MACHINE_ID_FILE)) {
      const id = fs.readFileSync(MACHINE_ID_FILE, 'utf8').trim();
      if (id) return id;
    }
  } catch {}
  const id = require('node:crypto').randomUUID();
  try {
    fs.mkdirSync(path.dirname(MACHINE_ID_FILE), { recursive: true });
    fs.writeFileSync(MACHINE_ID_FILE, id);
  } catch {}
  return id;
}
function licenseInstanceName() {
  try { return `Restash · ${os.hostname()} · ${getMachineId().slice(0, 8)}`; }
  catch { return `Restash · ${getMachineId().slice(0, 8)}`; }
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

// Per-OS safe defaults via the platform layer: macOS keeps ⌘⇧V / ⌃⇧F; Win/Linux
// move OFF Ctrl+Shift+V (universal paste-as-plain-text) to non-colliding
// Ctrl+Alt+V / Ctrl+Alt+F. Customization UI + tryRegisterHotkey rollback intact.
const DEFAULT_HOTKEY    = platform.defaultHotkeys.summon;
const DEFAULT_QR_HOTKEY = platform.defaultHotkeys.qr;

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
    hotkey: DEFAULT_HOTKEY, qrHotkey: DEFAULT_QR_HOTKEY, theme: 'light',
    onboarded: false, stashes: [], tier: 'free',
    license: null,     // { key, instanceId, variantId, tier, status, expiresAt } once activated
    trialStartedAt: 0, // 0 = not yet stamped; ensureTrialStamp() sets it on first run
    otoShown: false,   // one-time-offer fires once, ever
    menuSize: null,    // {width,height} — user-resized list popover (null = default)
    gridSize: null,    // {width,height} — user-resized cursor numpad (null = default)
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

// Forward references — these get assigned inside app.whenReady() once the
// real implementations are defined. registerHotkeySlot is called before then
// (at module load), so we wrap them in a thunk that resolves at call time.
let qrTrigger = null;

// Generic per-slot registration. Each slot ('summon' | 'qr') has its own
// accelerator + handler. Re-registering a slot unregisters the previous one,
// preserves the other slot, and rolls back if the new combo is in use.
function registerHotkeySlot(slot, accel) {
  const handler = slot === 'qr'
    ? () => { if (typeof qrTrigger === 'function') qrTrigger(); }
    : togglePopoverAtCursor;
  const prev = slot === 'qr' ? currentQRHotkey : currentHotkey;
  if (prev) globalShortcut.unregister(prev);
  const ok = accel ? globalShortcut.register(accel, handler) : false;
  if (ok) {
    if (slot === 'qr') currentQRHotkey = accel; else currentHotkey = accel;
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
  // Per-OS asset selection lives in the platform layer (mac Template auto-invert;
  // Windows .ico/16px PNG; Linux 22/24px light/dark PNG).
  try {
    const theme = readSettings().theme;
    return platform.trayIcon(theme);
  } catch {
    const p = path.join(__dirname, 'assets', 'brand', 'tray-Template.png');
    const img = nativeImage.createFromPath(p);
    if (process.platform === 'darwin') img.setTemplateImage(true);
    return img;
  }
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
    // On Win/Linux mark the popover/numpad as a utility window so it doesn't
    // show in the taskbar/window list (mac ignores 'type').
    ...(process.platform !== 'darwin' ? { type: 'toolbar' } : {}),
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

// Capture the foreground window/app before the popover steals focus. On mac
// this is a PID (AppleEvents); on Win an HWND; on X11 a window id; on Wayland
// null (no API). The opaque handle is passed back to platform.paste().
function captureFrontmostApp() {
  return platform.captureForegroundWindow();
}

// macOS-only helper kept for the mac paste flow inside platform.darwin; on other
// OSes focus restore happens inside platform.paste() via the saved handle.
function activateAppByPid(pid) {
  if (platform.activateAppByPid) return platform.activateAppByPid(pid);
  return Promise.resolve();
}

function positionUnderTray() {
  platform.positionPopover(win, { anchor: 'tray', tray });
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
  // Per-OS work-area math + Wayland no-op (compositor positions) in the platform
  // layer. X11/Windows anchor to cursor; Wayland centers via compositor.
  platform.positionPopover(win, { anchor: 'cursor', tray });
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

  const isMac = process.platform === 'darwin';

  // Build the tray/app context menu. Reused by the tray right-click AND the
  // app menu (so a missing tray on GNOME-without-tray never blocks any feature).
  const buildContextMenu = () => Menu.buildFromTemplate([
    { label: 'Open Restash', click: togglePopover },
    { type: 'separator' },
    { label: 'Decode QR…', click: () => decodeQRAndShowPreview() },
    { type: 'separator' },
    { label: 'Settings…', accelerator: isMac ? 'Cmd+,' : undefined, click: () => { togglePopover(); setTimeout(() => win?.webContents.send('open:settings'), 120); } },
    { label: 'Check for Updates…', click: () => win?.webContents.send('open:updates') },
    { label: 'Billing & Account…', click: () => win?.webContents.send('open:billing') },
    { type: 'separator' },
    { label: 'Quit Restash', accelerator: 'CommandOrControl+Q', click: () => app.quit() },
  ]);

  tray = new Tray(createTrayIcon());
  tray.setToolTip('Restash');
  if (isMac) tray.setTitle(' Restash');
  // Left-click toggles the popover on every OS; right-click opens the context
  // menu on Win/Linux (mac uses left-click for the popover, menu via the icon).
  tray.on('click', togglePopover);
  tray.on('right-click', () => tray.popUpContextMenu(buildContextMenu()));

  // No-tray fallback (e.g. GNOME without AppIndicator): never tell the user to
  // install an extension. Instead the global-hotkey numpad is the primary
  // surface, and the same actions are always reachable from the app menu.
  if (!isMac) {
    const appMenu = Menu.buildFromTemplate([
      {
        label: 'Restash',
        submenu: [
          { label: 'Open Restash', click: togglePopover },
          { label: 'Decode QR…', click: () => decodeQRAndShowPreview() },
          { type: 'separator' },
          { label: 'Settings…', click: () => { togglePopover(); setTimeout(() => win?.webContents.send('open:settings'), 120); } },
          { label: 'Check for Updates…', click: () => win?.webContents.send('open:updates') },
          { label: 'Billing & Account…', click: () => win?.webContents.send('open:billing') },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
    ]);
    try { Menu.setApplicationMenu(appMenu); } catch {}
  }

  // Clicking the Dock icon opens/toggles the popover (same as tray click).
  app.on('activate', () => togglePopover());

  // A second launch (Spotlight, double-click, `npm start`) is bounced by the
  // single-instance lock above — when it happens, surface THIS instance instead.
  app.on('second-instance', () => togglePopover());

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

    // Close the overlay BEFORE capture so the dim mask isn't in the image.
    closeScanOverlay();
    await new Promise((r) => setTimeout(r, 80));

    // Non-macOS: use the bundled cross-platform path (desktopCapturer region
    // grab + zxing-wasm/jsQR decode) — no native helper, no screencapture.
    if (process.platform !== 'darwin') {
      const display = screen.getDisplayNearestPoint({ x: rectX, y: rectY });
      const cap = await platform.captureRegion({
        rect: { x: rectX, y: rectY, width: Math.round(size), height: Math.round(size) },
        displayId: display.id,
      });
      if (!cap.ok || !cap.pngBuffer) {
        showQRPreview({ ok: false, reason: 'capture-failed', message: 'Could not capture that area.' });
        return { ok: false };
      }
      const dec = await platform.decodeQR(cap.pngBuffer);
      if (!dec.ok || !dec.payload) {
        showQRPreview({ ok: false, reason: dec.reason === 'no-decoder' ? 'decode-failed' : 'no-qr', message: dec.reason === 'no-decoder' ? undefined : 'No QR code in that area. Try centring the lens directly over it.' });
        return { ok: false };
      }
      showQRPreview({ ok: true, ...detectQRType(dec.payload) });
      return { ok: true };
    }

    const { spawnSync } = require('node:child_process');
    const tmpPath = path.join(app.getPath('temp'), `restash-qr-${Date.now()}.png`);
    // macOS: -R<rect> region capture, -x silent, -o no shadow → Swift Vision decode.
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
    clipboard.writeText(String(text ?? ''));
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

  // --- IPC: installed / running apps ---
  // mac scans /Applications (scanInstalledApps); other OSes return the running
  // process / window-owner list via the platform layer (we don't crawl the
  // Windows registry or rely on PATH tools).
  ipcMain.handle('apps:list', () => {
    if (process.platform === 'darwin') return scanInstalledApps();
    try { return platform.listRunningApps(); } catch { return []; }
  });

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
  // Windows on the current desktop, via the platform layer (mac Swift helper /
  // Windows EnumWindows / X11 _NET_CLIENT_LIST). Wayland returns [] (hard OS
  // restriction — capabilities().canListWindows is false there).
  const currentDesktopWindows = () => {
    try { return platform.listWindows('desktop'); } catch { return Promise.resolve([]); }
  };

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
  ipcMain.handle('env:open', (_e, env) => {
    const targets = Array.isArray(env?.targets) ? env.targets : [];
    const urlMode = env?.urlMode === 'separate' ? 'separate' : 'window';

    const normalizeUrl = (u) => {
      const s = String(u || '').trim();
      if (!s) return '';
      if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
      return 'https://' + s;
    };

    const apps  = targets.filter((t) => t && t.type === 'app');
    const sites = targets.filter((t) => t && t.type === 'site' && (t.value || '').trim());

    // Launch apps first (so browsers aren't stealing focus mid-launch) via the
    // per-OS launcher (open -a / shell.openPath / .desktop Exec — never gtk-launch).
    for (const a of apps) { try { platform.launchApp(a); } catch {} }

    // Group sites by Chrome profile dir; '' = default browser / last profile.
    // The platform layer decides whether to use the per-OS Chrome binary or
    // fall back to the default browser via shell.openExternal.
    const byProfile = new Map();
    for (const t of sites) {
      const url = normalizeUrl(t.value);
      if (!url) continue;
      const prof = String(t.profile || '').trim();
      if (!byProfile.has(prof)) byProfile.set(prof, []);
      byProfile.get(prof).push(url);
    }
    try { platform.openSites(byProfile, { separate: urlMode === 'separate' }); } catch {}
    return { ok: true };
  });
  ipcMain.handle('qr:dataurl', (_e, text) => QRCode.toDataURL(String(text ?? ''), {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 320,
    color: { dark: '#000000', light: '#ffffff' },
  }));

  // --- IPC: share an item ---
  // macOS shows the native NSSharingServicePicker (via the committed Swift
  // helper, routed through platform.share). On Win/Linux there is no native
  // share sheet, so platform.share returns { fallback: true } and the renderer
  // shows an in-app Copy / Open URL / Reveal file / Email action set (all via
  // already-cross-platform Electron shell APIs — zero new native deps).
  ipcMain.handle('share:item', (e, { text, url, filePath, label, iconPath } = {}) => {
    return platform.share(
      { text, url, filePath, label, iconPath },
      {
        beforeShare: () => {
          // Suppress blur-hide + drop window level so the system picker floats above.
          suppressBlurHideUntil = Date.now() + 60_000;
          if (win) win.setAlwaysOnTop(false);
        },
        afterShare: () => {
          suppressBlurHideUntil = 0;
          if (win) win.setAlwaysOnTop(true, 'pop-up-menu');
        },
      }
    );
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

  // --- IPC: accessibility (mac TCC; on Win/Linux there is no TCC — return true
  // so the renderer's mac-only banner never blocks. Win/Linux use capability
  // checks + the one-time OS-permission explainer instead). ---
  ipcMain.handle('accessibility:check', (_e, prompt = false) => {
    if (process.platform !== 'darwin') return true;
    return systemPreferences.isTrustedAccessibilityClient(!!prompt);
  });
  ipcMain.handle('accessibility:open', () => {
    if (process.platform === 'darwin') {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    }
  });

  // --- IPC: platform capabilities — drives renderer UI degradation
  // (Paste vs Copy, hide native Share, one-time OS-permission explainer,
  // "use the tray/launcher" banner). Permission != install. ---
  ipcMain.handle('platform:capabilities', () => {
    try { return platform.capabilities(); } catch { return null; }
  });
  // Accelerator → human label, per OS (Ctrl/Alt/Shift vs ⌘/⌃/⇧).
  ipcMain.handle('platform:formatAccel', (_e, accel) => {
    try { return platform.formatAccelerator(accel); } catch { return String(accel || ''); }
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
    // Non-macOS: bundled cross-platform full-display grab + zxing-wasm/jsQR
    // decode (no screencapture, no Swift Vision). The lens overlay drives the
    // precise region path (scan:capture); this whole-screen variant is a
    // fallback used by the tray "Decode QR" entry.
    if (process.platform !== 'darwin') {
      const cap = await platform.captureRegion({});
      if (!cap.ok || !cap.pngBuffer) return { ok: false, reason: 'capture-failed' };
      const dec = await platform.decodeQR(cap.pngBuffer);
      if (!dec.ok || !dec.payload) return { ok: false, reason: dec.reason === 'no-decoder' ? 'decode-failed' : 'no-qr' };
      return { ok: true, ...detectQRType(dec.payload) };
    }

    const tmpPath = path.join(app.getPath('temp'), `restash-qr-${Date.now()}.png`);
    const { spawnSync } = require('node:child_process');

    // macOS: region selection screenshot then Swift Vision decode.
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

    // Route through the platform layer. Each OS handles clipboard write
    // (text or multi-file), foreground restore, and paste synthesis via its
    // bundled mechanism (osascript / win-helper / xcb / libei-portal / uinput),
    // and falls back to copy-only when synthesis isn't available. hooks let the
    // platform hide our windows so focus can return.
    return platform.paste(
      { text, filePaths, targetWindow: previousAppPid },
      {
        hideApp: () => {
          if (win && win.isVisible()) win.hide();
          if (process.platform === 'darwin') app.hide();
        },
      }
    );
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

  // Settings IPC
  ipcMain.handle('settings:load', () => ({
    ...readSettings(),
    currentHotkey,
    currentQRHotkey,
    entitlement: resolveEntitlement(),
  }));
  // Renderer asks for a fresh entitlement read (e.g. after the billing modal).
  ipcMain.handle('entitlement:get', () => resolveEntitlement());

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
    return { ok: true };
  });
  ipcMain.handle('stash:delete', (_e, id) => {
    const s = readSettings();
    s.stashes = (s.stashes || []).filter((x) => x.id !== id);
    writeSettings(s);
    // NOTE: items still reference the deleted id; renderer cleans up on save.
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
  // --- Stubs for menu-bar dropdown actions ---
  ipcMain.handle('app:check-updates', async () => {
    // electron-updater: NSIS differential on Windows, AppImage zsync on Linux.
    // macOS auto-update needs Squirrel.Mac signing+notarization (out of scope);
    // mac just reports its version. The updater is loaded lazily so dev runs and
    // unpackaged builds (where update metadata is absent) never throw.
    if (process.platform === 'darwin' || !app.isPackaged) {
      return { ok: true, status: 'up-to-date', version: app.getVersion() };
    }
    try {
      // eslint-disable-next-line global-require
      const { autoUpdater } = require('electron-updater');
      autoUpdater.autoDownload = true;
      const result = await autoUpdater.checkForUpdates();
      const remote = result && result.updateInfo && result.updateInfo.version;
      if (remote && remote !== app.getVersion()) {
        return { ok: true, status: 'downloading', version: remote };
      }
      return { ok: true, status: 'up-to-date', version: app.getVersion() };
    } catch (err) {
      return { ok: false, status: 'error', error: err && err.message, version: app.getVersion() };
    }
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
