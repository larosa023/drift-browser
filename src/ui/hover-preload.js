// Preload for the tab preview card shown when the pointer rests on a tab in the sidebar.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hoverBridge', { onShow: (fn) => ipcRenderer.on('show', (_e, d) => fn(d)) });
