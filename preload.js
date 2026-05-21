const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('restash', {
  loadItems: () => ipcRenderer.invoke('items:load'),
  saveItems: (items) => ipcRenderer.invoke('items:save', items),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  qrDataURL: (text) => ipcRenderer.invoke('qr:dataurl', text),
  shareItem: ({ text, url, filePath, label, iconPath }) =>
    ipcRenderer.invoke('share:item', { text, url, filePath, label, iconPath }),
  // File item flow
  pickFile: () => ipcRenderer.invoke('file:pick'),
  addFile:  (srcPath) => ipcRenderer.invoke('file:add', srcPath),
  openFile: (storedPath) => ipcRenderer.invoke('file:open', storedPath),
  revealFile: (storedPath) => ipcRenderer.invoke('file:reveal', storedPath),
  onPopoverShown: (cb) => ipcRenderer.on('popover:shown', cb),

  loadSettings: () => ipcRenderer.invoke('settings:load'),
  getEntitlement: () => ipcRenderer.invoke('entitlement:get'),
  setBillingWindow: (open) => ipcRenderer.invoke('billing:window', open),
  markOTOShown: () => ipcRenderer.invoke('oto:markShown'),
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

  rowMenu: (item) => ipcRenderer.invoke('row:menu', item),

  // Mode switching (grid vs list) — main tells renderer which UI to show.
  onModeSet: (cb) => ipcRenderer.on('mode:set', (_e, mode) => cb(mode)),
  onStashCycle: (cb) => ipcRenderer.on('stash:cycle', (_e, payload) => cb(payload || { direction: 1 })),

  // Menu bar dropdown actions (Option C footer).
  onOpenSettings: (cb) => ipcRenderer.on('open:settings', cb),
  onOpenUpdates: (cb) => ipcRenderer.on('open:updates', cb),
  onOpenBilling: (cb) => ipcRenderer.on('open:billing', cb),
  checkUpdates: () => ipcRenderer.invoke('app:check-updates'),
  openBilling: () => ipcRenderer.invoke('app:open-billing'),
  quit: () => ipcRenderer.invoke('app:quit'),
});
