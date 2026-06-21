// electron-builder `afterPack` hook — ad-hoc sign the packaged .app with its
// REAL bundle id (com.restash.app), so that:
//   • the unsigned (no Apple Developer ID) build still launches on Apple
//     Silicon, which refuses to run a fully-unsigned arm64 app, and
//   • permission dialogs read "Restash", not "Electron".
//
// We run in afterPack (after the app is laid down, before the DMG is built)
// and disable electron-builder's own signing via `mac.identity: null`, so this
// is the single, authoritative signature and the DMG is built from it.

const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename; // "Restash"
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  // RES-39: this ad-hoc signature is authoritative (mac.identity is null, so
  // electron-builder does no signing of its own), which means it MUST carry the
  // app's entitlements itself. Without disable-library-validation + allow-jit,
  // macOS kills the GPU/renderer/network child processes (exit 15 / SIGTERM)
  // the moment the app loads a bundled Swift helper or a system XPC service
  // attaches (e.g. the NSSharingServicePicker share sheet). That surfaced as a
  // packaged-only render-process-gone crash on Share, even though `electron .`
  // dev runs were fine (dev inherits Electron's own signed+entitled binary).
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
    console.log(`  • ad-hoc signed ${appName}.app as com.restash.app (with entitlements)`);
  } catch (e) {
    console.warn(`  • afterPack ad-hoc sign failed: ${e.message}`);
  }
};
