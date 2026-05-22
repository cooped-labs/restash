// electron-builder `afterSign` hook — submits the signed macOS app to Apple
// for notarization, then the build staples the ticket.
//
// It is a NO-OP until notarization credentials are present, so unsigned dev
// builds keep working untouched. To turn it on, export these before `npm run
// dist` (an app-specific password is made at appleid.apple.com → Sign-In &
// Security → App-Specific Passwords):
//
//   export APPLE_ID="you@example.com"
//   export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
//   export APPLE_TEAM_ID="XXXXXXXXXX"
//
// Notarization also requires the build to be code-signed with a
// "Developer ID Application" certificate (CSC_LINK / Keychain).

const { notarize } = require('@electron/notarize');

exports.default = async function notarizeApp(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log('  • notarize  skipped — set APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID to enable');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  console.log(`  • notarizing ${appName}.app with Apple — this can take a few minutes…`);

  await notarize({
    appPath: `${appOutDir}/${appName}.app`,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
  });

  console.log(`  • notarized ${appName}.app ✓`);
};
