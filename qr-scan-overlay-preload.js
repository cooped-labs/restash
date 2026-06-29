// qr-scan-overlay-preload.js — minimal bridge for the Spotlight Lens overlay
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('restashScan', {
  // User clicked at {x, y} (window-local coords). Main converts to absolute
  // screen coords and runs `screencapture -R…` for a region whose size is
  // driven by the user-resized lens radius (main clamps it to 40–360px).
  capture: ({ x, y, radius }) => ipcRenderer.invoke('scan:capture', { x, y, radius }),
  // User hit Esc — close the overlay without scanning.
  cancel:  () => ipcRenderer.invoke('scan:cancel'),
});
