// tutorial-preload.js — minimal bridge for the onboarding window
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tutorial', {
  // Called when user finishes (Done → Get started) or skips. Closes the
  // tutorial window and persists onboarded=true so it doesn't reopen.
  complete: () => ipcRenderer.invoke('tutorial:complete'),
});
