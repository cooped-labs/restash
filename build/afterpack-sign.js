// electron-builder `afterPack` hook — FALLBACK ad-hoc signing.
//
// Two distribution paths are supported:
//
//   1) Real Developer ID build: when a signing identity is configured
//      (CSC_LINK / CSC_IDENTITY / CSC_NAME, or a Developer ID Application
//      cert in the keychain), package.json no longer forces mac.identity
//      to null, so electron-builder performs its own per-component Developer
//      ID signature and build/notarize.js notarizes + staples it. In that
//      case this hook MUST NOT run — a `--force --deep` ad-hoc pass would
//      overwrite the real nested signatures with an ad-hoc one. We detect
//      the configured identity and no-op.
//
//   2) Unsigned/ad-hoc build (no cert): electron-builder finds no identity
//      and skips its own signing, so this hook is the single, authoritative
//      signature. It ad-hoc signs the packaged .app with its REAL bundle id
//      (com.restash.app) so that:
//        • the build still launches on Apple Silicon, which refuses to run a
//          fully-unsigned arm64 app, and
//        • permission dialogs read "Restash", not "Electron".
//      Because it is authoritative here, a failure means we'd ship an
//      unsigned/broken .app — so the failure is FATAL and aborts the build
//      before any DMG is produced.
//
// RES-39: this ad-hoc signature MUST carry the app's entitlements itself.
// Without disable-library-validation + allow-jit, macOS kills the
// GPU/renderer/network child processes (exit 15 / SIGTERM) the moment the app
// loads a bundled Swift helper or a system XPC service attaches (e.g. the
// NSSharingServicePicker share sheet). That surfaced as a packaged-only
// render-process-gone crash on Share, even though `electron .` dev runs were
// fine (dev inherits Electron's own signed+entitled binary).

const { execFileSync } = require('node:child_process');
const path = require('node:path');

// True when a real macOS code-signing identity is configured for this build,
// in which case electron-builder signs (and notarize.js notarizes) for real
// and we must NOT overwrite that with an ad-hoc signature.
function hasRealSigningIdentity() {
  const { CSC_LINK, CSC_IDENTITY, CSC_NAME, CSC_IDENTITY_AUTO_DISCOVERY } = process.env;
  if (CSC_LINK || CSC_IDENTITY || CSC_NAME) return true;
  // Mirrors electron-builder: identity auto-discovery is on by default; honor an
  // explicit opt-out only when nothing else forces a real identity.
  if (CSC_IDENTITY_AUTO_DISCOVERY === 'false') return false;
  return false;
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  if (hasRealSigningIdentity()) {
    console.log('  • afterPack ad-hoc sign skipped — real Developer ID identity configured (electron-builder signs + notarize.js notarizes)');
    return;
  }

  const appName = context.packager.appInfo.productFilename; // "Restash"
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const entitlements = path.join(__dirname, 'entitlements.mac.plist');

  try {
    // Strip any extended-attribute detritus so codesign doesn't choke.
    execFileSync('xattr', ['-cr', appPath]);
    execFileSync('codesign', [
      '--force', '--deep',
      '--identifier', 'com.restash.app',
      '--entitlements', entitlements,   // RES-39: JIT + library-validation entitlements
      '--sign', '-',            // ad-hoc
      appPath,
    ], { stdio: 'inherit' });
    console.warn('  • WARNING: no Developer ID identity configured — ad-hoc signed '
      + `${appName}.app as com.restash.app. This build is NOT notarized and will be `
      + 'blocked by Gatekeeper on download. Set CSC_LINK / CSC_KEY_PASSWORD (Developer '
      + 'ID Application cert) + APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID '
      + 'to produce a distributable, notarized build.');
  } catch (e) {
    // This ad-hoc signature is authoritative (electron-builder did no signing of
    // its own). If it fails, the .app is unsigned/partially-signed and will crash
    // on Apple Silicon — do NOT let a DMG be built from it. Fail the build.
    throw new Error(`afterPack ad-hoc sign failed (would ship an unsigned/broken .app): ${e.message}`);
  }
};
