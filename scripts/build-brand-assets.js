#!/usr/bin/env node
/*
 * Renders assets/brand/mark.svg into the PNG variants we actually use:
 *
 *   tray-Template.png      22x22 monochrome (black) — macOS tray @1x
 *   tray-Template@2x.png   44x44 monochrome (black) — macOS tray @2x
 *   app/16,32,64,128,256,512,1024.png  — full-color app-icon variants
 *
 * The "Template" suffix is the macOS convention: it tells AppKit to invert
 * the icon for dark menu bars and apply selection tinting automatically.
 *
 *   node scripts/build-brand-assets.js
 */
const fs = require('node:fs');
const path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets', 'brand');
const APP_OUT = path.join(ASSETS, 'app');
fs.mkdirSync(APP_OUT, { recursive: true });

const baseSvg = fs.readFileSync(path.join(ASSETS, 'mark.svg'), 'utf8');

/** Recolor + render the mark at `size`px and write to `outPath`. */
function render({ size, color, outPath, padding = 0 }) {
  // Replace `currentColor` with the concrete color we want.
  let svg = baseSvg.replace(/currentColor/g, color);

  // Optional safe-area padding: shrink the inner 24×24 viewBox to leave
  // padding around the mark so it sits comfortably inside an app-icon frame.
  if (padding > 0) {
    const vb = 24;
    const inner = vb - padding * 2;
    svg = svg.replace(/viewBox="0 0 24 24"/, `viewBox="${-padding} ${-padding} ${vb} ${vb}" width="${vb}" height="${vb}"`);
    // adjust rect positions to fit smaller area by scaling — easier to just
    // wrap in a <g transform="scale(...) translate(...)">
    void inner;
  }

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
  });
  const pngBuffer = resvg.render().asPng();
  fs.writeFileSync(outPath, pngBuffer);
  return pngBuffer.length;
}

// --- TRAY (template image, pure black with alpha — macOS theming kicks in) ---
const tray1x = render({ size: 22, color: '#000000', outPath: path.join(ASSETS, 'tray-Template.png') });
const tray2x = render({ size: 44, color: '#000000', outPath: path.join(ASSETS, 'tray-Template@2x.png') });
console.log(`tray-Template.png      22×22  ${tray1x.toString().padStart(4)} B`);
console.log(`tray-Template@2x.png   44×44  ${tray2x.toString().padStart(4)} B`);

// --- APP ICON (full color; will be wrapped in a rounded-square frame by macOS) ---
// For now we render the same mark in a single color. When we package via
// electron-builder we'll generate a proper .icns from the 1024 variant.
for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
  const bytes = render({ size, color: '#1c1c1e', outPath: path.join(APP_OUT, `${size}.png`) });
  console.log(`app/${size}.png            ${size}×${size}  ${bytes.toString().padStart(5)} B`);
}

// --- CROSS-PLATFORM TRAY ICONS (no mac Template auto-invert) -------------
// Windows wants a multi-res .ico + a 16px PNG; Linux wants 22/24px PNGs in
// light + dark variants. We render explicit light/dark fills (dark icon for a
// light tray, light icon for a dark tray) rather than relying on auto-invert.
const TRAY_OUT = path.join(ASSETS, 'tray');
const WIN_TRAY_OUT = path.join(TRAY_OUT, 'win');
fs.mkdirSync(WIN_TRAY_OUT, { recursive: true });

const TRAY_DARK_FILL = '#e8e8ea';   // shown on a dark tray
const TRAY_LIGHT_FILL = '#1c1c1e';  // shown on a light tray

for (const size of [16, 22, 24]) {
  render({ size, color: TRAY_LIGHT_FILL, outPath: path.join(TRAY_OUT, `tray-light-${size}.png`) });
  render({ size, color: TRAY_DARK_FILL, outPath: path.join(TRAY_OUT, `tray-dark-${size}.png`) });
}
console.log('tray/{light,dark}-{16,22,24}.png  rendered');

// --- BUILD ICON SETS for electron-builder --------------------------------
// Linux AppImage/deb need a PNG set under build/icons/; Windows needs build/icon.ico.
const BUILD_ICONS = path.join(ROOT, 'build', 'icons');
fs.mkdirSync(BUILD_ICONS, { recursive: true });
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
  render({ size, color: '#1c1c1e', outPath: path.join(BUILD_ICONS, `${size}x${size}.png`) });
}
console.log('build/icons/{16..512}.png  rendered (Linux AppImage/deb)');

// Windows .ico via png-to-ico (dev-only, pure JS). Optional: skip with a warning
// if the dev dep isn't installed yet so the brand step still succeeds.
(async () => {
  try {
    // eslint-disable-next-line global-require
    const pngToIco = require('png-to-ico');
    const pngs = ICO_SIZES.map((s) => path.join(BUILD_ICONS, `${s}x${s}.png`));
    const icoBuf = await pngToIco(pngs);
    fs.writeFileSync(path.join(ROOT, 'build', 'icon.ico'), icoBuf);
    fs.writeFileSync(path.join(WIN_TRAY_OUT, 'tray.ico'), await pngToIco([
      path.join(BUILD_ICONS, '16x16.png'),
      path.join(BUILD_ICONS, '24x24.png'),
      path.join(BUILD_ICONS, '32x32.png'),
    ]));
    console.log('build/icon.ico + tray/win/tray.ico  written (png-to-ico)');
  } catch (e) {
    console.warn('png-to-ico not installed — skipping .ico generation (run `npm i -D png-to-ico`).');
  }
  console.log('\nDone. Tray icons in assets/brand/ (+ tray/), app icons in assets/brand/app/, build icons in build/icons/.');
})();
