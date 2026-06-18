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

  try {
    // Strip any extended-attribute detritus so codesign doesn't choke.
    execFileSync('xattr', ['-cr', appPath]);
    execFileSync('codesign', [
      '--force', '--deep',
      '--identifier', 'com.restash.app',
      '--sign', '-',            // ad-hoc
      appPath,
    ], { stdio: 'inherit' });
    console.log(`  • ad-hoc signed ${appName}.app as com.restash.app`);
  } catch (e) {
    console.warn(`  • afterPack ad-hoc sign failed: ${e.message}`);
  }
};
