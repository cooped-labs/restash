const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('shelf', {
  // Resolve a dropped File to its absolute filesystem path. In a sandboxed
  // renderer (Electron 32+) File.path is removed, so webUtils is the only
  // supported way to recover the path for the file:add / ingest pipeline.
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file); } catch { return ''; }
  },
  // Save a new item from the quick-add path
  addFromQuick: (payload) => ipcRenderer.invoke('shelf:add-from-quick', payload),
  // Undo the most recent add (removes the item from store)
  undoAdd: (itemId) => ipcRenderer.invoke('shelf:undo-add', itemId),
  // Stash list, sorted by lastUsedAt desc, with synthetic { id:'all', name:'All' } first
  listStashes: () => ipcRenderer.invoke('shelf:list-stashes'),
  // Create a stash on the fly; returns { ok, stash } | { ok:false, reason }
  createStash: (name) => ipcRenderer.invoke('shelf:create-stash', name),
  // Last-used stash id (persisted across sessions)
  getLastUsedStash: () => ipcRenderer.invoke('shelf:get-last-used-stash'),
  // Drop-zone ingest paths — file paths array + optional stash routing
  ingestFiles: (paths, stashId, pinned) => ipcRenderer.invoke('shelf:ingest-files', { paths, stashId, pinned }),
  // RES-13 v7: drag-to-reveal — renderer pings main to widen/shrink the
  // BrowserWindow as the user enters / leaves the notch.
  expand:   () => ipcRenderer.invoke('shelf:expand'),
  collapse: () => ipcRenderer.invoke('shelf:collapse'),
  // Esc / post-save collapse — alias for collapse(), kept for the existing
  // renderer keybinding code.
  hide: () => ipcRenderer.invoke('shelf:hide'),

  onShown:           (cb) => ipcRenderer.on('shelf:shown', () => cb()),
  onHidden:          (cb) => ipcRenderer.on('shelf:hidden', () => cb()),
  onStashesChanged:  (cb) => ipcRenderer.on('shelf:stashes-changed', () => cb()),
  onHotkeyChanged:   (cb) => ipcRenderer.on('shelf:hotkey-changed', (_e, accel) => cb(accel)),
});
