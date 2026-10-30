// Preload for the Glance backdrop (the dimmed layer and buttons around a link preview).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('glanceBridge', {
  onState: (fn) => ipcRenderer.on('glance', (_e, d) => fn(d)),
  close: () => ipcRenderer.send('glance-close'),
  expand: () => ipcRenderer.send('glance-expand'),
});
