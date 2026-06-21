// platform/capabilities.js — runtime feature flags + session detection.
//
// The renderer reads these (via preload) once on load and relabels/degrades UI
// (Paste vs Copy, hide native Share, show a one-time OS-permission explainer,
// show a "use the tray/launcher" banner where global hotkeys can't register).
//
// IMPORTANT (zero-install policy): `needsPermissionGrant` is about a one-time
// OS PERMISSION (a native portal/TCC/polkit dialog already present on the OS),
// never a download or package install. See docs/windows-linux-port.md.

'use strict';

/**
 * Detect the Linux display server. Returns 'x11' | 'wayland' | 'unknown'.
 * Uses ONLY env the display server itself sets — no external tool is run.
 */
function detectLinuxSession() {
  const type = String(process.env.XDG_SESSION_TYPE || '').toLowerCase();
  if (type === 'wayland') return 'wayland';
  if (type === 'x11') return 'x11';
  if (process.env.WAYLAND_DISPLAY) return 'wayland';
  if (process.env.DISPLAY) return 'x11';
  return 'unknown';
}

/** The coarse session label used across the platform layer. */
function sessionType() {
  if (process.platform === 'darwin') return 'darwin';
  if (process.platform === 'win32') return 'win32';
  if (process.platform === 'linux') return detectLinuxSession();
  return 'unknown';
}

module.exports = { detectLinuxSession, sessionType };
