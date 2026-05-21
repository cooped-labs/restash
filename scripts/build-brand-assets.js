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

console.log('\nDone. Tray icons are in assets/brand/, app icons in assets/brand/app/.');
