// platform/qr.js — cross-platform QR region capture + decode.
//
// Replaces the macOS `screencapture` + Swift Vision helper with a fully
// bundled, zero-install path:
//   • capture: Electron desktopCapturer.getSources({ types: ['screen'] }) at
//     full display resolution (accounting for display.scaleFactor), cropped to
//     the user-dragged lens rectangle.
//   • decode:  zxing-wasm (vendored .wasm, no network, no native build) with a
//     pure-JS jsQR fallback.
//
// On Wayland, desktopCapturer routes through xdg-desktop-portal ScreenCast,
// which shows a one-time OS consent picker (a PERMISSION, not an install).
//
// This module runs in the MAIN process. Pixel decoding from a PNG buffer is
// done with a lazy-loaded decoder so the wasm/js cost is only paid on first QR
// scan. detectQRType()/parseURIParams stay in main.js unchanged.

'use strict';

const { desktopCapturer, screen, nativeImage } = require('electron');

let _zxing = null;       // cached zxing-wasm module (readBarcodesFromImageData)
let _jsQR = null;        // cached jsQR fallback
let _decoderTried = false;

/**
 * Lazily resolve a decoder. Prefers the vendored zxing-wasm; falls back to
 * jsQR. Both are pure JS/WASM with no native build and no network.
 * @returns {Promise<{kind:'zxing'|'jsqr'|null}>}
 */
async function ensureDecoder() {
  if (_zxing || _jsQR) return { kind: _zxing ? 'zxing' : 'jsqr' };
  if (_decoderTried) return { kind: null };
  _decoderTried = true;
  try {
    // zxing-wasm exposes readBarcodes / readBarcodesFromImageData depending on
    // version; we normalize below in decodePng.
    // eslint-disable-next-line global-require
    _zxing = require('zxing-wasm/reader');
    return { kind: 'zxing' };
  } catch (_e) { /* fall through to jsQR */ }
  try {
    // eslint-disable-next-line global-require
    _jsQR = require('jsqr');
    return { kind: 'jsqr' };
  } catch (_e) { /* no decoder available */ }
  return { kind: null };
}

/**
 * Capture a screen region as a PNG buffer.
 * @param {{rect?:{x:number,y:number,width:number,height:number}, displayId?:number}} opts
 * @returns {Promise<{ok:boolean, pngBuffer?:Buffer, reason?:string}>}
 */
async function captureRegion({ rect, displayId } = {}) {
  try {
    const displays = screen.getAllDisplays();
    const target = displayId != null
      ? displays.find((d) => d.id === displayId) || screen.getPrimaryDisplay()
      : screen.getPrimaryDisplay();
    const sf = target.scaleFactor || 1;

    // Request thumbnails at full physical resolution so the crop is sharp.
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(target.size.width * sf),
        height: Math.round(target.size.height * sf),
      },
      fetchWindowIcons: false,
    });
    if (!sources.length) return { ok: false, reason: 'no-source' };

    // Match the source to our target display when possible (display_id is a
    // string on Electron); else take the first screen source.
    let src = sources.find((s) => String(s.display_id) === String(target.id));
    if (!src) src = sources[0];

    let img = src.thumbnail; // nativeImage at physical resolution
    if (img.isEmpty()) return { ok: false, reason: 'empty-capture' };

    if (rect && rect.width > 0 && rect.height > 0) {
      // rect is in logical px relative to the display's top-left; convert to
      // physical px for the crop against the full-res thumbnail.
      const cx = Math.max(0, Math.round((rect.x - target.bounds.x) * sf));
      const cy = Math.max(0, Math.round((rect.y - target.bounds.y) * sf));
      const cw = Math.round(rect.width * sf);
      const ch = Math.round(rect.height * sf);
      img = img.crop({ x: cx, y: cy, width: cw, height: ch });
    }
    return { ok: true, pngBuffer: img.toPNG() };
  } catch (err) {
    return { ok: false, reason: 'capture-error', error: err && err.message };
  }
}

/**
 * Decode a QR from a PNG buffer (or a nativeImage). Returns the raw payload
 * string; caller runs detectQRType() on it.
 * @param {Buffer} pngBuffer
 * @returns {Promise<{ok:boolean, payload?:string, reason?:string}>}
 */
async function decodePng(pngBuffer) {
  const { kind } = await ensureDecoder();
  if (!kind) return { ok: false, reason: 'no-decoder' };

  // Convert PNG → raw RGBA ImageData via Electron's nativeImage + bitmap.
  let img;
  try { img = nativeImage.createFromBuffer(pngBuffer); }
  catch { return { ok: false, reason: 'bad-image' }; }
  if (!img || img.isEmpty()) return { ok: false, reason: 'bad-image' };
  const size = img.getSize();
  const bgra = img.toBitmap(); // Electron returns BGRA premultiplied
  if (!bgra || !bgra.length) return { ok: false, reason: 'bad-image' };

  // Convert BGRA → RGBA (Uint8ClampedArray) once, reused by both decoders.
  const rgba = new Uint8ClampedArray(bgra.length);
  for (let i = 0; i < bgra.length; i += 4) {
    rgba[i] = bgra[i + 2];
    rgba[i + 1] = bgra[i + 1];
    rgba[i + 2] = bgra[i];
    rgba[i + 3] = bgra[i + 3];
  }

  try {
    if (kind === 'zxing') {
      const imageData = { data: rgba, width: size.width, height: size.height };
      const fn = _zxing.readBarcodesFromImageData || _zxing.readBarcodes;
      const results = await fn(imageData, { formats: ['QRCode'], tryHarder: true });
      const hit = (results || []).find((r) => r && r.text);
      if (hit && hit.text) return { ok: true, payload: hit.text };
      return { ok: false, reason: 'no-qr' };
    }
    // jsQR
    const res = _jsQR(rgba, size.width, size.height, { inversionAttempts: 'attemptBoth' });
    if (res && res.data) return { ok: true, payload: res.data };
    return { ok: false, reason: 'no-qr' };
  } catch (err) {
    return { ok: false, reason: 'decode-error', error: err && err.message };
  }
}

module.exports = { captureRegion, decodePng, ensureDecoder };
