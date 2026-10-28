// Preload for the floating notification view: just enough to show a notification and report clicks.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('toastBridge', {
  onShow: (fn) => ipcRenderer.on('show', (_e, d) => fn(d)),
  size: (w, h) => ipcRenderer.send('toast-size', w, h),
  act: (i) => ipcRenderer.send('toast-act', i),
});
