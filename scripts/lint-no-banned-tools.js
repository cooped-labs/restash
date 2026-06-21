#!/usr/bin/env node
/*
 * CI lint — enforces the zero-install bundling policy.
 *
 * Fails the build if main.js or platform/*.js contain an execFile/spawn/exec of
 * any BANNED user-installed tool. Restash ships every native capability inside
 * the app (committed helper binary, vendored prebuilt .node, or pure JS/WASM);
 * it must never shell out to a tool the user has to install.
 *
 * Usage: node scripts/lint-no-banned-tools.js   (exit 1 on violation)
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// Tools that may NOT be invoked at runtime (see docs/windows-linux-port.md).
const BANNED = [
  'xdotool', 'ydotool', 'ydotoold', 'xclip', 'xsel',
  'wl-copy', 'wl-paste', 'wl-clipboard', 'wmctrl', 'xprop',
  'gtk-launch', 'notify-send',
];

// Files in scope of the lint.
const files = ['main.js'];
const platformDir = path.join(ROOT, 'platform');
for (const f of fs.readdirSync(platformDir)) {
  if (f.endsWith('.js')) files.push(path.join('platform', f));
}

// Match a spawn/exec family call whose command argument names a banned tool.
// e.g. execFile('xdotool', ...) / spawn("wl-copy") / exec(`xclip -i`)
const callRe = /(?:execFile|execFileSync|exec|execSync|spawn|spawnSync)\s*\(\s*[`'"]([^`'"]+)[`'"]/g;

let violations = 0;
for (const rel of files) {
  const abs = path.join(ROOT, rel);
  let src;
  try { src = fs.readFileSync(abs, 'utf8'); } catch { continue; }
  let m;
  while ((m = callRe.exec(src)) !== null) {
    const cmd = m[1];
    const base = path.basename(cmd).toLowerCase();
    if (BANNED.includes(base)) {
      const line = src.slice(0, m.index).split('\n').length;
      console.error(`BANNED TOOL: ${rel}:${line} spawns "${cmd}" — zero-install policy violation.`);
      violations++;
    }
  }
  // Also catch any bare mention as a spawned command in arrays like ['xdotool'].
  for (const tool of BANNED) {
    const bareRe = new RegExp(`(?:spawn|spawnSync|execFile|execFileSync)\\s*\\([^)]*['"\`]${tool}['"\`]`, 'g');
    let bm;
    while ((bm = bareRe.exec(src)) !== null) {
      const line = src.slice(0, bm.index).split('\n').length;
      console.error(`BANNED TOOL: ${rel}:${line} references "${tool}" in a spawn — zero-install policy violation.`);
      violations++;
    }
  }
}

// Bundling check: if a Linux helper binary is committed/present in bin/, then
// vendor/linux-lib/ MUST be non-empty (i.e., contain at least one .so file).
// Without this, the AppImage would resolve the helper's dynamic deps (libei,
// libportal, etc.) from /usr at runtime — which breaks the zero-install promise
// on a clean Ubuntu box where those libs may be missing or ABI-skewed.
// See scripts/bundle-linux-libs.sh (CI walks ldd → vendors them).
const linuxHelper = path.join(ROOT, 'bin', 'restash-linux-helper');
// The repo carries a zero-byte placeholder so electron-builder's extraResources
// reference resolves on every platform. Only enforce bundling when the file is
// a real built artifact (size > 0) — i.e., on the Linux CI runner after the
// compile step. Avoids false positives on macOS dev / before-build CI lints.
let linuxHelperBuilt = false;
try { linuxHelperBuilt = fs.statSync(linuxHelper).size > 0; } catch { /* missing */ }
if (linuxHelperBuilt) {
  const libDir = path.join(ROOT, 'vendor', 'linux-lib');
  let bundled = [];
  try {
    bundled = fs.readdirSync(libDir).filter(f => /\.so(\.|$)/.test(f));
  } catch { /* dir missing — treated as empty below */ }
  if (bundled.length === 0) {
    console.error(
      `BUNDLING: bin/restash-linux-helper is present but vendor/linux-lib/ has no .so files.\n` +
      `  Run scripts/bundle-linux-libs.sh on the Linux build runner to vendor the helper's\n` +
      `  transitive ldd closure. Zero-install policy: nothing native may resolve from /usr.`
    );
    violations++;
  } else {
    console.log(`zero-install lint: bin/restash-linux-helper present, vendor/linux-lib has ${bundled.length} bundled .so file(s).`);
  }
}

if (violations > 0) {
  console.error(`\n${violations} zero-install policy violation(s). See docs/windows-linux-port.md.`);
  process.exit(1);
}
console.log('zero-install lint passed: no banned user-installed tools are spawned.');
