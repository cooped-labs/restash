'use strict';

// ---------- iconography (filled SVG set) ----------
const ICONS = {
  // Filled link
  url: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.6 14.6a4 4 0 0 0 5.66 0l3.18-3.18a4 4 0 0 0-5.66-5.66l-1.59 1.59 1.41 1.41 1.59-1.59a2 2 0 0 1 2.83 2.83l-3.18 3.18a2 2 0 0 1-2.83 0 1 1 0 0 0-1.41 1.41z"/><path d="M13.4 9.4a4 4 0 0 0-5.66 0L4.56 12.58a4 4 0 0 0 5.66 5.66l1.59-1.59-1.41-1.41-1.59 1.59a2 2 0 0 1-2.83-2.83l3.18-3.18a2 2 0 0 1 2.83 0 1 1 0 0 0 1.41-1.41z"/></svg>`,
  // Phosphor "wallet bold" — user-supplied (assets/wallet.svg)
  cryptoWallet: `<svg viewBox="0 0 22 22" fill="currentColor"><path d="M16.84 11.69a1.38 1.38 0 1 1-2.75 0 1.38 1.38 0 0 1 2.75 0zm3.44-3.1v6.88a2.75 2.75 0 0 1-2.75 2.75H5.16a2.75 2.75 0 0 1-2.75-2.75V5.24a2.83 2.83 0 0 1 2.75-2.83h11.34a1.03 1.03 0 0 1 0 2.06H5.16c-.39 0-.7.34-.69.72.02.37.34.66.72.66h12.34a2.75 2.75 0 0 1 2.75 2.75zm-2.06 0c0-.38-.31-.69-.69-.69H5.2a2.75 2.75 0 0 1-.73-.09v7.66c0 .38.31.69.69.69h12.37c.38 0 .69-.31.69-.69V8.59z"/></svg>`,
  // Map pin filled
  pin: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5.5 7 13 7 13s7-7.5 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>`,
  // Aa typography mark for plain text
  textAa: `<svg viewBox="0 0 24 24" fill="currentColor"><text x="2.5" y="17.5" font-family="Inter, -apple-system, system-ui" font-weight="700" font-size="15">A</text><text x="13" y="19" font-family="Inter, -apple-system, system-ui" font-weight="400" font-size="12">a</text></svg>`,
  // Paperclip — generic file kind icon (used until we know the MIME)
  file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5l-8.5 8.5a5.5 5.5 0 0 1-7.78-7.78L13.5 3.7a3.5 3.5 0 0 1 4.95 4.95L9.93 17.17a1.5 1.5 0 0 1-2.12-2.12L16 6.86"/></svg>`,
  // Terminal prompt — `>_` chevron + caret line, for the Command kind
  command: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l4 4-4 4M12.5 16h6.5"/></svg>`,
  // Person silhouette — Contact kind
  contact: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12.4a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4zm0 1.9c-4.06 0-7.6 2.06-7.6 5.04V21h15.2v-1.66c0-2.98-3.54-5.04-7.6-5.04z"/></svg>`,
  // Twin AI sparkle — Agent template kind
  agent: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 2.5l1.85 5.15L18 9.5l-5.15 1.85L11 16.5l-1.85-5.15L4 9.5l5.15-1.85z"/><path d="M17.5 14l.95 2.55L21 17.5l-2.55.95L17.5 21l-.95-2.55L14 17.5l2.55-.95z"/></svg>`,
  // 2×2 launchpad grid — Environment kind (a set of sites/apps)
  environment: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></svg>`,
  // Neutral clip glyph — a raw recent copy that isn't a URL or crypto address.
  clip: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3.5" width="12" height="17" rx="2.2"/><path d="M9 7.5h6M9 11h6M9 14.5h3.5"/></svg>`,
};

// ---------- raw-clip auto-detection (cursor-modal Recent page, RES-33) ----------
// A recent is just literal copied text. At render time we sniff whether it
// looks like a URL or a crypto address so we can show a subtle leading glyph
// (link / wallet / neutral clip). Mirrors the approved prototype's detect().
const RE_RECENT_URL = /^(https?:\/\/|www\.)|^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i;
const RE_RECENT_BTC = /^(bc1|[13])[a-km-zA-HJ-NP-Z0-9]{25,62}$/;
const RE_RECENT_ETH = /^0x[0-9a-fA-F]{40}$/;
const RE_RECENT_SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function detectRecentKind(text) {
  const t = String(text || '').trim();
  if (!t) return 'clip';
  if (RE_RECENT_URL.test(t)) return 'url';
  if (RE_RECENT_ETH.test(t) || RE_RECENT_BTC.test(t) || RE_RECENT_SOL.test(t)) return 'crypto';
  return 'clip';
}
const RECENT_GLYPH = { url: ICONS.url, crypto: ICONS.cryptoWallet, clip: ICONS.clip };

// Monochrome SVG glyphs per file kind. All use currentColor so they pick up
// the icon-tile foreground (light in dark mode, dark in light mode) — same
// vibe as the URL / wallet / pin / Aa icons.
const FILE_GLYPHS = {
  generic:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5l-8.5 8.5a5.5 5.5 0 0 1-7.78-7.78L13.5 3.7a3.5 3.5 0 0 1 4.95 4.95L9.93 17.17a1.5 1.5 0 0 1-2.12-2.12L16 6.86"/></svg>`,
  image:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="1.5"/><circle cx="8.5" cy="10" r="1.5" fill="currentColor" stroke="none"/><path d="M5 17l4-4 3.5 3.5 3-3 3.5 3.5" stroke-linecap="round"/></svg>`,
  video:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l6 3.5-6 3.5z" fill="currentColor" stroke="none"/></svg>`,
  audio:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 9v6M9 6v12M12 7v10M15 4v16M18 9v6"/></svg>`,
  pdf:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="16" rx="2"/><text x="12" y="15.5" text-anchor="middle" font-family="Inter, system-ui" font-weight="800" font-size="7" fill="currentColor" stroke="none">PDF</text></svg>`,
  document: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 7h14M5 11h14M5 15h9"/></svg>`,
  sheet:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 16h18M12 4v16"/></svg>`,
  slides:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 17v-4M11 17v-7M15 17v-2M19 17v-5"/></svg>`,
  archive:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M3 7l2-3h14l2 3v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7h18M9 11h6"/></svg>`,
};

// Returns the cleanest user-facing filename for a file entry.
// Preference order: originalName → basename(storedPath) with hash prefix
// stripped → "file". Never returns a full storage path.
function displayFileName(file) {
  if (!file) return 'file';
  if (file.originalName) return file.originalName;
  const path = file.storedPath || '';
  const base = path.split('/').pop() || 'file';
  // Restash prefixes stored files with a short random token + underscore
  // (e.g. "mpczrodr_Doc_Iceman_.mp4") — drop it for display only.
  return base.replace(/^[a-z0-9]{6,12}_/i, '') || base;
}

function fileGlyph(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('image/'))   return FILE_GLYPHS.image;
  if (m.startsWith('video/'))   return FILE_GLYPHS.video;
  if (m.startsWith('audio/'))   return FILE_GLYPHS.audio;
  if (m === 'application/pdf')  return FILE_GLYPHS.pdf;
  if (m.includes('word') || m.includes('opendocument.text'))   return FILE_GLYPHS.document;
  if (m.includes('sheet') || m.includes('excel'))              return FILE_GLYPHS.sheet;
  if (m.includes('presentation') || m.includes('powerpoint'))  return FILE_GLYPHS.slides;
  if (m.includes('zip') || m.includes('compressed'))           return FILE_GLYPHS.archive;
  if (m.startsWith('text/'))    return FILE_GLYPHS.document;
  return FILE_GLYPHS.generic;
}

function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ---------- top 10 blockchains ----------
// Color + monogram render a simple, clearly-color-coded badge per chain.
// Listed roughly by market cap; tweak as needed.
const CHAINS = {
  BTC:  { name: 'Bitcoin',   color: '#F7931A', sym: '₿' },
  ETH:  { name: 'Ethereum',  color: '#627EEA', sym: 'Ξ' },
  SOL:  { name: 'Solana',    color: '#9945FF', sym: 'S' },
  BNB:  { name: 'BNB Chain', color: '#F3BA2F', sym: 'B' },
  XRP:  { name: 'XRP',       color: '#23292F', sym: 'X' },
  ADA:  { name: 'Cardano',   color: '#0033AD', sym: 'A' },
  DOGE: { name: 'Dogecoin',  color: '#C2A633', sym: 'Ð' },
  TON:  { name: 'Toncoin',   color: '#0098EA', sym: 'T' },
  TRX:  { name: 'Tron',      color: '#EB0029', sym: 'T' },
  AVAX: { name: 'Avalanche', color: '#E84142', sym: 'A' },
};

function chainBadgeSVG(code) {
  const c = CHAINS[code];
  if (!c) return '';
  // Authentic chain logo from spothq/cryptocurrency-icons (MIT) — bundled in assets/chains/.
  // TON sourced separately (cryptologos).
  const file = code.toLowerCase();
  return `<img class="chain-logo" src="assets/chains/${file}.svg" alt="${c.name}" />`;
}

function iconForItem(item) {
  if (item.kind === 'cryptoAddress' && item.tag && CHAINS[item.tag]) {
    return { html: chainBadgeSVG(item.tag), isChain: true };
  }
  if (item.kind === 'file') {
    // For multi-file items, base the icon on the FIRST file. A small "+N"
    // badge appears over the icon to signal "this item is a set."
    const files = Array.isArray(item.files) && item.files.length
      ? item.files
      : [{ storedPath: item.value, mime: item.mime }];
    const first = files[0] || {};
    const extra = files.length > 1 ? files.length - 1 : 0;
    const badge = extra ? `<span class="file-count-badge">+${extra}</span>` : '';
    const isStack = files.length > 1;
    if ((first.mime || '').startsWith('image/') && first.storedPath) {
      const safe = first.storedPath.replace(/"/g, '%22');
      return { html: `<img class="file-thumb" src="file://${safe}" alt="" />${badge}`, isThumb: true, isStack };
    }
    return { html: fileGlyph(first.mime) + badge, isFile: true, isStack };
  }
  return { html: (KINDS[item.kind] || KINDS.text).icon, isChain: false };
}

const KINDS = {
  url:             { icon: ICONS.url,          name: 'URL',     labelPlaceholder: 'Restash homepage',   valuePlaceholder: 'https://…',                  tagLabel: 'Tag',   tagPlaceholder: '' },
  cryptoAddress:   { icon: ICONS.cryptoWallet, name: 'Crypto',  labelPlaceholder: 'My ETH wallet',       valuePlaceholder: '0x… or bc1… or …',           tagLabel: 'Chain', tagPlaceholder: '' },
  physicalAddress: { icon: ICONS.pin,          name: 'Address', labelPlaceholder: 'Home',                valuePlaceholder: '123 Main St, City, ZIP',     tagLabel: 'Tag',   tagPlaceholder: '' },
  text:            { icon: ICONS.textAa,       name: 'Text',    labelPlaceholder: 'Email signature',     valuePlaceholder: '',                           tagLabel: 'Tag',   tagPlaceholder: '' },
  command:         { icon: ICONS.command,      name: 'Command', labelPlaceholder: 'Deploy to prod',      valuePlaceholder: 'git push origin main',       tagLabel: 'Shell', tagPlaceholder: '' },
  contact:         { icon: ICONS.contact,      name: 'Contact', labelPlaceholder: 'Alice Martin',        valuePlaceholder: '',                           tagLabel: 'Tag',   tagPlaceholder: '' },
  file:            { icon: ICONS.file,         name: 'File',    labelPlaceholder: 'Brand kit / Resume',  valuePlaceholder: '',                           tagLabel: 'Tag',   tagPlaceholder: '' },
  agent:           { icon: ICONS.agent,        name: 'Agent',   labelPlaceholder: 'Strategist persona',  valuePlaceholder: '# Role\nYou are a…',          tagLabel: 'Tag',   tagPlaceholder: '' },
  environment:     { icon: ICONS.environment,  name: 'Environment', labelPlaceholder: 'Morning setup',   valuePlaceholder: '',                           tagLabel: 'Tag',   tagPlaceholder: '' },
};

// ---------- agent templates ----------
// Curated, on-demand persona prompts. Pasting an Agent item dumps this raw
// markdown into whatever AI tool is focused (Claude, ChatGPT, Cursor…) so the
// model is instantly framed with the right point of view. Users can pick a
// starter here, then tweak it, or write their own from scratch.
const AGENT_TEMPLATES = [
  {
    name: 'Researcher',
    label: 'Deep Researcher',
    body: `# Role: Deep Researcher

You are a rigorous research analyst. Your job is to investigate the question below thoroughly and report what is actually known — not what sounds good.

## Operating principles
- Separate established fact, reasonable inference, and speculation. Label each.
- Cite the basis for every non-obvious claim. If you can't, say so.
- Surface the strongest counter-evidence to your own conclusion.
- Note what you'd need to know to be more confident.

## Output format
1. **Bottom line** — 2-3 sentences.
2. **Key findings** — bulleted, each tagged [fact] / [inference] / [unknown].
3. **Open questions** — what remains uncertain and why it matters.

## Task
`,
  },
  {
    name: 'Strategist',
    label: 'Strategist',
    body: `# Role: Strategist

You think in leverage, trade-offs, and second-order effects. You are not here to cheerlead — you are here to find the move that actually changes the outcome.

## Operating principles
- Start from the goal and the constraints, not the tactics.
- For every option, name the cost, the risk, and what has to be true for it to work.
- Prefer reversible bets early; concentrate resources once the path is clear.
- Call out the option no one wants to say out loud.

## Output format
1. **The real problem** — restated in one sentence.
2. **Options** — 2-4, each with upside / cost / key assumption.
3. **Recommendation** — pick one, and say what would change your mind.

## Task
`,
  },
  {
    name: 'CEO',
    label: 'CEO Advisor',
    body: `# Role: CEO Advisor

You think like a founder-CEO accountable for the whole company: growth, runway, team, and risk. You optimize for the durable outcome, not the comfortable answer.

## Operating principles
- Tie every decision to growth, cash, or risk — if it touches none, deprioritize it.
- Be decisive. Give a clear call, then the reasoning.
- Protect focus: name what to STOP doing, not just what to start.
- Think in 90-day and 3-year horizons at the same time.

## Output format
1. **The call** — what you would decide today.
2. **Why** — the reasoning, in plain terms.
3. **Risks & stop-doing** — what could break this, and what to cut.

## Task
`,
  },
  {
    name: 'Critic',
    label: 'Red-Team Critic',
    body: `# Role: Red-Team Critic

Your job is to find what's wrong before reality does. You are sharp, specific, and fair — you attack the idea, never the person.

## Operating principles
- Assume the plan will be executed by tired people under pressure.
- Find the single failure that does the most damage, and start there.
- Distinguish fatal flaws from fixable ones.
- For every weakness, propose the smallest change that closes it.

## Output format
1. **Fatal risks** — would sink this; must be fixed.
2. **Weak points** — would hurt; should be fixed.
3. **Steelman** — the strongest version of this idea, if salvageable.

## Task
`,
  },
  {
    name: 'Engineer',
    label: 'Staff Engineer',
    body: `# Role: Staff Engineer

You are a pragmatic senior engineer. You value correctness, simplicity, and the next person who has to read this code.

## Operating principles
- Solve the actual problem; resist gold-plating.
- Name the trade-offs of each approach — performance, complexity, maintenance.
- Call out edge cases, failure modes, and what isn't covered.
- Prefer boring, well-understood solutions over clever ones.

## Output format
1. **Approach** — recommended design, briefly justified.
2. **Implementation notes** — key steps, gotchas, edge cases.
3. **What I'd test** — the cases that would actually catch bugs.

## Task
`,
  },
  {
    name: 'Editor',
    label: 'Sharp Editor',
    body: `# Role: Sharp Editor

You make writing clearer, tighter, and more honest. You cut filler without cutting meaning.

## Operating principles
- Lead with the point. Move the most important sentence first.
- Delete words that don't earn their place.
- Replace vague claims with concrete ones; flag claims that need proof.
- Preserve the author's voice — sharpen it, don't overwrite it.

## Output format
1. **Revised version** — the improved text.
2. **What changed** — the 3-5 most important edits and why.
3. **Still soft** — anything vague or unsupported the author should address.

## Task
`,
  },
  {
    name: 'Coach',
    label: 'Decision Coach',
    body: `# Role: Decision Coach

You help me think clearly under pressure. You ask before you advise, and you separate the decision from the emotion around it.

## Operating principles
- Clarify what I'm actually deciding and by when.
- Surface my unstated assumptions and fears.
- Reframe the choice in terms of values and trade-offs, not just outcomes.
- End with one concrete next step I can take today.

## Output format
1. **Clarifying questions** — 2-3, if anything is unclear.
2. **The decision, reframed** — what's really at stake.
3. **Next step** — the smallest action that creates momentum.

## Task
`,
  },
  {
    name: 'Analyst',
    label: 'Data Analyst',
    body: `# Role: Data Analyst

You turn numbers into decisions. You are skeptical of tidy stories and careful about what the data can and cannot support.

## Operating principles
- State the question precisely before touching the data.
- Check sample size, time window, and confounders before drawing conclusions.
- Quantify uncertainty — give ranges, not false precision.
- Translate findings into a recommendation a non-analyst can act on.

## Output format
1. **Question** — what we're really measuring.
2. **Findings** — what the data shows, with caveats.
3. **So what** — the decision this should inform.

## Task
`,
  },
];

const state = {
  items: [],
  search: '',
  editing: null,
  selectedId: null,
  draggingId: null,
  hotkey: 'Control+Command+S',
  mode: 'list', // 'list' (tray dropdown) | 'grid' (cursor numpad)
  // One shared active-stash index — the menu dropdown and the cursor numpad
  // are two views of the SAME stash, so selecting a stash in one carries to
  // the other.
  stashIdx: 0,
  theme: 'light',
  // Clipboard memory (RES-11)
  clipHistory: [],          // auto-captured recent copies, newest-first
  clipHistoryMax: 3,        // 0 = Off
  // Cursor-modal page cycle (RES-33). The numpad popup is now a unified cycle:
  // page 0 = Recent (a vertical LIST of raw recent copies, replacing the old
  // "All" grid), pages 1+ = saved stashes as 3×3 numpad grids. The cursor
  // modal tracks its own page index so the menu-dropdown chip bar (which still
  // shows "All") is left untouched.
  gridPageIdx: 0,
  // Recents are FROZEN per summon: the 1–9 mapping is captured when the modal
  // opens and stays stable while it's open; it re-ranks on the next open.
  recentSnapshot: [],
  // Keyboard selection within the Recent list (page 0 only).
  recentSelIdx: 0,
};

let accessGranted = false;

// ---------- hotkey helpers ----------
// Electron accelerator format ↔ human-readable Mac symbols.
const MOD_SYMBOL = { Command: '⌘', Cmd: '⌘', Control: '⌃', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧' };
const KEY_SYMBOL = {
  ' ': 'Space', Space: 'Space', Enter: '↵', Tab: '⇥', Backspace: '⌫', Delete: '⌦',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc',
};

function prettyHotkey(accel) {
  if (!accel) return '—';
  return accel.split('+').map((tok) => MOD_SYMBOL[tok] || tok.toUpperCase()).join('');
}

// Combos that *would* register but would steal common app-level shortcuts globally.
// We allow them but require an extra confirmation.
const SOFT_WARN_COMBOS = new Set([
  'Command+S', 'Command+C', 'Command+V', 'Command+X', 'Command+Z', 'Command+A',
  'Command+W', 'Command+T', 'Command+N', 'Command+F', 'Command+P', 'Command+Q',
  'Command+R', 'Command+O', 'Command+E',
]);

function isModifier(key) {
  return ['Meta', 'Control', 'Alt', 'Shift', 'Command', 'CommandOrControl'].includes(key);
}

function eventToAccelerator(e) {
  const parts = [];
  if (e.metaKey) parts.push('Command');
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  let key = e.key;
  if (isModifier(key)) return null;
  if (key === ' ') key = 'Space';
  if (key.length === 1) key = key.toUpperCase();
  else if (key.startsWith('Arrow')) key = key.replace('Arrow', '');
  // Function keys, "Enter", "Tab", "Escape", etc. arrive as-is which Electron accepts.

  parts.push(key);
  return parts.join('+');
}

function validateAccelerator(accel) {
  if (!accel) return { ok: false, message: 'No keys captured.' };
  const tokens = accel.split('+');
  const mods = tokens.filter((t) => MOD_SYMBOL[t]);
  const keys = tokens.filter((t) => !MOD_SYMBOL[t]);
  if (mods.length === 0) return { ok: false, message: 'Add a modifier key (⌘, ⌃, ⌥, or ⇧).' };
  if (keys.length !== 1) return { ok: false, message: 'Pick exactly one non-modifier key.' };
  // Don't allow modifier-only or pure Shift+letter (too easy to fire by accident).
  if (mods.length === 1 && mods[0] === 'Shift') {
    return { ok: false, message: 'Shift alone isn’t a strong enough modifier.' };
  }
  return { ok: true };
}

function isSoftWarn(accel) {
  return SOFT_WARN_COMBOS.has(accel);
}

const $ = (id) => document.getElementById(id);
const listEl = $('list');
const gridEl = $('grid');
const emptyEl = $('empty');

// Hover-only highlight: clear the selection (and peek strip) when the mouse
// leaves the list entirely. Keyboard arrow keys can still set a selection.
listEl.addEventListener('mouseleave', () => {
  if (state.selectedId !== null) {
    state.selectedId = null;
    updateSelectionHighlight();
  }
});
const searchEl = $('search');
const editorBackdrop = $('editorBackdrop');
const qrBackdrop = $('qrBackdrop');
const toastEl = $('toast');
const hintbarList = $('hintbarList');
const hintbarGrid = $('hintbarGrid');
const dropdownFooter = $('dropdownFooter');

function uid() {
  return 'i_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Plain recency sort — used where no stash context applies (migrations, etc.).
function sortItems(items) {
  return [...items].sort((a, b) => {
    const av = a.lastUsedAt || a.createdAt || 0;
    const bv = b.lastUsedAt || b.createdAt || 0;
    return bv - av;
  });
}

// ---------- per-stash pinning ----------
// Pins are PER STASH. `item.pins` is a map { [stashId]: order }: a key's
// presence means the item is pinned in that stash; the number orders it on
// that stash's 3×3 numpad. "All" is itself a stash and uses the id 'all'.
// The same item can be pinned in several stashes, each with its own slot.
function isPinned(item, stashId) {
  return !!item && !!item.pins && Object.prototype.hasOwnProperty.call(item.pins, stashId);
}
function pinOrder(item, stashId) {
  const v = (item && item.pins) ? item.pins[stashId] : undefined;
  return (typeof v === 'number') ? v : 1e9;
}
function pinnedInStash(stashId) {
  return state.items
    .filter((i) => isPinned(i, stashId))
    .sort((a, b) => pinOrder(a, stashId) - pinOrder(b, stashId));
}
function nextPinOrder(stashId) {
  const used = state.items.filter((i) => isPinned(i, stashId)).map((i) => i.pins[stashId]);
  return used.length ? Math.max(...used) + 1 : 0;
}

// Sort a pool for display within a stash: items pinned in THAT stash come
// first (in pin order), the rest follow by recency.
function sortItemsForStash(items, stashId) {
  return [...items].sort((a, b) => {
    const ap = isPinned(a, stashId), bp = isPinned(b, stashId);
    if (ap !== bp) return ap ? -1 : 1;
    if (ap && bp) return pinOrder(a, stashId) - pinOrder(b, stashId);
    const av = a.lastUsedAt || a.createdAt || 0;
    const bv = b.lastUsedAt || b.createdAt || 0;
    return bv - av;
  });
}

// ---------- Stashes (cursor numpad paging) ----------
//
// Stage A MVP: stashes are auto-derived from item kinds. The first ("All")
// shows top-9 pinned items (same as before); the rest each filter by a
// kind (Wallets / Links / Addresses / Snippets) and are only included when
// at least one matching item exists, so empty stashes never appear.
// Stage B will add user-created stashes persisted in settings.
function computeStashes() {
  // "All" is always first — top-9 pinned items, same as before stashes existed.
  const stashes = [{
    id: 'all', name: 'All',
    filter: () => true,
    pinnedOnly: true,
  }];
  // If the user has created any custom stashes, those drive the cycler.
  if (availableStashes && availableStashes.length) {
    for (const s of availableStashes) {
      stashes.push({
        id: s.id,
        name: s.name,
        filter: (it) => Array.isArray(it.stashIds) && it.stashIds.includes(s.id),
        pinnedOnly: false,
      });
    }
    return stashes;
  }
  // Otherwise, fall back to kind-derived stashes so the cycler still has
  // something useful to show.
  const has = (kind) => state.items.some((i) => i.kind === kind);
  if (has('cryptoAddress'))   stashes.push({ id: 'wallets',   name: 'Wallets',   filter: (i) => i.kind === 'cryptoAddress',   pinnedOnly: false });
  if (has('url'))             stashes.push({ id: 'links',     name: 'Links',     filter: (i) => i.kind === 'url',             pinnedOnly: false });
  if (has('physicalAddress')) stashes.push({ id: 'addresses', name: 'Addresses', filter: (i) => i.kind === 'physicalAddress', pinnedOnly: false });
  if (has('text'))            stashes.push({ id: 'snippets',  name: 'Snippets',  filter: (i) => i.kind === 'text',            pinnedOnly: false });
  if (has('agent'))           stashes.push({ id: 'agents',    name: 'Agents',    filter: (i) => i.kind === 'agent',           pinnedOnly: false });
  if (has('environment'))     stashes.push({ id: 'envs',      name: 'Environments', filter: (i) => i.kind === 'environment',   pinnedOnly: false });
  return stashes;
}

function itemsForStash(stash) {
  // The cursor numpad shows this stash's pinned items (up to 9), in pin order.
  // Members = items matching the stash filter; of those, the ones pinned IN
  // this stash (item.pins[stash.id]) fill slots 1..9. Single source of truth:
  // the menu-bar list and this numpad both read item.pins, so they can't drift.
  const members = state.items.filter(stash.filter);
  return members
    .filter((i) => isPinned(i, stash.id))
    .sort((a, b) => pinOrder(a, stash.id) - pinOrder(b, stash.id))
    .slice(0, 9);
}

// Move a pinned item before/after a target WITHIN one stash's pin order,
// then renumber that stash's pins 0..N-1.
function reorderPinned(draggedId, targetId, before, stashId) {
  const ordered = pinnedInStash(stashId);
  const dragged = ordered.find((i) => i.id === draggedId);
  const target = ordered.find((i) => i.id === targetId);
  if (!dragged || !target) return;

  // Remove dragged, then re-insert relative to target.
  const without = ordered.filter((i) => i.id !== draggedId);
  const targetIdx = without.findIndex((i) => i.id === targetId);
  const insertAt = before ? targetIdx : targetIdx + 1;
  without.splice(insertAt, 0, dragged);

  // Renumber this stash's pin order.
  without.forEach((i, idx) => { if (i.pins) i.pins[stashId] = idx; });
  persist();
  render();
}

function filtered() {
  // Apply the active stash filter first (selected via the list-mode chip bar
  // or cycled with ⌘⇧V). "All" stash matches everything; user stashes match
  // by stashIds; auto-derived stashes use their own filter.
  const stashes = listStashes();
  const activeIdx = clampStashIdx(state.stashIdx ?? 0, stashes.length);
  const active = stashes[activeIdx];
  let pool = state.items.filter(active.filter);

  const q = state.search.trim().toLowerCase();
  if (q) {
    pool = pool.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.value.toLowerCase().includes(q) ||
        (i.tag || '').toLowerCase().includes(q)
    );
  }
  return sortItemsForStash(pool, active.id);
}

// Stashes for the list-mode chip bar — same set as the grid pager.
function listStashes() {
  return computeStashes();
}
function clampStashIdx(idx, length) {
  if (!length) return 0;
  return ((idx % length) + length) % length;
}

// The stash currently in focus — drives which stash a pin/unpin acts on.
// List mode uses the chip bar selection; grid mode uses the active page.
function activeStashId() {
  if (state.mode === 'grid') {
    // Cursor modal: page 0 is Recent (raw clips — no stash context, so pin/unpin
    // actions fall back to "All"); pages 1+ are real stashes.
    const pages = gridPages();
    const page = pages[clampGridPageIdx()];
    return (page && !page.recent && page.id) ? page.id : 'all';
  }
  const stashes = listStashes();
  const idx = clampStashIdx(state.stashIdx ?? 0, stashes.length);
  return stashes[idx]?.id || 'all';
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  toastEl.style.animation = 'none';
  void toastEl.offsetWidth;
  toastEl.style.animation = '';
  setTimeout(() => toastEl.classList.add('hidden'), 1400);
}

// ---------- free-tier enforcement ----------
// Limits apply only once the trial is over (effective === 'free'). During the
// trial, effective === 'full' and nothing is capped.
function isFree() {
  return (state.entitlement && state.entitlement.effective) === 'free';
}

// Returns true if a NEW `kind` would exceed the free cap — and fires the
// upgrade nudge. Returns false when allowed. Existing over-limit data is never
// touched; this only blocks fresh additions.
function hitsFreeLimit(kind) {
  if (!isFree()) return false;
  const lim = (state.entitlement && state.entitlement.limits)
    || { items: 15, stashes: 1, pins: 9 };
  let count, cap;
  if (kind === 'items')        { count = state.items.length; cap = lim.items; }
  else if (kind === 'stashes') { count = availableStashes.length; cap = lim.stashes; }
  else if (kind === 'pins')    { count = pinnedInStash(activeStashId()).length; cap = lim.pins; }
  else return false;
  if (count < cap) return false;
  const noun = { items: 'Item', stashes: 'Stash', pins: 'Pin' }[kind];
  showLimitNudge(`${noun} limit reached (${count}/${cap})`);
  return true;
}

let _limitNudgeTimer = null;
function showLimitNudge(title) {
  const el = $('limitNudge');
  if (!el) return;
  const t = el.querySelector('.ln-title');
  if (t) t.textContent = title;
  el.classList.remove('hidden');
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(_limitNudgeTimer);
  _limitNudgeTimer = setTimeout(() => el.classList.add('hidden'), 5500);
}

async function persist() {
  await window.restash.saveItems(state.items);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ---------- theme ----------
function applyTheme(theme) {
  state.theme = theme === 'dark' ? 'dark' : 'light';
  document.body.classList.toggle('theme-dark', state.theme === 'dark');
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.textContent = state.theme === 'dark' ? '☀' : '☾';
    btn.title = state.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  }
}

async function toggleTheme() {
  const next = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { await window.restash.setTheme(next); } catch {}
}

// ---------- footer actions (list mode) ----------
async function handleUpdatesCheck() {
  try {
    const r = await window.restash.checkUpdates();
    if (r.status === 'up-to-date') toast(`You're on the latest (v${r.version})`);
    else toast(`Update available: ${r.version}`);
  } catch {
    toast('Could not check updates');
  }
}

function handleBillingOpen() {
  openBilling();
}

// ---------- billing ----------
// Lemon Squeezy checkout URLs — REPLACE with the real product links once the
// store is set up. Each opens in the user's browser.
const CHECKOUT_URLS = {
  monthly:  'https://restash.lemonsqueezy.com/buy/REPLACE-MONTHLY',
  yearly:   'https://restash.lemonsqueezy.com/buy/REPLACE-YEARLY',
  lifetime: 'https://restash.lemonsqueezy.com/buy/REPLACE-LIFETIME',
  // Discounted one-time-offer checkout links (separate LS products / discount codes).
  otoLifetime: 'https://restash.lemonsqueezy.com/buy/REPLACE-OTO-LIFETIME',
  otoYearly:   'https://restash.lemonsqueezy.com/buy/REPLACE-OTO-YEARLY',
};
const SUPPORT_EMAIL = 'support@restash.app'; // REPLACE with real support inbox

// Plan currently highlighted in the Free-state segmented picker.
let billingSelectedPlan = 'yearly';
const PLAN_INFO = {
  monthly:  { price: '$9.99', unit: '/mo', sub: 'Billed monthly' },
  yearly:   { price: '$39',   unit: '/yr', sub: '$3.25/mo · billed yearly · save 67%' },
  lifetime: { price: '$99',   unit: '',    sub: 'One payment · yours forever' },
};
const CLOCK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`;

const billingBackdrop = $('billingBackdrop');

function openBilling() {
  renderBilling();
  window.restash.setBillingWindow?.(true);   // grow the popover so it fits, no scroll
  billingBackdrop.classList.remove('hidden');
}
function closeBilling() {
  billingBackdrop.classList.add('hidden');
  window.restash.setBillingWindow?.(false);  // restore list height
  focusSearch();
}

// ---------- one-time offer (Option B) ----------
const otoBackdrop = $('otoBackdrop');
// Which discounted deal the CTA will buy. 'lifetime' is pre-selected.
let otoSelectedDeal = 'lifetime';
const OTO_DEALS = {
  lifetime: { name: 'Lifetime', sub: 'Pay once · yours forever', now: '$50', was: '$99', url: 'otoLifetime', badge: 'BEST VALUE' },
  yearly:   { name: '1 Year',   sub: '12 months of Pro',        now: '$30', was: '$39', url: 'otoYearly' },
};

function renderOTO() {
  const card = $('otoCard');
  if (!card) return;
  const dealRow = (id) => {
    const d = OTO_DEALS[id];
    const on = id === otoSelectedDeal;
    const badge = d.badge ? `<span class="oto-badge">${d.badge}</span>` : '';
    return `
      <button type="button" class="oto-deal${on ? ' best' : ''}" data-oto-deal="${id}">
        <div class="oto-deal-main">
          <div class="oto-deal-name">${d.name}${badge}</div>
          <div class="oto-deal-sub">${d.sub}</div>
        </div>
        <div class="oto-deal-price">
          <div class="oto-deal-now">${d.now}</div>
          <div class="oto-deal-was">${d.was}</div>
        </div>
      </button>`;
  };
  const sel = OTO_DEALS[otoSelectedDeal];
  card.innerHTML = `
    <div class="oto-eyebrow">★ One-time offer</div>
    <div class="oto-title">A deal that won't<br>come back</div>
    ${dealRow('lifetime')}
    ${dealRow('yearly')}
    <button type="button" class="oto-cta" data-oto-cta>Claim ${sel.name} — ${sel.now}</button>
    <button type="button" class="oto-ghost" data-oto-dismiss>No thanks</button>
    <div class="oto-footnote">One-time offer · won't appear again</div>
  `;
}

function openOTO() {
  renderOTO();
  window.restash.setBillingWindow?.(true); // OTO needs the taller window too
  otoBackdrop.classList.remove('hidden');
}
function closeOTO() {
  otoBackdrop.classList.add('hidden');
  window.restash.setBillingWindow?.(false);
  focusSearch();
}

// Fire the OTO at most once, at a high-intent moment: trial winding down
// (≤5 days left) and not yet shown. Persisted via settings.otoShown so it
// survives restarts.
async function maybeShowOTO() {
  const ent = state.entitlement || {};
  if (state.otoShown) return;
  const trialEnding = ent.trialActive && (ent.trialDaysLeft || 0) <= 5;
  if (!trialEnding) return;
  state.otoShown = true;
  await window.restash.markOTOShown?.();
  openOTO();
}

// Build the billing body for the current tier. `state.tier` is one of
// 'free' | 'monthly' | 'yearly' | 'lifetime'; `state.billing.renewsAt` is an
// epoch-ms timestamp for subscribers (drives the time-left bar).
// Small footer shown on paid billing views: masked license key + a button to
// release this device's activation.
function licenseFooterHTML(lic) {
  if (!lic) return '';
  return `
    <div class="license-foot">
      <span class="lf-key">Licensed · ${escapeHtml(lic.keyMasked || '')}</span>
      <button class="lf-deact" data-license-deactivate>Deactivate this device</button>
    </div>`;
}

function renderBilling() {
  const body = $('billingBody');
  const ent = state.entitlement || {};
  const tier = ent.tier || 'free';
  const lic = ent.license || null;

  if (tier === 'complete') {
    body.innerHTML = `
      <div class="billing-lifetime">
        <div class="lt-mark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="11" width="16" height="7" rx="1.5"/><path d="M6 8h12"/><path d="M8 5h8"/>
          </svg>
        </div>
        <div class="tier-badge"><span class="spark">✦</span> Complete access</div>
        <div class="billing-note">You have complete access — every feature unlocked, free. No trial, no limits, no expiry.</div>
      </div>
    `;
    return;
  }

  if (tier === 'lifetime') {
    body.innerHTML = `
      <div class="billing-lifetime">
        <div class="lt-mark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="11" width="16" height="7" rx="1.5"/><path d="M6 8h12"/><path d="M8 5h8"/>
          </svg>
        </div>
        <div class="tier-badge"><span class="spark">✦</span> Lifetime</div>
        <div class="billing-note">You own Restash forever. No renewals, no expiry — every future update included.</div>
      </div>
      ${licenseFooterHTML(lic)}
    `;
    return;
  }

  if (tier === 'monthly' || tier === 'yearly') {
    // Lemon Squeezy reports the subscription's next-renewal date as the
    // license key's expires_at.
    const renewsAt = (lic && lic.expiresAt) ? Date.parse(lic.expiresAt) : 0;
    const periodMs = tier === 'yearly' ? 365 * 864e5 : 30 * 864e5;
    let barHTML = '';
    if (renewsAt) {
      const msLeft = Math.max(0, renewsAt - Date.now());
      const daysLeft = Math.ceil(msLeft / 864e5);
      const pct = Math.max(2, Math.min(100, Math.round((msLeft / periodMs) * 100)));
      const renewDate = new Date(renewsAt).toLocaleDateString(undefined,
        { month: 'short', day: 'numeric', year: 'numeric' });
      barHTML = `
        <div class="renewal">
          <div class="renewal-line">
            <span>Renews ${renewDate}</span>
            <span class="left">${daysLeft} day${daysLeft === 1 ? '' : 's'} left</span>
          </div>
          <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
        </div>`;
    }
    const priceLabel = tier === 'yearly' ? '$39 / year' : '$9.99 / month';
    const upsell = tier === 'monthly'
      ? `<button class="b-btn" data-billing-upsell="yearly">Switch to Yearly · save 67%</button>`
      : `<button class="b-btn" data-billing-upsell="lifetime">Upgrade to Lifetime · $99</button>`;
    body.innerHTML = `
      <div class="tier-hero">
        <div class="tier-badge">${tier === 'yearly' ? 'Yearly' : 'Monthly'}</div>
        <div class="tier-sub">${priceLabel}</div>
      </div>
      ${barHTML}
      <button class="b-btn" data-billing-manage>Manage subscription</button>
      ${upsell}
      ${licenseFooterHTML(lic)}
    `;
    return;
  }

  // Free — segmented picker layout. Trial banner + Free→Pro comparison +
  // a Monthly/Yearly/Lifetime segment that shows one plan + one CTA.
  const banner = ent.trialActive
    ? `<div class="trial">
         <div class="ico">${CLOCK_SVG}</div>
         <div class="t-main">
           <div class="t-title">Free trial</div>
           <div class="t-sub">Full access · then 1 stash / 15 items</div>
         </div>
         <div class="t-days">${ent.trialDaysLeft || 0}<small>${(ent.trialDaysLeft || 0) === 1 ? 'day left' : 'days left'}</small></div>
       </div>`
    : `<div class="trial">
         <div class="ico">${CLOCK_SVG}</div>
         <div class="t-main">
           <div class="t-title">Free plan</div>
           <div class="t-sub">Trial ended · limited to 1 stash / 15 items</div>
         </div>
       </div>`;

  const sel = billingSelectedPlan;
  const plan = PLAN_INFO[sel];
  body.innerHTML = `
    ${banner}
    <div class="cmp">
      <div class="cmp-h">Free → Pro</div>
      <div class="cmp-row"><span class="cmp-label">Stashes</span><span class="cmp-vals"><span class="cmp-free">1</span><span class="cmp-arrow">→</span><span class="cmp-pro">Unlimited</span></span></div>
      <div class="cmp-row"><span class="cmp-label">Saved items</span><span class="cmp-vals"><span class="cmp-free">15</span><span class="cmp-arrow">→</span><span class="cmp-pro">Unlimited</span></span></div>
      <div class="cmp-row"><span class="cmp-label">Pinned slots</span><span class="cmp-vals"><span class="cmp-free">9</span><span class="cmp-arrow">→</span><span class="cmp-pro">Unlimited</span></span></div>
      <div class="cmp-row"><span class="cmp-label">Max file size</span><span class="cmp-vals"><span class="cmp-free">100 MB</span><span class="cmp-arrow">→</span><span class="cmp-pro">5 GB</span></span></div>
      <div class="cmp-row"><span class="cmp-label">Support</span><span class="cmp-vals"><span class="cmp-free">Standard</span><span class="cmp-arrow">→</span><span class="cmp-pro">Priority</span></span></div>
    </div>
    <div class="section-label">Choose a plan</div>
    <div class="seg">
      <button data-billing-seg="monthly"${sel === 'monthly' ? ' class="on"' : ''}>Monthly</button>
      <button data-billing-seg="yearly"${sel === 'yearly' ? ' class="on"' : ''}>Yearly</button>
      <button data-billing-seg="lifetime"${sel === 'lifetime' ? ' class="on"' : ''}>Lifetime</button>
    </div>
    <div class="seg-detail">
      <div class="seg-price">${plan.price}<small>${plan.unit}</small></div>
      <div class="seg-sub">${plan.sub}</div>
    </div>
    <button class="big-cta" data-billing-cta>Upgrade to ${sel[0].toUpperCase()}${sel.slice(1)}</button>
    <div class="activate">
      <button type="button" class="activate-toggle" data-activate-toggle>Already bought Restash? <b>Enter your license key</b></button>
      <div class="activate-box hidden" id="activateBox">
        <input id="licenseKeyInput" type="text" placeholder="License key" autocomplete="off" spellcheck="false" />
        <button type="button" class="b-btn primary" data-activate-go>Activate</button>
      </div>
      <div class="activate-msg hidden" id="activateMsg"></div>
    </div>
  `;
}

// Run a license activation from the billing modal: call Lemon Squeezy, then
// refresh the entitlement everywhere on success.
async function activateLicenseFromBilling() {
  const input = $('licenseKeyInput');
  const msg = $('activateMsg');
  const btn = document.querySelector('[data-activate-go]');
  if (!input) return;
  const key = input.value.trim();
  if (!key) { input.focus(); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Activating…'; }
  if (msg) msg.classList.add('hidden');
  const res = await window.restash.activateLicense(key);
  if (res && res.ok) {
    state.entitlement = res.entitlement;
    state.tier = res.entitlement.tier;
    renderBilling();        // flips to the paid view
    render();               // limits lifted — refresh the list
    toast('Restash unlocked — thank you!');
  } else {
    if (btn) { btn.disabled = false; btn.textContent = 'Activate'; }
    if (msg) {
      msg.textContent = (res && res.error) || 'Activation failed.';
      msg.classList.remove('hidden');
    }
  }
}

async function deactivateLicenseFromBilling() {
  const res = await window.restash.deactivateLicense();
  if (res && res.ok) {
    state.entitlement = res.entitlement;
    state.tier = res.entitlement.tier;
    renderBilling();
    render();
    toast('License released on this device');
  }
}


// ---------- mode switching ----------
function applyMode(mode) {
  state.mode = mode;
  document.body.classList.toggle('mode-grid', mode === 'grid');
  document.body.classList.toggle('mode-list', mode === 'list');
  document.body.classList.toggle('mode-qr',   mode === 'qr');
  // grid + qr modes are takeovers: hide the dropdown footer + list hintbar.
  const isList = mode === 'list';
  hintbarList?.classList.toggle('hidden', !isList);
  hintbarGrid?.classList.toggle('hidden', mode !== 'grid');
  dropdownFooter?.classList.toggle('hidden', !isList);
  // Toggle the QR panel + the regular list/stash containers.
  const qrPanel = document.getElementById('qrPanel');
  if (qrPanel) qrPanel.classList.toggle('hidden', mode !== 'qr');
  render();
}

// ---------- window resizing ----------
// Resize bounds — must match MENU_BOUNDS / GRID_BOUNDS in main.js.
const RESIZE_BOUNDS = {
  list: { minW: 280, maxW: 580, minH: 360, maxH: 780 },
  grid: { minW: 200, maxW: 380, minH: 280, maxH: 520 },
};
// Curated size presets surfaced in Settings. Free-drag covers everything else.
const SIZE_PRESETS = {
  list: [
    { name: 'Standard', width: 300, height: 428 },
    { name: 'Tall',     width: 320, height: 620 },
    { name: 'Wide',     width: 460, height: 520 },
  ],
  grid: [
    { name: 'Standard', width: 240, height: 332 },
    { name: 'Large',    width: 300, height: 412 },
    { name: 'Huge',     width: 360, height: 492 },
  ],
};

function clampCardSize(w, h, mode) {
  const b = RESIZE_BOUNDS[mode] || RESIZE_BOUNDS.list;
  return {
    width:  Math.max(b.minW, Math.min(b.maxW, Math.round(w))),
    height: Math.max(b.minH, Math.min(b.maxH, Math.round(h))),
  };
}

// Wire the three drag handles (left/right edge, bottom edge, corner). The
// window physically resizes as you drag; the final size is committed (saved)
// on release. Anchor: list grows down-and-left, grid grows down-and-right.
function wireResizeHandles() {
  const shell = document.querySelector('.shell');
  if (!shell) return;
  const handles = [
    { el: $('rzEdgeX'),  axis: 'x'  },
    { el: $('rzEdgeY'),  axis: 'y'  },
    { el: $('rzCorner'), axis: 'xy' },
  ];
  let drag = null;
  for (const { el, axis } of handles) {
    if (!el) continue;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      drag = {
        axis, mode: state.mode,
        sx: e.screenX, sy: e.screenY,
        w: shell.offsetWidth, h: shell.offsetHeight,
      };
      el.setPointerCapture(e.pointerId);
      document.body.classList.add('resizing');
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.screenX - drag.sx;
      const dy = e.screenY - drag.sy;
      let w = drag.w, h = drag.h;
      if (axis === 'x' || axis === 'xy') {
        // list anchors top-right → dragging the LEFT edge outward (dx<0) grows;
        // grid anchors top-left → dragging the RIGHT edge outward (dx>0) grows.
        w = drag.mode === 'grid' ? drag.w + dx : drag.w - dx;
      }
      if (axis === 'y' || axis === 'xy') h = drag.h + dy;
      const c = clampCardSize(w, h, drag.mode === 'grid' ? 'grid' : 'list');
      window.restash.resizeWindow({ mode: drag.mode, width: c.width, height: c.height, commit: false });
    });
    const end = () => {
      if (!drag) return;
      const mode = drag.mode;
      drag = null;
      document.body.classList.remove('resizing');
      // Commit the final size (shell now reflects the resized window).
      const c = clampCardSize(shell.offsetWidth, shell.offsetHeight, mode === 'grid' ? 'grid' : 'list');
      if (mode === 'grid') state.gridSize = c; else state.menuSize = c;
      window.restash.resizeWindow({ mode, width: c.width, height: c.height, commit: true });
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
}

// Toggle body.modal-open whenever any .backdrop opens/closes, so the resize
// handles disappear while a modal is up. One observer, no per-modal wiring.
function watchModals() {
  const backdrops = Array.from(document.querySelectorAll('.backdrop'));
  if (!backdrops.length) return;
  const sync = () => {
    const open = backdrops.some((b) => !b.classList.contains('hidden'));
    document.body.classList.toggle('modal-open', open);
  };
  const mo = new MutationObserver(sync);
  backdrops.forEach((b) => mo.observe(b, { attributes: true, attributeFilter: ['class'] }));
  sync();
}

// Render the Settings size-preset chips for one modal.
function renderSizePresets(mode) {
  const host = $(mode === 'grid' ? 'gridSizePresets' : 'menuSizePresets');
  if (!host) return;
  // No saved size yet → the app is at its default, which equals the first
  // ("Standard") preset, so highlight that.
  const current = (mode === 'grid' ? state.gridSize : state.menuSize)
    || SIZE_PRESETS[mode][0];
  host.innerHTML = SIZE_PRESETS[mode].map((p) => {
    const active = current && current.width === p.width && current.height === p.height;
    return `<button type="button" class="size-preset${active ? ' active' : ''}"
      data-mode="${mode}" data-w="${p.width}" data-h="${p.height}">${p.name}
      <span class="dim">${p.width}×${p.height}</span></button>`;
  }).join('');
  for (const btn of host.querySelectorAll('.size-preset')) {
    btn.addEventListener('click', () => {
      const w = Number(btn.dataset.w), h = Number(btn.dataset.h);
      const c = clampCardSize(w, h, mode);
      if (mode === 'grid') state.gridSize = c; else state.menuSize = c;
      window.restash.resizeWindow({ mode, width: c.width, height: c.height, commit: true });
      renderSizePresets(mode); // refresh active highlight
    });
  }
}

// ---------- rendering ----------
function render() {
  if (state.mode === 'qr')   return renderQRPanel();
  if (state.mode === 'grid') return renderGrid();
  return renderList();
}

// ---------- QR preview ----------
// SVG-only icons used in the preview's hero row, by content type.
const QR_HERO_ICONS = {
  url: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.6 14.6a4 4 0 0 0 5.66 0l3.18-3.18a4 4 0 0 0-5.66-5.66l-1.59 1.59 1.41 1.41 1.59-1.59a2 2 0 0 1 2.83 2.83l-3.18 3.18a2 2 0 0 1-2.83 0 1 1 0 0 0-1.41 1.41z"/><path d="M13.4 9.4a4 4 0 0 0-5.66 0L4.56 12.58a4 4 0 0 0 5.66 5.66l1.59-1.59-1.41-1.41-1.59 1.59a2 2 0 0 1-2.83-2.83l3.18-3.18a2 2 0 0 1 2.83 0 1 1 0 0 0 1.41-1.41z"/></svg>`,
  wifi: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9.5a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8 15.5a5 5 0 0 1 8 0"/><circle cx="12" cy="19" r="1.2" fill="currentColor"/></svg>`,
  text: `<svg viewBox="0 0 24 24" fill="currentColor"><text x="3" y="17" font-family="Inter" font-weight="700" font-size="15">A</text><text x="13" y="19" font-family="Inter" font-weight="400" font-size="12">a</text></svg>`,
  vcard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="3"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>`,
  warn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l10 17H2z"/><path d="M12 10v5"/><circle cx="12" cy="18" r=".8" fill="currentColor"/></svg>`,
};

function renderQRPanel() {
  const panel = document.getElementById('qrPanel');
  if (!panel) return;
  const r = state.qrResult;

  // No result yet (shouldn't normally happen — main pushes a result before
  // switching to qr mode). Render an empty waiting state.
  if (!r) {
    panel.innerHTML = `<div class="qr-empty">No QR data.</div>`;
    return;
  }

  // Error / non-success case (no QR found, decode failed, etc.)
  if (!r.ok) {
    panel.innerHTML = `
      <div class="qr-head">
        <div class="qr-mini-icon">${QR_HERO_ICONS.warn}</div>
        <div class="qr-head-text">
          <div class="qr-title">No QR decoded</div>
          <div class="qr-meta">${escapeHtml(r.reason || '')}</div>
        </div>
      </div>
      <div class="qr-body">
        <p class="qr-error-msg">${escapeHtml(r.message || "Couldn't decode the QR.")}</p>
      </div>
      <div class="qr-actions">
        <button class="qr-btn primary" data-qr-act="retry">Try again</button>
        <button class="qr-btn" data-qr-act="dismiss">Close</button>
      </div>
    `;
    panel.querySelector('[data-qr-act="retry"]')?.addEventListener('click', () => window.restash.qrCaptureAndDecode());
    panel.querySelector('[data-qr-act="dismiss"]')?.addEventListener('click', () => window.restash.hideWindow?.());
    return;
  }

  panel.innerHTML = qrPanelHTML(r);
  panel.querySelectorAll('[data-qr-act]').forEach((btn) => {
    btn.addEventListener('click', () => handleQRAction(btn.dataset.qrAct, r));
  });

  // For URL results, fetch site metadata + safety heuristics in the background
  // and re-render the panel when they arrive. The initial render already shows
  // the loading skeleton.
  if (r.type === 'url' && !r._metaFetched) {
    window.restash.qrFetchSiteMeta?.(r.value).then((res) => {
      if (state.qrResult !== r) return; // user already moved on
      r._metaFetched = true;
      r._meta  = res?.meta  || null;
      r._flags = res?.flags || [];
      panel.innerHTML = qrPanelHTML(r);
      panel.querySelectorAll('[data-qr-act]').forEach((btn) => {
        btn.addEventListener('click', () => handleQRAction(btn.dataset.qrAct, r));
      });
    }).catch(() => {});
  }
}

// Renders the site-preview card (favicon + title + description + optional og:image)
// for URL QRs. Three states: loading (initial), loaded with image, loaded without.
function siteCardHTML(r) {
  const m = r._meta;
  const loading = !r._metaFetched;
  const faviconImg = m?.favicon
    ? `<img src="${escapeAttr(m.favicon)}" alt="" onerror="this.style.display='none'" />`
    : '';
  const heroImg = m?.image
    ? `<img class="hero-img" src="${escapeAttr(m.image)}" alt="" onerror="this.style.display='none'" />`
    : '';

  return `
    <div class="site-preview${loading ? ' loading' : ''}">
      ${heroImg}
      <div class="site-preview-body">
        <div class="site-favicon">${faviconImg}</div>
        <div class="site-meta">
          <div class="site-title">${loading ? '' : escapeHtml(m?.title || r.host || 'Untitled')}</div>
          <div class="site-desc">${loading ? '' : escapeHtml(m?.description || '')}</div>
          <div class="site-host">${escapeHtml(r.host || '')}</div>
        </div>
      </div>
    </div>
  `;
}

// Pill in the header showing safety status. "Safe" if no flags, "Check" if any.
function safetyBadgeHTML(r) {
  if (r.type !== 'url') return '';
  if (!r._metaFetched) return ''; // wait for fetch + heuristics
  const flags = r._flags || [];
  if (flags.length === 0) {
    return `<span class="qr-safety safe" title="No safety flags">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4.5 4.5L19 7"/></svg>
      Safe
    </span>`;
  }
  const tooltip = flags.map((f) => f.text).join(' • ');
  return `<span class="qr-safety warn" title="${escapeAttr(tooltip)}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l10 17H2z"/><path d="M12 10v5"/><circle cx="12" cy="18" r=".9" fill="currentColor"/></svg>
    Check
  </span>`;
}

function escapeAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// Specialized panel for URL-type QRs. Replaces the generic hero+value layout
// with a site-preview card + URL row + safety badge in the header.
function urlPanelHTML(r, card, urlRow) {
  const safetyBadge = safetyBadgeHTML(r);
  return `
    <div class="qr-head">
      <div class="qr-mini-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v3M14 21h3M21 17v4h-4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="qr-head-text">
        <div class="qr-title">Decoded · URL</div>
        <div class="qr-meta">${escapeHtml(r.host || '')}</div>
      </div>
      ${safetyBadge}
    </div>
    <div class="qr-body">
      ${card}
      ${urlRow}
    </div>
    <div class="qr-actions">
      <button class="qr-btn" data-qr-act="save">Save</button>
      <button class="qr-btn" data-qr-act="copy">Copy</button>
      <button class="qr-btn primary" data-qr-act="primary">Open ↵</button>
    </div>
  `;
}

function qrPanelHTML(r) {
  // Title bar (top): "Decoded · <type>" + secondary line.
  const typeLabel = ({
    url: 'URL', crypto: `${r.chain || ''} address`, wifi: 'Wi-Fi', vcard: 'Contact', text: 'Text',
  })[r.type] || 'QR';
  const secondary = r.type === 'url'    ? (r.host || '')
                  : r.type === 'crypto' ? `${r.chain || ''} · ${r.value.length} chars`
                  : r.type === 'wifi'   ? (r.security || 'open')
                  : r.type === 'text'   ? `${r.value.length} characters`
                  : '';

  // Hero icon: chain logo for crypto, kind glyph for everything else.
  const heroIcon = r.type === 'crypto'
    ? `<img src="assets/chains/${(r.chain || '').toLowerCase()}.svg" alt="${escapeHtml(r.chain || '')}" />`
    : QR_HERO_ICONS[r.type] || QR_HERO_ICONS.text;

  // Hero text + value rendering varies by type.
  let heroTitle, heroSub, valueBlock;
  // For URL, the site preview card replaces the hero+value blocks entirely.
  if (r.type === 'url') {
    const card = siteCardHTML(r);
    const urlRow = `<div class="qr-value qr-value-mono qr-value-tiny">${escapeHtml(r.value)}</div>`;
    return urlPanelHTML(r, card, urlRow);
  }
  if (r.type === 'crypto') {
    heroTitle = r.payment?.label ? r.payment.label : `${r.chain} wallet`;
    // If this was a payment URI (Solana Pay / BIP21 / EIP-681), show what's
    // being requested. Otherwise fall back to a generic character count.
    if (r.payment) {
      const parts = [];
      if (r.payment.amount) parts.push(`${r.payment.amount} ${r.payment['spl-token'] ? 'tokens' : r.chain}`);
      if (r.payment.message) parts.push(r.payment.message);
      heroSub = parts.length ? `Payment · ${parts.join(' · ')}` : `${r.chain} payment URI`;
    } else {
      heroSub = `${r.value.length} characters`;
    }
    valueBlock = `<div class="qr-value qr-value-mono qr-value-tiny">${escapeHtml(r.value)}</div>`;
  } else if (r.type === 'wifi') {
    heroTitle = r.ssid || 'Wi-Fi network';
    heroSub = `${r.security || 'open'} · password ready to copy`;
    valueBlock = `
      <div class="qr-kv"><span class="qr-k">Password</span><span class="qr-v qr-value-mono">${escapeHtml(r.password || '')}</span></div>
    `;
  } else if (r.type === 'vcard') {
    heroTitle = 'Contact card';
    heroSub = 'vCard data';
    valueBlock = `<div class="qr-value">${escapeHtml((r.value || '').slice(0, 200))}${(r.value || '').length > 200 ? '…' : ''}</div>`;
  } else {
    heroTitle = 'Text content';
    heroSub = 'No URL or wallet detected';
    valueBlock = `<div class="qr-value">${escapeHtml((r.value || '').slice(0, 400))}${(r.value || '').length > 400 ? '…' : ''}</div>`;
  }

  // Primary action label depends on type. For crypto items where we don't
  // know the explorer, fall back to plain Copy so we don't lie to the user.
  const cryptoHasExplorer = r.type === 'crypto' && !!explorerURLForChain(r.chain, r.value);
  const primaryLabel = r.type === 'url'    ? 'Open ↵'
                     : r.type === 'crypto' ? (cryptoHasExplorer ? `${r.chain} explorer ↵` : 'Copy ↵')
                     : r.type === 'wifi'   ? 'Copy password ↵'
                     : 'Copy ↵';
  // If the primary action IS a copy, the secondary "Copy" button is redundant.
  const primaryIsCopy = /^Copy\b/.test(primaryLabel);

  return `
    <div class="qr-head">
      <div class="qr-mini-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v3M14 21h3M21 17v4h-4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="qr-head-text">
        <div class="qr-title">Decoded · ${escapeHtml(typeLabel)}</div>
        <div class="qr-meta">${escapeHtml(secondary)}</div>
      </div>
    </div>
    <div class="qr-body">
      <div class="qr-hero">
        <div class="qr-hero-ic qr-hero-ic-${r.type}">${heroIcon}</div>
        <div class="qr-hero-text">
          <div class="qr-hero-title">${escapeHtml(heroTitle)}</div>
          <div class="qr-hero-sub">${escapeHtml(heroSub)}</div>
        </div>
      </div>
      ${valueBlock}
    </div>
    <div class="qr-actions">
      <button class="qr-btn" data-qr-act="save">Save</button>
      ${primaryIsCopy ? '' : '<button class="qr-btn" data-qr-act="copy">Copy</button>'}
      <button class="qr-btn primary" data-qr-act="primary">${escapeHtml(primaryLabel)}</button>
    </div>
  `;
}

// Block explorers for the chains Restash recognizes. Used by the QR-decoder
// preview's primary action for crypto items.
function explorerURLForChain(chain, address) {
  const a = encodeURIComponent(address);
  switch ((chain || '').toUpperCase()) {
    case 'BTC': return `https://mempool.space/address/${a}`;
    case 'ETH': return `https://etherscan.io/address/${a}`;
    case 'SOL': return `https://solscan.io/account/${a}`;
    default:    return null;
  }
}

async function handleQRAction(act, r) {
  if (act === 'copy') {
    const text = r.type === 'wifi' ? (r.password || r.value) : r.value;
    await window.restash.copy(text);
    toast('Copied');
    return;
  }
  if (act === 'primary') {
    if (r.type === 'url') {
      await window.restash.openExternal(r.value);
      window.restash.hideWindow?.();
    } else if (r.type === 'wifi') {
      await window.restash.copy(r.password || '');
      toast('Password copied');
    } else if (r.type === 'crypto') {
      const url = explorerURLForChain(r.chain, r.value);
      if (url) {
        await window.restash.openExternal(url);
        window.restash.hideWindow?.();
      } else {
        await window.restash.copy(r.value);
        toast('Copied');
      }
    } else {
      await window.restash.copy(r.value);
      toast('Copied');
    }
    return;
  }
  if (act === 'save')    return saveQRResultAsItem(r);
  if (act === 'dismiss') return window.restash.hideWindow?.();
}

// Save flow — switch back to list mode, open the editor pre-filled with the
// detected kind + value + label, so the user just confirms (or tweaks) and saves.
function saveQRResultAsItem(r) {
  let kind = 'text';
  let label = '';
  let value = r.value || '';
  let tag;

  if (r.type === 'url') {
    kind = 'url';
    label = r.host || value;
  } else if (r.type === 'crypto') {
    kind = 'cryptoAddress';
    tag = r.chain;
    label = `${r.chain} wallet`;
  } else if (r.type === 'wifi') {
    // Save the password as a text item — that's what's actually useful to paste.
    // SSID lives in the label for context.
    kind = 'text';
    value = r.password || '';
    label = `${r.ssid || 'Wi-Fi'} password`;
  } else if (r.type === 'vcard') {
    kind = 'text';
    label = 'Contact card';
  } else {
    kind = 'text';
    label = (value || '').slice(0, 40).replace(/\n/g, ' ').trim() || 'Text';
  }

  // Switch back to list mode so the editor's modal renders against a populated
  // popover (not the qr panel which would still be the visible body).
  applyMode('list');
  openEditor(null, { prefill: { kind, label, value, tag } });
}

function makeTile(item, idx) {
  const tile = document.createElement('button');
  if (!item) {
    tile.className = 'tile empty';
    tile.disabled = true;
    tile.innerHTML = `<span class="num">${idx + 1}</span>`;
    return tile;
  }
  const icon = iconForItem(item);
  // First file drives the image-bg decision for multi-file items.
  const firstFile = (item.kind === 'file' && Array.isArray(item.files) && item.files[0])
    || (item.kind === 'file' ? { storedPath: item.value, mime: item.mime } : null);
  const isImageFile = firstFile && (firstFile.mime || '').startsWith('image/') && firstFile.storedPath;
  const fileCount = (item.kind === 'file' && Array.isArray(item.files)) ? item.files.length : 0;
  const countBadge = fileCount > 1 ? `<span class="tile-count-badge">+${fileCount - 1}</span>` : '';
  // Every non-empty grid tile is, by construction, a pinned item of this stash.
  tile.className = 'tile pinned' + (isImageFile ? ' image-bg' : '');
  tile.dataset.id = item.id;
  tile.dataset.slot = String(idx + 1);
  if (isImageFile) {
    const safe = firstFile.storedPath.replace(/"/g, '%22');
    tile.innerHTML = `
      <img class="tile-bg" src="file://${safe}" alt="" />
      <span class="num">${idx + 1}</span>
      ${countBadge}
      <div class="lbl">${escapeHtml(item.label)}</div>
    `;
  } else {
    tile.innerHTML = `
      <span class="num">${idx + 1}</span>
      ${countBadge}
      <div class="ic${icon.isChain ? ' is-chain' : ''}${icon.isThumb ? ' is-thumb' : ''}">${icon.html}</div>
      <div class="lbl">${escapeHtml(item.label)}</div>
    `;
  }
  tile.addEventListener('click', () => pasteItem(item));
  tile.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    const action = await window.restash.rowMenu({ id: item.id, pinned: true });
    if (action) handleAction(action, item);
  });
  return tile;
}

function buildGridPage(stash) {
  const page = document.createElement('div');
  page.className = 'grid-page';
  page.dataset.stash = stash.id;
  const items = itemsForStash(stash);
  for (let i = 0; i < 9; i++) page.appendChild(makeTile(items[i], i));
  return page;
}

// ---------- cursor-modal unified page cycle (RES-33) ----------
// Page 0 is "Recent" (a vertical list of raw recent copies, replacing the old
// "All" grid). Pages 1+ are the saved/auto stashes EXCEPT "All" (its role is
// taken over by Recent), rendered as the familiar 3×3 numpad grids. The cycle
// wraps. This is the SINGLE source of truth for the cursor numpad's pages.
function gridPages() {
  const pages = [{ id: 'recent', name: 'Recent', recent: true }];
  for (const s of computeStashes()) {
    if (s.id === 'all') continue; // Recent has taken over the first-page slot
    pages.push(s);
  }
  return pages;
}

function clampGridPageIdx() {
  const n = gridPages().length;
  if (!n) return 0;
  state.gridPageIdx = ((state.gridPageIdx % n) + n) % n;
  return state.gridPageIdx;
}

// The frozen recents for THIS summon (capped at clipHistoryMax, newest-first).
// Captured once when the popover is shown so the 1–9 mapping never shifts while
// the modal is open. Empty when memory is Off or history is empty. Main already
// trims stored history to clipHistoryMax, so the cap here is belt-and-braces.
function recentsForModal() {
  if (state.clipHistoryMax <= 0) return [];
  return state.recentSnapshot.slice(0, state.clipHistoryMax);
}

// Build the Recent list page — same footprint as a grid page (it IS a
// .grid-page so the slide transition reuses the existing machinery), but its
// content is a vertically scrolling list rather than a 3×3 grid.
function buildRecentPage() {
  const page = document.createElement('div');
  page.className = 'grid-page recent-grid-page';
  page.dataset.stash = 'recent';

  const recents = recentsForModal();
  if (!recents.length) {
    const empty = document.createElement('div');
    empty.className = 'rlist-empty';
    const off = state.clipHistoryMax <= 0;
    empty.innerHTML = `
      <div class="rlist-empty-glyph">${ICONS.clip}</div>
      <div class="rlist-empty-title">${off ? 'Clipboard memory is off' : 'No recent copies yet'}</div>
      <div class="rlist-empty-hint">${off
        ? 'Turn on Recent history in Settings to see copies here.'
        : 'Copy something and it shows up here.'}</div>`;
    page.appendChild(empty);
    return page;
  }

  const list = document.createElement('div');
  list.className = 'rlist';
  recents.forEach((entry, i) => {
    list.appendChild(buildModalRecentRow(entry, i));
  });
  page.appendChild(list);
  return page;
}

// One Recent row in the cursor modal: subtle leading auto-detect glyph +
// one truncated single line of the copied text + a 1–9 quick-key on the right.
// No tag chips, no badges, no timestamps.
function buildModalRecentRow(entry, i) {
  const row = document.createElement('div');
  const hasKey = i < 9;
  row.className = 'rrow' + (i === state.recentSelIdx ? ' selected' : '') + (hasKey ? '' : ' nokey');
  row.dataset.ridx = String(i);
  const oneLine = String(entry.text || '').replace(/\s+/g, ' ').trim();
  const kind = detectRecentKind(oneLine);
  row.innerHTML = `
    <span class="glyph" title="${kind}">${RECENT_GLYPH[kind]}</span>
    <span class="clip">${escapeHtml(oneLine)}</span>
    <span class="qkey">${hasKey ? (i + 1) : '·'}</span>`;
  row.addEventListener('mouseenter', () => { state.recentSelIdx = i; refreshRecentSel(); });
  row.addEventListener('click', () => pasteRecentEntry(entry));
  return row;
}

// Keep the selected Recent row highlighted + scrolled into view.
function refreshRecentSel() {
  const rows = Array.from(gridEl.querySelectorAll('.rrow'));
  rows.forEach((r, i) => r.classList.toggle('selected', i === state.recentSelIdx));
  if (rows[state.recentSelIdx]) rows[state.recentSelIdx].scrollIntoView({ block: 'nearest' });
}

// Paste a raw recent clip — reuses the RES-11 paste path (restores the prior
// clipboard) so muscle memory and behavior match the menu-dropdown Recent rows.
function pasteRecentEntry(entry) {
  if (!entry) return;
  window.restash.pasteActive(entry.text);
}

function buildPage(page) {
  return page.recent ? buildRecentPage() : buildGridPage(page);
}

// Header: ‹ name › arrows + animated stash name. Arrows + the name cluster
// drive the same unified cycle as the hotkey and the pager dots.
function renderStashHeader(pages, activeIdx, previousIdx) {
  const headerEl = document.querySelector('#gridWrap .stash-header');
  const nameEl = document.getElementById('stashName');
  if (!nameEl) return;

  // Wire up the ‹ › arrows once (they live in the markup; idempotent).
  if (headerEl && !headerEl.dataset.wired) {
    headerEl.dataset.wired = '1';
    headerEl.querySelector('.stash-arrow.prev')?.addEventListener('click', () => cycleStash(-1));
    headerEl.querySelector('.stash-arrow.next')?.addEventListener('click', () => cycleStash(1));
  }

  const setName = () => {
    if (previousIdx === undefined || previousIdx === activeIdx) {
      nameEl.innerHTML = `<span class="label">${escapeHtml(pages[activeIdx].name)}</span>`;
      return;
    }
    nameEl.querySelectorAll('.label').forEach((old) => {
      old.classList.remove('entering', 'in');
      old.classList.add('exiting');
      requestAnimationFrame(() => old.classList.add('out'));
      setTimeout(() => { if (old.parentNode) old.remove(); }, 280);
    });
    const newLabel = document.createElement('span');
    newLabel.className = 'label entering';
    newLabel.textContent = pages[activeIdx].name;
    nameEl.appendChild(newLabel);
    requestAnimationFrame(() => newLabel.classList.add('in'));
  };
  setName();

  // Pager dots — one per page, current page filled. Clicking jumps directly.
  const dots = document.getElementById('stashDots');
  if (dots) {
    dots.innerHTML = '';
    pages.forEach((p, i) => {
      const d = document.createElement('i');
      if (i === activeIdx) d.className = 'on';
      d.title = p.name;
      d.addEventListener('click', () => {
        if (i !== state.gridPageIdx) cycleStash(i - state.gridPageIdx);
      });
      dots.appendChild(d);
    });
    dots.classList.toggle('hidden', pages.length < 2);
  }
}

function renderGrid() {
  emptyEl.classList.add('hidden');
  listEl.classList.add('hidden');
  const wrap = document.getElementById('gridWrap');
  if (wrap) wrap.classList.remove('hidden');

  const pages = gridPages();
  const activeIdx = clampGridPageIdx();
  renderStashHeader(pages, activeIdx);

  // Cycle hint — only meaningful when there's more than one page. Built from
  // the user's *current* hotkey so it tracks whatever they've set in Settings:
  // hold the modifiers, tap the same combo again to advance the page.
  const cycleHint = document.getElementById('gridCycleHint');
  const cycleKey  = document.getElementById('gridCycleKey');
  if (cycleHint && cycleKey) {
    if (pages.length > 1) {
      cycleKey.textContent = prettyHotkey(state.hotkey);
      cycleHint.classList.remove('hidden');
    } else {
      cycleHint.classList.add('hidden');
    }
  }

  const page = buildPage(pages[activeIdx]);
  page.classList.add('center');
  gridEl.innerHTML = '';
  gridEl.appendChild(page);
  if (pages[activeIdx].recent) refreshRecentSel();
}

// Called when the user presses the hotkey again while the cursor numpad is
// already open (also driven by the ‹ › arrows, the pager dots and ←/→).
// Slides in the next page's content. Wraps across Recent + every stash.
function cycleStash(direction = 1) {
  const pages = gridPages();
  if (pages.length < 2) return; // nothing to cycle through
  const fromIdx = clampGridPageIdx();
  const toIdx = ((fromIdx + direction) % pages.length + pages.length) % pages.length;
  if (fromIdx === toIdx) return;
  state.gridPageIdx = toIdx;
  // Reset Recent selection when arriving on the Recent page.
  if (pages[toIdx].recent) state.recentSelIdx = 0;

  // Header + dots update
  renderStashHeader(pages, toIdx, fromIdx);

  // Build the new page positioned off-screen, then transition both pages.
  // Use querySelectorAll so rapid cycling doesn't leave stragglers behind.
  const oldPages = Array.from(gridEl.querySelectorAll('.grid-page'));
  const newPage = buildPage(pages[toIdx]);
  newPage.classList.add(direction > 0 ? 'enter-right' : 'enter-left');
  gridEl.appendChild(newPage);
  // Force reflow so the transition actually runs from the off-screen state.
  void newPage.offsetWidth;

  oldPages.forEach((oldPage) => {
    oldPage.classList.remove('center', 'enter-right', 'enter-left');
    oldPage.classList.add(direction > 0 ? 'exit-left' : 'exit-right');
    setTimeout(() => { if (oldPage.parentNode) oldPage.remove(); }, 320);
  });
  newPage.classList.remove('enter-right', 'enter-left');
  newPage.classList.add('center');
  if (pages[toIdx].recent) requestAnimationFrame(refreshRecentSel);
}

// Drag-reorder state for the stash chip bar.
let draggedStashId = null;

function clearStashDropIndicators() {
  document.querySelectorAll('.stash-bar .stash-tab').forEach((t) => {
    t.classList.remove('drop-before', 'drop-after');
  });
}

function onStashDragStart(e) {
  draggedStashId = e.currentTarget.dataset.stashId;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  // Firefox requires setData to actually fire drop.
  try { e.dataTransfer.setData('text/plain', draggedStashId); } catch {}
}

function onStashDragOver(e) {
  if (!draggedStashId) return;
  const target = e.currentTarget;
  if (target.dataset.stashId === draggedStashId) return;
  if (!target.classList.contains('user')) return; // can't drop on "All" or auto stashes
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const rect = target.getBoundingClientRect();
  const before = (e.clientX - rect.left) < rect.width / 2;
  clearStashDropIndicators();
  target.classList.add(before ? 'drop-before' : 'drop-after');
}

function onStashDragLeave(e) {
  e.currentTarget.classList.remove('drop-before', 'drop-after');
}

async function onStashDrop(e) {
  e.preventDefault();
  if (!draggedStashId) return;
  const target = e.currentTarget;
  const targetId = target.dataset.stashId;
  if (targetId === draggedStashId) return;

  const rect = target.getBoundingClientRect();
  const before = (e.clientX - rect.left) < rect.width / 2;

  // Compute new id sequence for user stashes.
  const list = [...availableStashes];
  const fromIdx = list.findIndex((s) => s.id === draggedStashId);
  if (fromIdx === -1) return;
  const [moved] = list.splice(fromIdx, 1);
  let toIdx = list.findIndex((s) => s.id === targetId);
  if (toIdx === -1) {
    list.push(moved);
  } else {
    if (!before) toIdx += 1;
    list.splice(toIdx, 0, moved);
  }

  const ids = list.map((s) => s.id);
  await window.restash.reorderStashes(ids);
  availableStashes = list;

  // Keep the same stash visually active across the reorder.
  const refreshed = listStashes();
  const activeId = refreshed[state.stashIdx]?.id;
  if (activeId) {
    const newIdx = refreshed.findIndex((s) => s.id === activeId);
    if (newIdx >= 0) state.stashIdx = newIdx;
  }
  render();
}

function onStashDragEnd() {
  document.querySelectorAll('.stash-bar .stash-tab').forEach((t) => {
    t.classList.remove('dragging', 'drop-before', 'drop-after');
  });
  draggedStashId = null;
}

function renderListStashBar() {
  const bar = document.getElementById('stashBar');
  if (!bar) return;
  const stashes = listStashes();
  const activeIdx = clampStashIdx(state.stashIdx ?? 0, stashes.length);

  // Stash bar is always present in list mode now — the "+ New" chip needs
  // somewhere to live even when no custom stashes exist yet.
  bar.style.display = '';
  const tabsHTML = stashes.map((s, i) => {
    // Only persisted USER stashes (id format "s_…") are draggable. "All"
    // stays pinned at the leftmost slot; auto-derived kind-stashes aren't
    // backed by real records so reordering them would be meaningless.
    const isUser = typeof s.id === 'string' && s.id.startsWith('s_');
    return `<button type="button" class="stash-tab${i === activeIdx ? ' active' : ''}${isUser ? ' user' : ''}" data-idx="${i}" data-stash-id="${escapeHtml(s.id)}"${isUser ? ' draggable="true"' : ''}>${escapeHtml(s.name)}</button>`;
  }).join('');
  // Show an edit (✎) chip only when the active stash is a user-created one
  // (can't edit "All" or auto-derived kind stashes).
  const active = stashes[activeIdx];
  const showEdit = active && typeof active.id === 'string' && active.id.startsWith('s_');
  bar.innerHTML = tabsHTML + (showEdit ? `<button type="button" class="stash-edit-icon" id="editStashBtn" title="Edit ${escapeHtml(active.name)}">✎</button>` : '') + `
    <button type="button" class="stash-tab new" id="newStashTab" title="New stash">+ New</button>
    <input type="text" class="stash-tab-input hidden" id="newStashTabInput" placeholder="Stash name…" autocomplete="off" />
  `;
  if (showEdit) {
    document.getElementById('editStashBtn').addEventListener('click', () => window.restash.openStashEditWindow(active.id));
  }

  for (const tab of bar.querySelectorAll('.stash-tab:not(.new)')) {
    tab.addEventListener('click', () => {
      state.stashIdx = Number(tab.dataset.idx);
      render();
    });
    if (tab.classList.contains('user')) {
      tab.addEventListener('dragstart', onStashDragStart);
      tab.addEventListener('dragover',  onStashDragOver);
      tab.addEventListener('dragleave', onStashDragLeave);
      tab.addEventListener('drop',      onStashDrop);
      tab.addEventListener('dragend',   onStashDragEnd);
    }
  }

  const newBtn = document.getElementById('newStashTab');
  const newInput = document.getElementById('newStashTabInput');
  newBtn.addEventListener('click', () => {
    newBtn.classList.add('hidden');
    newInput.classList.remove('hidden');
    newInput.value = '';
    setTimeout(() => newInput.focus(), 0);
  });
  newInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const name = newInput.value.trim();
      if (!name) return;
      if (hitsFreeLimit('stashes')) return;
      const res = await window.restash.createStash(name);
      if (res?.ok && res.stash) {
        availableStashes.push(res.stash);
        // Jump straight to the new stash so the user sees it active.
        const refreshed = listStashes();
        state.stashIdx = refreshed.findIndex((s) => s.id === res.stash.id);
        render();
      } else if (res?.reason === 'duplicate-name') {
        newInput.classList.add('shake');
        setTimeout(() => newInput.classList.remove('shake'), 400);
      }
    } else if (e.key === 'Escape') {
      newBtn.classList.remove('hidden');
      newInput.classList.add('hidden');
    }
  });
  newInput.addEventListener('blur', () => {
    // Tap-out cancels (so the input doesn't sit open forever).
    newBtn.classList.remove('hidden');
    newInput.classList.add('hidden');
  });
}

function cycleListStash(direction = 1) {
  const stashes = listStashes();
  if (stashes.length < 2) return;
  state.stashIdx = clampStashIdx((state.stashIdx ?? 0) + direction, stashes.length);
  render();
}

// Compact relative time for Recent rows: "now", "2m", "3h", "5d".
function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 45) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

// ---------- Recent (clipboard memory) ----------
// Renders the RECENT section at the top of the list. Self-contained so it can
// be re-rendered on its own when new copies stream in (clipboard-history:updated)
// without rebuilding the whole list. Only shown in list mode, when the feature
// is on (max > 0), there's history, and the user isn't searching.
function renderRecent() {
  if (!listEl) return;
  // Remove any prior block first so this is idempotent.
  const prior = document.getElementById('recentBlock');
  if (prior) prior.remove();

  // RECENT lives at the top of the "All" stash only — inside a specific user
  // or auto stash, the popover is scoped to that stash and a global recents
  // strip would just confuse the scope (Kevin: "only show in ALL").
  const visible = state.mode === 'list'
    && state.clipHistoryMax > 0
    && state.clipHistory.length > 0
    && !state.search
    && activeStashId() === 'all';
  if (!visible) {
    // If Recent just emptied and there are no saved items either, the list
    // should fall back to the empty state — do a full render to handle that.
    if (state.mode === 'list' && state.items.length === 0
        && !listEl.classList.contains('hidden') && !listEl.firstChild) {
      render();
    }
    return;
  }

  // If the empty-state is currently showing (no saved items), a full render
  // is needed to swap it out for the list — re-entrancy guarded by the block
  // check above.
  if (listEl.classList.contains('hidden')) { render(); return; }

  const block = document.createElement('div');
  block.id = 'recentBlock';

  const header = document.createElement('div');
  header.className = 'list-section recent-section';
  header.innerHTML = `
    <span class="rs-label">Recent</span>
    <button type="button" class="rs-clear" title="Clear recent history">Clear ✕</button>
  `;
  header.querySelector('.rs-clear').addEventListener('click', async (e) => {
    e.stopPropagation();
    try { await window.restash.clipboardHistory.clear(); } catch {}
    state.clipHistory = [];
    renderRecent();
  });
  block.appendChild(header);

  state.clipHistory.slice(0, state.clipHistoryMax).forEach((entry) => {
    block.appendChild(buildRecentRow(entry));
  });

  // Always sits at the very top, above pinned.
  listEl.insertBefore(block, listEl.firstChild);
}

// One Recent row — reuses the row look (icon tile + mono text + relative time);
// on hover/selected it reveals Paste · Save to Restash · Share · QR.
function buildRecentRow(entry) {
  const row = document.createElement('div');
  row.className = 'row recent-row';
  row.dataset.cid = entry.id;

  const oneLine = String(entry.text || '').replace(/\s+/g, ' ').trim();
  // Same auto-detect leading glyph as the RES-33 cursor recents — link for
  // URLs, wallet for crypto addresses, neutral clip glyph for everything else.
  // Keeps the two recent views visually consistent so users don't have to
  // re-learn which icon means what.
  const recentKind = detectRecentKind(oneLine);

  row.innerHTML = `
    <div class="row-main">
      <div class="icon recent-icon" data-rkind="${recentKind}">${RECENT_GLYPH[recentKind]}</div>
      <div class="text">
        <span class="label mono">${escapeHtml(oneLine)}</span>
      </div>
      <div class="recent-right">
        <span class="recent-time">${timeAgo(entry.capturedAt)}</span>
        <div class="recent-actions">
          <button class="row-act" data-ract="paste" title="Paste" aria-label="Paste">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L19 7"/></svg>
          </button>
          <button class="row-act" data-ract="save" title="Save to Restash" aria-label="Save to Restash">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <button class="row-act" data-ract="share" title="Share…" aria-label="Share">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>
          </button>
          <button class="row-act" data-ract="qr" title="Show QR code" aria-label="Show QR code">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v3M14 21h3M21 17v4h-4"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;

  row.addEventListener('click', (e) => {
    const actBtn = e.target.closest('.row-act');
    const act = actBtn ? actBtn.dataset.ract : 'paste'; // clicking the row pastes
    e.stopPropagation();
    if (act === 'paste') {
      // Reuse the existing paste path (restores the prior clipboard).
      window.restash.pasteActive(entry.text);
    } else if (act === 'save') {
      // Open the editor pre-filled as a new text item for the user to label.
      applyMode('list');
      openEditor(null, { prefill: { kind: 'text', value: entry.text } });
    } else if (act === 'share') {
      window.restash.shareItem({ text: entry.text, label: 'Recent copy' });
    } else if (act === 'qr') {
      openQR({ label: 'Recent copy', value: entry.text });
    }
  });

  return row;
}

function renderList() {
  const wrap = document.getElementById('gridWrap');
  if (wrap) wrap.classList.add('hidden');
  renderListStashBar();
  const rows = filtered();
  // The Recent (clipboard memory) block can stand on its own even when the
  // user has no saved items yet — so only show the empty state when BOTH the
  // saved items AND the visible Recent block are empty.
  const hasRecent = state.clipHistoryMax > 0 && state.clipHistory.length > 0 && !state.search && activeStashId() === 'all';
  if (state.items.length === 0 && !hasRecent) {
    emptyEl.classList.remove('hidden');
    listEl.classList.add('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  listEl.classList.remove('hidden');

  // Clear stale selection (e.g., when filter narrows out the selected row).
  // No default-select on load — the dark highlight + peek strip only appear
  // on hover (or after explicit keyboard navigation via arrow keys).
  if (state.selectedId && !rows.find((r) => r.id === state.selectedId)) {
    state.selectedId = null;
  }

  // Pin state is per-stash — everything below is relative to the focused stash.
  const activeId = activeStashId();

  listEl.innerHTML = '';

  // Clipboard memory: RECENT section at the very top of list mode.
  renderRecent();

  const addSection = (text) => {
    const h = document.createElement('div');
    h.className = 'list-section';
    h.textContent = text;
    listEl.appendChild(h);
  };
  let lastPinned = null;
  rows.forEach((item, idx) => {
    const icon = iconForItem(item);
    const isSel = item.id === state.selectedId;
    const pinnedHere = isPinned(item, activeId);

    // Labelled section headers so pinned vs. unpinned reads at a glance.
    // "Pinned" sits above the pinned block; "More items" above the rest
    // (only emitted at the transition, i.e. when both groups exist).
    if (lastPinned === null && pinnedHere) {
      addSection('Pinned');
    } else if (lastPinned === true && !pinnedHere) {
      addSection('More items');
    }
    lastPinned = pinnedHere;

    const row = document.createElement('div');
    row.className = 'row' + (isSel ? ' selected' : '') + (pinnedHere ? ' is-pinned' : '');
    row.dataset.id = item.id;
    // Only pinned rows are draggable — they participate in the explicit numpad ordering.
    if (pinnedHere) row.draggable = true;

    // Tag chip only appears when there's a tag AND we're not already showing
    // a chain badge for it (chain badge = tag visualised).
    const tagChip = (item.tag && !icon.isChain)
      ? `<span class="tag-chip">${escapeHtml(item.tag)}</span>`
      : '';
    // Pinned rows always show a small pin glyph; on hover it swaps to the
    // drag grip (⋮⋮) to signal the row can be reordered.
    const dragHandle = pinnedHere
      ? `<span class="drag-handle" aria-hidden="true"><span class="pg-pin"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 2.5h5a1 1 0 0 1 .7 1.7l-.7.7v4.6l2.3 2.3a1 1 0 0 1-.7 1.7H13v6a1 1 0 0 1-2 0v-6H7.6a1 1 0 0 1-.7-1.7l2.3-2.3V4.9l-.7-.7a1 1 0 0 1 .7-1.7z"/></svg></span><span class="pg-grip">⋮⋮</span></span>`
      : '';
    const keyHint = isSel
      ? `<span class="key">↵</span>`
      : (idx < 9 ? `<span class="key">⌘${idx + 1}</span>` : '');

    // Hover-only actions (QR + native share). Replace the key indicator on hover.
    // QR is meaningless for file items (would just encode a local path), so
    // skip it there.
    const qrButton = (item.kind === 'file' || item.kind === 'agent' || item.kind === 'environment') ? '' : `
        <button class="row-act" data-act="qr" title="Show QR code" aria-label="Show QR code">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <path d="M14 14h3v3M21 14v3M14 21h3M21 17v4h-4"/>
          </svg>
        </button>`;
    const rowActions = `
      <div class="row-actions">
        ${qrButton}
        <button class="row-act" data-act="share" title="Share…" aria-label="Share">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3v12"/>
            <path d="M8 7l4-4 4 4"/>
            <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>
          </svg>
        </button>
      </div>
    `;

    row.innerHTML = `
      <div class="row-main">
        ${dragHandle}
        <div class="icon${icon.isChain ? ' is-chain' : ''}${icon.isStack ? ' is-stack' : ''}">${icon.html}</div>
        <div class="text">
          <span class="label">${escapeHtml(item.label)}</span>${tagChip}
        </div>
        ${keyHint}
        ${rowActions}
      </div>
      <div class="row-peek">${peekHTML(item)}</div>
    `;

    if (pinnedHere) {
      row.addEventListener('dragstart', (e) => {
        state.draggingId = item.id;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.id);
      });
      row.addEventListener('dragend', () => {
        state.draggingId = null;
        row.classList.remove('dragging');
        listEl.querySelectorAll('.row.drop-before, .row.drop-after').forEach((el) => {
          el.classList.remove('drop-before', 'drop-after');
        });
      });
      row.addEventListener('dragover', (e) => {
        if (!state.draggingId || state.draggingId === item.id) return;
        const dragging = state.items.find((i) => i.id === state.draggingId);
        if (!dragging || !isPinned(dragging, activeId)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const r = row.getBoundingClientRect();
        const before = (e.clientY - r.top) < r.height / 2;
        row.classList.toggle('drop-before', before);
        row.classList.toggle('drop-after', !before);
      });
      row.addEventListener('dragleave', () => {
        row.classList.remove('drop-before', 'drop-after');
      });
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        const draggedId = state.draggingId;
        if (!draggedId || draggedId === item.id) return;
        const r = row.getBoundingClientRect();
        const before = (e.clientY - r.top) < r.height / 2;
        reorderPinned(draggedId, item.id, before, activeId);
      });
    }
    row.addEventListener('click', (e) => {
      // Hover action button clicks shouldn't trigger paste.
      const actBtn = e.target.closest('.row-act');
      if (actBtn) {
        e.stopPropagation();
        const act = actBtn.dataset.act;
        if (act === 'qr') openQR(item);
        else if (act === 'share') {
          // For URLs use both text+url so Mail / Messages can offer to send a link.
          const url = item.kind === 'url' ? item.value : null;

          // File items: pass the stored file path. The Swift share helper
          // wraps it as an NSURL fileURL so AirDrop / Mail / Messages
          // recognize it as a real file (attachment, not text).
          const filePath = item.kind === 'file' ? item.value : null;

          // Preview icon for the share sheet. Crypto items use their chain
          // logo when set; file images use their actual thumbnail; otherwise
          // the kind icon.
          let iconPath = null;
          if (item.kind === 'cryptoAddress') {
            iconPath = (item.tag && CHAINS[item.tag])
              ? `assets/chains/${item.tag.toLowerCase()}.svg`
              : 'assets/wallet.svg';
          } else if (item.kind === 'file' && (item.mime || '').startsWith('image/')) {
            iconPath = item.value; // absolute path; main resolves OK
          }

          window.restash.shareItem({
            text: item.kind === 'file' ? null : item.value,
            url,
            filePath,
            label: item.label,
            iconPath,
          });
        }
        return;
      }
      state.selectedId = item.id;
      pasteItem(item);
    });
    row.addEventListener('mouseenter', () => {
      if (state.selectedId !== item.id) {
        state.selectedId = item.id;
        updateSelectionHighlight();
      }
    });
    row.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      state.selectedId = item.id;
      updateSelectionHighlight();
      const action = await window.restash.rowMenu({ id: item.id, pinned: isPinned(item, activeId) });
      if (action) handleAction(action, item);
    });
    listEl.appendChild(row);
  });
  scrollSelectedIntoView();
}

// Middle-truncate a wallet address: first 5 + … + last 5, the way wallets
// are conventionally shown. Short strings pass through untouched.
function truncateWallet(addr) {
  const a = String(addr || '');
  return a.length <= 12 ? a : `${a.slice(0, 5)}…${a.slice(-5)}`;
}

// Rich, multi-line detail shown in the expanded row peek (the selected row).
// The goal: the user sees ALL the data at a glance — useful for checking an
// item without pasting it.
//   crypto  → full address, centered
//   file    → one line per file (name + size)
//   contact → one labeled line per detail (email / phone / company / wallet)
//   else    → the raw value on a single line
function peekHTML(item) {
  if (item.kind === 'cryptoAddress') {
    return `<div class="peek-wallet">${escapeHtml(truncateWallet(item.value))}</div>`;
  }
  if (item.kind === 'file') {
    const files = Array.isArray(item.files) && item.files.length
      ? item.files
      : [{ originalName: item.originalName, size: item.size, storedPath: item.value }];
    return files.map((f) => {
      const name = escapeHtml(displayFileName(f));
      const size = f.size ? escapeHtml(formatBytes(f.size)) : '';
      return `<div class="peek-file"><span class="pf-name">${name}</span><span class="pf-size">${size}</span></div>`;
    }).join('');
  }
  if (item.kind === 'contact') {
    const c = item.contact || {};
    const rows = [];
    if (c.email)   rows.push(['Email', c.email]);
    if (c.phone)   rows.push(['Phone', c.phone]);
    if (c.company) rows.push(['Company', c.company]);
    if (c.wallet)  rows.push(['Wallet', truncateWallet(c.wallet)]);
    if (!rows.length) return `<div class="peek-line">${escapeHtml(item.value || '')}</div>`;
    return rows.map(([k, v]) =>
      `<div class="peek-kv"><span class="pk">${escapeHtml(k)}</span><span class="pv">${escapeHtml(v)}</span></div>`
    ).join('');
  }
  if (item.kind === 'agent') {
    // Agent personas are long markdown. Show the first few meaningful lines
    // with markdown syntax stripped — enough to recognise the persona at a
    // glance without dumping the whole prompt into the row.
    const lines = String(item.value || '')
      .split('\n')
      .map((l) => l.replace(/^#+\s*/, '').replace(/^[-*]\s+/, '').trim())
      .filter(Boolean)
      .slice(0, 3);
    if (!lines.length) return `<div class="peek-line">${escapeHtml(item.value || '')}</div>`;
    return lines.map((l, i) =>
      `<div class="peek-agent-line${i === 0 ? ' head' : ''}">${escapeHtml(l)}</div>`
    ).join('');
  }
  if (item.kind === 'environment') {
    const targets = Array.isArray(item.env?.targets) ? item.env.targets : [];
    if (!targets.length) return `<div class="peek-line">No sites or apps</div>`;
    return targets.map((t) => {
      const ic = t.type === 'app' ? ICONS.environment : ICONS.url;
      return `<div class="peek-env"><span class="pe-ic">${ic}</span><span class="pe-val">${escapeHtml(t.value || '')}</span></div>`;
    }).join('');
  }
  return `<div class="peek-line">${escapeHtml(item.value || '')}</div>`;
}

function updateSelectionHighlight() {
  const rows = filtered();

  let selectedEl = null;
  let selectedItem = null;
  const rowEls = listEl.querySelectorAll('.row');
  rowEls.forEach((el, idx) => {
    const isSel = el.dataset.id === state.selectedId;
    el.classList.toggle('selected', isSel);

    // Flip the key indicator: ↵ on selected, ⌘1–9 elsewhere.
    const keyEl = el.querySelector('.key');
    if (keyEl) {
      const item = rows[idx];
      if (isSel) {
        keyEl.textContent = '↵';
      } else if (idx < 9 && item) {
        keyEl.textContent = '⌘' + (idx + 1);
      } else {
        keyEl.textContent = '';
      }
    }

    if (isSel) {
      selectedEl = el;
      selectedItem = rows[idx];
    }
  });
  // Inline preview (the .preview span) is driven purely by the .selected
  // class via CSS opacity — no inserted strip, so no layout shift.
}

function scrollSelectedIntoView() {
  const el = listEl.querySelector('.row.selected');
  if (el) el.scrollIntoView({ block: 'nearest' });
}

function moveSelection(delta) {
  const rows = filtered();
  if (rows.length === 0) return;
  const idx = rows.findIndex((r) => r.id === state.selectedId);
  const nextIdx = Math.max(0, Math.min(rows.length - 1, (idx === -1 ? 0 : idx + delta)));
  state.selectedId = rows[nextIdx].id;
  updateSelectionHighlight();
  scrollSelectedIntoView();
}

function selectedItem() {
  return filtered().find((r) => r.id === state.selectedId) || null;
}

// ---------- actions ----------
function handleAction(act, item) {
  if (act === 'paste') pasteItem(item);
  else if (act === 'edit') openEditor(item);
  else if (act === 'qr') openQR(item);
  else if (act === 'pin' || act === 'unpin') {
    // Pinning acts on the stash currently in focus. The numpad has 9 slots,
    // so each stash caps at 9 pins. Unpinning is always allowed.
    const sid = activeStashId();
    if (act === 'pin') {
      if (pinnedInStash(sid).length >= 9) {
        toast('Numpad full — 9 pins per stash');
        return;
      }
      if (!item.pins) item.pins = {};
      item.pins[sid] = nextPinOrder(sid);
    } else if (item.pins) {
      delete item.pins[sid];
    }
    persist();
    render();
  } else if (act === 'delete') {
    state.items = state.items.filter((i) => i.id !== item.id);
    persist();
    render();
  }
}

async function pasteItem(item) {
  item.lastUsedAt = Date.now();
  await persist();

  // Environment items don't paste — they OPEN. One action launches every site
  // and app in the environment, then the popover closes.
  if (item.kind === 'environment') {
    try { await window.restash.openEnvironment(item.env || { targets: [], urlMode: 'window' }); } catch {}
    window.restash.hideWindow?.();
    return;
  }

  // File items go through the file-URL pasteboard path so ⌘V behaves
  // correctly in Finder / Mail / Slack. Multi-file items paste all files in
  // one shot (Mail attaches all, Finder copies all, etc.).
  let payload;
  if (item.kind === 'file') {
    const files = Array.isArray(item.files) ? item.files : [];
    const paths = files.map((f) => f.storedPath).filter(Boolean);
    // Back-compat: if a stray item still has only value, use it.
    if (!paths.length && item.value) paths.push(item.value);
    payload = { filePaths: paths };
  } else if (item.kind === 'contact') {
    // Paste the WHOLE contact, not just the email — name first, then every
    // filled detail on its own line.
    const c = item.contact || {};
    payload = [item.label, c.email, c.phone, c.company, c.wallet]
      .filter(Boolean)
      .join('\n');
  } else {
    payload = item.value;
  }
  const result = await window.restash.pasteActive(payload);
  if (result.ok) {
    // Window already hidden by main; nothing more to do.
    return;
  }
  if (result.reason === 'no-accessibility') {
    // Main already opened System Settings → Accessibility for the user.
    accessGranted = false;
    refreshAccessUI();
    toast(`Grant Accessibility to "Electron" in System Settings, then try again`);
    return;
  }
  // Other failure modes (osascript error, bad input) — keep window open
  // and tell the user what happened.
  toast(`Paste failed: ${result.reason || 'unknown'} — value is on clipboard`);
}

// ---------- editor ----------
let editorKind = 'url';
let editorChain = null; // selected blockchain code when kind === 'cryptoAddress'
let editorStashIds = new Set();
let availableStashes = []; // cached from main; refreshed before each editor open
// Picked files for a file-kind item. Each entry: { storedPath, originalName, size, mime }.
// One item can hold many files; pasting writes all paths to the clipboard
// so a single ⌘V attaches/copies all of them.
let editorFiles = [];

// Files the user TRIED to pick but were rejected (e.g. exceeds size limit).
// Each entry: { originalName, size, limit, reason }. Shown inline in the
// file picker so the user knows exactly what happened, instead of a
// fleeting toast that's easy to miss.
let editorFileErrors = [];

// Environment-kind editor state. Targets are an ordered list of
// { type: 'site'|'app', value, path? }, snapshotted by "Capture what's open".
// urlMode controls how sites reopen: 'window' = all sites as tabs in one
// browser window; 'separate' = each in its own window.
let editorEnvTargets = [];
let chromeProfiles = [];  // [{ dir, name, account }] — loaded for env editor
let editorEnvUrlMode = 'window';

async function openEditor(item, opts = {}) {
  // Pull the latest stash list from main before opening, so a stash created
  // elsewhere shows up immediately.
  try { availableStashes = await window.restash.listStashes(); } catch { availableStashes = []; }

  // Prefill (used by the QR-decoder "Save" action). When set, the editor opens
  // in "new item" mode but with the kind/label/value/tag already populated, so
  // the user just needs to confirm or tweak.
  const prefill = opts.prefill;

  state.editing = item || null;
  editorKind = item?.kind || prefill?.kind || 'url';
  editorChain = (editorKind === 'cryptoAddress' && (item?.tag || prefill?.tag) && CHAINS[item?.tag || prefill?.tag])
    ? (item?.tag || prefill?.tag) : null;
  editorStashIds = new Set(Array.isArray(item?.stashIds) ? item.stashIds : []);
  // For file items in edit mode, hydrate from `files` (multi-file) or
  // fall back to single-file legacy fields.
  if (item?.kind === 'file') {
    if (Array.isArray(item.files) && item.files.length) {
      editorFiles = item.files.map((f) => ({ ...f }));
    } else if (item.value) {
      editorFiles = [{
        storedPath: item.value,
        originalName: item.originalName || item.value.split('/').pop() || 'file',
        size: item.size, mime: item.mime,
      }];
    } else {
      editorFiles = [];
    }
  } else {
    editorFiles = [];
  }
  editorFileErrors = [];  // fresh editor = no leftover warnings

  // Environment kind: hydrate the target list + site-open mode, and make sure
  // the installed-apps list is loaded for the app dropdowns (cached after 1st).
  if (item?.kind === 'environment') {
    editorEnvTargets = Array.isArray(item.env?.targets) ? item.env.targets.map((t) => ({ ...t })) : [];
    editorEnvUrlMode = item.env?.urlMode === 'separate' ? 'separate' : 'window';
    // Load the user's Chrome profiles once, so each site can pick which profile
    // to reopen in. Re-render when they arrive (fetch is async).
    if (!chromeProfiles.length) {
      window.restash.getChromeProfiles?.().then((list) => {
        chromeProfiles = Array.isArray(list) ? list : [];
        if (editorKind === 'environment') renderEnvEditor();
      }).catch(() => {});
    }
  } else {
    editorEnvTargets = [];
    editorEnvUrlMode = 'window';
  }

  $('editorTitle').textContent = item ? 'Edit item' : 'New item';
  $('fLabel').value = item?.label || prefill?.label || '';
  $('fValue').value = (item?.kind === 'file' || editorKind === 'file')
    ? ''
    : (item?.value || prefill?.value || '');

  // Hydrate the structured Contact fields (empty for non-contact items).
  const c = (item?.kind === 'contact' && item.contact) ? item.contact : {};
  $('fContactEmail').value = c.email || '';
  $('fContactPhone').value = c.phone || '';
  $('fContactCompany').value = c.company || '';
  $('fContactWallet').value = c.wallet || '';

  renderKindPicker();
  renderChainPicker();
  renderAgentPicker();
  renderEnvEditor();
  renderStashPicker();
  renderFilePicker();
  syncKindUI();
  $('delBtn').classList.toggle('hidden', !item);

  // Grow the popover window so the add/edit form has room to breathe.
  window.restash.setEditorWindow?.(true);
  editorBackdrop.classList.remove('hidden');
  setTimeout(() => $('fLabel').focus(), 0);
}

function renderKindPicker() {
  const host = $('kindPicker');
  if (!host) return;
  host.innerHTML = Object.entries(KINDS).map(([kind, meta]) => `
    <button type="button" data-kind="${kind}" class="chip${editorKind === kind ? ' active' : ''}">
      <span class="chip-ic">${meta.icon}</span>
      <span class="chip-lbl">${meta.name}</span>
    </button>
  `).join('');
  for (const btn of host.querySelectorAll('.chip')) {
    btn.addEventListener('click', () => {
      editorKind = btn.dataset.kind;
      syncKindUI();
    });
  }
}

function renderChainPicker() {
  const host = $('fChainPicker');
  if (!host) return;
  host.innerHTML = Object.entries(CHAINS).map(([code, c]) => `
    <button type="button" class="chain-btn${editorChain === code ? ' selected' : ''}" data-chain="${code}" title="${c.name}">
      <span class="chain-badge">${chainBadgeSVG(code)}</span>
      <span class="chain-name">${code}</span>
    </button>
  `).join('');
  for (const btn of host.querySelectorAll('.chain-btn')) {
    btn.addEventListener('click', () => {
      editorChain = btn.dataset.chain;
      for (const b of host.querySelectorAll('.chain-btn')) {
        b.classList.toggle('selected', b.dataset.chain === editorChain);
      }
    });
  }
}

// Curated agent-template chips, shown when the Agent kind is selected.
// Clicking a chip drops the markdown persona into the Value field (and fills
// the Label if it's still empty) so the user starts from a strong base.
function renderAgentPicker() {
  const host = $('fAgentPicker');
  if (!host) return;
  host.innerHTML = AGENT_TEMPLATES.map((t, i) => `
    <button type="button" class="agent-chip" data-tpl="${i}">
      <span class="chip-ic">${ICONS.agent}</span>
      <span class="chip-lbl">${escapeHtml(t.name)}</span>
    </button>
  `).join('');
  for (const btn of host.querySelectorAll('.agent-chip')) {
    btn.addEventListener('click', () => {
      const tpl = AGENT_TEMPLATES[Number(btn.dataset.tpl)];
      if (!tpl) return;
      $('fValue').value = tpl.body;
      if (!$('fLabel').value.trim()) $('fLabel').value = tpl.label;
      for (const b of host.querySelectorAll('.agent-chip')) {
        b.classList.toggle('active', b === btn);
      }
      $('fValue').focus();
    });
  }
}

// Environment editor — a list of targets (sites + apps), add buttons, and a
// site-open mode toggle. Rebuilt from editorEnvTargets on every change.
// Environment editor — capture-only. The user opens the sites/apps they want,
// hits "Capture what's open", and Restash snapshots the open browser tabs +
// running apps into the target list (remove-only). A site-open mode toggle
// controls how the sites reopen.
function renderEnvEditor() {
  const host = $('fEnvPicker');
  if (!host) return;

  const profileSelect = (t, i) => {
    // Only sites get a profile picker, and only when Chrome profiles exist.
    if (t.type !== 'site' || !chromeProfiles.length) return '';
    const opts = [`<option value="">Default profile</option>`]
      .concat(chromeProfiles.map((p) =>
        `<option value="${escapeHtml(p.dir)}"${t.profile === p.dir ? ' selected' : ''}>${escapeHtml(p.name)}</option>`));
    return `<select class="env-profile" data-i="${i}" title="Open this tab in Chrome profile">${opts.join('')}</select>`;
  };
  const rows = editorEnvTargets.map((t, i) => {
    const ic = t.type === 'app' ? ICONS.environment : ICONS.url;
    const cls = t.type === 'app' ? 'is-app' : 'is-site';
    return `<div class="env-cap-row ${cls}" data-i="${i}">
      <span class="env-ic">${ic}</span>
      <span class="env-cap-val" title="${escapeHtml(t.value || '')}">${escapeHtml(t.value || '')}</span>
      ${profileSelect(t, i)}
      <button type="button" class="env-x" data-i="${i}" title="Remove">×</button>
    </div>`;
  }).join('');

  const count = editorEnvTargets.length;
  const hasSites = editorEnvTargets.some((t) => t.type === 'site');
  const siteN = editorEnvTargets.filter((t) => t.type === 'site').length;
  const appN  = editorEnvTargets.filter((t) => t.type === 'app').length;

  host.innerHTML = `
    <div class="env-capture-row">
      <button type="button" class="env-capture-btn" data-scope="desktop" id="envCapDesktop">
        <span class="cap-ic">${ICONS.environment}</span>
        <span class="cap-lbl">This desktop</span>
      </button>
      <button type="button" class="env-capture-btn ghost" data-scope="all" id="envCapAll">
        <span class="cap-lbl">Everything open</span>
      </button>
    </div>
    <div class="env-cap-hint" id="envCapHint">${count
      ? `${siteN} ${siteN === 1 ? 'site' : 'sites'} · ${appN} ${appN === 1 ? 'app' : 'apps'} — remove anything you don't want.`
      : '“This desktop” grabs what’s on your current Space. “Everything open” grabs every app + tab.'}</div>
    <div class="env-rows">${rows}</div>
    <div class="env-mode${hasSites ? '' : ' hidden'}">
      <span>Open sites in:</span>
      <button type="button" class="env-mode-btn${editorEnvUrlMode === 'window' ? ' active' : ''}" data-mode="window">One window</button>
      <button type="button" class="env-mode-btn${editorEnvUrlMode === 'separate' ? ' active' : ''}" data-mode="separate">Separate windows</button>
    </div>`;

  // Capture buttons — snapshot the current Desktop, or everything open.
  const doCapture = async (scope, btn) => {
    const hint = $('envCapHint');
    const lbl = btn.querySelector('.cap-lbl');
    const prev = lbl.textContent;
    host.querySelectorAll('.env-capture-btn').forEach((b) => { b.disabled = true; });
    btn.classList.add('busy');
    lbl.textContent = 'Capturing…';
    try {
      const snap = await window.restash.captureEnvironment(scope);
      const targets = [];
      for (const url of (snap?.sites || [])) targets.push({ type: 'site', value: url });
      for (const a of (snap?.apps || [])) targets.push({ type: 'app', value: a.name, path: a.path || '' });
      editorEnvTargets = targets;
      renderEnvEditor();
      if (!targets.length && $('envCapHint')) {
        $('envCapHint').textContent = scope === 'desktop'
          ? 'Nothing on this desktop. Open some tabs/apps here, then capture again.'
          : 'Nothing detected. Open some tabs/apps (allow Restash to control your browser when prompted), then try again.';
      } else if (targets.length && !$('fLabel').value.trim()) {
        $('fLabel').value = scope === 'desktop' ? 'This desktop' : 'My workspace';
      }
    } catch {
      host.querySelectorAll('.env-capture-btn').forEach((b) => { b.disabled = false; });
      btn.classList.remove('busy');
      lbl.textContent = prev;
      if (hint) hint.textContent = 'Capture failed — allow Restash to control your browser in System Settings → Privacy → Automation.';
    }
  };
  $('envCapDesktop')?.addEventListener('click', (e) => doCapture('desktop', e.currentTarget));
  $('envCapAll')?.addEventListener('click', (e) => doCapture('all', e.currentTarget));

  // Remove buttons.
  host.querySelectorAll('.env-x').forEach((btn) => {
    btn.addEventListener('click', () => {
      editorEnvTargets.splice(Number(btn.dataset.i), 1);
      renderEnvEditor();
    });
  });

  // Per-site Chrome-profile pickers. No re-render — just update the model.
  host.querySelectorAll('.env-profile').forEach((sel) => {
    sel.addEventListener('change', () => {
      const t = editorEnvTargets[Number(sel.dataset.i)];
      if (t) t.profile = sel.value || undefined;
    });
  });

  // Site-open mode toggle.
  host.querySelectorAll('.env-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      editorEnvUrlMode = btn.dataset.mode;
      host.querySelectorAll('.env-mode-btn').forEach((b) =>
        b.classList.toggle('active', b.dataset.mode === editorEnvUrlMode));
    });
  });
}

function renderStashPicker() {
  const host = $('fStashPicker');
  if (!host) return;
  const chips = availableStashes.map((s) => `
    <button type="button" class="stash-chip${editorStashIds.has(s.id) ? ' active' : ''}" data-id="${s.id}">${escapeHtml(s.name)}</button>
  `).join('');
  host.innerHTML = chips + `
    <button type="button" class="stash-chip new" id="newStashBtn">+ New</button>
    <input type="text" class="stash-chip-input hidden" id="newStashInput" placeholder="Stash name…" autocomplete="off" />
  `;
  for (const btn of host.querySelectorAll('.stash-chip:not(.new)')) {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (editorStashIds.has(id)) editorStashIds.delete(id);
      else editorStashIds.add(id);
      btn.classList.toggle('active');
    });
  }
  $('newStashBtn').addEventListener('click', () => {
    $('newStashBtn').classList.add('hidden');
    const input = $('newStashInput');
    input.classList.remove('hidden');
    input.value = '';
    setTimeout(() => input.focus(), 0);
  });
  $('newStashInput').addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const name = $('newStashInput').value.trim();
      if (!name) return;
      if (hitsFreeLimit('stashes')) return;
      const res = await window.restash.createStash(name);
      if (res?.ok && res.stash) {
        availableStashes.push(res.stash);
        editorStashIds.add(res.stash.id);
        renderStashPicker(); // rebuild so the new chip appears
      }
    } else if (e.key === 'Escape') {
      $('newStashBtn').classList.remove('hidden');
      $('newStashInput').classList.add('hidden');
    }
  });
}

async function pickAndAppendFiles() {
  const picked = await window.restash.pickFile();
  if (!picked || !picked.length) return;
  for (const p of picked) {
    const res = await window.restash.addFile(p.path);
    if (res?.ok) {
      editorFiles.push({
        storedPath: res.storedPath,
        originalName: res.originalName,
        size: res.size,
        mime: res.mime,
      });
    } else if (res?.reason === 'too-large') {
      // Surface inline so the user can SEE which file was rejected and why.
      editorFileErrors.push({
        originalName: res.originalName || p.name,
        size: res.size,
        limit: res.limit,
        reason: 'too-large',
      });
    } else if (res?.reason) {
      editorFileErrors.push({
        originalName: p.name,
        size: 0,
        reason: res.reason,
      });
    }
  }
  // Auto-fill the label from the first file (only if empty).
  if (editorFiles.length && !$('fLabel').value) {
    const first = editorFiles[0].originalName;
    $('fLabel').value = first.replace(/\.[^.]+$/, '');
  }
  renderFilePicker();
}

function renderFilePicker() {
  const empty  = $('filePickEmpty');
  const picked = $('filePickPicked');

  // Wire the empty zone click once.
  if (!renderFilePicker._wired) {
    empty.addEventListener('click', pickAndAppendFiles);
    renderFilePicker._wired = true;
  }

  if (!editorFiles.length && !editorFileErrors.length) {
    empty.classList.remove('hidden');
    picked.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  picked.classList.remove('hidden');

  // Warning rows for rejected files (size limit, etc.). Shown ABOVE the
  // accepted rows so they read first.
  const errorRowsHTML = editorFileErrors.map((err, i) => {
    let sub;
    if (err.reason === 'too-large') {
      const fileSize = formatBytes(err.size || 0);
      const limit = formatBytes(err.limit || (100 * 1024 * 1024));
      sub = `${fileSize} — Restash supports files up to ${limit}`;
    } else {
      sub = err.reason || 'Could not be added';
    }
    return `
      <div class="file-row error" data-err-i="${i}">
        <div class="thumb error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
        </div>
        <div class="meta">
          <div class="name">${escapeHtml(err.originalName)}</div>
          <div class="sub">${escapeHtml(sub)}</div>
        </div>
        <button type="button" class="x-btn" data-dismiss-err="${i}" title="Dismiss">×</button>
      </div>
    `;
  }).join('');

  // Build a list of file rows + an "Add more" button.
  const fileRowsHTML = editorFiles.map((f, i) => {
    const isImage = (f.mime || '').startsWith('image/');
    const isVideo = (f.mime || '').startsWith('video/');
    const thumb = isImage && f.storedPath
      ? `<div class="thumb"><img src="file://${f.storedPath.replace(/"/g, '%22')}" alt="" /></div>`
      : `<div class="thumb${isVideo ? ' video' : ''}"><div class="file-glyph">${fileGlyph(f.mime)}</div></div>`;
    const sizeStr = formatBytes(f.size);
    const ext = (f.originalName.match(/\.([^.]+)$/) || [, ''])[1].toUpperCase();
    const sub = ext ? `${sizeStr} · ${ext}` : sizeStr;
    return `
      <div class="file-row" data-i="${i}">
        ${thumb}
        <div class="meta">
          <div class="name">${escapeHtml(f.originalName)}</div>
          <div class="sub">${escapeHtml(sub)}</div>
        </div>
        <button type="button" class="x-btn" data-remove="${i}" title="Remove">×</button>
      </div>
    `;
  }).join('');

  picked.innerHTML = errorRowsHTML + fileRowsHTML + `
    <button type="button" class="add-more-btn" id="addMoreFiles">+ Add more files</button>
  `;

  picked.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.remove);
      editorFiles.splice(idx, 1);
      renderFilePicker();
    });
  });
  picked.querySelectorAll('[data-dismiss-err]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.dismissErr);
      editorFileErrors.splice(idx, 1);
      renderFilePicker();
    });
  });
  picked.querySelector('#addMoreFiles')?.addEventListener('click', pickAndAppendFiles);
}

function syncKindUI() {
  for (const btn of document.querySelectorAll('#kindPicker .chip')) {
    btn.classList.toggle('active', btn.dataset.kind === editorKind);
  }
  const meta = KINDS[editorKind];
  $('fValue').placeholder = meta.valuePlaceholder;
  // Kind-specific label hint (URL → "Restash homepage", Crypto → "My ETH wallet", etc.)
  $('fLabel').placeholder = meta.labelPlaceholder || '';

  // Crypto kind reveals the visual chain picker (for chain logo + tag).
  const isCrypto = editorKind === 'cryptoAddress';
  $('fChainRow').classList.toggle('hidden', !isCrypto);

  // Contact kind swaps the single Value field for the structured field group.
  const isContact = editorKind === 'contact';
  $('fContactRow').classList.toggle('hidden', !isContact);

  // Environment kind swaps the Value field for the targets editor.
  const isEnv = editorKind === 'environment';
  $('fEnvRow').classList.toggle('hidden', !isEnv);

  // File kind swaps the text Value field for the file picker zone.
  const isFile = editorKind === 'file';
  $('fValueRow').classList.toggle('hidden', isFile || isContact || isEnv);
  $('fFileRow').classList.toggle('hidden', !isFile);

  // Agent kind reveals the curated starter-template chips above the fields.
  const isAgent = editorKind === 'agent';
  $('fAgentRow').classList.toggle('hidden', !isAgent);

  // Command: monospace value so shell syntax reads cleanly. Agent: taller.
  $('fValue').classList.toggle('mono', editorKind === 'command');
  $('fValue').rows = isAgent ? 9 : 3;
  const valueLabel = $('fValueRow')?.querySelector('span');
  if (valueLabel) {
    valueLabel.textContent = editorKind === 'command' ? 'Command'
      : isAgent ? 'Template (Markdown)'
      : 'Value';
  }
}

function closeEditor() {
  editorBackdrop.classList.add('hidden');
  window.restash.setEditorWindow?.(false);
  state.editing = null;
  focusSearch();
}

async function saveFromEditor() {
  const label = $('fLabel').value.trim();
  const isFile = editorKind === 'file';
  const isContact = editorKind === 'contact';
  const isEnv = editorKind === 'environment';
  // Crypto: tag = chain code. Other kinds don't use tag.
  const tag = editorKind === 'cryptoAddress' ? (editorChain || undefined) : undefined;
  const validIds = new Set(availableStashes.map((s) => s.id));
  const stashIds = Array.from(editorStashIds).filter((id) => validIds.has(id));

  // Structured contact fields (only meaningful for the contact kind).
  const contact = {
    email: $('fContactEmail').value.trim(),
    phone: $('fContactPhone').value.trim(),
    company: $('fContactCompany').value.trim(),
    wallet: $('fContactWallet').value.trim(),
  };
  // The pasted value for a contact = its most useful single field.
  const contactValue = contact.email || contact.phone || contact.wallet || contact.company || '';

  // Environment: keep only targets with a value (URL or chosen app).
  const envTargets = editorEnvTargets
    .map((t) => ({
      type: t.type === 'app' ? 'app' : 'site',
      value: (t.value || '').trim(),
      ...(t.path ? { path: t.path } : {}),
      ...(t.type !== 'app' && t.profile ? { profile: t.profile } : {}),
    }))
    .filter((t) => t.value || t.path);

  // Validation: file → ≥1 file; contact → ≥1 field; env → ≥1 target; else value.
  if (isFile) {
    if (!label || !editorFiles.length) return;
  } else if (isContact) {
    if (!label || !contactValue) return;
  } else if (isEnv) {
    if (!label || !envTargets.length) return;
  } else {
    const value = $('fValue').value.trim();
    if (!label || !value) return;
  }

  // Free-tier cap — block a NEW item past the limit (editing an existing
  // item is always allowed). Keeps the editor open so input isn't lost.
  if (!state.editing && hitsFreeLimit('items')) return;

  if (isFile) {
    const fileFields = { files: editorFiles.map((f) => ({ ...f })) };
    // Keep `value` populated with the first stored path for back-compat with
    // anything that still reads item.value (share preview, etc.).
    const value = editorFiles[0]?.storedPath || '';
    if (state.editing) {
      Object.assign(state.editing, { kind: 'file', label, value, tag, stashIds, ...fileFields });
      // Clear legacy single-file fields to avoid stale data.
      delete state.editing.originalName;
      delete state.editing.mime;
      delete state.editing.size;
    } else {
      state.items.push({
        id: uid(),
        kind: 'file',
        label,
        value,
        tag,
        stashIds,
        ...fileFields,
        createdAt: Date.now(),
        lastUsedAt: null,
        pins: {},
      });
    }
  } else if (isContact) {
    if (state.editing) {
      Object.assign(state.editing, { kind: 'contact', label, value: contactValue, tag: undefined, stashIds, contact });
    } else {
      state.items.push({
        id: uid(),
        kind: 'contact',
        label,
        value: contactValue,
        stashIds,
        contact,
        createdAt: Date.now(),
        lastUsedAt: null,
        pins: {},
      });
    }
  } else if (isEnv) {
    const env = { targets: envTargets, urlMode: editorEnvUrlMode === 'separate' ? 'separate' : 'window' };
    // value = newline summary of targets, so search + row peek have something.
    const value = envTargets.map((t) => t.value).join('\n');
    if (state.editing) {
      Object.assign(state.editing, { kind: 'environment', label, value, tag: undefined, stashIds, env });
      delete state.editing.contact;
    } else {
      state.items.push({
        id: uid(),
        kind: 'environment',
        label,
        value,
        stashIds,
        env,
        createdAt: Date.now(),
        lastUsedAt: null,
        pins: {},
      });
    }
  } else {
    const value = $('fValue').value.trim();
    if (state.editing) {
      Object.assign(state.editing, { kind: editorKind, label, value, tag, stashIds });
      // Switching away from contact — drop the stale structured object.
      delete state.editing.contact;
    } else {
      state.items.push({
        id: uid(),
        kind: editorKind,
        label,
        value,
        tag,
        stashIds,
        createdAt: Date.now(),
        lastUsedAt: null,
        pins: {},
      });
    }
  }
  await persist();
  closeEditor();
  render();
}

async function deleteFromEditor() {
  if (!state.editing) return;
  state.items = state.items.filter((i) => i.id !== state.editing.id);
  await persist();
  closeEditor();
  render();
}

// ---------- QR ----------
async function openQR(item) {
  $('qrLabel').textContent = item.label;
  $('qrValue').textContent = item.value;
  try {
    const dataURL = await window.restash.qrDataURL(item.value);
    $('qrImg').src = dataURL;
  } catch {
    $('qrImg').removeAttribute('src');
  }
  qrBackdrop.classList.remove('hidden');
}

function closeQR() {
  qrBackdrop.classList.add('hidden');
  // Defer focusing search so it doesn't fight with macOS focus shifting after
  // the modal click. Avoids race conditions when the popover was inactive.
  setTimeout(() => {
    try { focusSearch(); } catch {}
  }, 0);
}

// Belt-and-suspenders: global click delegation. Even if the direct
// addEventListener wiring is somehow lost between renders, anything in
// the document with data-close="qr" closes the QR modal.
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-close]');
  if (!target) return;
  const which = target.dataset.close;
  if (which === 'qr') { e.preventDefault(); closeQR(); }
  else if (which === 'editor') { e.preventDefault(); closeEditor(); }
  else if (which === 'settings') { e.preventDefault(); closeSettings(); }
  else if (which === 'billing') { e.preventDefault(); closeBilling(); }
});

// Billing modal interactions — segment switch, CTA, upsell, manage, support.
document.addEventListener('click', (e) => {
  const seg = e.target.closest('[data-billing-seg]');
  if (seg) {
    billingSelectedPlan = seg.dataset.billingSeg;
    renderBilling();
    return;
  }
  if (e.target.closest('[data-billing-cta]')) {
    window.restash.openExternal(CHECKOUT_URLS[billingSelectedPlan]);
    return;
  }
  const upsell = e.target.closest('[data-billing-upsell]');
  if (upsell) {
    window.restash.openExternal(CHECKOUT_URLS[upsell.dataset.billingUpsell]);
    return;
  }
  if (e.target.closest('[data-billing-manage]')) {
    // Lemon Squeezy customer order portal — buyers enter their email to get a
    // magic link for invoices, plan changes, and cancellation.
    window.restash.openExternal('https://app.lemonsqueezy.com/my-orders');
    return;
  }
  if (e.target.closest('[data-activate-toggle]')) {
    const box = $('activateBox');
    if (box) {
      box.classList.toggle('hidden');
      if (!box.classList.contains('hidden')) $('licenseKeyInput')?.focus();
    }
    return;
  }
  if (e.target.closest('[data-activate-go]')) {
    activateLicenseFromBilling();
    return;
  }
  if (e.target.closest('[data-license-deactivate]')) {
    deactivateLicenseFromBilling();
    return;
  }
  if (e.target.closest('#billingSupportBtn')) {
    window.restash.openExternal(`mailto:${SUPPORT_EMAIL}?subject=Restash%20support`);
  }
});
if (billingBackdrop) {
  billingBackdrop.addEventListener('click', (e) => {
    if (e.target === billingBackdrop) closeBilling();
  });
}

// One-time offer interactions — deal select, claim, dismiss.
document.addEventListener('click', (e) => {
  const deal = e.target.closest('[data-oto-deal]');
  if (deal) {
    otoSelectedDeal = deal.dataset.otoDeal;
    renderOTO();
    return;
  }
  if (e.target.closest('[data-oto-cta]')) {
    window.restash.openExternal(CHECKOUT_URLS[OTO_DEALS[otoSelectedDeal].url]);
    closeOTO();
    return;
  }
  if (e.target.closest('[data-oto-dismiss]')) {
    closeOTO();
  }
});
if (otoBackdrop) {
  otoBackdrop.addEventListener('click', (e) => {
    // OTO dismisses on outside click too — it's a one-shot, no trapping.
    if (e.target === otoBackdrop) closeOTO();
  });
}

// Upgrade nudge → billing. Hide any open modal first so billing isn't stacked.
{
  const lnBtn = $('limitNudgeBtn');
  if (lnBtn) lnBtn.addEventListener('click', () => {
    $('limitNudge').classList.add('hidden');
    editorBackdrop.classList.add('hidden');
    settingsBackdrop.classList.add('hidden');
    openBilling();
  });
}

// ---------- settings ----------
const settingsBackdrop = $('settingsBackdrop');
let recording = false;
let recordedAccel = null;

function openSettings() {
  setHotkeyDisplay(state.hotkey);
  setQRHotkeyDisplay(state.qrHotkey);
  hideHotkeyStatus();
  hideQRHotkeyStatus();
  renderSizePresets('list');
  renderSizePresets('grid');
  renderClipHistorySeg();
  refreshAccessUI();
  settingsBackdrop.classList.remove('hidden');
}

// Reflect the saved clipboard-memory count on the segmented control.
function renderClipHistorySeg() {
  const seg = $('clipHistorySeg');
  if (!seg) return;
  for (const btn of seg.querySelectorAll('button')) {
    btn.classList.toggle('on', Number(btn.dataset.n) === state.clipHistoryMax);
  }
}

function closeSettings() {
  stopRecording();
  stopQRRecording();
  settingsBackdrop.classList.add('hidden');
  focusSearch();
}

function setHotkeyDisplay(accel) {
  $('hotkeyDisplay').textContent = prettyHotkey(accel);
  $('hotkeyDisplay').classList.remove('recording');
}

function hideHotkeyStatus() {
  $('hotkeyStatus').classList.add('hidden');
}

function showHotkeyStatus(kind, message) {
  const el = $('hotkeyStatus');
  el.className = `hotkey-status ${kind}`;
  el.textContent = message;
  el.classList.remove('hidden');
}

function startRecording() {
  recording = true;
  recordedAccel = null;
  $('hotkeyDisplay').textContent = 'Press a combo…';
  $('hotkeyDisplay').classList.add('recording');
  $('hotkeyRecordBtn').textContent = 'Cancel';
  hideHotkeyStatus();
}

function stopRecording() {
  recording = false;
  recordedAccel = null;
  $('hotkeyRecordBtn').textContent = 'Change…';
  setHotkeyDisplay(state.hotkey);
}

async function commitRecordedHotkey(accel) {
  // Soft-warn: combo would register but hijack a common app shortcut.
  if (isSoftWarn(accel)) {
    const ok = confirm(
      `${prettyHotkey(accel)} is a common app shortcut (e.g. Save, Copy, Paste).\n\n` +
      `Setting it as Restash's global hotkey will hijack it EVERYWHERE on your Mac — ` +
      `every app's ${prettyHotkey(accel)} will open Restash instead of doing its normal action.\n\n` +
      `Use it anyway?`
    );
    if (!ok) {
      stopRecording();
      return;
    }
  }

  // Hard check: ask the main process to actually try registering it.
  const result = await window.restash.setHotkey(accel);
  if (result.ok) {
    state.hotkey = result.hotkey;
    setHotkeyDisplay(state.hotkey);
    showHotkeyStatus('ok', `Saved. Press ${prettyHotkey(state.hotkey)} anywhere to open Restash.`);
    updateHintBar();
    recording = false;
    recordedAccel = null;
    $('hotkeyRecordBtn').textContent = 'Change…';
  } else {
    showHotkeyStatus('error',
      result.reason === 'in-use'
        ? `${prettyHotkey(accel)} is already used by another app or by macOS. Pick another combo.`
        : `Could not register ${prettyHotkey(accel)}.`
    );
    stopRecording();
  }
}

async function resetHotkey() {
  const result = await window.restash.resetHotkey();
  if (result.ok) {
    state.hotkey = result.hotkey;
    setHotkeyDisplay(state.hotkey);
    showHotkeyStatus('ok', `Reset to default ${prettyHotkey(state.hotkey)}.`);
    updateHintBar();
  } else {
    showHotkeyStatus('error', `Could not register default hotkey.`);
  }
}

// ---------- QR-decoder hotkey recorder (parallel to the summon one) ----------
let qrRecording = false;
let qrRecordedAccel = null;

function setQRHotkeyDisplay(accel) {
  $('qrHotkeyDisplay').textContent = prettyHotkey(accel);
  $('qrHotkeyDisplay').classList.remove('recording');
}
function hideQRHotkeyStatus() { $('qrHotkeyStatus').classList.add('hidden'); }
function showQRHotkeyStatus(kind, message) {
  const el = $('qrHotkeyStatus');
  el.className = `hotkey-status ${kind}`;
  el.textContent = message;
  el.classList.remove('hidden');
}
function startQRRecording() {
  qrRecording = true;
  qrRecordedAccel = null;
  $('qrHotkeyDisplay').textContent = 'Press a combo…';
  $('qrHotkeyDisplay').classList.add('recording');
  $('qrHotkeyRecordBtn').textContent = 'Cancel';
  hideQRHotkeyStatus();
}
function stopQRRecording() {
  qrRecording = false;
  qrRecordedAccel = null;
  $('qrHotkeyRecordBtn').textContent = 'Change…';
  setQRHotkeyDisplay(state.qrHotkey);
}
async function commitRecordedQRHotkey(accel) {
  if (isSoftWarn(accel)) {
    const ok = confirm(
      `${prettyHotkey(accel)} is a common app shortcut. Setting it as the QR-decoder hotkey ` +
      `will hijack it everywhere on your Mac. Use it anyway?`
    );
    if (!ok) { stopQRRecording(); return; }
  }
  const result = await window.restash.setQRHotkey(accel);
  if (result.ok) {
    state.qrHotkey = result.hotkey;
    setQRHotkeyDisplay(state.qrHotkey);
    showQRHotkeyStatus('ok', `Saved. Press ${prettyHotkey(state.qrHotkey)} anywhere to scan a QR.`);
    qrRecording = false;
    qrRecordedAccel = null;
    $('qrHotkeyRecordBtn').textContent = 'Change…';
  } else {
    showQRHotkeyStatus('error',
      result.reason === 'in-use'
        ? `${prettyHotkey(accel)} is already used by another app or by macOS. Pick another combo.`
        : `Could not register ${prettyHotkey(accel)}.`
    );
    stopQRRecording();
  }
}
async function resetQRHotkey() {
  const result = await window.restash.resetQRHotkey();
  if (result.ok) {
    state.qrHotkey = result.hotkey;
    setQRHotkeyDisplay(state.qrHotkey);
    showQRHotkeyStatus('ok', `Reset to default ${prettyHotkey(state.qrHotkey)}.`);
  } else {
    showQRHotkeyStatus('error', `Could not register default QR hotkey.`);
  }
}

async function refreshAccessUI(prompt = false) {
  try {
    accessGranted = await window.restash.checkAccessibility(prompt);
  } catch {
    accessGranted = false;
  }
  const banner = $('accessBanner');
  if (banner) banner.classList.toggle('hidden', accessGranted);

  const statusText = $('accessStatusText');
  if (statusText) {
    statusText.textContent = accessGranted ? 'Granted — auto-paste enabled' : 'Not granted — auto-paste is disabled';
    statusText.classList.toggle('granted', accessGranted);
    statusText.classList.toggle('denied', !accessGranted);
  }
  const openBtn = $('accessOpenBtn');
  if (openBtn) openBtn.classList.toggle('hidden', accessGranted);
}

function updateHintBar() {
  const hb = document.querySelector('.hintbar');
  if (!hb) return;
  const spans = hb.querySelectorAll('span');
  if (spans.length >= 3) {
    spans[spans.length - 1].innerHTML = `<kbd>${prettyHotkey(state.hotkey)}</kbd> open`;
  }
}

function focusSearch() {
  searchEl.focus();
  searchEl.select();
}

// ---------- wiring ----------
function wire() {
  searchEl.addEventListener('input', (e) => {
    state.search = e.target.value;
    state.selectedId = null; // force re-pick to first match
    render();
  });

  // Dropdown footer (list mode only). Delegated click handler.
  dropdownFooter?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'new') return openEditor(null);
    if (act === 'theme') return toggleTheme();
    if (act === 'settings') return openSettings();
    if (act === 'updates') return handleUpdatesCheck();
    if (act === 'billing') return handleBillingOpen();
    if (act === 'quit') return window.restash.quit();
  });

  // Right-click tray menu items relay to renderer through these IPC events.
  window.restash.onOpenSettings(() => openSettings());
  window.restash.onOpenUpdates(() => handleUpdatesCheck());
  window.restash.onOpenBilling(() => handleBillingOpen());

  // Main process tells us which mode to render before each show.
  window.restash.onModeSet((mode) => applyMode(mode));

  // License re-check downgraded us (refund / expiry) — refresh entitlement.
  window.restash.onEntitlementChanged?.(async () => {
    try {
      state.entitlement = await window.restash.getEntitlement();
      state.tier = state.entitlement.tier;
      if (!billingBackdrop.classList.contains('hidden')) renderBilling();
      render();
    } catch {}
  });

  // Enter inside the license-key field submits the activation.
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'licenseKeyInput' && e.key === 'Enter') {
      e.preventDefault();
      activateLicenseFromBilling();
    }
  });

  // Drag-to-resize handles + the modal-open watcher that hides them.
  wireResizeHandles();
  watchModals();
  // QR decoder pushes a result via main → renderer; stash it and re-render
  // so the qr-mode panel reflects what was decoded.
  window.restash.onQRResult?.((payload) => { state.qrResult = payload; render(); });
  // Subsequent hotkey presses while the popover is open cycle through stashes —
  // grid mode slides the numpad, list mode flips the chip bar at the top.
  window.restash.onStashCycle?.((payload) => {
    const direction = payload?.direction ?? 1;
    if (state.mode === 'grid') cycleStash(direction);
    else cycleListStash(direction);
  });
  // Stash edit window persists changes then closes; main pings us to refresh.
  window.restash.onStashesChanged?.(async () => {
    try {
      availableStashes = await window.restash.listStashes();
      state.items = await window.restash.loadItems();
    } catch {}
    render();
  });

  $('settingsCloseBtn').addEventListener('click', closeSettings);

  // Stash edit lives in its own BrowserWindow (stash-edit.html). When the
  // user clicks Done / Delete there, main emits stashes:changed; we refresh
  // via that handler (wired in init).

  settingsBackdrop.addEventListener('click', (e) => {
    if (e.target === settingsBackdrop) closeSettings();
  });
  $('hotkeyRecordBtn').addEventListener('click', () => {
    if (recording) stopRecording();
    else startRecording();
  });
  $('hotkeyResetBtn').addEventListener('click', resetHotkey);

  // QR-decoder hotkey recorder buttons.
  $('qrHotkeyRecordBtn').addEventListener('click', () => {
    if (qrRecording) stopQRRecording(); else startQRRecording();
  });
  $('qrHotkeyResetBtn').addEventListener('click', resetQRHotkey);

  // Clipboard memory: segmented "Recent items" control + Clear history.
  $('clipHistorySeg')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-n]');
    if (!btn) return;
    const n = Number(btn.dataset.n);
    if (n === state.clipHistoryMax) return;
    state.clipHistoryMax = n;
    renderClipHistorySeg();
    try { await window.restash.clipboardHistory.setMax(n); } catch {}
    // Main trims + broadcasts; re-render Recent so the change is immediate.
    if (state.mode === 'list') renderRecent();
  });
  $('clipClearBtn')?.addEventListener('click', async () => {
    if (!state.clipHistory.length) { toast('No recent copies to clear'); return; }
    const ok = window.confirm('Clear all captured clipboard copies? This cannot be undone.');
    if (!ok) return;
    try { await window.restash.clipboardHistory.clear(); } catch {}
    state.clipHistory = [];
    if (state.mode === 'list') renderRecent();
    toast('Cleared recent copies');
  });

  $('accessGrantBtn').addEventListener('click', async () => {
    // First click: trigger the macOS prompt by calling check(prompt=true)
    await refreshAccessUI(true);
    if (!accessGranted) await window.restash.openAccessibilitySettings();
  });
  $('accessOpenBtn').addEventListener('click', async () => {
    await window.restash.openAccessibilitySettings();
  });

  // kindPicker buttons are generated by renderKindPicker() on editor open;
  // their listeners are wired there.
  $('saveBtn').addEventListener('click', saveFromEditor);
  $('cancelBtn').addEventListener('click', closeEditor);
  $('delBtn').addEventListener('click', deleteFromEditor);
  editorBackdrop.addEventListener('click', (e) => {
    if (e.target === editorBackdrop) closeEditor();
  });
  $('qrCloseBtn').addEventListener('click', closeQR);
  qrBackdrop.addEventListener('click', (e) => {
    if (e.target === qrBackdrop) closeQR();
  });

  document.addEventListener('keydown', (e) => {
    const editorOpen = !editorBackdrop.classList.contains('hidden');
    const qrOpen = !qrBackdrop.classList.contains('hidden');
    const settingsOpen = !settingsBackdrop.classList.contains('hidden');
    const billingOpen = !billingBackdrop.classList.contains('hidden');
    const otoOpen = otoBackdrop && !otoBackdrop.classList.contains('hidden');

    // Either hotkey recorder (summon or QR) swallows everything while active.
    if (recording || qrRecording) {
      e.preventDefault();
      e.stopPropagation();
      const slot = qrRecording ? 'qr' : 'summon';
      const displayEl = slot === 'qr' ? $('qrHotkeyDisplay') : $('hotkeyDisplay');
      const stopFn   = slot === 'qr' ? stopQRRecording      : stopRecording;
      const statusFn = slot === 'qr' ? showQRHotkeyStatus   : showHotkeyStatus;
      const commitFn = slot === 'qr' ? commitRecordedQRHotkey : commitRecordedHotkey;

      if (e.key === 'Escape') { stopFn(); return; }
      if (isModifier(e.key)) {
        const partial = [];
        if (e.metaKey) partial.push('Command');
        if (e.ctrlKey) partial.push('Control');
        if (e.altKey) partial.push('Alt');
        if (e.shiftKey) partial.push('Shift');
        displayEl.textContent = partial.length ? prettyHotkey(partial.join('+') + '+…') : 'Press a combo…';
        return;
      }
      const accel = eventToAccelerator(e);
      const v = validateAccelerator(accel);
      if (!v.ok) { statusFn('error', v.message); return; }
      displayEl.textContent = prettyHotkey(accel);
      displayEl.classList.remove('recording');
      if (slot === 'qr') qrRecordedAccel = accel; else recordedAccel = accel;
      commitFn(accel);
      return;
    }

    if (e.key === 'Escape') {
      if (otoOpen) closeOTO();
      else if (editorOpen) closeEditor();
      else if (qrOpen) closeQR();
      else if (settingsOpen) closeSettings();
      else if (billingOpen) closeBilling();
      else window.restash.hideWindow();
      return;
    }

    if (editorOpen || qrOpen || settingsOpen || billingOpen || otoOpen) return;

    if (e.metaKey && e.key === ',') {
      e.preventDefault();
      openSettings();
      return;
    }
    if (e.metaKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      openEditor(null);
      return;
    }
    // Grid mode: bare digit keys paste the numpad slot of the active page.
    // On the Recent page (RES-33), 1–9 paste the FROZEN top-9 recent clips.
    if (state.mode === 'grid' && /^[1-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const idx = parseInt(e.key, 10) - 1;
      const pages = gridPages();
      const page = pages[clampGridPageIdx()];
      if (page && page.recent) {
        const recents = recentsForModal();
        if (recents[idx]) pasteRecentEntry(recents[idx]);
      } else if (page) {
        const items = itemsForStash(page);
        if (items[idx]) pasteItem(items[idx]);
      }
      return;
    }
    // List mode: ⌘1-9 paste.
    if (e.metaKey && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      const items = filtered();
      const idx = parseInt(e.key, 10) - 1;
      if (items[idx]) pasteItem(items[idx]);
      return;
    }
    // Grid mode: ←/→ cycle pages (Recent ↔ stashes), wrapping.
    if (state.mode === 'grid' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      cycleStash(e.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    // Grid mode + Recent page: ↑/↓ move the selection within the list.
    if (state.mode === 'grid' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const pages = gridPages();
      if (pages[clampGridPageIdx()]?.recent) {
        e.preventDefault();
        const n = recentsForModal().length;
        if (n) {
          state.recentSelIdx = Math.max(0, Math.min(n - 1, state.recentSelIdx + (e.key === 'ArrowDown' ? 1 : -1)));
          refreshRecentSel();
        }
        return;
      }
      // Other grid pages don't use a row selection — swallow to avoid list moves.
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelection(1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelection(-1);
      return;
    }
    if (e.key === 'Enter') {
      // Grid mode + Recent page: Enter pastes the selected recent clip.
      if (state.mode === 'grid') {
        const pages = gridPages();
        if (pages[clampGridPageIdx()]?.recent) {
          const recents = recentsForModal();
          const entry = recents[state.recentSelIdx];
          if (entry) { e.preventDefault(); pasteRecentEntry(entry); }
        }
        return;
      }
      const item = selectedItem();
      if (item) {
        e.preventDefault();
        pasteItem(item);
      }
    }
  });

  // Each time the popover appears, reset state and focus the search box.
  window.restash.onPopoverShown(() => {
    // Always summon to a clean state. If a modal (Settings / Editor / QR) was
    // left open when the popover last auto-hid on blur, it would otherwise
    // still be on top — making the hotkey look like it "opens Settings".
    document.querySelectorAll('.backdrop').forEach((b) => b.classList.add('hidden'));
    state.search = '';
    searchEl.value = '';
    state.selectedId = null;
    // RES-33: freeze the Recent page's 1–9 mapping for THIS summon. Snapshot
    // the current clipboard history now; it stays stable while the modal is
    // open and re-ranks on the next summon.
    state.recentSnapshot = Array.isArray(state.clipHistory) ? state.clipHistory.slice() : [];
    state.recentSelIdx = 0;
    // Every summon of the cursor modal lands on page 0 (Recent).
    state.gridPageIdx = 0;
    refreshAccessUI();
    render();
    focusSearch();
    // One high-intent shot at the discounted offer once the trial's near its end.
    maybeShowOTO();
  });

  // Apply the initial mode so the correct UI shell is shown before any
  // mode:set event arrives from main.
  applyMode('list');
}

// ---------- boot ----------
(async function init() {
  state.items = await window.restash.loadItems();

  // Migrate legacy single-file items (saved before multi-file support) into
  // the new `files: []` shape. Old: { value, originalName, mime, size }.
  // New:  { files: [{ storedPath, originalName, mime, size }] }.
  let touchedFiles = false;
  for (const it of (state.items || [])) {
    if (it.kind === 'file' && !Array.isArray(it.files)) {
      it.files = it.value ? [{
        storedPath: it.value,
        originalName: it.originalName || it.value.split('/').pop() || 'file',
        mime: it.mime,
        size: it.size,
      }] : [];
      touchedFiles = true;
    }
  }
  if (touchedFiles) await persist();

  if (!state.items || state.items.length === 0) {
    state.items = [
      { id: uid(), kind: 'url', label: 'CFA Crypto Pro', value: 'https://cfacryptopro.com', createdAt: Date.now(), pins: { all: 0 } },
      { id: uid(), kind: 'cryptoAddress', label: 'Example ETH wallet', value: '0x0000000000000000000000000000000000000000', tag: 'ETH', createdAt: Date.now() - 1000 },
      { id: uid(), kind: 'text', label: 'Email signature', value: '—\nKevin\nkevin@cfacryptopro.com', createdAt: Date.now() - 2000 },
    ];
    await persist();
  }
  // Pull the live hotkey + theme + user stashes from main.
  try {
    const s = await window.restash.loadSettings();
    state.hotkey   = s.currentHotkey   || s.hotkey   || state.hotkey;
    state.qrHotkey = s.currentQRHotkey || s.qrHotkey || state.qrHotkey || 'Command+Shift+F';
    state.tier        = s.tier || 'free';
    state.billing     = s.billing || null;
    state.entitlement = s.entitlement || { tier: 'free', effective: 'free', trialActive: false, trialDaysLeft: 0 };
    state.otoShown    = !!s.otoShown;
    state.menuSize    = s.menuSize || null;
    state.gridSize    = s.gridSize || null;
    state.clipHistoryMax = (typeof s.clipboardHistoryMax === 'number') ? s.clipboardHistoryMax : 3;
    applyTheme(s.theme || 'light');
  } catch {}
  // Clipboard memory: load captured history + subscribe to live updates.
  try { state.clipHistory = await window.restash.clipboardHistory.load(); } catch { state.clipHistory = []; }
  window.restash.clipboardHistory.onUpdated((items) => {
    state.clipHistory = Array.isArray(items) ? items : [];
    if (state.mode === 'list') renderRecent();
  });
  try {
    availableStashes = await window.restash.listStashes();
  } catch { availableStashes = []; }

  // ---- migrate legacy pin data into the unified per-stash item.pins map ----
  // Older builds stored pins two ways: a global item.pinned flag (+pinnedOrder)
  // and a per-stash pinnedItemIds list on the stash record. Fold both into
  // item.pins, then drop the dead fields. Runs once; idempotent after.
  {
    let dirty = false;
    const byId = new Map((state.items || []).map((i) => [i.id, i]));
    for (const s of availableStashes) {
      if (Array.isArray(s.pinnedItemIds)) {
        s.pinnedItemIds.forEach((id, idx) => {
          const it = byId.get(id);
          if (it) {
            if (!it.pins) it.pins = {};
            if (!(s.id in it.pins)) { it.pins[s.id] = idx; dirty = true; }
          }
        });
      }
    }
    const legacyGlobal = (state.items || []).filter(
      (i) => i.pinned && (!i.pins || !('all' in i.pins))
    );
    sortItems(legacyGlobal).forEach((i, idx) => {
      if (!i.pins) i.pins = {};
      i.pins.all = (typeof i.pinnedOrder === 'number') ? i.pinnedOrder : idx;
      dirty = true;
    });
    for (const i of (state.items || [])) {
      if ('pinned' in i)      { delete i.pinned; dirty = true; }
      if ('pinnedOrder' in i) { delete i.pinnedOrder; dirty = true; }
    }
    if (dirty) await persist();
  }

  wire();
  updateHintBar();
  await refreshAccessUI();
  render();
  focusSearch();
})();
