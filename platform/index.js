// platform/index.js — selects the per-OS implementation and exposes the stable
// platform contract to main.js. See interface.md for the full contract and
// docs/windows-linux-port.md for the zero-install bundling policy.

'use strict';

const qr = require('./qr');
const accelerators = require('./accelerators');
const { sessionType } = require('./capabilities');

let impl;
switch (process.platform) {
  case 'darwin': impl = require('./darwin'); break;
  case 'win32': impl = require('./win32'); break;
  case 'linux': impl = require('./linux'); break;
  default: impl = require('./linux'); break; // closest degraded behavior
}

module.exports = {
  ...impl,

  // Shared cross-platform QR (desktopCapturer + zxing-wasm/jsQR). darwin.js does
  // NOT override these, so mac can still use its Vision path in main.js; the new
  // unified path is available to all OSes via platform.captureRegion/decodeQR.
  captureRegion: qr.captureRegion,
  decodeQR: qr.decodePng,

  // Accelerator helpers (defaults + label formatting).
  accelerators,
  defaultHotkeys: accelerators.DEFAULTS,
  formatAccelerator: accelerators.formatAccelerator,

  // Convenience: coarse session label.
  sessionType,
};
