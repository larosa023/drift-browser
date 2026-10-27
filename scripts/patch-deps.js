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
