const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shelf', {
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
  // Dismiss the shelf programmatically (Esc, click-outside, etc.)
  hide: () => ipcRenderer.invoke('shelf:hide'),

  onShown:           (cb) => ipcRenderer.on('shelf:shown', () => cb()),
  onHidden:          (cb) => ipcRenderer.on('shelf:hidden', () => cb()),
  onStashesChanged:  (cb) => ipcRenderer.on('shelf:stashes-changed', () => cb()),
  onHotkeyChanged:   (cb) => ipcRenderer.on('shelf:hotkey-changed', (_e, accel) => cb(accel)),
});
