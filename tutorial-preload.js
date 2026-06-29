// tutorial-preload.js — minimal bridge for the onboarding window
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tutorial', {
  // Called when user finishes (Done → Get started) or skips. Closes the
  // tutorial window and persists onboarded=true so it doesn't reopen.
  complete: () => ipcRenderer.invoke('tutorial:complete'),

  // Generate a QR code data URL entirely offline via the main-process QRCode
  // module (same handler the main window uses). Lets the onboarding QR scene
  // honor its "Generated on your Mac. No internet." promise instead of pulling
  // a library from a CDN.
  qr: (text) => ipcRenderer.invoke('qr:dataurl', String(text ?? '')),
});
