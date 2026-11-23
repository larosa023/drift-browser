// Added by Drift in front of an extension's background service worker. Electron can't give
// service workers the browser APIs Drift implements (windows, the toolbar button's click,
// the side panel, tabs that are Drift's tabs…), but it does give them to the extension's own
// pages. So these calls go to a hidden page of the same extension (drift-bridge.html), which
// makes them and answers; events come back the same way.
(() => {
  if (globalThis.__driftShim) return;
  globalThis.__driftShim = true;
  const chrome = globalThis.chrome;
  if (!chrome || !chrome.runtime) return;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function ask(msg, tries = 20) {
    for (let i = 0; ; i++) {
      try {
        const res = await chrome.runtime.sendMessage({ __driftBridge: 1, ...msg });
        if (res) return res;
      } catch (e) {}
      if (i >= tries) return null;
      await wait(250);   // the hidden page may still be loading (Drift just started)
    }
  }
  const listeners = new Map();   // "api.event" -> Set of functions
  const om = chrome.runtime.onMessage;
  const addMsg = om.addListener.bind(om), removeMsg = om.removeListener.bind(om), hasMsg = om.hasListener.bind(om);
  addMsg((m) => {
    if (!m || !m.__driftEvent) return;
    for (const f of listeners.get(m.__driftEvent) || []) { try { f(...(m.args || [])); } catch (e) { console.error(e); } }
  });
  // The extension's own message listeners don't see Drift's messages.
  const wrapped = new Map();
  om.addListener = (f) => {
    const w = (m, s, r) => (m && (m.__driftEvent || m.__driftBridge)) ? undefined : f(m, s, r);
    wrapped.set(f, w); addMsg(w);
  };
  om.removeListener = (f) => { const w = wrapped.get(f); if (w) { removeMsg(w); wrapped.delete(f); } };
  om.hasListener = (f) => wrapped.has(f) && hasMsg(wrapped.get(f));
  const event = (path) => ({
    addListener(f) {
      if (!listeners.has(path)) { listeners.set(path, new Set()); ask({ op: 'sub', path }, 120); }
      listeners.get(path).add(f);
    },
    removeListener(f) { const s = listeners.get(path); if (s) s.delete(f); },
    hasListener(f) { const s = listeners.get(path); return !!(s && s.has(f)); },
    hasListeners() { const s = listeners.get(path); return !!(s && s.size); },
  });
  const call = (path) => (...args) => {
    const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    const p = ask({ op: 'call', path, args: JSON.parse(JSON.stringify(args)) }).then((res) => {
      if (!res) throw new Error(`${path}: Drift couldn't reach this extension's helper page`);
      if (!res.ok) throw new Error(res.e);
      return res.r;
    });
    if (cb) { p.then(cb, (e) => { console.error(e); cb(); }); return undefined; }
    return p;
  };
  // When Drift's own extension support did reach this worker, it has set these up already
  // (and sealed the chrome object): nothing to add.
  const make = (api, fns, events, keep = {}) => {
    const d = Object.getOwnPropertyDescriptor(chrome, api);
    if (Object.isFrozen(chrome) || (d && !d.configurable)) return;
    const o = { ...keep };
    for (const f of fns) o[f] = call(`${api}.${f}`);
    for (const e of events) o[e] = event(`${api}.${e}`);
    try { Object.defineProperty(chrome, api, { value: o, enumerable: true, configurable: true, writable: true }); } catch (e) { console.error('drift shim', api, e); }
  };
  make('sidePanel', ['setPanelBehavior', 'getPanelBehavior', 'setOptions', 'getOptions', 'open', 'close', 'getLayout'], ['onOpened', 'onClosed']);
  make('windows', ['get', 'getCurrent', 'getLastFocused', 'getAll', 'create', 'update', 'remove'], ['onCreated', 'onRemoved', 'onFocusChanged', 'onBoundsChanged'],
    { WINDOW_ID_NONE: -1, WINDOW_ID_CURRENT: -2 });
  make('action', ['setTitle', 'getTitle', 'setIcon', 'setPopup', 'getPopup', 'setBadgeText', 'getBadgeText', 'setBadgeBackgroundColor', 'getBadgeBackgroundColor', 'getUserSettings', 'enable', 'disable', 'openPopup'], ['onClicked']);
  make('contextMenus', ['create', 'update', 'remove', 'removeAll'], ['onClicked']);
  // Tabs: Drift's tabs come from the helper page; messaging stays Chromium's own.
  const nt = chrome.tabs || {};
  const keepTabs = { TAB_ID_NONE: -1 };
  for (const k of ['sendMessage', 'connect', 'executeScript', 'insertCSS', 'removeCSS', 'getZoom', 'setZoom', 'getZoomSettings', 'setZoomSettings', 'captureVisibleTab', 'detectLanguage']) if (typeof nt[k] === 'function') keepTabs[k] = nt[k].bind(nt);
  make('tabs', ['get', 'getCurrent', 'query', 'create', 'update', 'remove', 'reload', 'goBack', 'goForward', 'duplicate', 'highlight', 'move', 'discard'],
    ['onCreated', 'onUpdated', 'onActivated', 'onRemoved', 'onReplaced', 'onHighlighted', 'onMoved', 'onAttached', 'onDetached', 'onZoomChange'], keepTabs);
})();
