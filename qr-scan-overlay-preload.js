// qr-scan-overlay-preload.js — minimal bridge for the Spotlight Lens overlay
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('restashScan', {
  // User clicked at {x, y} (window-local coords). Main converts to absolute
  // screen coords and runs `screencapture -R…` for a small region.
  capture: ({ x, y }) => ipcRenderer.invoke('scan:capture', { x, y }),
  // User hit Esc — close the overlay without scanning.
  cancel:  () => ipcRenderer.invoke('scan:cancel'),
});
