// stash-edit-preload.js — IPC bridge for the standalone stash edit window
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('restash', {
  loadItems:      () => ipcRenderer.invoke('items:load'),
  saveItems:      (items) => ipcRenderer.invoke('items:save', items),
  listStashes:    () => ipcRenderer.invoke('stash:list'),
  setStashPinned: (stashId, itemIds) => ipcRenderer.invoke('stash:setPinned', { stashId, itemIds }),
  renameStash:    (id, name) => ipcRenderer.invoke('stash:rename', { id, name }),
  deleteStash:    (id) => ipcRenderer.invoke('stash:delete', id),
  qrDataURL:      (text) => ipcRenderer.invoke('qr:dataurl', text),
  closeWindow:    () => window.close(),
});
