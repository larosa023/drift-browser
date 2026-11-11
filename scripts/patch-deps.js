// Small fixes to dependencies, applied after `npm install` (idempotent).
const fs = require('fs');
const path = require('path');

// electron-chrome-extensions: Manifest V2 background pages (e.g. uBlock Origin) run without
// context isolation, and Chromium replaces the page's `chrome` object after the preload runs,
// so the injected APIs (browserAction, contextMenus, webNavigation…) were lost. Re-inject
// whenever `chrome` has been swapped out — a MutationObserver fires right before each
// parser-inserted <script> runs, so this lands before the extension's own code.
const file = path.join(__dirname, '..', 'node_modules', 'electron-chrome-extensions', 'dist', 'chrome-extension-api.preload.js');
const MARK_PLACEHOLDER = '/* drift: mv2 reinject v6 */';
let src = fs.readFileSync(file, 'utf8');
// Re-apply cleanly if an older version of this patch is present.
if (src.includes('/* drift:') && !src.includes(MARK_PLACEHOLDER) && fs.existsSync(file + '.orig')) src = fs.readFileSync(file + '.orig', 'utf8');
if (!src.includes('/* drift:') && !fs.existsSync(file + '.orig')) fs.writeFileSync(file + '.orig', src);
const MARK = '/* drift: mv2 reinject v6 */';
if (!src.includes(MARK)) {
  const from = `      console.warn(\`injectExtensionAPIs: context isolation disabled in \${location.href}\`);
      mainWorldScript();
      return;`;
  const to = `      ${MARK}
      // Electron reports tabId -1 for every webRequest event; Drift's main process can tell
      // which tab a request belongs to, so background pages may ask it synchronously.
      globalThis.__driftTabFor = (d) => {
        try { return import_electron2.ipcRenderer.sendSync('drift-tab-for', { url: d.url, type: d.type, frameId: d.frameId, initiator: d.initiator || '' }); }
        catch { return -1; }
      };
      const inject = () => { if (globalThis.chrome && !Object.isFrozen(globalThis.chrome)) { try { mainWorldScript(); } catch (e) { console.error(e); } } };
      inject();
      const mo = new MutationObserver(inject);
      mo.observe(document, { childList: true, subtree: true });
      document.addEventListener('DOMContentLoaded', () => { inject(); mo.disconnect(); }, { once: true });
      return;`;
  if (!src.includes(from)) throw new Error('patch-deps: electron-chrome-extensions preload changed; update scripts/patch-deps.js');
  src = src.replace(from, to);
  // Same problem for extension pages opened in tabs (dashboards, options pages), which run
  // with context isolation: re-run the main-world injection until Chromium's own chrome
  // object has settled. mainWorldScript skips if it already ran on the current object, and
  // keeps the bridge it needs for re-runs.
  const mwStart = `    function mainWorldScript() {
      const electron = globalThis.electron || electronContext;`;
  if (!src.includes(mwStart)) throw new Error('patch-deps: mainWorldScript start changed; update scripts/patch-deps.js');
  src = src.replace(mwStart, `    function mainWorldScript() {
      if (!globalThis.chrome || Object.isFrozen(globalThis.chrome)) return;
      // Electron reports installType "development" for every extension. Some extensions
      // (e.g. Previews for Twitch) treat that as tampering and wipe their own settings,
      // so report "normal" like Chrome does for store installs.
      try {
        const mg = globalThis.chrome.management;
        if (mg && !mg.__driftNormal) {
          const fix = (v) => { if (Array.isArray(v)) v.forEach(fix); else if (v && typeof v === 'object' && 'installType' in v) v.installType = 'normal'; return v; };
          for (const fn of ['getSelf', 'get', 'getAll']) {
            const orig = mg[fn];
            if (typeof orig !== 'function') continue;
            Object.defineProperty(mg, fn, { configurable: true, writable: true, value: function (...args) {
              const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
              const p = new Promise((res, rej) => {
                try { orig.call(mg, ...args, (v) => { const e = globalThis.chrome.runtime.lastError; e ? rej(new Error(e.message)) : res(fix(v)); }); }
                catch (e) { rej(e); }
              });
              if (cb) { p.then(cb, () => cb(undefined)); return undefined; }
              return p;
            } });
          }
          Object.defineProperty(mg, '__driftNormal', { value: true });
        }
      } catch {}
      // One-time repair for Previews (For Twitch & YouTube): its settings were replaced with
      // \`true\` by that check before this fix; remove the broken value so it starts fresh.
      try {
        if (globalThis.chrome.runtime && globalThis.chrome.runtime.id === 'hpmbiinljekjjcjgijnlbmgcmoonclah' && globalThis.chrome.storage && globalThis.chrome.storage.local) {
          globalThis.chrome.storage.local.get('tp_options', (o) => { if (o && o.tp_options === true) globalThis.chrome.storage.local.remove('tp_options'); });
        }
      } catch {}
      const electron = globalThis.electron || electronContext;`);
  const del = `      delete globalThis.electron;
      Object.freeze(chrome);`;
  if (!src.includes(del)) throw new Error('patch-deps: mainWorldScript end changed; update scripts/patch-deps.js');
  src = src.replace(del, `      Object.freeze(chrome);`);
  const iso = `        import_electron2.contextBridge.executeInMainWorld({
          func: mainWorldScript
        });`;
  if (!src.includes(iso)) throw new Error('patch-deps: isolated injection changed; update scripts/patch-deps.js');
  src = src.replace(iso, `        const injectMain = () => { try { import_electron2.contextBridge.executeInMainWorld({ func: mainWorldScript }); } catch (e) { console.error(e); } };
        injectMain();
        if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
          const mo2 = new MutationObserver(injectMain);
          mo2.observe(document, { childList: true, subtree: true });
          document.addEventListener('DOMContentLoaded', () => { injectMain(); mo2.disconnect(); }, { once: true });
        }`);
  fs.writeFileSync(file, src);
  console.log('patch-deps: patched electron-chrome-extensions preload');
}

// electron-chrome-extensions (main process): every newly tracked tab was reported as
// activated, which made Drift switch to tabs meant to open in the background (middle-click,
// Ctrl+click, "Open all"). The store already picks an active tab when a window has none.
for (const variant of ['cjs/index.js', 'esm/index.mjs']) {
  const f = path.join(__dirname, '..', 'node_modules', 'electron-chrome-extensions', 'dist', ...variant.split('/'));
  if (!fs.existsSync(f)) continue;
  let s = fs.readFileSync(f, 'utf8');
  const MARK2 = '/* drift: no auto-activate v1 */';
  if (s.includes(MARK2)) continue;
  const from = `    this.onCreated(tabId);
    this.onActivated(tabId);`;
  if (!s.includes(from)) throw new Error(`patch-deps: observeTab changed in ${variant}; update scripts/patch-deps.js`);
  s = s.replace(from, `    this.onCreated(tabId);
    ${MARK2}
    if (this.ctx.store.getActiveTabFromWebContents(tab) === tab) this.onActivated(tabId);`);
  fs.writeFileSync(f, s);
  console.log(`patch-deps: patched electron-chrome-extensions ${variant}`);
}

// electron-chrome-extensions (main process): one "destroyed" listener was added to an
// extension page per event it listens to (uBlock Origin listens to a dozen), which Node
// reports as a possible memory leak. Watch each page once.
for (const variant of ['cjs/index.js', 'esm/index.mjs']) {
  const f = path.join(__dirname, '..', 'node_modules', 'electron-chrome-extensions', 'dist', ...variant.split('/'));
  if (!fs.existsSync(f)) continue;
  let s = fs.readFileSync(f, 'utf8');
  const MARK3 = '/* drift: observe host once v1 */';
  if (s.includes(MARK3)) continue;
  const from = `  observeListenerHost(host) {
    const hostId = getHostId(host);`;
  if (!s.includes(from)) throw new Error(`patch-deps: observeListenerHost changed in ${variant}; update scripts/patch-deps.js`);
  s = s.replace(from, `  observeListenerHost(host) {
    ${MARK3}
    this.__observed = this.__observed || new WeakSet();
    if (this.__observed.has(host)) return;
    this.__observed.add(host);
    const hostId = getHostId(host);`);
  fs.writeFileSync(f, s);
  console.log(`patch-deps: patched electron-chrome-extensions ${variant} (listener hosts)`);
}

// electron-chrome-extensions: an extension's badge changing (uBlock Origin's blocked count
// changes many times a second on streaming sites) made every window's extension buttons
// reload every icon, each decoded and re-encoded on Drift's main thread — with a second
// window open (and a video playing in it) that was enough to make the browser lag.
// Main side: badge updates go out at most ~10 times a second, and icon images are cached.
for (const variant of ['cjs/index.js', 'esm/index.mjs']) {
  const f = path.join(__dirname, '..', 'node_modules', 'electron-chrome-extensions', 'dist', ...variant.split('/'));
  if (!fs.existsSync(f)) continue;
  let s = fs.readFileSync(f, 'utf8');
  const MARK4 = '/* drift: action updates v1 */';
  if (s.includes(MARK4)) continue;
  const upd = `  onUpdate() {
    if (this.queuedUpdate) return;
    this.queuedUpdate = true;
    queueMicrotask(() => {
      this.queuedUpdate = false;`;
  if (!s.includes(upd)) throw new Error(`patch-deps: browserAction onUpdate changed in ${variant}; update scripts/patch-deps.js`);
  s = s.replace(upd, `  onUpdate() {
    ${MARK4}
    if (this.queuedUpdate) return;
    this.queuedUpdate = true;
    const since = Date.now() - (this.__lastUpdate || 0);
    setTimeout(() => {
      this.queuedUpdate = false;
      this.__lastUpdate = Date.now();`);
  // close the setTimeout instead of queueMicrotask: the callback ends with "    });\n  }" — add the delay
  const updEnd = `          observer.send?.("browserAction.update");
        }
      });
    });
  }`;
  if (!s.includes(updEnd)) throw new Error(`patch-deps: browserAction onUpdate end changed in ${variant}; update scripts/patch-deps.js`);
  s = s.replace(updEnd, `          observer.send?.("browserAction.update");
        }
      });
    }, Math.max(0, 100 - since));
  }`);
  const ico = `          if (action) {
            iconDetails = tabId && action.tabs[tabId]?.icon || action.icon;
          }
          let iconImage;`;
  if (!s.includes(ico)) throw new Error(`patch-deps: extension-icon handler changed in ${variant}; update scripts/patch-deps.js`);
  s = s.replace(ico, `          if (action) {
            iconDetails = tabId && action.tabs[tabId]?.icon || action.icon;
          }
          const __iconKey = extension && iconDetails ? [extensionId, imageSize, resizeType, JSON.stringify(iconDetails.path || ''), JSON.stringify(iconDetails.imageData || '')].join('|') : '';
          const __icons = this.__iconCache || (this.__iconCache = new Map());
          if (__iconKey && __icons.has(__iconKey)) return new Response(__icons.get(__iconKey), { status: 200, headers: { "Content-Type": "image/png" } });
          let iconImage;`);
  const resp = `          if (iconImage) {
            return new Response(iconImage.toPNG(), {`;
  if (!s.includes(resp)) throw new Error(`patch-deps: extension-icon response changed in ${variant}; update scripts/patch-deps.js`);
  s = s.replace(resp, `          if (iconImage) {
            const __png = iconImage.toPNG();
            if (__iconKey) { __icons.set(__iconKey, __png); if (__icons.size > 300) __icons.delete(__icons.keys().next().value); }
            return new Response(__png, {`);
  fs.writeFileSync(f, s);
  console.log(`patch-deps: patched electron-chrome-extensions ${variant} (action updates)`);
}
// Sidebar side: a button whose icon and badge didn't change isn't touched (no icon reload).
for (const variant of ['cjs/browser-action.js', 'esm/browser-action.mjs']) {
  const f = path.join(__dirname, '..', 'node_modules', 'electron-chrome-extensions', 'dist', ...variant.split('/'));
  if (!fs.existsSync(f)) continue;
  let s = fs.readFileSync(f, 'utf8');
  const MARK5 = '/* drift: action icons v1 */';
  if (s.includes(MARK5)) continue;
  const a = `        const iconUrl = \`crx://extension-icon/\${this.id}/\${iconSize}/\${resizeType}?\${searchParams.toString()}\`;`;
  if (!s.includes(a)) throw new Error(`patch-deps: browser-action updateIcon changed in ${variant}; update scripts/patch-deps.js`);
  s = s.replace(a, a + `
        ${MARK5}
        if (this.__iconUrl === iconUrl) return;
        this.__iconUrl = iconUrl;`);
  const b = `          const badge = this.getBadge();
          badge.textContent = info.text;
          badge.style.color = "#fff";
          badge.style.backgroundColor = info.color;`;
  if (!s.includes(b)) throw new Error(`patch-deps: browser-action badge changed in ${variant}; update scripts/patch-deps.js`);
  s = s.replace(b, `          const badge = this.getBadge();
          if (badge.textContent !== info.text) badge.textContent = info.text;
          if (badge.style.backgroundColor !== info.color) { badge.style.color = "#fff"; badge.style.backgroundColor = info.color; }`);
  const c = `        this.title = typeof info.title === "string" ? info.title : "";`;
  if (s.includes(c)) s = s.replace(c, `        const __t = typeof info.title === "string" ? info.title : "";
        if (this.title !== __t) this.title = __t;`);
  fs.writeFileSync(f, s);
  console.log(`patch-deps: patched electron-chrome-extensions ${variant} (action icons)`);
}
