// platform/chrome.js — shared Chrome profile enumeration.
//
// The logic (read `Local State` → profile.info_cache) is identical across OSes;
// only the path differs, which each platform module supplies via chromePaths().
// Nothing here shells out to a tool — pure fs reads.

'use strict';

const fs = require('node:fs');

/**
 * @param {{localState:string}} paths from platform.chromePaths()
 * @returns {Array<{dir:string,name:string,account:string}>}
 */
function getChromeProfiles(paths) {
  try {
    const d = JSON.parse(fs.readFileSync(paths.localState, 'utf8'));
    const cache = (d && d.profile && d.profile.info_cache) || {};
    const out = Object.entries(cache).map(([dir, info]) => ({
      dir,
      name: (info && info.name) || dir,
      account: (info && info.user_name) || '',
    }));
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  } catch { return []; }
}

module.exports = { getChromeProfiles };
