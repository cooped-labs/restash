const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('restash', {
  loadItems: () => ipcRenderer.invoke('items:load'),
  saveItems: (items) => ipcRenderer.invoke('items:save', items),
  // Fired when the OTHER window (popover ↔ stash-edit) saves items, so this
  // window can reload from disk instead of clobbering with a stale view.
  onItemsChanged: (cb) => ipcRenderer.on('items:changed', cb),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  resizeWindow: (payload) => ipcRenderer.invoke('window:resize', payload),
  qrDataURL: (text) => ipcRenderer.invoke('qr:dataurl', text),
  shareItem: ({ text, url, filePath, filePaths, label, iconPath }) =>
    ipcRenderer.invoke('share:item', { text, url, filePath, filePaths, label, iconPath }),
  // File item flow
  pickFile: () => ipcRenderer.invoke('file:pick'),
  addFile:  (srcPath) => ipcRenderer.invoke('file:add', srcPath),
  openFile: (storedPath) => ipcRenderer.invoke('file:open', storedPath),
  revealFile: (storedPath) => ipcRenderer.invoke('file:reveal', storedPath),
  // Copy a by-reference (video/oversized) recent to ~/Downloads on demand.
  saveFileCopy: (p) => ipcRenderer.invoke('file:saveCopy', p),
  onPopoverShown: (cb) => ipcRenderer.on('popover:shown', cb),

  // Environment kind: capture the current workspace + open a whole env.
  listApps: () => ipcRenderer.invoke('apps:list'),
  captureEnvironment: (scope) => ipcRenderer.invoke('env:capture', scope),
  getChromeProfiles: () => ipcRenderer.invoke('chrome:profiles'),
  openEnvironment: (env) => ipcRenderer.invoke('env:open', env),

  loadSettings: () => ipcRenderer.invoke('settings:load'),
  setEditorWindow: (open) => ipcRenderer.invoke('editor:window', open),
  setHotkey: (accel) => ipcRenderer.invoke('hotkey:set', accel),
  resetHotkey: () => ipcRenderer.invoke('hotkey:reset'),
  setTheme: (theme) => ipcRenderer.invoke('theme:set', theme),
  // Stashes
  listStashes:  () => ipcRenderer.invoke('stash:list'),
  createStash:  (name) => ipcRenderer.invoke('stash:create', name),
  renameStash:  (id, name) => ipcRenderer.invoke('stash:rename', { id, name }),
  deleteStash:  (id) => ipcRenderer.invoke('stash:delete', id),
  reorderStashes: (idsInOrder) => ipcRenderer.invoke('stash:reorder', idsInOrder),
  setStashPinned: (stashId, itemIds) => ipcRenderer.invoke('stash:setPinned', { stashId, itemIds }),
  openStashEditWindow: (stashId) => ipcRenderer.invoke('stashEdit:open', stashId),
  onStashesChanged: (cb) => ipcRenderer.on('stashes:changed', cb),

  // payload: string (legacy) OR { text?, filePath? } (file items)
  pasteActive: (payload) => ipcRenderer.invoke('paste:active', payload),
  // QR decoder — drag a box around any QR on screen and get back the decoded
  // payload + a detected content type ('url' | 'crypto' | 'wifi' | 'vcard' | 'text').
  qrCaptureAndDecode: () => ipcRenderer.invoke('qr:capture-and-decode'),
  qrFetchSiteMeta:   (url) => ipcRenderer.invoke('qr:fetch-site-meta', url),
  setQRHotkey:       (accel) => ipcRenderer.invoke('qrHotkey:set', accel),
  resetQRHotkey:     () => ipcRenderer.invoke('qrHotkey:reset'),
  onQRResult: (cb) => ipcRenderer.on('qr:result', (_e, payload) => cb(payload)),
  checkAccessibility: (prompt = false) => ipcRenderer.invoke('accessibility:check', prompt),
  openAccessibilitySettings: () => ipcRenderer.invoke('accessibility:open'),

  // Platform capabilities — the UI relabels (Paste vs Copy), hides native Share
  // on Win/Linux, shows the one-time OS-permission explainer where a portal
  // consent is required, and renders Ctrl/Alt/Shift vs ⌘/⌃/⇧ labels per OS.
  // permission != install: see docs/windows-linux-port.md.
  platformCapabilities: () => ipcRenderer.invoke('platform:capabilities'),
  formatAccelerator: (accel) => ipcRenderer.invoke('platform:formatAccel', accel),

  rowMenu: (item) => ipcRenderer.invoke('row:menu', item),

  // Clipboard memory (RES-11) — auto-captured recent copies.
  clipboardHistory: {
    load:   () => ipcRenderer.invoke('clipboardHistory:load'),
    remove: (id) => ipcRenderer.invoke('clipboardHistory:remove', id),
    clear:  () => ipcRenderer.invoke('clipboardHistory:clear'),
    setMax: (n) => ipcRenderer.invoke('clipboardHistory:setMax', n),
    onUpdated: (cb) => ipcRenderer.on('clipboard-history:updated', (_e, items) => cb(items)),
  },

  // Mode switching (grid vs list) — main tells renderer which UI to show.
  onModeSet: (cb) => ipcRenderer.on('mode:set', (_e, mode) => cb(mode)),
  onStashCycle: (cb) => ipcRenderer.on('stash:cycle', (_e, payload) => cb(payload || { direction: 1 })),

  // Menu bar dropdown actions (Option C footer).
  onOpenSettings: (cb) => ipcRenderer.on('open:settings', cb),
  onOpenUpdates: (cb) => ipcRenderer.on('open:updates', cb),
  checkUpdates: (opts) => ipcRenderer.invoke('app:check-updates', opts),
  quit: () => ipcRenderer.invoke('app:quit'),
});
