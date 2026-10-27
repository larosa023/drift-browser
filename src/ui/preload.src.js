// Source for src/ui/preload.js (bundled with esbuild: npm run build:preload)
const { contextBridge, ipcRenderer } = require('electron');
const { injectBrowserAction } = require('electron-chrome-extensions/browser-action');

const IN = ['state', 'layout', 'palette', 'panel', 'find-open', 'find-result', 'download-started', 'extensions', 'bookmarks', 'passwords', 'toast', 'bm-edit'];

contextBridge.exposeInMainWorld('drift', {
  send: (ch, ...args) => ipcRenderer.send(ch, ...args),
  suggest: (q) => ipcRenderer.invoke('suggest', q),
  invoke: (ch, ...a) => ['pw-reveal', 'bm-sources'].includes(ch) ? ipcRenderer.invoke(ch, ...a) : Promise.resolve(null),
  on: (ch, fn) => { if (IN.includes(ch)) ipcRenderer.on(ch, (_e, ...a) => fn(...a)); },
});

// Registers the <browser-action-list> element used for extension buttons.
injectBrowserAction();
