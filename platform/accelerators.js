// platform/accelerators.js — per-OS default hotkeys + accelerator→label format.
//
// Defaults use CommandOrControl so config maps ⌘ on mac / Ctrl elsewhere.
// Win/Linux summon moves OFF Ctrl+Shift+V (universal paste-as-plain-text) to a
// non-colliding Ctrl+Alt+V; QR Ctrl+Alt+F.

'use strict';

const isMac = process.platform === 'darwin';

// macOS summon moves OFF ⌘⇧V (Apple-standard "Paste and Match Style", which a
// global shortcut would shadow system-wide) to a non-colliding ⌘⌥V, mirroring
// the Win/Linux Ctrl+Alt+V decision; QR uses ⌘⌥F. Win/Linux get safe Ctrl+Alt.
const DEFAULTS = isMac
  ? { summon: 'Command+Alt+V', qr: 'Command+Alt+F' }
  : { summon: 'Control+Alt+V', qr: 'Control+Alt+F' };

/**
 * Render an accelerator as a human label. On mac use ⌘/⌃/⌥/⇧ glyphs; on
 * Win/Linux use Ctrl/Alt/Shift text.
 * @param {string} accel e.g. 'Control+Alt+V'
 */
function formatAccelerator(accel) {
  const parts = String(accel || '').split('+').filter(Boolean);
  return parts.map((p) => {
    const k = p.toLowerCase();
    if (isMac) {
      if (k === 'command' || k === 'cmd' || k === 'commandorcontrol') return '⌘';
      if (k === 'control' || k === 'ctrl') return '⌃';
      if (k === 'alt' || k === 'option') return '⌥';
      if (k === 'shift') return '⇧';
      return p.toUpperCase();
    }
    if (k === 'commandorcontrol' || k === 'command' || k === 'cmd' || k === 'control' || k === 'ctrl') return 'Ctrl';
    if (k === 'alt' || k === 'option') return 'Alt';
    if (k === 'shift') return 'Shift';
    if (k === 'super' || k === 'meta') return 'Super';
    return p.toUpperCase();
  }).join(isMac ? '' : '+');
}

module.exports = { DEFAULTS, formatAccelerator, isMac };
