// Drift — a lightweight Chromium browser (Electron)
// Main process: window, tabs, shields, sessions, shortcuts, downloads.
// Startup timing and process memory, printed when DRIFT_PERF=1 is set (for profiling).
const __T0 = Date.now();
const PERF_ON = !!process.env.DRIFT_PERF;
global.PERF = PERF_ON ? (l) => console.log(`[perf] ${String(Date.now() - __T0).padStart(5)}ms ${l}`) : () => {};

const {
  app, BaseWindow, WebContentsView, ipcMain, session, Menu, shell, dialog,
  protocol, net, clipboard, nativeTheme, webContents, webFrameMain, nativeImage, screen,
} = require('electron');
const path = require('path');
const fs = require('fs');
// Chrome extension support (tabs/popups/action APIs + Chrome Web Store installs).
// Must be required before the app is ready: it registers the crx:// scheme.
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const { installChromeWebStore, uninstallExtension } = require('electron-chrome-web-store');
const { Bookmarks, chromiumProfiles, fromChromiumJSON, fromNetscapeHTML, toNetscapeHTML } = require('./bookmarks');
const { Passwords } = require('./passwords');
const WALLPAPERS = require('./wallpapers');

// ---------------------------------------------------------------------------
// Constants & small helpers
// ---------------------------------------------------------------------------

const GAP = 8;            // space around the page
const FIND_H = 46;        // height of the find bar
const TITLE_H = 40;       // height of the top toolbar (address bar, drag area, window buttons)
const BOOKMARKS_H = 30;   // height of the bookmarks bar
const RAIL_W = 52;        // width of the icon-only sidebar
const RADIUS = 10;        // page corner radius
const UI_DIR = path.join(__dirname, 'ui');
const PAGES_DIR = path.join(__dirname, 'pages');
const NEWTAB = 'drift://newtab/';
const AUDIO_HOOK = fs.readFileSync(path.join(__dirname, 'audio-hook.js'), 'utf8');
// The part of it every page gets up front (same as page-preload.js): Web Audio goes through a
// per-page gain node, so a later volume change reaches sounds that are already playing.
const AUDIO_CONNECT_HOOK = `(() => {
  if (AudioNode.prototype.connect.__drift) return;
  const origConnect = AudioNode.prototype.connect;
  const masters = window.__driftMasters = window.__driftMasters || new Set();
  const patched = function (dest, ...rest) {
    if (dest instanceof AudioDestinationNode) {
      const c = dest.context;
      let m = c.__driftMaster;
      if (!m) {
        m = c.createGain();
        origConnect.call(m, dest);
        Object.defineProperty(c, '__driftMaster', { value: m });
        masters.add(new WeakRef(m));
        if (window.__driftAudio) m.gain.value = window.__driftAudio.gain;
      }
      origConnect.call(this, m, ...rest);
      return dest;
    }
    return origConnect.call(this, dest, ...rest);
  };
  patched.__drift = origConnect;
  AudioNode.prototype.connect = patched;
})();`;

const SEARCH_ENGINES = {
  brave:      { name: 'Brave Search', url: 'https://search.brave.com/search?q=%s' },
  duckduckgo: { name: 'DuckDuckGo',   url: 'https://duckduckgo.com/?q=%s' },
  google:     { name: 'Google',       url: 'https://www.google.com/search?q=%s' },
  bing:       { name: 'Bing',         url: 'https://www.bing.com/search?q=%s' },
  startpage:  { name: 'Startpage',    url: 'https://www.startpage.com/do/search?q=%s' },
};

const DEFAULT_SETTINGS = {
  searchEngine: 'brave',
  suggestions: true,
  shields: true,
  shieldsAllow: [],          // hostnames where shields are off (built-in engine)
  shieldsEngine: 'ubo',      // 'ubo' = bundled uBlock Origin, 'builtin' = lighter built-in blocker
  theme: 'system',           // system | dark | light
  accent: '#ff6a3d',
  sidebarWidth: 264,
  sidebarHidden: false,
  sidebarRail: false,        // icon-only sidebar
  titleBar: true,
  bookmarksBar: true,
  forceDark: false,          // darken every site (Chromium's auto dark mode, like Opera)
  forceDarkOff: [],          // hostnames excluded from force dark
  offerPasswords: true,
  wallpaper: '',             // '' (none) | 'builtin:<id>' | 'file:<name in userData/wallpapers>'
  wallpaperDim: 0.35,        // 0..0.85 tint over the wallpaper so text stays readable
  wallpaperBlur: 0,          // px
  wallpaperNewTab: true,     // also show it on the new tab page
  restoreTabs: true,
  sleepTabs: true,
  sleepMinutes: 20,
  permissions: {},           // { "origin|perm": true/false }
  hiddenActions: [],         // (old setting, no longer used)
  pinnedActions: [],
  hiddenSites: [],           // sites removed from the new tab page's tiles         // extension ids whose buttons stay in the toolbar; the rest are under the puzzle button
  unpacked: [],              // folders of extensions loaded with "Load unpacked"
  bounds: null,
  maximized: false,
};

const userData = () => app.getPath('userData');
const file = (n) => path.join(userData(), n);

function readJSON(name, fallback) {
  try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { return fallback; }
}
// Saves while browsing are written in the background, so a slow disk (or a virus scanner
// checking each write on Windows) never stalls the browser. Each save goes to its own temp
// file and only replaces the real one if nothing newer was saved meanwhile.
const saveGen = new Map();   // file name -> number of the latest save
const pendingWrites = new Map();   // file name -> latest contents not yet on disk
let tmpSeq = 0;
function writeJSON(name, data) {
  let json;
  try { json = JSON.stringify(data); } catch (e) { console.error('save failed', name, e.message); return; }
  const gen = (saveGen.get(name) || 0) + 1; saveGen.set(name, gen);
  pendingWrites.set(name, json);
  const tmp = file(`${name}.${process.pid}-${++tmpSeq}.tmp`);
  fs.promises.mkdir(userData(), { recursive: true })
    .then(() => fs.promises.writeFile(tmp, json))
    .then(() => saveGen.get(name) === gen ? fs.promises.rename(tmp, file(name)).then(() => { if (saveGen.get(name) === gen) pendingWrites.delete(name); }) : fs.promises.unlink(tmp))
    .catch((e) => { console.error('save failed', name, e.message); fs.promises.unlink(tmp).catch(() => {}); });
}
// For saves that must be on disk before Drift exits (quitting, closing the last window).
function writeJSONSync(name, data) {
  saveGen.set(name, (saveGen.get(name) || 0) + 1);   // any background save still running is older
  pendingWrites.delete(name);
  try {
    fs.mkdirSync(userData(), { recursive: true });
    const tmp = file(name + '.tmp');
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file(name));
  } catch (e) { console.error('save failed', name, e.message); }
}
function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
// Like debounce, for saves: anything still waiting is written when Drift quits (flushSaves).
const pendingFlush = new Set();
function debounceSave(fn, ms) {
  let t = null;
  const run = () => { clearTimeout(t); t = null; pendingFlush.delete(run); fn(); };
  return () => { clearTimeout(t); t = setTimeout(run, ms); pendingFlush.add(run); };
}
function flushSaves() {
  for (const run of [...pendingFlush]) { try { run(); } catch (e) { console.error('flush', e.message); } }
  for (const [name, json] of pendingWrites) {
    try { fs.writeFileSync(file(name + '.tmp'), json); fs.renameSync(file(name + '.tmp'), file(name)); } catch (e) { console.error('save failed', name, e.message); }
  }
  pendingWrites.clear();
}
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }
function isInternal(u) { return !u || u.startsWith('drift:') || u === 'about:blank'; }

function toUrl(text) {
  const t = (text || '').trim();
  if (!t) return NEWTAB;
  if (t.startsWith('?')) return searchUrl(t.slice(1).trim());
  if (/^(https?|file|drift|about|view-source|chrome-extension):/i.test(t)) return t;
  if (/^localhost(:\d+)?(\/.*)?$/i.test(t) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(t)) return 'http://' + t;
  if (!/\s/.test(t) && /^[^\s/]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(t)) return 'https://' + t;
  return searchUrl(t);
}
function searchUrl(q) {
  const eng = SEARCH_ENGINES[settings.searchEngine] || SEARCH_ENGINES.brave;
  return eng.url.replace('%s', encodeURIComponent(q));
}

// A Chrome-like user agent so sites don't treat us as an "embedded" app.
// Google's sign-in pages refuse browsers that look tampered with. Since mid-2026 the
// old trick (claiming to be Firefox) fails, because Chromium still sends its client-hint
// headers and JS features. A clean, consistent Chrome identity everywhere passes.
// On Google's sign-in pages (accounts.google.com) Drift shows its true, untouched identity:
// Chromium as Electron ships it, with no version claim, no DevTools-protocol session and no
// page patches. Claiming to be Chrome there makes Google run Chrome-only checks that an
// embedded engine fails ("This browser or app may not be secure"); the honest engine passes.
// Every other site sees the Chrome identity below.
const GOOGLE_SIGNIN = /^accounts\.google\.[a-z.]+$/i;
function isSignin(url) { try { return GOOGLE_SIGNIN.test(new URL(url).hostname); } catch { return false; } }
function engineUA() {
  const plat = process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64'
    : process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${plat}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Electron/${process.versions.electron} Safari/537.36`;
}
function uaFor(url) { return isSignin(url) ? engineUA() : chromeUA(); }
// Put a page into sign-in mode or normal mode before it loads `url`.
function setMode(wc, url) {
  const signin = isSignin(url);
  wc.__driftSignin = signin;
  if (signin) {
    try { if (wc.debugger.isAttached()) wc.debugger.detach(); } catch {}
    wc.__driftIdentity = false;
  }
  const want = uaFor(url);
  if (wc.getUserAgent() !== want) wc.setUserAgent(want);
  if (!signin && /^https?:/.test(url || '')) applyIdentity(wc);
}
// Load a URL with the right identity for where it's going.
function loadIn(wc, url) {
  const tab = wcToTab.get(wc.id);
  if (tab && darkSwitchNeeded(tab, url)) { openInFreshView(tab, url); return Promise.resolve(); }
  setMode(wc, url);
  return wc.loadURL(url).catch(() => {});
}
// Force dark is fixed when a tab's page process starts, so a tab going from a page without it
// (like the new tab page) to a site with it needs a new page. Decide that before the site
// starts loading, not after: otherwise the site loads twice (a visible stall on heavy sites).
function darkSwitchNeeded(tab, url) {
  return !!(tab.view && /^(https?|file):/i.test(url || '') && wantsDark(url) !== !!tab.dark);
}
function openInFreshView(tab, url) {
  const wc = tab.view.webContents;
  let restore = null;
  try {
    // The history so far plus the new site as the current entry: the site loads once, and
    // Back still leads where it did.
    const entries = wc.navigationHistory.getAllEntries().slice(0, wc.navigationHistory.getActiveIndex() + 1)
      .map(e => ({ url: e.url, title: e.title || '' }));
    entries.push({ url, title: '' });
    restore = { entries, index: entries.length - 1 };
  } catch {}
  const muted = tab.muted;
  destroyView(tab);
  tab.url = url;
  ensureView(tab, restore);
  const nwc = tab.view.webContents;
  if (muted) nwc.setAudioMuted(true);
  if (tab.volume !== 1) nwc.once('did-finish-load', () => applyVolume(tab));
  if (tab.id === activeId) {
    if (extensions) { try { extensions.selectTab(nwc); } catch {} }
    layout(); focusPage();
  }
  push();
}
// Switch identity when a page navigates or redirects into Google sign-in. The first request
// to Google has to carry the honest identity, so restart that navigation after switching.
// Leaving sign-in (the cookie-setting redirects back to the site) is never interrupted; the
// page switches back once it lands.
function guardUserAgent(wc) {
  const enter = (e) => {
    if (e.isMainFrame === false) return;
    const url = e.url; if (!/^https?:/.test(url || '')) return;
    if (!isSignin(url) || wc.__driftSignin) return;
    e.preventDefault();
    setMode(wc, url);
    wc.loadURL(url).catch(() => {});
  };
  wc.on('will-navigate', enter);
  wc.on('will-redirect', enter);
  // Back on the site, switch to the Chrome identity at the next link the user follows (before
  // its request goes out). Changing identity on a page that has already loaded makes Chromium
  // re-request it, which would replay sign-in's one-time redirect, so the page sign-in lands on
  // keeps the engine identity. Google's own hops on the way back are left alone.
  wc.on('will-navigate', (e) => {
    if (!wc.__driftSignin || e.isMainFrame === false) return;
    const url = e.url; if (!/^https?:/.test(url || '') || isSignin(url)) return;
    let from = ''; try { from = new URL(wc.getURL()).hostname; } catch {}
    if (/^accounts\.(google\.[a-z.]+|youtube\.com)$/i.test(from)) return;
    e.preventDefault();
    setMode(wc, url);
    wc.loadURL(url).catch(() => {});
  });
  // "Sign in with Google" popups: their first load happens before these hooks can act.
  wc.on('did-create-window', (child, details) => {
    const cwc = child.webContents;
    if (isSignin(details.url) && !cwc.__driftSignin) { setMode(cwc, details.url); cwc.loadURL(details.url).catch(() => {}); }
  });
}

// The Chrome version Drift reports (see extensions/drift-hints/identity.json).
function identity() {
  try { return JSON.parse(fs.readFileSync(path.join(hintsPath(), 'identity.json'), 'utf8')); } catch { return null; }
}
const ENGINE_MAJOR = Number(process.versions.chrome.split('.')[0]);
const IDENTITY = identity();
const CLAIM = IDENTITY && IDENTITY.enabled !== false && IDENTITY.chromeMajor > ENGINE_MAJOR ? IDENTITY : null;   // null: report the engine as-is
function chromeUA() {
  const major = CLAIM ? CLAIM.chromeMajor : ENGINE_MAJOR;
  const plat = process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64'
    : process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7'
    : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${plat}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let settings;
let history;            // Map url -> {url,title,visits,last}
// Per-window state. Drift can have several windows; the variables below always describe the
// window being handled right now (the "current" window). Every entry point — a message from a
// window's sidebar UI, an event from one of its tabs, a window event — switches to the right
// window first with useWin(). Everything else (settings, history, bookmarks, downloads,
// extensions) is shared by all windows.
let win, ui;
let tabs = [];          // this window's tabs, in sidebar order
let activeId = null;
let overlay = null;     // null | 'palette' | 'peek' | menus…
let findOpen = false;
let htmlFullscreen = false;
let nextTabId = 1;
let nextWinId = 1;
let closedTabs = [];    // for Ctrl+Shift+T
const windows = [];     // window contexts
let cur = null;         // the current window's context
let lastFocused = null; // the window the user used last (for actions with no window of their own)
const zOrder = [];      // windows, most recently created or focused first (≈ which is on top)
let quitting = false;   // quitting with windows open: the session was saved once, with all of them
const WIN_KEYS = ['win', 'ui', 'tabs', 'activeId', 'overlay', 'findOpen', 'htmlFullscreen', 'splits', 'toastView', 'toastShown', 'toastTimer', 'toastToken', 'toastSize'];
function saveCtx() {
  if (!cur) return;
  cur.win = win; cur.ui = ui; cur.tabs = tabs; cur.activeId = activeId; cur.overlay = overlay; cur.findOpen = findOpen;
  cur.htmlFullscreen = htmlFullscreen; cur.splits = splits; cur.toastView = toastView; cur.toastShown = toastShown;
  cur.toastTimer = toastTimer; cur.toastToken = toastToken; cur.toastSize = toastSize;
}
function useWin(ctx) {
  if (!ctx || ctx === cur) return cur;
  saveCtx();
  const prev = cur;
  cur = ctx;
  ({ win, ui, tabs, activeId, overlay, findOpen, htmlFullscreen, splits, toastView, toastShown, toastTimer, toastToken, toastSize } = ctx);
  return prev;
}
function newWinCtx() {
  return { id: nextWinId++, win: null, ui: null, tabs: [], activeId: null, overlay: null, findOpen: false, htmlFullscreen: false,
    splits: [], toastView: null, toastShown: false, toastTimer: null, toastToken: 0, toastSize: { w: 360, h: 64 }, ready: false };
}
// Run fn for each window (as the current window), then switch back.
function forEachWin(fn) {
  saveCtx();
  const prev = cur;
  for (const ctx of [...windows]) { useWin(ctx); try { fn(ctx); } catch (e) { console.error(e); } }
  if (prev && windows.includes(prev)) useWin(prev);
}
const ctxOfTab = (tab) => windows.find(c => c.id === tab.wid) || null;
const ctxOfUi = (wc) => windows.find(c => c.ui && c.ui.webContents === wc) || null;
const ctxOfWin = (w) => windows.find(c => c.win === w) || null;
function useTab(tab) { const c = tab && ctxOfTab(tab); if (c) useWin(c); return c; }
// Every tab in every window.
function allTabs() { saveCtx(); return windows.flatMap(c => c.tabs); }
function findTab(id) { return allTabs().find(t => t.id === id) || null; }
let blocker = null;
let uboId = null;          // extension id of the bundled uBlock Origin while it's loaded
let extensions = null;     // ElectronChromeExtensions instance
let blockedTotal = 0;
let splits = [];          // split view pairs: { a: tabId, b: tabId, ratio, dir: 'row' | 'col' }
let bookmarks = null;      // Bookmarks store
let passwords = null;      // Passwords store
const downloads = [];
const wcToTab = new Map();

const saveSettings = debounceSave(() => writeJSON('settings.json', settings), 400);
const saveHistory = debounceSave(() => {
  const arr = [...history.values()].sort((a, b) => b.last - a.last).slice(0, 4000);
  writeJSON('history.json', arr);
}, 2000);
const saveSession = debounceSave(() => { if (windows.length) writeJSON('session.json', sessionSnapshot()); }, 800);

// Session: every open window with its tabs. The first window's tabs are also stored at the top
// level, the format older versions of Drift read.
function windowSnapshot(c) {
  const kept = c.tabs.filter(t => !isInternal(t.url) || t.pinned);
  const idx = (id) => kept.findIndex(t => t.id === id);
  let bounds = null;
  try { if (c.win && !c.win.isDestroyed()) bounds = c.win.isMaximized() || c.win.isFullScreen() ? c.win.getNormalBounds() : c.win.getBounds(); } catch {}
  return {
    tabs: kept.map(t => ({ url: t.url, title: t.title, favicon: (t.favicon || '').length < 12000 ? t.favicon : '', pinned: t.pinned })),
    active: Math.max(0, idx(c.activeId)),
    splits: c.splits.map(sp => [idx(sp.a), idx(sp.b), sp.ratio, sp.dir]).filter(x => x[0] >= 0 && x[1] >= 0),
    bounds, maximized: !!(c.win && !c.win.isDestroyed() && c.win.isMaximized()),
  };
}
function sessionSnapshot() {
  saveCtx();
  const ws = windows.map(windowSnapshot);
  return { ...(ws[0] || { tabs: [], active: 0, splits: [] }), windows: ws };
}

function activeTab() { return tabs.find(t => t.id === activeId) || null; }

// Show a context menu in the current window. Clicks run later, so they switch back to this
// window first.
function popupMenu(template, opts = {}) {
  const ctx = cur;
  const wrap = (items) => items.map(it => {
    const out = { ...it };
    if (typeof it.click === 'function') out.click = (...a) => { useWin(ctx); return it.click(...a); };
    if (Array.isArray(it.submenu)) out.submenu = wrap(it.submenu);
    return out;
  });
  Menu.buildFromTemplate(wrap(template)).popup({ window: win, ...opts });
}

// ---------------------------------------------------------------------------
// Pushing state to the sidebar UI (coalesced)
// ---------------------------------------------------------------------------

// push() refreshes every window's sidebar (coalesced); each gets its own tabs and active page.
// At most ~30 updates a second: a busy page (Twitch, YouTube) fires loading, title, icon and
// audio events in bursts, and each update makes every sidebar re-render.
let pushQueued = false, lastPush = 0;
function push() {
  if (pushQueued) return;
  pushQueued = true;
  const wait = Math.max(0, 33 - (Date.now() - lastPush));
  const run = () => { pushQueued = false; lastPush = Date.now(); forEachWin(() => pushOne()); };
  if (wait) setTimeout(run, wait); else setImmediate(run);
}
function pushOne() {
  {
    if (!ui || ui.webContents.isDestroyed()) return;
    const t = activeTab();
    const wc = t && t.view ? t.view.webContents : null;
    ui.webContents.send('state', {
      tabs: tabs.map(x => ({
        id: x.id, url: x.url, title: x.title, favicon: x.favicon, pinned: x.pinned,
        loading: x.loading, audible: x.audible, muted: x.muted, asleep: !x.view,
        volume: x.volume, hadAudio: x.hadAudio,
        crashed: x.crashed,
      })),
      activeId,
      activeWcId: wc ? wc.id : -1,
      splits: splits.map(sp => ({ a: sp.a, b: sp.b, dir: sp.dir })),
      nav: {
        url: t ? t.url : '',
        canGoBack: wc ? wc.navigationHistory.canGoBack() : false,
        canGoForward: wc ? wc.navigationHistory.canGoForward() : false,
        loading: t ? t.loading : false,
        secure: t ? t.url.startsWith('https:') : false,
        blocked: t ? t.blocked : 0,
        shieldsOn: t ? shieldsOnFor(t.url) : settings.shields,
        bookmarked: !!(t && bookmarks && bookmarks.findByUrl(t.url)),
        dark: !!(t && t.dark),
        darkSite: t ? !settings.forceDarkOff.includes(hostOf(t.url)) : true,
        zoom: wc ? Math.round(wc.getZoomFactor() * 100) : 100,
      },
      settings: { ...settings, permissions: undefined, bounds: undefined },
      passwordCount: passwords ? passwords.entries.length : 0,
      appVersion: app.getVersion(), update: updateState,
      wallpaperCss: wallpaperCss(),
      wallpapers: WALLPAPERS.map(w => ({ id: w.id, name: w.name, css: w.css })),
      desktopWallpaper: !!desktopWallpaperPath(),
      passwordsEncrypted: passwords ? passwords.canEncrypt() : false,
      engines: Object.fromEntries(Object.entries(SEARCH_ENGINES).map(([k, v]) => [k, v.name])),
      blockedTotal,
      uboId,
      downloads: downloads.map(d => ({ ...d, item: undefined })),
      overlay, findOpen,
      maximized: win ? win.isMaximized() : false,
      platform: process.platform,
      chrome: process.versions.chrome,
      dark: isDark(),
      windowCount: windows.length, windowId: cur ? cur.id : 0,
    });
  }
}
// Send the same message to every window's sidebar UI.
function sendAll(ch, ...args) {
  saveCtx();
  for (const c of windows) if (c.ui && !c.ui.webContents.isDestroyed()) c.ui.webContents.send(ch, ...args);
}

function isDark() {
  return settings.theme === 'dark' || (settings.theme === 'system' && nativeTheme.shouldUseDarkColors);
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function contentRect() {
  const [w, h] = win.getContentSize();
  if (htmlFullscreen) return { x: 0, y: 0, width: w, height: h };
  const top = titleHeight() + bookmarksHeight() + (findOpen ? FIND_H : 0);
  const left = sidebarLeft();
  return { x: left, y: top, width: Math.max(0, w - left - GAP), height: Math.max(0, h - top - GAP) };
}

function titleHeight() {
  return settings.titleBar && !win.isFullScreen() ? TITLE_H : GAP;
}
function bookmarksHeight() {
  return settings.titleBar && settings.bookmarksBar && !win.isFullScreen() ? BOOKMARKS_H : 0;
}
function sidebarLeft() {
  if (settings.sidebarHidden) return GAP;
  return settings.sidebarRail ? RAIL_W : settings.sidebarWidth;
}

// The split containing a tab, if any.
function splitOf(id) { return splits.find(sp => sp.a === id || sp.b === id) || null; }

// Where each visible page goes: one pane normally, two in split view.
function panes() {
  const r = contentRect();
  const t = activeTab(); if (!t) return [];
  const sp = htmlFullscreen ? null : splitOf(t.id);
  if (!sp) return [{ tab: t, rect: r }];
  const A = tabs.find(x => x.id === sp.a), B = tabs.find(x => x.id === sp.b);
  if (sp.dir === 'col') {
    const h1 = Math.round((r.height - GAP) * sp.ratio);
    return [{ tab: A, rect: { x: r.x, y: r.y, width: r.width, height: h1 } },
            { tab: B, rect: { x: r.x, y: r.y + h1 + GAP, width: r.width, height: r.height - h1 - GAP } }];
  }
  const w1 = Math.round((r.width - GAP) * sp.ratio);
  return [{ tab: A, rect: { x: r.x, y: r.y, width: w1, height: r.height } },
          { tab: B, rect: { x: r.x + w1 + GAP, y: r.y, width: r.width - w1 - GAP, height: r.height } }];
}

// With the sidebar collapsed to icons (or hidden), notifications from the sidebar would sit
// under the page, so they're shown in a small view of their own above it, sized to fit.
let toastView = null, toastShown = false, toastTimer = null, toastToken = 0, toastSize = { w: 360, h: 64 };
function placeToast() {
  if (!toastView || !win) return;
  const r = contentRect();
  const w = Math.min(toastSize.w, Math.max(200, r.width - 16)), h = toastSize.h;
  toastView.setBounds({ x: r.x + 4, y: r.y + r.height - h - 4, width: w, height: h });
}
function showFloatingToast(t) {
  if (!toastView) {
    toastView = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, preload: path.join(__dirname, 'ui', 'toast-preload.js') } });
    toastView.setBackgroundColor('#00000000');
    toastView.webContents.loadURL('drift://ui/toast.html');
  }
  toastToken = t.token;
  const send = () => toastView.webContents.send('show', { html: t.html, dark: isDark(), accent: settings.accent });
  if (toastView.webContents.isLoading()) toastView.webContents.once('did-finish-load', send); else send();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideFloatingToast, Math.max(1500, Math.min(15000, t.ms || 3200)));
}
function hideFloatingToast() {
  clearTimeout(toastTimer);
  if (!toastShown) return;
  toastShown = false;
  try { win.contentView.removeChildView(toastView); } catch {}
}

function restack() {
  const views = panes().map(p => p.tab && p.tab.view).filter(Boolean);
  const uiOnTop = overlay !== null && !htmlFullscreen;
  const want = uiOnTop ? [...views, ui] : [ui, ...views];
  if (toastView && toastShown) want.push(toastView);   // notifications float above everything
  const have = win.contentView.children;
  if (have.length === want.length && have.every((v, i) => v === want[i])) return;
  for (const c of have) if (!want.includes(c)) win.contentView.removeChildView(c);
  // Raising the UI over the page (opening an overlay) only needs the UI moved to the top.
  // Re-adding the page view too makes it repaint from blank for a few frames (a flash).
  const pagesOf = (list) => list.filter(v => v !== ui && v !== toastView);
  const curPages = pagesOf(win.contentView.children), wantPages = pagesOf(want);
  if (uiOnTop && curPages.length === wantPages.length && curPages.every((v, i) => v === wantPages[i])) {
    win.contentView.addChildView(ui);
    if (toastView && toastShown) win.contentView.addChildView(toastView);
    return;
  }
  // Only touch views from the first one out of place: adding a view that's already attached
  // moves it to the top without detaching it. Detaching the sidebar UI would drop its focus
  // and cancel anything in progress there (like dragging a tab).
  const cur = win.contentView.children;
  let i = 0; while (i < want.length && cur[i] === want[i]) i++;
  for (let j = i; j < want.length; j++) win.contentView.addChildView(want[j]);
}

function layout() {
  if (!win || win.isDestroyed()) return;
  const [w, h] = win.getContentSize();
  const r = contentRect();
  const ps = panes();
  for (const p of ps) {
    if (!p.tab) continue;
    if (!p.tab.view) ensureView(p.tab);   // wake a sleeping split partner
    p.tab.lastActive = Date.now();
    p.tab.view.setBounds(p.rect);
    p.tab.view.setBorderRadius(htmlFullscreen ? 0 : RADIUS);
  }
  const sp = ps.length === 2 ? splitOf(activeId) : null;
  if (overlay === 'peek') ui.setBounds({ x: 0, y: 0, width: (settings.sidebarRail ? RAIL_W : settings.sidebarWidth) + 24, height: h });
  else ui.setBounds({ x: 0, y: 0, width: w, height: h });
  if (toastShown) placeToast();
  restack();
  ui.webContents.send('layout', { content: r, fullscreen: htmlFullscreen || win.isFullScreen(), titleH: titleHeight(), bmH: bookmarksHeight(), left: sidebarLeft(),
    panes: ps.map(p => ({ id: p.tab ? p.tab.id : 0, rect: p.rect })), split: sp ? { dir: sp.dir, ratio: sp.ratio } : null, activeId });
}

function setOverlay(mode, keepFocus) {
  overlay = mode;
  layout();
  if (['palette', 'modal', 'extmenu', 'siteinfo', 'dlmenu', 'bmpop'].includes(mode)) ui.webContents.focus();
  else if (!keepFocus) focusPage();   // keepFocus: an extension popup just opened and must keep focus
  push();
}

function focusPage() {
  const t = activeTab();
  if (t && t.view && !findOpen) t.view.webContents.focus();
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function createTab(url = NEWTAB, opts = {}) {
  const tab = {
    id: nextTabId++, wid: cur.id, url, title: opts.title || '', favicon: opts.favicon || (faviconStore[hostOf(url)] || ''),
    pinned: !!opts.pinned, view: null, loading: false, audible: false, muted: false,
    volume: 1, hadAudio: false,
    blocked: 0, lastActive: Date.now(), crashed: false,
  };
  let index = opts.index;
  if (index === undefined) {
    if (tab.pinned) index = tabs.filter(t => t.pinned).length;
    else if (opts.openerId) {
      // Open next to the tab that opened it (like Chrome).
      const i = tabs.findIndex(t => t.id === opts.openerId);
      index = i >= 0 ? i + 1 : tabs.length;
    } else index = tabs.length;
  }
  tabs.splice(index, 0, tab);
  if (!opts.lazy) ensureView(tab);
  if (opts.activate !== false) activate(tab.id);
  else { push(); saveSession(); }
  return tab;
}

// Force dark is a per-renderer Chromium setting, so it's chosen when a tab's view is created.
function wantsDark(url) {
  if (!settings.forceDark || !/^(https?|file):/i.test(url || '')) return false;
  return !settings.forceDarkOff.includes(hostOf(url));
}

// Background behind a tab's page before it draws: the theme's page colour (matches the new tab page).
function pageBase() { return isDark() ? '#1b1b20' : '#fafafb'; }
function baseFor(url) { return isInternal(url) || /^(chrome-extension|devtools):/.test(url || '') ? pageBase() : '#ffffff'; }
// Everything a tab's page reports (title, loading, audio, popups…) is handled as the tab's
// window — looked up when the event fires, since a tab can move to another window.
function bindToTab(wc, tab) {
  const wrapped = new WeakMap();
  const wrap = (fn) => {
    if (typeof fn !== 'function') return fn;
    let w = wrapped.get(fn);
    if (!w) { w = function (...a) { useTab(tab); return fn.apply(this, a); }; wrapped.set(fn, w); }
    return w;
  };
  for (const m of ['on', 'once', 'addListener', 'prependListener', 'prependOnceListener']) { const orig = wc[m].bind(wc); wc[m] = (ev, fn) => orig(ev, wrap(fn)); }
  for (const m of ['off', 'removeListener']) { const orig = wc[m].bind(wc); wc[m] = (ev, fn) => orig(ev, wrapped.get(fn) || fn); }
  const swoh = wc.setWindowOpenHandler.bind(wc);
  wc.setWindowOpenHandler = (fn) => swoh(wrap(fn));
}
// WebGPU is only offered to pages when Chromium reports it working with hardware acceleration
// (see page-preload.js for why).
function webgpuUsable() {
  try { return app.getGPUFeatureStatus().webgpu === 'enabled'; } catch { return false; }
}
const NO_WEBGPU_CODE = `(() => { try {
  const G = window.GPU && window.GPU.prototype;
  if (!G || G.requestAdapter.__drift) return;
  const p = new Proxy(G.requestAdapter, { apply: () => Promise.resolve(null) });
  Object.defineProperty(p, '__drift', { value: true });
  Object.defineProperty(G, 'requestAdapter', { ...Object.getOwnPropertyDescriptor(G, 'requestAdapter'), value: p });
} catch {} })();`;
function ensureView(tab, restore) {
  if (tab.view) return tab.view;
  tab.dark = wantsDark(tab.url);
  const extPage = /^chrome-extension:/.test(tab.url);
  const view = new WebContentsView({
    webPreferences: {
      sandbox: true, contextIsolation: true, nodeIntegration: false,
      spellcheck: true, scrollBounce: true,
      // Preload scripts in iframes (not Node) only for extension pages, whose panes (like
      // uBlock Origin's dashboard) need the extension APIs there. On web pages it would set up
      // a script context in every ad and embed frame: memory and time for nothing.
      nodeIntegrationInSubFrames: extPage,
      additionalArguments: tab.dark ? ['--blink-settings=forceDarkModeEnabled=true'] : [],

    },
  });
  // Until a page has drawn, show the theme's page colour instead of a white flash. Web pages
  // switch to white once their document is ready (pages without a background expect white,
  // like Chrome); Drift's own pages keep the theme colour.
  view.setBackgroundColor(pageBase());
  bindToTab(view.webContents, tab);
  // Once the document is ready, match the colour behind the page to what the page itself paints:
  // its own background if it has one (dark sites stay dark — no white flash), white only if it
  // has none (like Chrome). Checked again after load for pages that set it late.
  const matchBase = () => {
    const wc = view.webContents; if (wc.isDestroyed()) return;
    const url = wc.getURL();
    if (isInternal(url) || /^(chrome-extension|devtools):/.test(url)) { view.setBackgroundColor(pageBase()); return; }
    wc.executeJavaScriptInIsolatedWorld(1998, [{ code: `(() => {
      const bg = (el) => el ? getComputedStyle(el).backgroundColor : '';
      const solid = (c) => !!c && c !== 'transparent' && !(c.indexOf('rgba') === 0 && c.split(',').pop().trim() === '0)');
      const h = bg(document.documentElement), b = bg(document.body);
      return solid(h) ? h : solid(b) ? b : '';
    })()` }]).then((c) => {
      if (view.webContents.isDestroyed()) return;
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || '');
      view.setBackgroundColor(m ? '#' + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('') : '#ffffff');
    }).catch(() => {});
  };
  view.webContents.on('dom-ready', matchBase);
  view.webContents.on('did-finish-load', matchBase);
  view.webContents.on('did-start-navigation', (e) => {
    // Going from a web page to Drift's new tab page (or back): use the right colour from the start.
    if (e.isMainFrame && !e.isSameDocument && !view.webContents.isDestroyed()) view.setBackgroundColor(isInternal(e.url) ? pageBase() : baseFor(view.webContents.getURL()));
  });
  view.webContents.on('did-navigate', (_e, url) => {
    // A web tab that moved to an extension page: recreate it with iframe support (keeps history).
    if (!extPage && /^chrome-extension:/.test(url) && tab.view === view) { tab.url = url; setImmediate(() => { if (tab.view === view) rebuildView(tab); }); }
  });
  // Per-tab volume for Web Audio in iframes (embedded games, players): the top page gets the
  // hook from page-preload.js, web iframes as soon as they load (in the page's own script
  // context, so nothing extra is set up per frame).
  if (!extPage) view.webContents.on('did-frame-navigate', (_e, url, _code, _status, isMain, pid, rid) => {
    if (isMain || !/^https?:/.test(url)) return;
    const code = (tab.volume !== 1 ? `${AUDIO_HOOK};window.__driftAudio.set(${tab.volume});` : AUDIO_CONNECT_HOOK) + (webgpuUsable() ? '' : NO_WEBGPU_CODE);
    try { const f = webFrameMain.fromId(pid, rid); if (f && !f.isDestroyed()) f.executeJavaScript(code).catch(() => {}); } catch {}
  });
  view.setBorderRadius(RADIUS);
  tab.view = view;
  tab.crashed = false;
  const wc = view.webContents;
  wcToTab.set(wc.id, tab);
  wireTab(tab, wc);
  if (extensions) extensions.addTab(wc, (ctxOfTab(tab) || cur).win);
  setMode(wc, tab.url);
  if (restore && restore.entries.length) wc.navigationHistory.restore(restore).catch(() => loadIn(wc, tab.url));
  else loadIn(wc, tab.url);
  return view;
}

// Recreate a tab's page (e.g. to switch force dark on/off) keeping its back/forward history.
function rebuildView(tab) {
  if (!tab.view) return;
  const wc = tab.view.webContents;
  let restore = null;
  try {
    restore = { entries: wc.navigationHistory.getAllEntries(), index: wc.navigationHistory.getActiveIndex() };
  } catch {}
  const zoomFactor = wc.getZoomFactor();
  const muted = tab.muted;
  destroyView(tab);
  ensureView(tab, restore);
  const nwc = tab.view.webContents;
  nwc.once('did-finish-load', () => { nwc.setZoomFactor(zoomFactor); if (tab.volume !== 1) applyVolume(tab); });
  if (muted) nwc.setAudioMuted(true);
  if (tab.id === activeId) {
    if (extensions) { try { extensions.selectTab(nwc); } catch {} }
    layout(); focusPage();
  }
  push();
}

function wireTab(tab, wc) {
  const upd = () => { push(); saveSession(); };
  wc.on('did-start-loading', () => { tab.loading = true; push(); });
  wc.on('did-stop-loading', () => { tab.loading = false; push(); });
  wc.on('page-title-updated', (_e, title) => {
    tab.title = title; upd();
    const h = history.get(tab.url); if (h) { h.title = title; saveHistory(); }
  });
  wc.on('page-favicon-updated', (_e, icons) => resolveTabIcon(tab, wc, icons));
  // Sites that never announce an icon (or announce it late) are handled after load.
  wc.on('did-finish-load', () => setTimeout(() => resolveTabIcon(tab, wc, []), 400));
  wc.on('will-navigate', (e) => {
    // A link or the new tab page's search box leading to a site that needs force dark switched.
    if (e.defaultPrevented || e.isMainFrame === false || tab.view !== null && tab.view.webContents !== wc) return;
    if (darkSwitchNeeded(tab, e.url)) { e.preventDefault(); setImmediate(() => { if (tab.view && tab.view.webContents === wc) openInFreshView(tab, e.url); }); }
  });
  wc.on('did-start-navigation', (d) => {
    if (d.isMainFrame && !d.isSameDocument) { tab.blocked = 0; notePendingNav(d.url, wc.id); }
  });
  wc.on('did-redirect-navigation', (d) => { if (d.isMainFrame) notePendingNav(d.url, wc.id); });
  wc.on('did-navigate', (_e, url) => {
    if (hostOf(url) !== tab.iconHost) tab.iconHost = '';
    if (hostOf(url) !== hostOf(tab.url)) tab.favicon = faviconStore[hostOf(url)] || '';
    tab.url = url; addHistory(url, wc.getTitle()); upd();
    if (wantsDark(url) !== !!tab.dark && !isInternal(url)) setImmediate(() => rebuildView(tab));
    if (pendingLogin && pendingLogin.wcId === wc.id) offerSavePassword();
  });
  wc.on('did-navigate-in-page', (_e, url, isMain) => {
    if (isMain) { tab.url = url; addHistory(url, wc.getTitle()); upd(); }
    if (isMain && pendingLogin && pendingLogin.wcId === wc.id) offerSavePassword();
  });
  wc.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return; // -3 = aborted (normal)
    showErrorPage(wc, url, code, desc);
  });
  wc.on('audio-state-changed', (e) => { tab.audible = e.audible; if (e.audible) tab.hadAudio = true; push(); });
  // Keep a custom volume applied as the page navigates or adds frames/players.
  wc.on('did-frame-finish-load', () => { if (tab.volume !== 1) applyVolume(tab); });
  wc.on('media-started-playing', () => { if (tab.volume !== 1) applyVolume(tab); });
  wc.on('render-process-gone', () => { tab.crashed = true; push(); });
  wc.on('found-in-page', (_e, r) => {
    ui.webContents.send('find-result', { active: r.activeMatchOrdinal, matches: r.matches });
  });
  wc.on('enter-html-full-screen', () => { htmlFullscreen = true; win.setFullScreen(true); layout(); });
  wc.on('leave-html-full-screen', () => { htmlFullscreen = false; win.setFullScreen(false); layout(); });
  wc.on('zoom-changed', (_e, dir) => zoom(dir === 'in' ? 1 : -1));
  wc.on('before-input-event', (e, input) => { if (handleShortcut(input)) e.preventDefault(); });
  // In split view, clicking into a page makes it the one the toolbar controls.
  wc.on('focus', () => {
    if (tab.id === activeId) return;
    const sp = splitOf(tab.id);
    if (sp && sp === splitOf(activeId)) {
      activeId = tab.id;
      if (extensions) { try { extensions.selectTab(wc); } catch {} }
      if (findOpen) closeFind(); else layout();
      push();
    }
  });
  wc.on('context-menu', (_e, p) => pageContextMenu(tab, wc, p));
  wc.setWindowOpenHandler(({ url, disposition }) => {
    // Real popups (sign-in windows etc.) stay popups so window.opener keeps working.
    if (disposition === 'new-window') {
      return { action: 'allow', overrideBrowserWindowOptions: {
        width: 520, height: 700, autoHideMenuBar: true, backgroundColor: '#ffffff',
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
      } };
    }
    createTab(url, { activate: disposition !== 'background-tab', openerId: tab.id });
    return { action: 'deny' };
  });
}

function showErrorPage(wc, url, code, desc) {
  const msg = {
    '-105': "This site can't be found", '-106': "You're offline",
    '-102': 'The site refused to connect', '-118': 'The site took too long to respond',
    '-137': "This site can't be found", '-200': 'Your connection is not private',
  }[String(code)] || "This page couldn't load";
  const html = `<!doctype html><meta charset=utf-8><title>${escapeHtml(hostOf(url))}</title>
  <style>html{color-scheme:light dark}body{font:15px/1.5 "Segoe UI",system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:Canvas;color:CanvasText}
  main{max-width:520px;padding:32px}h1{font-size:22px;margin:0 0 8px}p{opacity:.7;margin:0 0 4px;word-break:break-all}code{opacity:.5;font-size:12px}
  a{display:inline-block;margin-top:20px;padding:9px 18px;border-radius:999px;background:${settings.accent};color:#fff;text-decoration:none;font-weight:600}</style>
  <main><h1>${msg}</h1><p>${escapeHtml(url)}</p><code>${escapeHtml(desc)} (${code})</code><br><a href="${escapeHtml(url)}">Try again</a></main>`;
  wc.executeJavaScript(`document.open();document.write(${JSON.stringify(html)});document.close();`).catch(() => {});
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function refreshNewTabs() {
  for (const t of allTabs()) if (t.view && t.url.startsWith(NEWTAB)) t.view.webContents.reload();
}

function activate(id, opts = {}) {
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;
  const prev = activeTab();
  if (prev && prev !== tab && findOpen) closeFind();
  activeId = id;
  tab.lastActive = Date.now();
  if (!tab.view) ensureView(tab);
  if (extensions) { try { extensions.selectTab(tab.view.webContents); } catch {} }
  if (tab.crashed) { tab.crashed = false; tab.view.webContents.reload(); }
  else if (tab.url.startsWith(NEWTAB) && prev !== tab && !tab.view.webContents.isLoading()) tab.view.webContents.reload(); // fresh top sites
  layout();
  // noFocus: the tab was pressed in the sidebar and may be about to be dragged; moving focus
  // into the page now would cancel the drag. The sidebar asks for focus on release instead.
  if (overlay !== 'palette' && !opts.noFocus) focusPage();
  push(); saveSession();
}

function closeTab(id) {
  const i = tabs.findIndex(t => t.id === id);
  if (i < 0) return;
  const tab = tabs[i];
  if (!isInternal(tab.url)) {
    closedTabs.push({ url: tab.url, title: tab.title, favicon: tab.favicon, index: i, pinned: tab.pinned });
    if (closedTabs.length > 25) closedTabs.shift();
  }
  const sp = splitOf(id);
  const partner = sp ? (sp.a === id ? sp.b : sp.a) : null;
  if (sp) splits = splits.filter(x => x !== sp);
  tabs.splice(i, 1);
  destroyView(tab);
  if (activeId === id && partner && tabs.some(t => t.id === partner)) { activate(partner); }
  else if (activeId === id) {
    const unpinned = tabs.filter(t => !t.pinned);
    const next = tabs[i] && !tabs[i].pinned ? tabs[i] : (tabs[i - 1] || unpinned[unpinned.length - 1] || tabs[0]);
    if (next) activate(next.id);
    else if (windows.length > 1) { activeId = null; const w = win; setImmediate(() => { if (w && !w.isDestroyed()) w.close(); }); }   // its last tab: close this window
    else { activeId = null; createTab(NEWTAB); }
  }
  layout(); push(); saveSession();
}

function destroyView(tab) {
  if (!tab || !tab.view) return;
  const view = tab.view;
  tab.view = null;                       // first, so re-entrant calls are no-ops
  const wc = view.webContents;           // undefined once the page has already gone
  if (wc) {
    for (const [id, t] of wcToTab) if (t === tab) wcToTab.delete(id);
    if (extensions && !wc.isDestroyed()) { try { extensions.removeTab(wc); } catch {} }
  }
  const owner = ctxOfTab(tab) || cur;
  try { (owner && owner.win || win).contentView.removeChildView(view); } catch {}
  if (wc && !wc.isDestroyed()) wc.close();
  tab.loading = false; tab.audible = false;
}

function reopenClosed() {
  const c = closedTabs.pop();
  if (c) createTab(c.url, { title: c.title, favicon: c.favicon, index: Math.min(c.index, tabs.length), pinned: c.pinned });
}

function cycle(dir) {
  if (!tabs.length) return;
  const i = tabs.findIndex(t => t.id === activeId);
  activate(tabs[(i + dir + tabs.length) % tabs.length].id);
}

function moveTab(id, toIndex, pinned) {
  const i = tabs.findIndex(t => t.id === id);
  if (i < 0) return;
  const [tab] = tabs.splice(i, 1);
  if (typeof pinned === 'boolean') tab.pinned = pinned;
  const pinnedCount = tabs.filter(t => t.pinned).length;
  // Keep pinned tabs grouped at the top.
  let idx = Math.max(0, Math.min(toIndex, tabs.length));
  if (tab.pinned) idx = Math.min(idx, pinnedCount);
  else idx = Math.max(idx, pinnedCount);
  tabs.splice(idx, 0, tab);
  push(); saveSession();
}

function togglePin(id) {
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;
  moveTab(id, tab.pinned ? tabs.filter(t => t.pinned).length : tabs.filter(t => t.pinned).length, !tab.pinned);
}

// Put background tabs to sleep to save memory (like Brave/Zen tab sleeping).
setInterval(() => {
  if (!settings || !settings.sleepTabs) return;
  const cutoff = Date.now() - settings.sleepMinutes * 60000;
  let slept = false;
  forEachWin(() => {
    for (const t of tabs) {
      const sp = splitOf(t.id);
      if (sp && sp === splitOf(activeId)) continue;
      if (t.id !== activeId && t.view && !t.audible && t.lastActive < cutoff) {
        destroyView(t); slept = true;
      }
    }
  });
  if (slept) push();
}, 60000);

// ---------------------------------------------------------------------------
// Split view
// ---------------------------------------------------------------------------

function splitWith(otherId) {
  const base = activeTab(); if (!base) return;
  for (const id of [base.id, otherId]) { const old = splitOf(id); if (old) splits = splits.filter(x => x !== old); }
  let other;
  if (otherId === 'new') other = createTab(NEWTAB, { activate: false, openerId: base.id });
  else other = tabs.find(t => t.id === otherId);
  if (!other || other.id === base.id) return;
  // Keep the pair next to each other in the sidebar.
  if (!base.pinned && !other.pinned) {
    tabs.splice(tabs.indexOf(other), 1);
    tabs.splice(tabs.indexOf(base) + 1, 0, other);
  }
  splits.push({ a: base.id, b: other.id, ratio: 0.5, dir: 'row' });
  if (otherId === 'new') {
    activate(other.id);
    ui.webContents.send('palette', { newTab: false });
  } else { layout(); push(); saveSession(); }
}

function unsplit(id = activeId) {
  const sp = splitOf(id); if (!sp) return;
  splits = splits.filter(x => x !== sp);
  layout(); focusPage(); push(); saveSession();
}

function splitMenu(x, y) {
  const t = activeTab(); if (!t) return;
  const sp = splitOf(t.id);
  let items;
  if (sp) {
    items = [
      { label: 'Swap sides', click: () => { [sp.a, sp.b] = [sp.b, sp.a]; layout(); push(); saveSession(); } },
      { type: 'separator' },
      { label: 'Side by side', type: 'radio', checked: sp.dir === 'row', click: () => { sp.dir = 'row'; layout(); saveSession(); } },
      { label: 'Top and bottom', type: 'radio', checked: sp.dir === 'col', click: () => { sp.dir = 'col'; layout(); saveSession(); } },
      { label: 'Equal sizes', click: () => { sp.ratio = 0.5; layout(); saveSession(); } },
      { type: 'separator' },
      { label: 'Close split view', click: () => unsplit() },
    ];
  } else {
    const others = tabs.filter(o => o.id !== t.id).sort((a, b) => b.lastActive - a.lastActive).slice(0, 12);
    items = [
      { label: 'Split view with…', enabled: false },
      { label: 'New tab', accelerator: undefined, click: () => splitWith('new') },
      ...(others.length ? [{ type: 'separator' }] : []),
      ...others.map(o => ({ label: (o.title || hostOf(o.url) || 'New Tab').slice(0, 60), click: () => splitWith(o.id) })),
    ];
  }
  popupMenu(items, { x: Math.round(x), y: Math.round(y) });
}

// ---------------------------------------------------------------------------
// Favicons: fetched by the browser itself (pages often announce none, or serve icons
// that refuse to load inside another app's UI), cached per site as small data URLs.
// ---------------------------------------------------------------------------

let faviconStore = {};      // host -> data URL
const faviconMem = new Map(); // icon URL -> data URL | null
const saveFavicons = debounceSave(() => {
  const entries = Object.entries(faviconStore);
  if (entries.length > 800) faviconStore = Object.fromEntries(entries.slice(-800));
  writeJSON('favicons.json', faviconStore);
}, 3000);

// Shrink to 32px so icons stay small in memory and on disk (keeps SVG / ICO as-is).
function compactIcon(buf, type) {
  try {
    if (type === 'image/svg+xml') return buf.length < 60000 ? `data:${type};base64,${buf.toString('base64')}` : null;
    const img = nativeImage.createFromBuffer(buf);
    if (!img.isEmpty()) {
      const { width, height } = img.getSize();
      const out = width > 32 || height > 32 ? img.resize({ width: 32, height: 32, quality: 'best' }) : img;
      return out.toDataURL();
    }
  } catch {}
  return buf.length < 60000 ? `data:${type};base64,${buf.toString('base64')}` : null;
}

// Small rolling diagnostic log for icon problems: %APPDATA%\Drift\logs\favicons.log
// Lines are collected and written in the background, never on the browser's main path.
let iconLogBuf = '', iconLogTimer = null;
function iconLog(line) {
  iconLogBuf += `${new Date().toISOString()} ${line}\n`;
  if (iconLogTimer) return;
  iconLogTimer = setTimeout(async () => {
    iconLogTimer = null;
    const text = iconLogBuf; iconLogBuf = '';
    try {
      const dir = file('logs'); await fs.promises.mkdir(dir, { recursive: true });
      const f = path.join(dir, 'favicons.log');
      try { if ((await fs.promises.stat(f)).size > 200000) await fs.promises.rename(f, f + '.old'); } catch {}
      await fs.promises.appendFile(f, text);
    } catch {}
  }, 2000);
}

function withTimeout(promise, ms, what) {
  let t; return Promise.race([promise, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${what} timed out`)), ms); })]).finally(() => clearTimeout(t));
}

// Try the browser's own session first (same cookies and identity as the page, which bot
// checks like Cloudflare expect), then a clean session without extensions in the way.
let iconSession = null;
async function fetchIconBytes(iconUrl) {
  iconSession = iconSession || session.fromPartition('drift-favicons');
  iconSession.setUserAgent(chromeUA());
  const attempts = [['browser', session.defaultSession], ['clean', iconSession]];
  let lastErr = '';
  for (const [name, ses] of attempts) {
    try {
      const ctl = new AbortController();
      const r = await withTimeout(ses.fetch(iconUrl, { signal: ctl.signal, headers: { Accept: 'image/avif,image/webp,image/svg+xml,image/png,image/*,*/*;q=0.8' } }), 7000, 'fetch')
        .catch((e) => { ctl.abort(); throw e; });
      if (!r.ok) { lastErr = `${name}:HTTP ${r.status}`; continue; }
      const buf = Buffer.from(await withTimeout(r.arrayBuffer(), 7000, 'read'));
      return { buf, type: (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() };
    } catch (e) { lastErr = `${name}:${e.message}`; }
  }
  throw new Error(lastErr);
}

async function fetchFavicon(iconUrl) {
  if (!iconUrl) return null;
  if (iconUrl.startsWith('data:image/')) return iconUrl.length < 60000 ? iconUrl : null;
  if (!/^https?:/.test(iconUrl)) return null;
  if (faviconMem.has(iconUrl)) return faviconMem.get(iconUrl);
  let out = null, why = '';
  try {
    let { buf, type } = await fetchIconBytes(iconUrl);
    const head = buf.subarray(0, 64).toString('latin1');
    if (!type.startsWith('image/')) {
      // Servers often mislabel icons; sniff the bytes.
      type = head.startsWith('\x89PNG') ? 'image/png' : head.startsWith('\x00\x00\x01\x00') ? 'image/x-icon'
        : head.startsWith('GIF8') ? 'image/gif' : head.startsWith('\xff\xd8') ? 'image/jpeg'
        : /^\s*(<\?xml[^>]*>\s*)?<svg/i.test(head) ? 'image/svg+xml' : (head.slice(8, 12) === 'WEBP' ? 'image/webp' : '');
    }
    const looksLikeHtml = type !== 'image/svg+xml' && /^\s*<(!doctype|html)/i.test(head);
    if (!type || looksLikeHtml) why = `not an image (${type || 'unknown'})`;
    else if (!buf.length || buf.length >= 2000000) why = `bad size ${buf.length}`;
    else { out = compactIcon(buf, type); if (!out) why = 'could not decode'; }
  } catch (e) { why = e.message; }
  if (!out) iconLog(`miss ${iconUrl.slice(0, 160)} — ${why}`);
  faviconMem.set(iconUrl, out);
  if (!out) setTimeout(() => faviconMem.delete(iconUrl), 10 * 60 * 1000);   // retry later
  return out;
}

// Icon links declared in the page, best first (sized near 32px, then SVG, then others).
const ICON_SCAN = `(() => {
  const links = [...document.querySelectorAll('link[rel]')].filter(l => /(^|\\s)(icon|shortcut icon|apple-touch-icon|apple-touch-icon-precomposed|mask-icon)(\\s|$)/i.test(l.rel) && l.href);
  const score = (l) => {
    const rel = l.rel.toLowerCase(); let sc = rel.includes('apple-touch') ? 50 : rel.includes('mask-icon') ? 80 : 0;
    const m = /(\\d+)x(\\d+)/.exec(l.sizes ? String(l.sizes.value || l.getAttribute('sizes') || '') : '');
    if (m) sc += Math.abs(Number(m[1]) - 32) / 4; else if (/svg/.test(l.type || l.href)) sc += 2; else sc += 5;
    return sc;
  };
  return links.sort((a, b) => score(a) - score(b)).map(l => l.href).slice(0, 6);
})()`;

const iconJobs = new WeakMap();
async function resolveTabIcon(tab, wc, hinted) {
  const pageUrl = tab.url, host = hostOf(pageUrl);
  if (!host || !/^https?:/.test(pageUrl) || tab.iconHost === host && !hinted.length) return;
  if (iconJobs.get(tab) === host + '|' + hinted.join()) return;
  iconJobs.set(tab, host + '|' + hinted.join());
  let fromPage = [];
  try { if (!wc.isDestroyed()) fromPage = await withTimeout(wc.executeJavaScriptInIsolatedWorld(1999, [{ code: ICON_SCAN }]), 2500, 'page scan') || []; }
  catch (e) { iconLog(`scan ${host} — ${e.message}`); }
  let origin = ''; try { origin = new URL(pageUrl).origin; } catch {}
  const cands = [...new Set([...fromPage, ...hinted, origin + '/favicon.ico',
    `https://icons.duckduckgo.com/ip3/${host}.ico`, `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`])];
  let found = false;
  try {
    for (const c of cands) {
      if (hostOf(tab.url) !== host) break;      // tab moved to another site meanwhile
      const data = await fetchFavicon(c);
      if (data && hostOf(tab.url) === host) { tab.iconHost = host; setTabIcon(tab, data); found = true; break; }
    }
  } finally {
    iconJobs.delete(tab);
    if (!found && hostOf(tab.url) === host) iconLog(`NO ICON for ${host} after ${cands.length} tries`);
  }
}

function setTabIcon(tab, data) {
  tab.favicon = data;
  const host = hostOf(tab.url);
  if (host && data.length < 60000 && faviconStore[host] !== data) { faviconStore[host] = data; saveFavicons(); }
  push(); saveSession();
  if (bookmarks) { const b = bookmarks.findByUrl(tab.url); if (b && b.icon !== data && data.length < 40000) { bookmarks.noteIcon(tab.url, data); sendBookmarks(); } }
}

// ---------------------------------------------------------------------------
// Which tab does a request belong to? Electron tells extensions tabId -1 for every
// network request, so extensions like uBlock Origin ask us (see scripts/patch-deps.js).
// ---------------------------------------------------------------------------

const pendingNavs = new Map();   // url -> { wcId, at }
function notePendingNav(url, wcId) {
  pendingNavs.set(url, { wcId, at: Date.now() });
  if (pendingNavs.size > 200) for (const [k, v] of pendingNavs) if (Date.now() - v.at > 30000) pendingNavs.delete(k);
}
const originOf = (u) => { try { return new URL(u).origin; } catch { return ''; } };

const frameTab = new Map();   // Chromium frame-tree node id -> tab webContents id (ids are never reused)
function tabIdForRequest(d) {
  const live = allTabs().filter(t => t.view && !t.view.webContents.isDestroyed());
  // A page load: match the navigation the tab just started.
  if (d.type === 'main_frame') {
    const p = pendingNavs.get(d.url);
    if (p && Date.now() - p.at < 30000) return p.wcId;
    const t = live.find(x => x.view.webContents.getURL() === d.url);
    return t ? t.view.webContents.id : -1;
  }
  // Inside an embedded frame: frame ids are Chromium frame-tree node ids.
  if (d.frameId > 0) {
    const known = frameTab.get(d.frameId);
    if (known && live.some(t => t.view.webContents.id === known)) return known;
    for (const t of live) {
      try {
        const wc = t.view.webContents;
        for (const f of wc.mainFrame.framesInSubtree) frameTab.set(f.frameTreeNodeId, wc.id);   // index every frame seen
        if (frameTab.get(d.frameId) === wc.id) return wc.id;
      } catch {}
    }
    if (frameTab.size > 5000) frameTab.clear();
  }
  // From a tab's top frame: match the requesting site against what each tab shows.
  const origin = d.type === 'port' ? originOf(d.url) : (d.initiator && d.initiator !== 'null' ? d.initiator : '');
  if (!origin) return -1;
  const matches = live.filter(t => originOf(t.view.webContents.getURL()) === origin);
  if (!matches.length) return -1;
  if (d.type === 'port') { const exact = matches.find(t => t.view.webContents.getURL() === d.url); if (exact) return exact.view.webContents.id; }
  const best = matches.find(t => t.id === activeId) || matches.sort((a, b) => b.lastActive - a.lastActive)[0];
  return best.view.webContents.id;
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

function navigate(text, inNewTab) {
  const url = toUrl(text);
  const t = activeTab();
  if (inNewTab || !t) { createTab(url); return; }
  if (!t.view) ensureView(t);
  t.url = url;
  loadIn(t.view.webContents, url);
  focusPage(); push();
}

function zoom(dir) {
  const t = activeTab(); if (!t || !t.view) return;
  const wc = t.view.webContents;
  const steps = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
  const cur = wc.getZoomFactor();
  let next = 1;
  if (dir > 0) next = steps.find(s => s > cur + 0.001) || 5;
  else if (dir < 0) next = [...steps].reverse().find(s => s < cur - 0.001) || 0.25;
  wc.setZoomFactor(next);
  push();
}

function openFind() {
  if (!activeTab()) return;
  findOpen = true; layout(); ui.webContents.focus(); push();
  ui.webContents.send('find-open');
}
function closeFind() {
  const t = activeTab();
  if (t && t.view) t.view.webContents.stopFindInPage('clearSelection');
  findOpen = false; layout(); focusPage(); push();
}

function toggleSidebar() {
  settings.sidebarHidden = !settings.sidebarHidden;
  overlay = null;
  saveSettings(); forEachWin(() => layout()); push();
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts (work whether the page or the sidebar has focus)
// ---------------------------------------------------------------------------

function handleShortcut(input) {
  if (input.type !== 'keyDown') return false;
  const mod = process.platform === 'darwin' ? input.meta : input.control;
  const k = input.key.length === 1 ? input.key.toLowerCase() : input.key;
  const t = activeTab();
  const wc = t && t.view ? t.view.webContents : null;

  if (mod && !input.shift && !input.alt) {
    switch (k) {
      case 't': ui.webContents.send('palette', { newTab: true }); return true;
      case 'n': newWindow(); return true;
      case 'l': ui.webContents.send('palette', { newTab: false }); return true;
      case 'w': if (t) closeTab(t.id); return true;
      case 'r': if (wc) wc.reload(); return true;
      case 'f': openFind(); return true;
      case 'p': if (wc) wc.print(); return true;
      case 'd': toggleBookmarkActive(); return true;
      case 'Tab': cycle(1); return true;
      case 'PageDown': cycle(1); return true;
      case 'PageUp': cycle(-1); return true;
      case '=': case '+': zoom(1); return true;
      case '-': zoom(-1); return true;
      case '0': zoom(0); return true;
      case 'F5': if (wc) wc.reloadIgnoringCache(); return true;
    }
    if (/^[1-9]$/.test(k)) {
      const n = Number(k);
      const target = n === 9 ? tabs[tabs.length - 1] : tabs[n - 1];
      if (target) activate(target.id);
      return true;
    }
  }
  if (mod && input.shift && !input.alt) {
    switch (k) {
      case 't': reopenClosed(); return true;
      case 'Tab': cycle(-1); return true;
      case 'r': if (wc) wc.reloadIgnoringCache(); return true;
      case 'i': if (wc) wc.toggleDevTools(); return true;
      case 'Delete': ui.webContents.send('panel', 'settings'); return true;
      case 'b': setSetting('bookmarksBar', !settings.bookmarksBar); return true;
      case '+': case '=': zoom(1); return true;
    }
  }
  if (mod && input.alt && !input.shift && k === 's') { toggleSidebar(); return true; }
  if (input.alt && !mod && !input.shift) {
    if (k === 'ArrowLeft') { if (wc && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); return true; }
    if (k === 'ArrowRight') { if (wc && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); return true; }
    if (k === 'd') { ui.webContents.send('palette', { newTab: false }); return true; }
    if (k === 'Home') { navigate(NEWTAB); return true; }
  }
  if (!mod && !input.alt) {
    if (k === 'F5') { if (wc) input.shift ? wc.reloadIgnoringCache() : wc.reload(); return true; }
    if (k === 'F6') { ui.webContents.send('palette', { newTab: false }); return true; }
    if (k === 'F11') { win.setFullScreen(!win.isFullScreen()); return true; }
    if (k === 'F12') { if (wc) wc.toggleDevTools(); return true; }
    if (k === 'Escape' && findOpen) { closeFind(); return true; }
    if (k === 'Escape' && (overlay === 'palette' || overlay === 'modal')) { setOverlay(null); return true; }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Context menus
// ---------------------------------------------------------------------------

function pageContextMenu(tab, wc, p) {
  const m = [];
  const sep = () => { if (m.length && m[m.length - 1].type !== 'separator') m.push({ type: 'separator' }); };
  if (p.misspelledWord && p.dictionarySuggestions.length) {
    for (const s of p.dictionarySuggestions.slice(0, 5)) m.push({ label: s, click: () => wc.replaceMisspelling(s) });
    m.push({ label: 'Add to dictionary', click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
    sep();
  }
  if (p.linkURL) {
    m.push({ label: 'Open link in new tab', click: () => createTab(p.linkURL, { activate: false, openerId: tab.id }) });
    m.push({ label: 'Open link in new window', click: () => newWindow([p.linkURL]) });
    m.push({ label: 'Open link here', click: () => wc.loadURL(p.linkURL) });
    m.push({ label: 'Copy link address', click: () => clipboard.writeText(p.linkURL) });
    sep();
  }
  if (p.mediaType === 'image' && p.srcURL) {
    m.push({ label: 'Open image in new tab', click: () => createTab(p.srcURL, { activate: false, openerId: tab.id }) });
    m.push({ label: 'Save image as…', click: () => wc.downloadURL(p.srcURL) });
    m.push({ label: 'Copy image', click: () => wc.copyImageAt(p.x, p.y) });
    m.push({ label: 'Copy image address', click: () => clipboard.writeText(p.srcURL) });
    sep();
  }
  if (p.isEditable) {
    m.push({ role: 'undo', enabled: p.editFlags.canUndo }, { role: 'redo', enabled: p.editFlags.canRedo }, { type: 'separator' });
    m.push({ role: 'cut', enabled: p.editFlags.canCut }, { role: 'copy', enabled: p.editFlags.canCopy },
      { role: 'paste', enabled: p.editFlags.canPaste }, { role: 'pasteAndMatchStyle', label: 'Paste as plain text', enabled: p.editFlags.canPaste },
      { role: 'selectAll' });
    sep();
  } else if (p.selectionText && p.selectionText.trim()) {
    const sel = p.selectionText.trim();
    m.push({ role: 'copy' });
    const short = sel.length > 28 ? sel.slice(0, 28) + '…' : sel;
    m.push({ label: `Search ${SEARCH_ENGINES[settings.searchEngine].name} for “${short}”`, click: () => createTab(searchUrl(sel), { openerId: tab.id }) });
    sep();
  }
  if (!p.linkURL && !p.isEditable && !p.selectionText && p.mediaType === 'none') {
    m.push({ label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() });
    m.push({ label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() });
    m.push({ label: 'Reload', click: () => wc.reload() });
    sep();
    m.push({ label: 'Print…', click: () => wc.print() });
    m.push({ label: 'Find on page', click: openFind });
    sep();
  }
  if (extensions) {
    const extItems = extensions.getContextMenuItems(wc, p);
    if (extItems.length) { sep(); m.push(...extItems); sep(); }
  }
  m.push({ label: 'Inspect', click: () => wc.inspectElement(p.x, p.y) });
  popupMenu(m);
}

function tabContextMenu(id) {
  const tab = tabs.find(t => t.id === id); if (!tab) return;
  const wc = tab.view ? tab.view.webContents : null;
  popupMenu([
    { label: 'Reload', enabled: !!wc, click: () => wc && wc.reload() },
    { label: 'Duplicate', click: () => createTab(tab.url, { openerId: tab.id }) },
    { label: tab.pinned ? 'Unpin tab' : 'Pin tab', click: () => togglePin(id) },
    { label: tab.muted ? 'Unmute tab' : 'Mute tab', enabled: !!wc, click: () => toggleMute(id) },
    { label: `Volume (${Math.round(tab.volume * 100)}%)`, enabled: !!wc, submenu: [300, 200, 150, 100, 75, 50, 25, 10].map(p => ({
      label: p + '%', type: 'radio', checked: Math.round(tab.volume * 100) === p, click: () => setTabVolume(id, p / 100),
    })) },
    { label: 'Copy link', click: () => clipboard.writeText(tab.url) },
    splitOf(id) ? { label: 'Close split view', click: () => unsplit(id) }
      : { label: 'Open in split view with current tab', enabled: id !== activeId, click: () => splitWith(id) },
    { type: 'separator' },
    tabs.length > 1 ? { label: 'Move to new window', click: () => tabToNewWindow(tab) }
      : { label: 'Open in new window', enabled: !isInternal(tab.url), click: () => newWindow([tab.url]) },
    ...(windows.length > 1 ? [{ label: 'Move to window', submenu: windows.filter(c => c !== cur).map((c, n) => {
      const t = c.tabs.find(x => x.id === c.activeId) || c.tabs[0];
      return { label: `${(t && (t.title || hostOf(t.url))) || 'Window'} (${c.tabs.length} tab${c.tabs.length === 1 ? '' : 's'})`.slice(0, 60), click: () => moveTabToWindow(tab, c) };
    }) }] : []),
    { type: 'separator' },
    { label: 'Close tab', click: () => closeTab(id) },
    { label: 'Close other tabs', click: () => tabs.filter(t => t.id !== id && !t.pinned).forEach(t => closeTab(t.id)) },
    { label: 'Close tabs below', click: () => { const i = tabs.indexOf(tab); tabs.slice(i + 1).filter(t => !t.pinned).forEach(t => closeTab(t.id)); } },
  ]);
}

// ---------------------------------------------------------------------------
// Per-tab volume (Chromium has no per-tab volume API, so we scale audio inside
// the page: see audio-hook.js). 0 = silent, 1 = normal, up to 3 = 300% boost.
// ---------------------------------------------------------------------------

function applyVolume(tab) {
  if (!tab.view) return;
  const wc = tab.view.webContents;
  if (wc.isDestroyed()) return;
  const code = `${AUDIO_HOOK};window.__driftAudio.set(${tab.volume});`;
  let frames = [];
  try { frames = wc.mainFrame.framesInSubtree; } catch {}
  for (const f of frames) {
    try { if (!f.isDestroyed()) f.executeJavaScript(code).catch(() => {}); } catch {}
  }
}

function setTabVolume(id, v) {
  const tab = tabs.find(t => t.id === id); if (!tab) return;
  tab.volume = Math.round(Math.max(0, Math.min(3, Number(v) || 0)) * 100) / 100;
  tab.hadAudio = true;
  if (tab.muted && tab.volume > 0 && tab.view) { tab.muted = false; tab.view.webContents.setAudioMuted(false); }
  applyVolume(tab);
  push();
}

function toggleMute(id) {
  const tab = tabs.find(t => t.id === id); if (!tab || !tab.view) return;
  tab.muted = !tab.muted;
  tab.view.webContents.setAudioMuted(tab.muted);
  push();
}

// ---------------------------------------------------------------------------
// History & suggestions
// ---------------------------------------------------------------------------

function addHistory(url, title) {
  if (isInternal(url) || !/^https?:/.test(url)) return;
  const h = history.get(url) || { url, title: '', visits: 0, last: 0 };
  h.visits++; h.last = Date.now(); if (title) h.title = title;
  history.set(url, h); histVer++;
  saveHistory();
}

function frecency(h) {
  const ageDays = (Date.now() - h.last) / 864e5;
  return h.visits * (ageDays < 1 ? 100 : ageDays < 7 ? 70 : ageDays < 30 ? 50 : 30);
}

async function suggest(q) {
  q = (q || '').trim().toLowerCase();
  const out = [];
  if (!q) {
    return { items: [...history.values()].sort((a, b) => frecency(b) - frecency(a)).slice(0, 6)
      .map(h => ({ kind: 'history', url: h.url, title: h.title || hostOf(h.url) })) };
  }
  for (const t of allTabs()) {
    if (t.id !== activeId && ((t.title || '').toLowerCase().includes(q) || t.url.toLowerCase().includes(q)))
      out.push({ kind: 'tab', id: t.id, url: t.url, title: t.title || t.url, favicon: t.favicon });
  }
  if (bookmarks) {
    const seenB = new Set();
    for (const b of bookmarks.all()) {
      if (seenB.size >= 4) break;
      if ((b.title || '').toLowerCase().includes(q) || b.url.toLowerCase().includes(q)) { seenB.add(b.url); out.push({ kind: 'bookmark', url: b.url, title: b.title || hostOf(b.url) }); }
    }
  }
  const hits = [];
  for (const h of history.values()) {
    const u = h.url.toLowerCase(), ti = (h.title || '').toLowerCase();
    if (u.includes(q) || ti.includes(q)) {
      const bonus = hostOf(h.url).startsWith(q) ? 1000 : 0;
      hits.push([frecency(h) + bonus, h]);
    }
  }
  hits.sort((a, b) => b[0] - a[0]);
  for (const [, h] of hits.slice(0, 6)) if (!out.some(o => o.url === h.url)) out.push({ kind: 'history', url: h.url, title: h.title || hostOf(h.url) });
  let remote = [];
  if (settings.suggestions && q.length > 1) {
    try {
      const ctl = new AbortController(); setTimeout(() => ctl.abort(), 1200);
      const r = await net.fetch('https://duckduckgo.com/ac/?type=list&q=' + encodeURIComponent(q), { signal: ctl.signal });
      const j = await r.json();
      remote = (j[1] || []).filter(s => s.toLowerCase() !== q).slice(0, 4);
    } catch {}
  }
  return { items: out.slice(0, 10), searches: remote, inline: inlineCompletion(q) };
}

// Address-bar autocomplete: the most-visited site (or address) that starts with what's typed,
// e.g. "tw" -> "twitch.tv". Only whole hosts, or full addresses once a "/" is typed.
function inlineCompletion(q) {
  if (!q || /\s/.test(q) || /^[a-z]+:/.test(q)) return '';
  const bare = (u) => u.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
  const pathMode = q.includes('/');
  const scores = new Map();
  for (const h of history.values()) {
    if (!/^https?:/i.test(h.url)) continue;
    const cand = pathMode ? bare(h.url) : hostOf(h.url);
    if (!cand || !cand.toLowerCase().startsWith(q) || cand.length <= q.length) continue;
    scores.set(cand, (scores.get(cand) || 0) + frecency(h));
  }
  if (bookmarks) for (const b of bookmarks.all()) {
    if (!/^https?:/i.test(b.url || '')) continue;
    const cand = pathMode ? bare(b.url) : hostOf(b.url);
    if (cand && cand.toLowerCase().startsWith(q) && cand.length > q.length) scores.set(cand, (scores.get(cand) || 0) + 50);
  }
  let best = '', bestScore = -1;
  for (const [cand, sc] of scores) if (sc > bestScore || (sc === bestScore && cand.length < best.length)) { best = cand; bestScore = sc; }
  return best;
}

// Worked out again only after history or the hidden list changes (not on every new tab).
let histVer = 0, topCache = null;
function topSites() {
  const key = histVer + '|' + settings.hiddenSites.join() + '|' + Object.keys(faviconStore).length;
  if (topCache && topCache.key === key) return topCache.list;
  const m = new Map();
  for (const h of history.values()) {
    let u; try { u = new URL(h.url); } catch { continue; }
    const host = u.hostname.replace(/^www\./, ''); if (!host) continue;
    let e = m.get(host);
    if (!e) { e = { host, url: u.origin, title: '', score: 0 }; m.set(host, e); }
    e.score += frecency(h); if (!e.title && h.title) e.title = h.title;
  }
  const hidden = new Set(settings.hiddenSites);
  const list = [...m.values()].filter(e => !hidden.has(e.host)).sort((a, b) => b.score - a.score).slice(0, 8)
    .map(e => ({ ...e, icon: faviconStore[e.host] || faviconStore[e.host.replace(/^www\./, '')] || '' }));
  topCache = { key, list };
  return list;
}

// ---------------------------------------------------------------------------
// Shields (ad & tracker blocking via Ghostery's engine — same lists as uBlock)
// ---------------------------------------------------------------------------

function shieldsOnFor(url) {
  if (!settings.shields) return false;
  if (settings.shieldsEngine === 'ubo') return true;
  const h = hostOf(url);
  return !h || !settings.shieldsAllow.includes(h);
}

// Where the bundled uBlock Origin lives (outside the app archive so Chromium can load it).
function uboPath() {
  return app.isPackaged ? path.join(process.resourcesPath, 'extensions', 'ublock') : path.join(__dirname, '..', 'extensions', 'ublock');
}

// Chromium's User-Agent client hints, which Electron leaves off page loads, are added by a
// small helper (extensions/drift-hints/bg.js). It normally runs inside uBlock Origin's
// background page (scripts/sync-hints.js copies it there), so it costs no extra process; the
// standalone extension is loaded only when uBlock Origin is off. Either way it runs as an
// extension, alongside uBO's network filtering instead of replacing it.
function hintsPath() {
  return app.isPackaged ? path.join(process.resourcesPath, 'extensions', 'drift-hints') : path.join(__dirname, '..', 'extensions', 'drift-hints');
}
let hintsId = null;
async function loadHintsExt() {
  if (hintsId) return;
  try { const ext = await extApi().loadExtension(hintsPath(), { allowFileAccess: false }); hintsId = ext.id; await bgReady(ext.id); }
  catch (e) { console.error('[hints] could not load:', e.message); }
}
function unloadHintsExt() {
  if (!hintsId) return;
  try { extApi().removeExtension(hintsId); } catch {}
  hintsId = null;
}
// Resolves once an extension's background page has loaded (or after `ms`).
async function bgReady(id, ms = 1500) {
  const prefix = `chrome-extension://${id}/`;
  for (let t = 0; t < ms; t += 25) {
    const bg = webContents.getAllWebContents().find(w => w.getType() === 'backgroundPage' && w.getURL().startsWith(prefix));
    if (bg && !bg.isLoading()) return;
    await new Promise(r => setTimeout(r, 25));
  }
}

// Report the claimed Chrome version through Chromium's own user-agent override (the one
// DevTools device emulation uses), so navigator.userAgent, navigator.userAgentData and the
// request headers all agree natively, without patching anything in the page.
let startupGate = Promise.resolve();   // first page loads wait for this (see app startup)
let uaMeta = null;       // override for normal sites (null when the engine is reported as-is)
let hintSets = null;     // header values for the built-in blocker path: { low, high, realLow, realHigh }
function applyIdentity(wc) {
  if (!uaMeta || !wc || wc.isDestroyed() || wc.__driftSignin) return;
  const type = wc.getType();
  if (type !== 'window' && type !== 'browserView' && type !== 'webview') return;
  const dbg = wc.debugger;
  try { if (!dbg.isAttached()) dbg.attach('1.3'); } catch { return; }
  if (!wc.__driftIdentity) {
    wc.__driftIdentity = true;
    // DevTools or a crash can drop the session; put it back.
    dbg.on('detach', () => { wc.__driftIdentity = false; if (!wc.__driftSignin) setTimeout(() => applyIdentity(wc), 500); });
  }
  dbg.sendCommand('Emulation.setUserAgentOverride', { userAgent: chromeUA(), userAgentMetadata: uaMeta }).catch(() => {});
}
// Reads the engine's real platform details once, from Drift's own UI page.
// Any window's sidebar UI (for small jobs like reading the engine's details or drawing an icon).
function anyUi() { saveCtx(); const c = (cur && cur.ui && !cur.ui.webContents.isDestroyed()) ? cur : windows.find(w => w.ui && !w.ui.webContents.isDestroyed()); return c ? c.ui : null; }
async function initIdentity() {
  const ui = anyUi(); if (!ui) return;
  const real = await ui.webContents.executeJavaScript(`(async () => {
    const d = navigator.userAgentData;
    const h = await d.getHighEntropyValues(['architecture','bitness','fullVersionList','model','platformVersion','wow64']);
    return { ...h, brands: d.brands, platform: d.platform, mobile: d.mobile };
  })()`).catch(() => null);
  if (!real) return;
  const fmt = (l) => l.map(b => `"${b.brand}";v="${b.version}"`).join(', ');
  const q = (v) => `"${v || ''}"`;
  const sets = (brands, full) => [
    { 'sec-ch-ua': fmt(brands), 'sec-ch-ua-mobile': real.mobile ? '?1' : '?0', 'sec-ch-ua-platform': q(real.platform) },
    { 'sec-ch-ua-arch': q(real.architecture), 'sec-ch-ua-bitness': q(real.bitness), 'sec-ch-ua-full-version-list': fmt(full),
      'sec-ch-ua-model': q(real.model), 'sec-ch-ua-platform-version': q(real.platformVersion), 'sec-ch-ua-wow64': real.wow64 ? '?1' : '?0' },
  ];
  let brands = real.brands, full = real.fullVersionList || [];
  if (CLAIM) {
    brands = [{ brand: CLAIM.greaseBrand, version: CLAIM.greaseVersion }, { brand: 'Chromium', version: String(CLAIM.chromeMajor) }];
    full = [{ brand: CLAIM.greaseBrand, version: CLAIM.greaseVersion + '.0.0.0' }, { brand: 'Chromium', version: CLAIM.chromeFull }];
    uaMeta = { brands, fullVersionList: full, fullVersion: CLAIM.chromeFull, platform: real.platform, platformVersion: real.platformVersion || '',
      architecture: real.architecture || '', model: real.model || '', mobile: false, bitness: real.bitness || '', wow64: !!real.wow64 };
    for (const w of webContents.getAllWebContents()) if (/^https?:/.test(w.getURL()) && !isSignin(w.getURL())) applyIdentity(w);
  }
  const [low, high] = sets(brands, full), [realLow, realHigh] = sets(real.brands, real.fullVersionList || []);
  hintSets = { low, high, realLow, realHigh };
}

// With the built-in blocker, Electron's own request hooks are in use and extensions can't
// see requests, so the same hints are added here instead.
const HINTS_HIGH = /(^|\.)(google\.[a-z.]+|youtube\.com|gstatic\.com|googleapis\.com|googleusercontent\.com|withgoogle\.com|blogger\.com|gmail\.com)$/i;
function addHintHeaders(details, cb) {
  const sets = hintSets;
  if (!sets || !/^https:/.test(details.url)) return cb({});
  const frame = details.resourceType === 'mainFrame' || details.resourceType === 'subFrame';
  let google = false; try { google = HINTS_HIGH.test(new URL(details.url).hostname); } catch {}
  if (!frame && !google) return cb({});
  let signin = false;
  try { const wc = details.webContentsId && webContents.fromId(details.webContentsId); signin = !!(wc && wc.__driftSignin); } catch {}
  const h = details.requestHeaders, have = new Set(Object.keys(h).map(k => k.toLowerCase()));
  const add = (o) => { for (const [k, v] of Object.entries(o)) if (!have.has(k)) h[k] = v; };
  add(signin ? sets.realLow : sets.low);
  if (google) add(signin ? sets.realHigh : sets.high);
  cb({ requestHeaders: h });
}

async function loadUbo() {
  if (uboId) return;
  try {
    const ext = await extApi().loadExtension(uboPath(), { allowFileAccess: true });
    uboId = ext.id;
    unloadHintsExt();   // uBO's background page carries the hints helper
    await bgReady(ext.id);
    console.log('[shields] uBlock Origin', ext.version, 'loaded');
  } catch (e) { console.error('[shields] could not load uBlock Origin:', e.message); }
  sendExtensions(); push();
}
function unloadUbo(keepHints = true) {
  if (!uboId) return;
  try { extApi().removeExtension(uboId); } catch {}
  uboId = null;
  if (keepHints) loadHintsExt();
  sendExtensions(); push();
}

// Chromium lets either the app or extensions see network requests, not both, so only one
// blocking engine runs at a time. uBlock Origin is the default; the built-in one is lighter.
async function initShields() {
  if (settings.shieldsEngine === 'ubo') {
    if (settings.shields) await loadUbo(); else await loadHintsExt();
    return;
  }
  try {
    const { ElectronBlocker } = require('@ghostery/adblocker-electron');
    const cache = file('adblock-engine.bin');
    blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(net.fetch.bind(net), {
      path: cache,
      read: (p) => fs.promises.readFile(p),
      write: (p, buf) => fs.promises.writeFile(p, buf),
    });
    // Per-site allowlist: skip blocking when the tab's site has shields down.
    const tabUrlFor = (wcId) => { const t = wcToTab.get(wcId); return t ? t.url : ''; };
    const origReq = blocker.onBeforeRequest;
    blocker.onBeforeRequest = (details, cb) => {
      if (details.webContentsId && !shieldsOnFor(tabUrlFor(details.webContentsId))) return cb({});
      if (details.resourceType === 'mainFrame') return cb({});
      return origReq(details, cb);
    };
    const origHdr = blocker.onHeadersReceived;
    blocker.onHeadersReceived = (details, cb) => {
      if (details.webContentsId && !shieldsOnFor(tabUrlFor(details.webContentsId))) return cb({});
      return origHdr(details, cb);
    };
    const origCos = blocker.onInjectCosmeticFilters;
    blocker.onInjectCosmeticFilters = (event, url, msg) => {
      try { if (!shieldsOnFor(event.sender.getURL())) return undefined; } catch {}
      return origCos(event, url, msg);
    };
    blocker.on('request-blocked', (req) => {
      blockedTotal++;
      const t = wcToTab.get(req.tabId);
      if (t) { t.blocked++; if (t.id === activeId) push(); }
    });
    if (settings.shields) blocker.enableBlockingInSession(session.defaultSession);
    session.defaultSession.webRequest.onBeforeSendHeaders(addHintHeaders);
    console.log('[shields] ready');
  } catch (e) {
    console.error('[shields] could not load filter lists:', e.message);
  }
}

function setShieldsGlobal(on) {
  settings.shields = on; saveSettings();
  if (settings.shieldsEngine === 'ubo') { on ? loadUbo() : unloadUbo(); push(); return; }
  if (!blocker) { if (on) initShields(); return; }
  try {
    if (on) blocker.enableBlockingInSession(session.defaultSession);
    else blocker.disableBlockingInSession(session.defaultSession);
  } catch {}
  push();
}

async function setShieldsEngine(engine) {
  if (engine === settings.shieldsEngine) return;
  settings.shieldsEngine = engine; saveSettings();
  if (engine === 'ubo') {
    if (blocker) { try { blocker.disableBlockingInSession(session.defaultSession); } catch {} }
    session.defaultSession.webRequest.onBeforeSendHeaders(null);
    if (settings.shields) await loadUbo(); else await loadHintsExt();
  } else {
    unloadUbo(false);
    unloadHintsExt();   // extensions can't see requests with the built-in blocker; it adds the hints itself
    if (blocker) { if (settings.shields) blocker.enableBlockingInSession(session.defaultSession); session.defaultSession.webRequest.onBeforeSendHeaders(addHintHeaders); }
    else await initShields();
  }
  for (const t of allTabs()) if (t.view && !isInternal(t.url)) t.view.webContents.reload();
  push();
}

function toggleSiteShields() {
  const t = activeTab(); if (!t) return;
  const h = hostOf(t.url); if (!h) return;
  if (!settings.shields) { setShieldsGlobal(true); settings.shieldsAllow = settings.shieldsAllow.filter(x => x !== h); }
  else if (settings.shieldsAllow.includes(h)) settings.shieldsAllow = settings.shieldsAllow.filter(x => x !== h);
  else settings.shieldsAllow.push(h);
  saveSettings();
  if (t.view) t.view.webContents.reload();
  push();
}

// ---------------------------------------------------------------------------
// Chrome extensions
// ---------------------------------------------------------------------------

const extApi = () => session.defaultSession.extensions || session.defaultSession;

// Resolve "__MSG_name__" strings from an extension's _locales folder.
function localize(str, ext) {
  const m = /^__MSG_(.+)__$/.exec(str || '');
  if (!m) return str || '';
  const key = m[1].toLowerCase();
  const locales = [app.getLocale().replace('-', '_'), app.getLocale().split('-')[0], ext.manifest.default_locale, 'en'];
  for (const loc of locales) {
    if (!loc) continue;
    try {
      const msgs = JSON.parse(fs.readFileSync(path.join(ext.path, '_locales', loc, 'messages.json'), 'utf8'));
      const hit = Object.entries(msgs).find(([k]) => k.toLowerCase() === key);
      if (hit) return hit[1].message;
    } catch {}
  }
  return str;
}

function describePermissions(manifest) {
  const perms = new Set(manifest.permissions || []);
  const hosts = [...(manifest.host_permissions || []), ...((manifest.content_scripts || []).flatMap(c => c.matches || []))];
  const lines = [];
  if (hosts.some(h => h === '<all_urls>' || /^\*:\/\/\*\//.test(h) || /^https?:\/\/\*\//.test(h))) lines.push('Read and change all your data on all websites');
  else if (hosts.length) {
    const sites = [...new Set(hosts.map(h => h.replace(/^\*?:?\/\/|^https?:\/\//, '').replace(/\/.*$/, '').replace(/^\*\./, '')))].slice(0, 5);
    lines.push('Read and change your data on ' + sites.join(', '));
  }
  if (perms.has('tabs') || perms.has('history')) lines.push('Read your browsing history');
  if (perms.has('downloads')) lines.push('Manage your downloads');
  if (perms.has('cookies')) lines.push('Read and change cookies');
  if (perms.has('clipboardRead')) lines.push('Read data you copy and paste');
  if (perms.has('notifications')) lines.push('Show notifications');
  if (perms.has('declarativeNetRequest') || perms.has('webRequest')) lines.push('Block content on any page');
  return lines.length ? 'It can:\n• ' + lines.join('\n• ') : 'It needs no special permissions.';
}

function listExtensions() {
  let all = [];
  try { all = extApi().getAllExtensions(); } catch {}
  const hp = hintsPath();
  return all.filter(e => path.resolve(e.path || '') !== path.resolve(hp)).map(e => {
    const m = e.manifest || {};
    const opt = (m.options_ui && m.options_ui.page) || m.options_page || '';
    return {
      id: e.id, name: localize(m.name || e.name, e), version: e.version,
      description: localize(m.description, e),
      options: opt ? `chrome-extension://${e.id}/${opt.replace(/^\//, '')}` : '',
      unpacked: settings.unpacked.includes(e.path),
      builtin: e.id === uboId,
      hasAction: !!(m.action || m.browser_action),
      hidden: !settings.pinnedActions.includes(e.id),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
const sendExtensions = debounce(() => sendAll('extensions', listExtensions()), 100);
function sendExtensionsTo(c) { if (c.ui && !c.ui.webContents.isDestroyed()) c.ui.webContents.send('extensions', listExtensions()); }

async function startWorker(ext) {
  if (ext && ext.manifest.manifest_version === 3 && ext.manifest.background && ext.manifest.background.service_worker) {
    await session.defaultSession.serviceWorkers.startWorkerForScope(`chrome-extension://${ext.id}`).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Extension data housekeeping (runs before any extension loads)
// ---------------------------------------------------------------------------

const UBO_ID = 'kfjbnefaejpefdfmciibdijcalgdfaec';   // fixed by the "key" in extensions/ublock/manifest.json

// The ID Chromium gives an unpacked extension: a hash of its folder path.
function unpackedExtensionId(dir) {
  const h = require('crypto').createHash('sha256').update(Buffer.from(path.resolve(dir), process.platform === 'win32' ? 'utf16le' : 'utf8')).digest('hex').slice(0, 32);
  return [...h].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
}
function extDataDirs(id) {
  return [path.join(userData(), 'Local Extension Settings', id),
    path.join(userData(), 'IndexedDB', `chrome-extension_${id}_0.indexeddb.leveldb`),
    path.join(userData(), 'IndexedDB', `chrome-extension_${id}_0.indexeddb.blob`)];
}
function dirSize(d) { let n = 0; try { for (const f of fs.readdirSync(d, { withFileTypes: true })) n += f.isFile() ? fs.statSync(path.join(d, f.name)).size : dirSize(path.join(d, f.name)); } catch {} return n; }
function rmData(id) { for (const d of extDataDirs(id)) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { console.error('[ext] cleanup', e.message); } } }

function tidyExtensionData() {
  const les = path.join(userData(), 'Local Extension Settings');
  // 1. A separately loaded copy of uBlock Origin duplicates the built-in one (and older
  //    copies grow without bound): stop loading it and delete its data.
  const keep = [];
  for (const dir of settings.unpacked) {
    let name = '';
    try { name = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).name || ''; } catch {}
    if (/^uBlock Origin/i.test(name)) { rmData(unpackedExtensionId(dir)); console.log('[ext] removed duplicate uBlock Origin', dir); }
    else keep.push(dir);
  }
  if (keep.length !== settings.unpacked.length) { settings.unpacked = keep; writeJSON('settings.json', settings); }

  // 2. Before uBO had a fixed ID, each install location got fresh uBO settings. Carry the most
  //    recent ones over once, then remove the orphaned copies.
  if (fs.existsSync(path.join(les, UBO_ID))) return;
  let installed = [];
  try { installed = fs.readdirSync(path.join(userData(), 'Extensions')); } catch {}
  const exclude = new Set([UBO_ID, ...installed, ...settings.unpacked.map(unpackedExtensionId)]);
  let orphans = [];
  try {
    orphans = fs.readdirSync(les).filter(id => /^[a-p]{32}$/.test(id) && !exclude.has(id))
      .map(id => ({ id, mtime: fs.statSync(path.join(les, id)).mtimeMs, size: dirSize(path.join(les, id)) }))
      .filter(o => o.size > 500000);            // uBO data is megabytes; tiny dirs are other extensions
  } catch {}
  if (!orphans.length) return;
  const src = orphans.sort((a, b) => b.mtime - a.mtime)[0];
  try {
    const [fromLes, fromIdb, fromBlob] = extDataDirs(src.id), [toLes, toIdb, toBlob] = extDataDirs(UBO_ID);
    fs.cpSync(fromLes, toLes, { recursive: true });
    if (fs.existsSync(fromIdb)) fs.cpSync(fromIdb, toIdb, { recursive: true });
    if (fs.existsSync(fromBlob)) fs.cpSync(fromBlob, toBlob, { recursive: true });
    for (const lock of ['LOCK']) { try { fs.rmSync(path.join(toLes, lock), { force: true }); } catch {} }
    console.log('[ext] carried uBlock Origin settings over from', src.id);
    for (const o of orphans) rmData(o.id);
  } catch (e) { console.error('[ext] uBO settings migration failed:', e.message); }
}

async function setupExtensions(ses) {
  try { tidyExtensionData(); } catch (e) { console.error('[ext] housekeeping', e.message); }
  extensions = new ElectronChromeExtensions({
    session: ses,
    // chrome.tabs.create → a Drift tab
    async createTab(details) {
      // In the window the extension asked for, else the one in use.
      const target = (details.windowId && windows.find(c => c.win && !c.win.isDestroyed() && c.win.id === details.windowId)) || lastFocused || windows[0];
      if (target) useWin(target);
      const tab = createTab(details.url || NEWTAB, { activate: details.active !== false });
      if (!tab.view) ensureView(tab);
      return [tab.view.webContents, win];
    },
    // (Drift's own activate() tells the library too, which calls back here; skip that echo.)
    selectTab(wc) { const t = wcToTab.get(wc.id); if (t) { useTab(t); if (t.id !== activeId) activate(t.id); } },
    // chrome.tabs.remove, and also called when a page closes itself (window.close()).
    removeTab(wc) {
      try {
        const t = wcToTab.get(wc.id);
        if (t) setImmediate(() => { if (useTab(t) && tabs.includes(t)) closeTab(t.id); });
      } catch (e) { console.error('[tabs] removeTab', e); }
    },
    // chrome.windows.create → a new Drift window
    async createWindow(details) {
      const ctx = createWindow({ urls: [].concat(details.url || []).filter(Boolean) });
      return ctx.win;
    },
    removeWindow(w) { const c = ctxOfWin(w); if (c && c.win && !c.win.isDestroyed()) c.win.close(); },
    async requestPermissions(ext, perms) {
      const r = await dialog.showMessageBox(win, {
        type: 'question', buttons: ['Allow', 'Deny'], defaultId: 0, cancelId: 1,
        message: `${localize(ext.name, ext)} wants additional access`,
        detail: [...(perms.permissions || []), ...(perms.origins || [])].join('\n'),
      });
      return r.response === 0;
    },
  });
  ElectronChromeExtensions.handleCRXProtocol(ses);
  extApi().on('extension-loaded', sendExtensions);
  extApi().on('extension-unloaded', sendExtensions);

  try {
    await installChromeWebStore({
      session: ses,
      // Ask before installing, like Chrome's "Add extension?" prompt.
      beforeInstall: async (d) => {
        const r = await dialog.showMessageBox(win, {
          type: 'question', buttons: ['Add extension', 'Cancel'], defaultId: 0, cancelId: 1,
          title: 'Add extension', message: `Add “${d.localizedName}” to Drift?`,
          detail: describePermissions(d.manifest), icon: d.icon && !d.icon.isEmpty() ? d.icon : undefined,
        });
        return { action: r.response === 0 ? 'allow' : 'deny' };
      },
    });
  } catch (e) { console.error('[extensions] web store setup failed:', e.message); }

  for (const dir of settings.unpacked) {
    try { await startWorker(await extApi().loadExtension(dir, { allowFileAccess: true })); }
    catch (e) { console.error('[extensions] could not load', dir, e.message); }
  }
}

async function removeExtension(id) {
  if (id === uboId) return;   // built in: turned off from Settings → Shields instead
  const ext = extApi().getExtension(id); if (!ext) return;
  const name = localize(ext.manifest.name || ext.name, ext);
  const r = await dialog.showMessageBox(win, { type: 'question', buttons: ['Remove', 'Cancel'], defaultId: 0, cancelId: 1, message: `Remove “${name}”?` });
  if (r.response !== 0) return;
  if (settings.unpacked.includes(ext.path)) {
    extApi().removeExtension(id);
    settings.unpacked = settings.unpacked.filter(p => p !== ext.path); saveSettings();
  } else {
    try { await uninstallExtension(id, { session: session.defaultSession }); }
    catch (e) { console.error('[extensions] uninstall failed', e.message); extApi().removeExtension(id); }
  }
  settings.hiddenActions = settings.hiddenActions.filter(x => x !== id);
  settings.pinnedActions = settings.pinnedActions.filter(x => x !== id); saveSettings();
  sendExtensions();
}

async function loadUnpacked() {
  const r = await dialog.showOpenDialog(win, { title: 'Choose an extension folder (with manifest.json)', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return;
  const dir = r.filePaths[0];
  try {
    const ext = await extApi().loadExtension(dir, { allowFileAccess: true });
    await startWorker(ext);
    if (!settings.unpacked.includes(dir)) { settings.unpacked.push(dir); saveSettings(); }
    sendExtensions();
  } catch (e) {
    dialog.showMessageBox(win, { type: 'error', message: "Couldn't load that extension", detail: e.message });
  }
}

// ---------------------------------------------------------------------------
// Permissions — ask the user instead of Electron's default "allow everything"
// ---------------------------------------------------------------------------

const AUTO_ALLOW = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock']);
const ASK = {
  media: 'use your camera or microphone', geolocation: 'know your location',
  notifications: 'show notifications', 'clipboard-read': 'read your clipboard',
  'display-capture': 'share your screen', midi: 'use MIDI devices', midiSysex: 'control MIDI devices',
  'idle-detection': 'know when you are idle', keyboardLock: 'capture your keyboard',
  'storage-access': 'use cookies across sites', 'top-level-storage-access': 'use cookies across sites',
};

function setupPermissions(ses) {
  ses.setPermissionRequestHandler(async (wc, perm, cb, details) => {
    if (ctxOfUi(wc)) return cb(false);
    const from = wcToTab.get(wc.id); if (from) useTab(from);
    if (AUTO_ALLOW.has(perm)) return cb(true);
    if (!ASK[perm]) return cb(false);
    let origin = '';
    try { origin = new URL(details.requestingUrl || wc.getURL()).origin; } catch {}
    const key = `${origin}|${perm}`;
    if (key in settings.permissions) return cb(settings.permissions[key]);
    const r = await dialog.showMessageBox(win, {
      type: 'question', buttons: ['Allow', 'Block'], defaultId: 1, cancelId: 1,
      title: 'Permission request', message: `${hostOf(origin) || 'This site'} wants to ${ASK[perm]}`,
      checkboxLabel: 'Remember my choice for this site', checkboxChecked: true,
    });
    const allow = r.response === 0;
    if (r.checkboxChecked) { settings.permissions[key] = allow; saveSettings(); }
    cb(allow);
  });
  ses.setPermissionCheckHandler((wc, perm, origin) => {
    if (AUTO_ALLOW.has(perm)) return true;
    return settings.permissions[`${origin}|${perm}`] === true;
  });
}

// Site info (the lock icon): remember each site's certificate as Chromium verifies it.
// -3 tells Chromium to keep its own verdict; this only records what it saw.
const certs = new Map();   // hostname -> certificate summary
function setupCertificates(ses) {
  ses.setCertificateVerifyProc((req, cb) => {
    try {
      const c = req.certificate;
      if (c) {
        certs.set(req.hostname, {
          subject: (c.subject && c.subject.commonName) || c.subjectName || '',
          issuer: (c.issuer && (c.issuer.organizations && c.issuer.organizations[0] || c.issuer.commonName)) || c.issuerName || '',
          issuerCN: (c.issuer && c.issuer.commonName) || '',
          validStart: c.validStart * 1000, validExpiry: c.validExpiry * 1000,
          fingerprint: c.fingerprint || '', ok: req.errorCode === 0, error: req.errorCode === 0 ? '' : req.verificationResult,
        });
        if (certs.size > 500) certs.delete(certs.keys().next().value);
      }
    } catch {}
    cb(-3);
  });
}
// Permission rows shown in site info: the common ones always, plus any others the site was asked about.
const SITE_PERMS = [['media', 'Camera & microphone'], ['geolocation', 'Location'], ['notifications', 'Notifications'], ['clipboard-read', 'Clipboard'], ['display-capture', 'Screen sharing']];
async function siteInfo() {
  const t = activeTab();
  if (!t || !t.view || !/^https?:/.test(t.url)) return null;
  const u = new URL(t.url), origin = u.origin;
  const perms = SITE_PERMS.map(([perm, label]) => ({ perm, label }));
  for (const key of Object.keys(settings.permissions)) {
    const [o, perm] = key.split('|');
    if (o === origin && !perms.some(p => p.perm === perm)) perms.push({ perm, label: ASK[perm] ? ASK[perm].replace(/^\w/, c => c.toUpperCase()) : perm });
  }
  for (const p of perms) { const v = settings.permissions[`${origin}|${p.perm}`]; p.value = v === true ? 'allow' : v === false ? 'block' : 'ask'; }
  let cookies = 0;
  try { const base = u.hostname.replace(/^www\./, ''); cookies = (await session.defaultSession.cookies.get({ domain: base })).length; } catch {}
  return {
    origin, host: u.hostname.replace(/^www\./, ''), secure: u.protocol === 'https:',
    cert: u.protocol === 'https:' ? certs.get(u.hostname) || null : null,
    perms, cookies, blocked: t.blocked || 0, shields: shieldsOnFor(t.url), ubo: settings.shieldsEngine === 'ubo' && !!uboId,
  };
}
async function clearSiteData(origin) {
  let u; try { u = new URL(origin); } catch { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  const ses = session.defaultSession, base = u.hostname.replace(/^www\./, '');
  try {
    for (const c of await ses.cookies.get({ domain: base })) {
      const url = `${c.secure ? 'https' : 'http'}://${c.domain.replace(/^\./, '')}${c.path}`;
      await ses.cookies.remove(url, c.name).catch(() => {});
    }
    for (const o of new Set([u.origin, `${u.protocol}//www.${base}`, `${u.protocol}//${base}`])) {
      await ses.clearStorageData({ origin: o, storages: ['localstorage', 'indexdb', 'cachestorage', 'serviceworkers', 'websql', 'filesystem', 'shadercache'] }).catch(() => {});
    }
    return true;
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

function setupDownloads(ses) {
  ses.on('will-download', (_e, item, fromWc) => {
    // Belongs to the window whose page started it.
    const from = fromWc && wcToTab.get(fromWc.id);
    if (!(from && useTab(from)) && lastFocused) useWin(lastFocused);
    const dctx = cur;
    const dir = app.getPath('downloads');
    const ext = path.extname(item.getFilename());
    const base = path.basename(item.getFilename(), ext);
    let target = path.join(dir, item.getFilename()); let n = 1;
    while (fs.existsSync(target)) target = path.join(dir, `${base} (${n++})${ext}`);
    item.setSavePath(target);
    const d = { id: Date.now() + Math.random(), name: path.basename(target), path: target,
      received: 0, total: item.getTotalBytes(), state: 'progressing', seen: false, wid: dctx ? dctx.id : 0, item };
    downloads.unshift(d);
    if (downloads.length > 30) downloads.pop();
    let lastPush = 0;
    item.on('updated', (_ev, state) => {
      d.received = item.getReceivedBytes(); d.total = item.getTotalBytes(); d.state = state === 'interrupted' ? 'interrupted' : 'progressing';
      const now = Date.now(); if (now - lastPush > 250) { lastPush = now; push(); }   // progress updates at most 4×/s
    });
    item.once('done', (_ev, state) => {
      d.state = state; d.received = item.getReceivedBytes(); delete d.item; push();
      const c = windows.includes(dctx) ? dctx : (lastFocused || windows[0]);
      if (c && c.ui && !c.ui.webContents.isDestroyed()) c.ui.webContents.send('download-done', { id: d.id, name: d.name, state });
    });
    push();
  });
}

// ---------------------------------------------------------------------------
// drift:// internal pages
// ---------------------------------------------------------------------------

function setupProtocol() {
  let newtabHtml = null;
  protocol.handle('drift', async (req) => {
    const u = new URL(req.url);
    // Remove a tile from the new tab page. Needs a custom header, so other sites can't send it
    // (cross-origin requests with custom headers need permission they don't get).
    if (u.hostname === 'newtab' && u.pathname === '/hide') {
      if (req.method !== 'POST' || req.headers.get('x-drift-newtab') !== '1') return new Response('', { status: 403 });
      const host = String(u.searchParams.get('host') || '').slice(0, 253);
      if (host && !settings.hiddenSites.includes(host)) { settings.hiddenSites.push(host); saveSettings(); }
      return new Response(JSON.stringify(topSites()), { headers: { 'content-type': 'application/json' } });
    }
    if (u.hostname === 'newtab') {
      let html = newtabHtml || (newtabHtml = fs.readFileSync(path.join(PAGES_DIR, 'newtab.html'), 'utf8'));
      const data = {
        sites: topSites(), accent: settings.accent, dark: isDark(),
        engine: SEARCH_ENGINES[settings.searchEngine].name,
        searchUrl: SEARCH_ENGINES[settings.searchEngine].url,
        blocked: blockedTotal,
        wallpaper: settings.wallpaperNewTab ? wallpaperCss() : '',
        wallpaperDim: settings.wallpaperDim, wallpaperBlur: settings.wallpaperBlur,
      };
      html = html.replace('/*__DATA__*/null', JSON.stringify(data).replace(/</g, '\\u003c'));
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    // The sidebar UI is served from drift://ui/ rather than file:// so that
    // extension content scripts (which can match file:// URLs) never run inside it.
    if (u.hostname === 'wallpaper') {
      const name = path.basename(decodeURIComponent(u.pathname));
      const fp = path.join(wallpaperDir(), name);
      let body; try { body = await fs.promises.readFile(fp); } catch { body = null; }
      if (!name || !body) return new Response('Not found', { status: 404 });
      const types = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.bmp': 'image/bmp' };
      return new Response(body, { headers: { 'content-type': types[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'cache-control': 'max-age=31536000' } });
    }
    if (u.hostname === 'ui') {
      const name = path.basename(decodeURIComponent(u.pathname)) || 'index.html';
      const fp = path.join(UI_DIR, name);
      const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
      const type = types[path.extname(fp)];
      if (!type || name === 'preload.js' || name === 'preload.src.js' || name === 'toast-preload.js' || !fs.existsSync(fp)) return new Response('Not found', { status: 404 });
      return new Response(fs.readFileSync(fp), { headers: { 'content-type': type + '; charset=utf-8' } });
    }
    return new Response('Not found', { status: 404 });
  });
}

// ---------------------------------------------------------------------------
// Settings helper (also used by shortcuts)
// ---------------------------------------------------------------------------

function setSetting(key, value) {
  settings[key] = value; saveSettings();
  if (['titleBar', 'bookmarksBar', 'sidebarRail'].includes(key)) forEachWin(() => layout());
  if (key === 'theme') nativeTheme.themeSource = value;
  if (['theme', 'accent', 'searchEngine', 'wallpaper', 'wallpaperDim', 'wallpaperBlur', 'wallpaperNewTab'].includes(key)) refreshNewTabs();
  if (key === 'forceDark') {
    for (const t of allTabs()) if (t.view && !isInternal(t.url) && wantsDark(t.url) !== !!t.dark) { useTab(t); rebuildView(t); }
  }
  push();
}

function toggleForceDarkSite() {
  const t = activeTab(); if (!t) return;
  const h = hostOf(t.url); if (!h) return;
  if (!settings.forceDark) { settings.forceDarkOff = settings.forceDarkOff.filter(x => x !== h); setSetting('forceDark', true); return; }
  if (settings.forceDarkOff.includes(h)) settings.forceDarkOff = settings.forceDarkOff.filter(x => x !== h);
  else settings.forceDarkOff.push(h);
  saveSettings();
  for (const x of allTabs()) if (x.view && hostOf(x.url) === h && wantsDark(x.url) !== !!x.dark) { useTab(x); rebuildView(x); }
  push();
}

// ---------------------------------------------------------------------------
// Wallpapers
// ---------------------------------------------------------------------------

const wallpaperDir = () => file('wallpapers');

function wallpaperCss() {
  const w = settings.wallpaper || '';
  if (w.startsWith('builtin:')) { const b = WALLPAPERS.find(x => x.id === w.slice(8)); return b ? b.css : ''; }
  if (w.startsWith('file:')) return `url("drift://wallpaper/${encodeURIComponent(w.slice(5))}") center / cover no-repeat, #111`;
  return '';
}

// Windows keeps a copy of the current desktop background here.
function desktopWallpaperPath() {
  if (process.platform !== 'win32') return '';
  // Checked at most every 30 s: the sidebar state is sent many times a second while pages load.
  if (desktopWpCache && Date.now() - desktopWpCache.at < 30000) return desktopWpCache.p;
  const p = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Themes', 'TranscodedWallpaper');
  let out = ''; try { out = fs.statSync(p).size > 0 ? p : ''; } catch {}
  desktopWpCache = { p: out, at: Date.now() };
  return out;
}
let desktopWpCache = null;

function useWallpaperFile(src, ext) {
  fs.mkdirSync(wallpaperDir(), { recursive: true });
  const name = `custom-${Date.now()}${ext}`;
  fs.copyFileSync(src, path.join(wallpaperDir(), name));
  // Remove previously chosen custom images.
  for (const f of fs.readdirSync(wallpaperDir())) if (f !== name) { try { fs.unlinkSync(path.join(wallpaperDir(), f)); } catch {} }
  setSetting('wallpaper', 'file:' + name);
}

async function chooseWallpaper() {
  const r = await dialog.showOpenDialog(win, { title: 'Choose a wallpaper', properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp'] }] });
  if (r.canceled || !r.filePaths[0]) return;
  try { useWallpaperFile(r.filePaths[0], path.extname(r.filePaths[0]).toLowerCase()); }
  catch (e) { dialog.showMessageBox(win, { type: 'error', message: "Couldn't use that image", detail: e.message }); }
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

const sendBookmarks = debounce(() => {
  const withIcons = (items) => items.map(it => it.type === 'folder' ? { ...it, children: withIcons(it.children) }
    : { ...it, icon: (it.icon && it.icon.startsWith('data:')) ? it.icon : (faviconStore[hostOf(it.url)] || '') });
  if (bookmarks) sendAll('bookmarks', withIcons(bookmarks.bar));
  push();
  setTimeout(() => prefetchBookmarkIcons().catch(() => {}), 1500);
  setTimeout(prepareBookmarkMenuIcons, 500);
}, 30);

// Bookmarks (imported ones especially) may point at sites never opened in Drift, so they
// have no cached icon. Fetch one in the background for each such host.
const bmIconTried = new Set();
let bmIconRunning = false;
// Hosts with no icon anywhere aren't asked again for a week (they used to be retried at every start).
let iconMisses = null;
const saveIconMisses = debounceSave(() => writeJSON('icon-misses.json', iconMisses), 3000);
async function prefetchBookmarkIcons() {
  if (bmIconRunning || !bookmarks) return;
  bmIconRunning = true;
  try {
    const hosts = [...new Set(bookmarks.all().map(b => b.url && /^https?:/.test(b.url) ? hostOf(b.url) : '').filter(Boolean))]
      .filter(h => !faviconStore[h] && !bmIconTried.has(h));
    if (!iconMisses) iconMisses = readJSON('icon-misses.json', {});
    const WEEK = 7 * 864e5;
    for (let i = hosts.length - 1; i >= 0; i--) if (Date.now() - (iconMisses[hosts[i]] || 0) < WEEK) hosts.splice(i, 1);
    let got = 0;
    const work = async (host) => {
      bmIconTried.add(host);
      const bare = host.replace(/^www\./, '');
      const cands = [
        `https://www.google.com/s2/favicons?domain=${encodeURIComponent(bare)}&sz=32`,
        `https://icons.duckduckgo.com/ip3/${bare}.ico`,
        `https://${host}/favicon.ico`,
      ];
      for (const c of cands) {
        const data = await fetchFavicon(c);
        if (data && data.length < 60000) { faviconStore[host] = data; got++; return; }
      }
      iconLog(`NO ICON for bookmark host ${host}`);
      iconMisses[host] = Date.now(); saveIconMisses();
    };
    for (let i = 0; i < hosts.length; i += 4) {
      await Promise.all(hosts.slice(i, i + 4).map(h => work(h).catch(() => {})));
      if (got) { saveFavicons(); sendBookmarks(); got = 0; }
    }
  } finally { bmIconRunning = false; }
}

function toggleBookmarkActive() {
  const t = activeTab(); if (!t || isInternal(t.url)) return;
  const existing = bookmarks.findByUrl(t.url);
  // Already bookmarked: open the edit dialog (it has Delete), like Chrome's star.
  if (existing) ui.webContents.send('bm-edit', { id: existing.id, type: 'link', title: existing.title, url: existing.url });
  else {
    const b = bookmarks.add({ title: t.title || hostOf(t.url), url: t.url, icon: t.favicon });
    ui.webContents.send('toast', { text: 'Added to bookmarks bar', icon: 'starfill', action: { label: 'Edit', bm: b.id } });
  }
  sendBookmarks();
}

function openBookmark(item, newTab, background) {
  if (!item) return;
  if (item.type === 'folder') { for (const c of item.children) if (c.type === 'link') createTab(c.url, { activate: false }); return; }
  if (newTab) createTab(item.url, { activate: !background });
  else navigate(item.url);
}

// Site icons for native menus (folder menus, overflow), from the saved favicons. Native menus
// only take PNG/JPEG, so other formats (SVG, ICO) are drawn to a PNG once by the UI page.
const menuIconCache = new Map();   // icon data URL -> 16px nativeImage (null while unusable)
function toPngInUi(dataUrl, size = 32) {
  const ui = anyUi();
  if (!ui) return Promise.resolve(null);
  return ui.webContents.executeJavaScript(`(async () => {
    const img = new Image(); img.src = ${JSON.stringify(dataUrl)}; await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = ${size};
    c.getContext('2d').drawImage(img, 0, 0, ${size}, ${size}); return c.toDataURL('image/png');
  })()`).catch(() => null);
}
async function prepareMenuIcon(data) {
  if (menuIconCache.has(data)) return;
  menuIconCache.set(data, null);
  let img = null;
  try { img = nativeImage.createFromDataURL(data); } catch {}
  if (!img || img.isEmpty()) { const png = await toPngInUi(data); if (png) img = nativeImage.createFromDataURL(png); }
  if (img && !img.isEmpty()) menuIconCache.set(data, img.resize({ width: 16, height: 16, quality: 'best' }));
  else menuIconCache.delete(data);   // try again next time
  if (menuIconCache.size > 600) menuIconCache.clear();
}
// Called when bookmarks change, so icons are ready before a folder menu opens.
function prepareBookmarkMenuIcons() {
  if (!bookmarks) return;
  for (const b of bookmarks.all()) { const d = faviconStore[hostOf(b.url)]; if (d && d.startsWith('data:image/')) prepareMenuIcon(d); }
  if (folderMenuIcon === null) {
    folderMenuIcon = undefined;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${isDark() ? '#c8c8d0' : '#55555f'}" stroke-width="1.8" stroke-linejoin="round"><path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>`;
    toPngInUi('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')).then(png => {
      folderMenuIcon = png ? nativeImage.createFromDataURL(png).resize({ width: 16, height: 16, quality: 'best' }) : null;
    });
  }
}
function menuIcon(url) {
  const data = faviconStore[hostOf(url)] || '';
  return (data && menuIconCache.get(data)) || undefined;
}
let folderMenuIcon = null;
function folderIcon() { return folderMenuIcon || undefined; }
function bookmarkMenuItems(items) {
  return items.map(it => it.type === 'folder'
    ? { label: it.title || 'Folder', icon: folderIcon(), submenu: it.children.length ? [
        ...bookmarkMenuItems(it.children), { type: 'separator' },
        { label: `Open all (${it.children.filter(c => c.type === 'link').length})`, click: () => openBookmark(it, true, true) }] : [{ label: '(empty)', enabled: false }] }
    : { label: (it.title || it.url).slice(0, 60), icon: menuIcon(it.url), click: (_m, _w, ev) => openBookmark(it, ev && (ev.ctrlKey || ev.metaKey), false) });
}

function bookmarkContextMenu(id) {
  const hit = bookmarks.find(id); if (!hit) return;
  const it = hit.item;
  const t = activeTab();
  popupMenu([
    ...(it.type === 'link' ? [
      { label: 'Open', click: () => openBookmark(it, false) },
      { label: 'Open in new tab', click: () => openBookmark(it, true, false) },
      { label: 'Open in new window', click: () => newWindow([it.url]) },
      { label: 'Copy link', click: () => clipboard.writeText(it.url) },
    ] : [
      { label: 'Open all in new tabs', click: () => openBookmark(it, true, true) },
      { label: 'Open all in new window', enabled: it.children.some(c => c.type === 'link'), click: () => newWindow(it.children.filter(c => c.type === 'link').map(c => c.url)) },
    ]),
    { type: 'separator' },
    { label: 'Edit…', click: () => ui.webContents.send('bm-edit', { id: it.id, type: it.type, title: it.title, url: it.url || '' }) },
    { label: 'Delete', click: () => { bookmarks.remove(it.id); sendBookmarks(); } },
    { type: 'separator' },
    { label: 'Add current page', enabled: !!t && !isInternal(t.url), click: () => toggleBookmarkActive() },
    { label: 'Add folder…', click: () => ui.webContents.send('bm-edit', { id: null, type: 'folder', title: '', url: '' }) },
    { label: 'Hide bookmarks bar', click: () => setSetting('bookmarksBar', false) },
  ]);
}

async function importBookmarksFrom(source) {
  try {
    let items, name;
    if (source === 'file') {
      const r = await dialog.showOpenDialog(win, { title: 'Import bookmarks', properties: ['openFile'],
        filters: [{ name: 'Bookmarks file', extensions: ['html', 'htm', 'json'] }] });
      if (r.canceled || !r.filePaths[0]) return;
      const text = fs.readFileSync(r.filePaths[0], 'utf8');
      items = /^\s*\{/.test(text) ? fromChromiumJSON(r.filePaths[0]) : fromNetscapeHTML(text);
      name = path.basename(r.filePaths[0]);
    } else {
      const prof = chromiumProfiles().find(p => p.name === source);
      if (!prof) throw new Error(`Couldn't find ${source}'s bookmarks on this PC.`);
      items = fromChromiumJSON(prof.file); name = source;
    }
    const n = bookmarks.merge(items, name);
    sendBookmarks();
    ui.webContents.send('toast', { text: `Imported ${n} bookmark${n === 1 ? '' : 's'} from ${name}`, icon: 'starfill' });
  } catch (e) {
    dialog.showMessageBox(win, { type: 'error', message: "Couldn't import bookmarks", detail: e.message });
  }
}

async function exportBookmarks() {
  const r = await dialog.showSaveDialog(win, { title: 'Export bookmarks', defaultPath: path.join(app.getPath('documents'), 'drift-bookmarks.html'),
    filters: [{ name: 'Bookmarks file', extensions: ['html'] }] });
  if (r.canceled || !r.filePath) return;
  fs.writeFileSync(r.filePath, toNetscapeHTML(bookmarks.bar));
  ui.webContents.send('toast', { text: 'Bookmarks exported', icon: 'starfill' });
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

let pendingLogin = null;     // { wcId, url, username, password, timer }

function listPasswords() {
  return passwords.entries.map(e => ({ id: e.id, url: e.url, host: hostOf(e.url), username: e.username, updated: e.updated }))
    .sort((a, b) => a.host.localeCompare(b.host) || a.username.localeCompare(b.username));
}
const sendPasswords = () => { sendAll('passwords', listPasswords()); push(); };

async function offerSavePassword() {
  const p = pendingLogin; pendingLogin = null;
  if (!p) return;
  clearTimeout(p.timer);
  if (!settings.offerPasswords || passwords.isNever(p.url)) return;
  const same = passwords.forUrl(p.url).find(e => e.username === p.username);
  if (same && same.password === p.password) return;
  const host = hostOf(p.url);
  const from = wcToTab.get(p.wcId); if (from) useTab(from);
  const r = await dialog.showMessageBox(win, {
    type: 'question', title: 'Save password',
    message: same ? `Update your saved password for ${host}?` : `Save password for ${host}?`,
    detail: p.username ? `Username: ${p.username}` : 'No username was detected.',
    buttons: [same ? 'Update' : 'Save', 'Not now', 'Never for this site'], defaultId: 0, cancelId: 1,
  });
  if (r.response === 0) { passwords.upsert({ url: p.url, username: p.username, password: p.password }); sendPasswords(); }
  if (r.response === 2) passwords.addNever(p.url);
}

async function importPasswords() {
  const r = await dialog.showOpenDialog(win, { title: 'Import passwords (CSV)', properties: ['openFile'],
    filters: [{ name: 'Password export (CSV)', extensions: ['csv'] }] });
  if (r.canceled || !r.filePaths[0]) return;
  try {
    const res = passwords.importCSV(fs.readFileSync(r.filePaths[0], 'utf8'));
    sendPasswords();
    dialog.showMessageBox(win, { type: 'info', message: 'Passwords imported',
      detail: `${res.added} added, ${res.updated} updated${res.skipped ? `, ${res.skipped} skipped (duplicates or not a website login)` : ''}.\n\nThe CSV file still contains your passwords in plain text. Delete it once you've checked everything imported.` });
  } catch (e) {
    dialog.showMessageBox(win, { type: 'error', message: "Couldn't import passwords", detail: e.message });
  }
}

async function exportPasswords() {
  const ok = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Export', 'Cancel'], defaultId: 1, cancelId: 1,
    message: 'Export passwords?', detail: 'The exported file is NOT encrypted. Anyone who can open it can read all your passwords.' });
  if (ok.response !== 0) return;
  const r = await dialog.showSaveDialog(win, { title: 'Export passwords', defaultPath: path.join(app.getPath('documents'), 'drift-passwords.csv'),
    filters: [{ name: 'CSV', extensions: ['csv'] }] });
  if (r.canceled || !r.filePath) return;
  fs.writeFileSync(r.filePath, passwords.exportCSV(), { mode: 0o600 });
}

// Messages from web pages (page-preload.js). Only real tabs may ask, and the site
// is taken from the requesting frame itself, never from what the page says.
// ---------------------------------------------------------------------------
// Performance log, for tracking down lag on a user's machine. Off unless a file named
// "perf-log" exists in Drift's data folder; then every 2 s it writes which processes are
// using CPU (each tab by site, extensions, graphics, Drift itself) to logs\perf.log, plus any
// moment Drift's main thread was frozen.
// ---------------------------------------------------------------------------
function startPerfLog() {
  if (!fs.existsSync(file('perf-log'))) return;
  const out = path.join(file('logs'), 'perf.log');
  let buf = '';
  const log = (line) => { buf += `${new Date().toISOString().slice(11, 23)} ${line}\n`; };
  const flush = async () => {
    if (!buf) return; const text = buf; buf = '';
    try {
      await fs.promises.mkdir(file('logs'), { recursive: true });
      try { if ((await fs.promises.stat(out)).size > 3e6) await fs.promises.rename(out, out + '.old'); } catch {}
      await fs.promises.appendFile(out, text);
    } catch {}
  };
  log(`--- start Drift ${app.getVersion()} (Chromium ${process.versions.chrome}) ${process.platform} ${require('os').cpus().length} cores`);
  // Main-thread freezes: a 50 ms timer that fires late means the browser couldn't respond.
  let last = Date.now();
  setInterval(() => { const now = Date.now(), late = now - last - 50; last = now; if (late > 150) log(`FREEZE main thread blocked ${late} ms`); }, 50).unref();
  const extName = (id) => { try { const e = extApi().getExtension(id); return e ? localize(e.manifest.name || e.name, e) : id; } catch { return id; } };
  setInterval(() => {
    const labels = new Map();
    for (const wc of webContents.getAllWebContents()) {
      try {
        const pid = wc.getOSProcessId(), url = wc.getURL(), type = wc.getType();
        let label;
        if (ui && wc === ui.webContents) label = 'Drift sidebar';
        else if (/^chrome-extension:/.test(url)) label = `ext:${extName(new URL(url).hostname)}${type === 'backgroundPage' ? ' (background)' : ''}`;
        else label = `tab:${hostOf(url) || url.slice(0, 40)}${wcToTab.get(wc.id) && wcToTab.get(wc.id).id === activeId ? '*' : ''}`;
        labels.set(pid, labels.has(pid) ? labels.get(pid) + ' + ' + label : label);
      } catch {}
    }
    const rows = app.getAppMetrics().map(m => ({ label: labels.get(m.pid) || (m.type === 'Tab' ? 'worker/extension' : m.type) + (m.serviceName ? ':' + m.serviceName.replace(/^.*\./, '') : ''),
      cpu: m.cpu.percentCPUUsage, mb: Math.round(m.memory.workingSetSize / 1024), pid: m.pid }));
    const total = rows.reduce((a, r) => a + r.cpu, 0);
    rows.sort((a, b) => b.cpu - a.cpu);
    log(`cpu ${total.toFixed(0)}% | ` + rows.filter(r => r.cpu >= 1 || /\*/.test(r.label)).map(r => `${r.label} ${r.cpu.toFixed(0)}% ${r.mb}MB`).join(' | '));
    flush();
  }, 2000).unref();
  // Pages that freeze: Chromium's long-animation-frame timing names the scripts that ran (the
  // site's own, or an extension's) and how long style/layout and rendering took.
  const LOAF = `(() => {
    if (window.__driftLoaf) return 0;
    const a = window.__driftLoaf = [];
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.duration > 120) a.push({
        t: Math.round(e.startTime), d: Math.round(e.duration), block: Math.round(e.blockingDuration || 0),
        render: e.renderStart ? Math.round(e.startTime + e.duration - e.renderStart) : 0,
        style: e.styleAndLayoutStart ? Math.round(e.startTime + e.duration - e.styleAndLayoutStart) : 0,
        scripts: (e.scripts || []).filter(x => x.duration > 15).map(x => ({ src: (x.sourceURL || '').slice(0, 100), fn: (x.sourceFunctionName || '').slice(0, 40),
          inv: (x.invoker || '').slice(0, 60), d: Math.round(x.duration), layout: Math.round(x.forcedStyleAndLayoutDuration || 0) })),
      }); }).observe({ type: 'long-animation-frame', buffered: true });
    } catch (e) { a.push({ err: String(e) }); }
    return 0;
  })()`;
  const READ = `(() => { const a = window.__driftLoaf || []; const out = a.splice(0); return JSON.stringify(out); })()`;
  const instrument = (wc, label) => {
    const arm = () => { if (!wc.isDestroyed()) wc.executeJavaScriptInIsolatedWorld(1997, [{ code: LOAF }]).catch(() => {}); };
    const collect = () => {
      if (wc.isDestroyed()) return;
      wc.executeJavaScriptInIsolatedWorld(1997, [{ code: READ }]).then((j) => {
        let list = []; try { list = JSON.parse(j); } catch {}
        const where = label();
        for (const e of list) {
          if (e.err) { log(`${where} long-frame timing unavailable: ${e.err}`); continue; }
          log(`SLOW FRAME ${where} at +${e.t}ms: ${e.d}ms (blocking ${e.block}, style/layout ${e.style}, render ${e.render})` +
            e.scripts.map(x => `\n      script ${x.d}ms${x.layout ? ` (forced layout ${x.layout}ms)` : ''} ${x.src || '(inline)'} ${x.fn} [${x.inv}]`).join(''));
        }
        if (list.length) flush();
      }).catch(() => {});
    };
    wc.on('dom-ready', arm);
    wc.on('did-finish-load', () => { arm(); setTimeout(collect, 1500); setTimeout(collect, 8000); });
    const iv = setInterval(collect, 10000); iv.unref();
    wc.once('destroyed', () => clearInterval(iv));
  };
  const labelOf = (wc) => () => { try { if (ui && wc === ui.webContents) return 'Drift sidebar'; const t = wcToTab.get(wc.id); return `tab:${hostOf(wc.getURL()) || wc.getURL().slice(0, 40)}${t && t.dark ? ' (force dark)' : ''}`; } catch { return '?'; } };
  app.on('web-contents-created', (_e, wc) => { if (wc.getType() === 'window' || wc.getType() === 'browserView') instrument(wc, labelOf(wc)); });
  for (const wc of webContents.getAllWebContents()) if (wc.getType() === 'window' || wc.getType() === 'browserView') { instrument(wc, labelOf(wc)); try { wc.executeJavaScriptInIsolatedWorld(1997, [{ code: LOAF }]).catch(() => {}); } catch {} }
  // A one-off Chromium trace (graphics, video, page) when a chosen site starts loading: put the
  // site's name in a file named "perf-trace" next to "perf-log". Saved to logs\trace-*.json.
  let traceHost = '';
  try { traceHost = fs.readFileSync(file('perf-trace'), 'utf8').trim().toLowerCase(); } catch {}
  let tracing = false, traced = 0;
  if (traceHost) app.on('web-contents-created', (_e, wc) => {
    wc.on('did-start-navigation', async (d) => {
      if (tracing || traced >= 2 || !d.isMainFrame || d.isSameDocument || !hostOf(d.url).endsWith(traceHost)) return;
      tracing = true; traced++;
      const { contentTracing } = require('electron');
      try {
        await contentTracing.startRecording({ included_categories: ['toplevel', 'gpu', 'gpu.angle', 'gpu.service', 'gpu.capture', 'viz', 'cc', 'media', 'blink', 'v8', 'navigation', 'loading', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-gpu.service', 'disabled-by-default-gpu.decoder', 'disabled-by-default-viz.gpu_composite_time', 'skia', 'webgl'], excluded_categories: ['*'] });
        log(`TRACE started for ${hostOf(d.url)}`); flush();
        await new Promise(r => setTimeout(r, 9000));
        const outFile = path.join(file('logs'), `trace-${Date.now()}.json`);
        await contentTracing.stopRecording(outFile);
        log(`TRACE saved ${outFile}`); flush();
      } catch (e) { log('TRACE failed ' + e.message); }
      tracing = false;
    });
  });
  try { const g = app.getGPUFeatureStatus(); log('gpu features: ' + Object.entries(g).map(([k, v]) => k + '=' + v).join(' ')); } catch {}
  app.getGPUInfo('basic').then((g) => { try { log('gpu: ' + (g.gpuDevice || []).map(d => `${d.vendorId}:${d.deviceId}${d.active ? '(active)' : ''} ${d.driverVersion || ''}`).join(', ') + ' ' + JSON.stringify(g.auxAttributes ? { gl: g.auxAttributes.glRenderer, angle: g.auxAttributes.displayType } : {})); } catch {} }).catch(() => {});
  app.on('child-process-gone', (_e, d) => log(`PROCESS GONE ${d.type} ${d.reason} ${d.exitCode}`));
  // Chromium's own graphics report (chrome://gpu): why acceleration is on or off.
  setTimeout(async () => {
    const v = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true } });
    try {
      await v.webContents.loadURL('chrome://gpu');
      await new Promise(r => setTimeout(r, 4000));
      const text = await v.webContents.executeJavaScript(`(() => {
        const walk = (n) => { let t = ''; if (n.shadowRoot) t += walk(n.shadowRoot);
          for (const c of n.childNodes) t += c.nodeType === 3 ? (c.parentNode && c.parentNode.nodeName === 'STYLE' ? '' : c.textContent) : (c.nodeType === 1 || c.nodeType === 11 ? walk(c) : '');
          if (n.nodeType === 1 && /^(P|DIV|LI|TR|H\\d|TD|SPAN)$/.test(n.tagName)) t += n.tagName === 'TD' || n.tagName === 'SPAN' ? ' ' : '\\n';
          return t; };
        return walk(document.body).replace(/\\n\\s*\\n+/g, '\\n');
      })()`);
      await fs.promises.writeFile(path.join(file('logs'), 'gpu.txt'), text);
      log('gpu report saved to logs\\gpu.txt'); flush();
    } catch (e) { log('gpu report failed ' + e.message); }
    try { v.webContents.close(); } catch {}
  }, 6000);
  // Which extension service workers are running (they have no page of their own).
  setTimeout(() => { try { log('service workers: ' + Object.values(session.defaultSession.serviceWorkers.getAllRunning()).map(w => w.scope).join(', ')); } catch {} }, 8000);
}

function setupPageIPC() {
  ipcMain.on('drift-no-webgpu', (e) => { e.returnValue = !webgpuUsable(); });
  // Synchronous tab lookup for extension background pages only.
  ipcMain.on('drift-tab-for', (e, d) => {
    let out = -1;
    try { if (e.sender.getType() === 'backgroundPage' && d) out = tabIdForRequest(d); } catch {}
    e.returnValue = out;
  });
  const frameUrl = (e) => {
    if (!wcToTab.has(e.sender.id)) return '';
    try { return e.senderFrame ? e.senderFrame.url : ''; } catch { return ''; }
  };
  ipcMain.handle('pw-accounts', (e) => {
    const url = frameUrl(e); if (!/^https?:/.test(url)) return [];
    return passwords.forUrl(url).map(x => ({ id: x.id, username: x.username }));
  });
  ipcMain.handle('pw-fill', (e, id) => {
    const url = frameUrl(e); if (!/^https?:/.test(url)) return null;
    const entry = passwords.forUrl(url).find(x => x.id === id);
    if (!entry) return null;
    passwords.markUsed(entry.id);
    return { username: entry.username, password: entry.password };
  });
  ipcMain.on('pw-submitted', (e, data) => {
    const url = frameUrl(e); if (!/^https?:/.test(url) || !data || !data.password) return;
    if (pendingLogin) clearTimeout(pendingLogin.timer);
    pendingLogin = { wcId: e.sender.id, url, username: String(data.username || '').slice(0, 500), password: String(data.password).slice(0, 2000) };
    // Ask after the page moves on (successful login); single-page sites get a short grace period.
    pendingLogin.timer = setTimeout(offerSavePassword, 5000);
  });
}

// ---------------------------------------------------------------------------
// Auto-update from GitHub Releases (installed builds only)
// ---------------------------------------------------------------------------

let updateState = { status: 'idle', version: '' };   // idle | checking | downloading | ready | none | error
function setupUpdates() {
  if (!app.isPackaged) return;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) { console.error('[update]', e.message); return; }
  // The portable zip can't update itself; only the installed version does.
  if (process.platform === 'win32' && !fs.existsSync(path.join(path.dirname(process.execPath), 'Uninstall Drift.exe'))) {
    updateState = { status: 'portable', version: '' }; return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  const set = (status, version = updateState.version, extra = {}) => { updateState = { status, version, ...extra }; push(); };
  autoUpdater.on('checking-for-update', () => set('checking'));
  autoUpdater.on('update-available', (i) => set('downloading', i.version, { percent: 0 }));
  autoUpdater.on('download-progress', (p) => {
    const percent = Math.floor(p.percent || 0);
    if (updateState.status === 'downloading' && percent !== updateState.percent) set('downloading', updateState.version, { percent });
  });
  autoUpdater.on('update-not-available', () => set('none', '', { checkedAt: Date.now() }));
  autoUpdater.on('error', (e) => {
    const msg = String((e && e.message) || '');
    console.error('[update]', msg);
    // Short reason for Settings; the full message is in the console.
    const why = /ENOTFOUND|ECONNRESET|ETIMEDOUT|net::ERR/i.test(msg) ? 'no connection to GitHub' : /404|latest\.yml/i.test(msg) ? 'release not found' : /signature|sha512|checksum/i.test(msg) ? 'download was damaged' : 'unexpected error';
    set('error', updateState.version, { why });
  });
  autoUpdater.on('update-downloaded', (i) => {
    set('ready', i.version);
    sendAll('toast', { text: `Drift ${i.version} is ready — it installs when you restart`, icon: 'download', action: { label: 'Restart', update: true } });
  });
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 8000);
  setInterval(check, 4 * 3600 * 1000);
  ipcMain.on('update-check', (e) => {
    if (!ctxOfUi(e.sender) || ['checking', 'downloading', 'ready'].includes(updateState.status)) return;
    check();
  });
  // Restart to update: installs silently and reopens Drift with the same tabs.
  ipcMain.on('update-install', (e) => {
    if (!ctxOfUi(e.sender) || updateState.status !== 'ready') return;
    writeJSONSync('session.json', sessionSnapshot()); writeJSONSync('settings.json', settings);
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  });
}

// ---------------------------------------------------------------------------
// IPC from the sidebar UI
// ---------------------------------------------------------------------------

function setupIPC() {
  // Messages from a window's sidebar UI run as that window.
  const on = (ch, fn) => ipcMain.on(ch, (e, ...a) => { const c = ctxOfUi(e.sender); if (!c) return; useWin(c); fn(...a); });
  // Warm up a connection to a suggestion or bookmark under the pointer (once per site per 10s).
  const warmed = new Map();
  on('preconnect', (target) => {
    let origin; try { const u = new URL(toUrl(String(target || ''))); if (!/^https?:$/.test(u.protocol)) return; origin = u.origin; } catch { return; }
    const now = Date.now(); if (now - (warmed.get(origin) || 0) < 10000) return;
    warmed.set(origin, now); if (warmed.size > 200) warmed.clear();
    try { session.defaultSession.preconnect({ url: origin, numSockets: 1 }); } catch {}
  });
  const handle = (ch, fn) => ipcMain.handle(ch, (e, ...a) => { const c = ctxOfUi(e.sender); if (!c) return null; useWin(c); return fn(...a); });

  on('ready', () => { push(); layout(); sendBookmarks(); });
  on('activate', (id, noFocus) => activate(id, { noFocus: !!noFocus }));
  on('focus-page', () => { if (!overlay) focusPage(); });
  on('close-tab', (id) => closeTab(id));
  on('new-tab', () => { ui.webContents.send('palette', { newTab: true }); });
  on('tab-menu', (id) => tabContextMenu(id));
  on('move-tab', (id, idx, pinned) => moveTab(id, idx, pinned));
  on('tab-adopt', (id, idx) => { const t = findTab(Number(id)); if (t && ctxOfTab(t) !== cur) moveTabToWindow(t, cur, idx); });
  // A tab drag ended where nothing took it. Windows doesn't report where a drag that leaves
  // the page ended, so ask for the cursor position instead.
  on('tab-drop-out', (id, sidebarRect) => {
    const t = findTab(Number(id)); if (!t) return;
    const p = screen.getCursorScreenPoint();
    // Dropped back over this window's own sidebar (between tabs, say): nothing to do.
    if (sidebarRect && win && !win.isDestroyed()) {
      const cb = win.getContentBounds();
      const x = p.x - cb.x, y = p.y - cb.y;
      if (x >= sidebarRect.x && x < sidebarRect.x + sidebarRect.width && y >= sidebarRect.y && y < sidebarRect.y + sidebarRect.height) return;
    }
    tabDroppedOutside(t, p.x, p.y);
  });
  on('new-window', () => newWindow());
  on('toggle-pin', (id) => togglePin(id));
  on('toggle-mute', (id) => toggleMute(id));
  on('tab-volume', (id, v) => setTabVolume(id, v));
  on('navigate', (text, newTab) => { setOverlay(null); navigate(text, newTab); });
  on('switch-to', (id) => {
    setOverlay(null);
    const t = findTab(id); if (!t) return;
    useTab(t); activate(id);
    if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  on('back', () => { const t = activeTab(); t?.view?.webContents.navigationHistory.canGoBack() && t.view.webContents.navigationHistory.goBack(); });
  on('forward', () => { const t = activeTab(); t?.view?.webContents.navigationHistory.canGoForward() && t.view.webContents.navigationHistory.goForward(); });
  on('reload', () => { const t = activeTab(); if (t?.view) t.loading ? t.view.webContents.stop() : t.view.webContents.reload(); });
  on('home', () => navigate(NEWTAB));
  on('overlay', (mode, keepFocus) => setOverlay(mode, !!keepFocus));
  on('find', (text, forward, next) => {
    const t = activeTab(); if (!t?.view) return;
    if (!text) { t.view.webContents.stopFindInPage('clearSelection'); ui.webContents.send('find-result', { active: 0, matches: 0 }); return; }
    t.view.webContents.findInPage(text, { forward, findNext: !next });
  });
  on('find-close', () => closeFind());
  on('toggle-sidebar', () => toggleSidebar());
  on('sidebar-width', (w) => {
    // Dragging the edge in far enough collapses to the icon-only rail; dragging out expands again.
    if (w < 140) { if (!settings.sidebarRail) setSetting('sidebarRail', true); return; }
    settings.sidebarWidth = Math.round(Math.max(200, Math.min(420, w)));
    if (settings.sidebarRail) setSetting('sidebarRail', false); else { forEachWin(() => layout()); saveSettings(); push(); }
  });
  on('site-shields', () => toggleSiteShields());
  on('zoom', (d) => zoom(d));
  on('set', (key, value) => {
    if (!(key in DEFAULT_SETTINGS) || ['permissions', 'bounds', 'shieldsAllow', 'hiddenActions', 'pinnedActions', 'hiddenSites', 'unpacked', 'forceDarkOff'].includes(key)) return;
    if (key === 'shields') return setShieldsGlobal(!!value);
    if (key === 'shieldsEngine') return setShieldsEngine(value === 'builtin' ? 'builtin' : 'ubo');
    setSetting(key, value);
  });
  on('remove-allow', (host) => { settings.shieldsAllow = settings.shieldsAllow.filter(h => h !== host); saveSettings(); push(); });
  on('clear-data', async () => {
    const r = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Clear', 'Cancel'], defaultId: 1, cancelId: 1,
      message: 'Clear browsing data?', detail: 'This removes history, cookies, site data, cache and saved site permissions. You will be signed out of websites.' });
    if (r.response !== 0) return;
    history.clear(); histVer++; writeJSON('history.json', []);
    settings.permissions = {}; saveSettings();
    await session.defaultSession.clearStorageData();
    await session.defaultSession.clearCache();
    push();
  });
  on('win', (action) => {
    if (action === 'min') win.minimize();
    else if (action === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
    else if (action === 'close') win.close();
  });
  on('open-download', (id) => { const d = downloads.find(x => x.id === id); if (d) shell.openPath(d.path); });
  on('show-download', (id) => { const d = downloads.find(x => x.id === id); if (d) shell.showItemInFolder(d.path); });
  on('toast-float', (t) => { if (t && typeof t.html === 'string') showFloatingToast(t); });
  on('toast-hide', () => hideFloatingToast());
  const ctxOfToast = (wc) => { saveCtx(); return windows.find(c => c.toastView && c.toastView.webContents === wc) || null; };
  ipcMain.on('toast-size', (e, w, h) => {
    const c = ctxOfToast(e.sender); if (!c) return; useWin(c);
    toastSize = { w: Math.round(Math.max(120, Math.min(560, w))), h: Math.round(Math.max(40, Math.min(200, h))) };
    placeToast();
    if (!toastShown) { toastShown = true; win.contentView.addChildView(toastView); }
  });
  ipcMain.on('toast-act', (e, i) => {
    const c = ctxOfToast(e.sender); if (!c) return; useWin(c);
    if (ui && !ui.webContents.isDestroyed()) ui.webContents.send('toast-action', { token: toastToken, index: Number(i) });
    hideFloatingToast();
  });
  on('downloads-seen', () => { let changed = false; for (const d of downloads) if (!d.seen && d.state !== 'progressing') { d.seen = true; changed = true; } if (changed) push(); });
  on('cancel-download', (id) => { const d = downloads.find(x => x.id === id); if (d && d.item) d.item.cancel(); });
  on('clear-downloads', () => { for (let i = downloads.length - 1; i >= 0; i--) if (downloads[i].state !== 'progressing') downloads.splice(i, 1); push(); });
  on('open-downloads-folder', () => shell.openPath(app.getPath('downloads')));
  on('devtools-ui', () => ui.webContents.openDevTools({ mode: 'detach' }));
  handle('suggest', (q) => suggest(q));
  on('ext-list', () => sendExtensions());
  on('ext-remove', (id) => removeExtension(id));
  on('ext-options', (id) => { const e = listExtensions().find(x => x.id === id); if (e && e.options) createTab(e.options); });
  on('ext-visible', (id, pinned) => {
    settings.pinnedActions = settings.pinnedActions.filter(x => x !== id);
    if (pinned) settings.pinnedActions.push(id);
    saveSettings(); sendExtensions();
  });
  on('ext-store', () => createTab('https://chromewebstore.google.com/category/extensions'));
  on('ext-unpacked', () => loadUnpacked());
  on('force-dark-site', () => toggleForceDarkSite());
  on('split-menu', (x, y) => splitMenu(x, y));
  on('split-ratio', (r) => { const sp = splitOf(activeId); if (!sp) return; sp.ratio = Math.max(0.15, Math.min(0.85, Number(r) || 0.5)); layout(); saveSession(); });
  on('unsplit', () => unsplit());
  on('wp-choose', () => chooseWallpaper());
  on('wp-desktop', () => { const p = desktopWallpaperPath(); if (p) { try { useWallpaperFile(p, '.jpg'); } catch (e) { console.error(e.message); } } });
  on('undark', (host) => {
    settings.forceDarkOff = settings.forceDarkOff.filter(h => h !== host); saveSettings();
    for (const x of allTabs()) if (x.view && hostOf(x.url) === host && wantsDark(x.url) !== !!x.dark) { useTab(x); rebuildView(x); }
    push();
  });
  // bookmarks
  on('bm-list', () => sendBookmarks());
  on('bm-toggle', () => toggleBookmarkActive());
  on('bm-open', (id, newTab) => { const h = bookmarks.find(id); if (h) openBookmark(h.item, newTab, false); });
  handle('site-info', () => siteInfo());
  on('site-perm', (origin, perm, value) => {
    if (!ASK[perm] || typeof origin !== 'string') return;
    const key = `${origin}|${perm}`;
    if (value === 'allow') settings.permissions[key] = true;
    else if (value === 'block') settings.permissions[key] = false;
    else delete settings.permissions[key];
    saveSettings();
  });
  handle('site-clear', async (origin) => { const ok = await clearSiteData(origin); if (ok) { const t = activeTab(); if (t && t.view) t.view.webContents.reload(); } return ok; });
  on('bm-open-background', (id) => { const h = bookmarks.find(id); if (h) openBookmark(h.item, true, true); });
  on('bm-menu', (id) => bookmarkContextMenu(id));
  on('bm-bar-menu', () => {
    const t = activeTab();
    popupMenu([
      { label: 'Add current page', enabled: !!t && !isInternal(t.url), click: () => toggleBookmarkActive() },
      { label: 'Add folder…', click: () => ui.webContents.send('bm-edit', { id: null, type: 'folder', title: '', url: '' }) },
      { type: 'separator' },
      { label: 'Hide bookmarks bar', click: () => setSetting('bookmarksBar', false) },
    ]);
  });
  on('bm-folder', (id, x, y) => {
    const h = bookmarks.find(id); if (!h) return;
    popupMenu(bookmarkMenuItems([h.item])[0].submenu, { x: Math.round(x), y: Math.round(y) });
  });
  on('bm-overflow', (ids, x, y) => {
    const items = ids.map(id => bookmarks.find(id)).filter(Boolean).map(h => h.item);
    if (items.length) popupMenu(bookmarkMenuItems(items), { x: Math.round(x), y: Math.round(y) });
  });
  on('bm-move', (id, idx) => { bookmarks.move(id, idx); sendBookmarks(); });
  on('bm-move-into', (id, folderId) => { if (bookmarks.moveInto(id, folderId)) sendBookmarks(); });
  on('bm-add-tab-into', (tabId, folderId) => {
    const t = tabs.find(x => x.id === tabId); if (!t || isInternal(t.url)) return;
    if (bookmarks.addToFolder({ title: t.title || hostOf(t.url), url: t.url, icon: t.favicon }, folderId)) sendBookmarks();
  });
  on('bm-add-tab', (tabId, idx) => {
    const t = tabs.find(x => x.id === tabId); if (!t || isInternal(t.url)) return;
    bookmarks.add({ title: t.title || hostOf(t.url), url: t.url, icon: t.favicon }, idx); sendBookmarks();
  });
  on('bm-save', (id, fields) => {
    if (id) bookmarks.update(id, { title: String(fields.title || ''), url: fields.url ? toUrl(fields.url) : undefined });
    else if (fields.type === 'folder') bookmarks.add({ type: 'folder', title: String(fields.title || 'New folder') });
    else if (fields.url) bookmarks.add({ title: String(fields.title || ''), url: toUrl(fields.url) });
    sendBookmarks();
  });
  on('bm-delete', (id) => { bookmarks.remove(id); sendBookmarks(); });
  on('bm-import', (source) => importBookmarksFrom(source));
  on('bm-export', () => exportBookmarks());
  handle('bm-sources', () => chromiumProfiles().map(p => p.name));
  // passwords
  on('pw-list', () => sendPasswords());
  handle('pw-reveal', (id) => { const e = passwords.get(id); return e ? e.password : ''; });
  on('pw-copy', (id, what) => {
    const e = passwords.get(id); if (!e) return;
    clipboard.writeText(what === 'username' ? e.username : e.password);
    // Clear a copied password from the clipboard after 30 seconds, like most password managers.
    if (what !== 'username') setTimeout(() => { if (clipboard.readText() === e.password) clipboard.clear(); }, 30000);
  });
  on('pw-delete', async (id) => {
    const e = passwords.get(id); if (!e) return;
    const r = await dialog.showMessageBox(win, { type: 'question', buttons: ['Delete', 'Cancel'], defaultId: 0, cancelId: 1,
      message: `Delete the saved password for ${hostOf(e.url)}?`, detail: e.username ? `Username: ${e.username}` : '' });
    if (r.response === 0) { passwords.remove(id); sendPasswords(); }
  });
  on('pw-save', (id, fields) => {
    if (id) passwords.update(id, fields);
    else if (fields.url && fields.password) passwords.upsert({ url: toUrl(fields.url), username: fields.username || '', password: fields.password });
    sendPasswords();
  });
  on('pw-import', () => importPasswords());
  on('pw-export', () => exportPasswords());
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

// Create a Drift window. opts:
//   snapshot  a saved window (tabs, active tab, splits, bounds) to restore
//   urls      addresses to open
//   bounds    where to put it (defaults: the saved size, offset from the last window)
//   empty     start with no tabs (a tab is about to be moved in)
//   gate      wait for this before loading the first page (startup)
//   onReady   called once its sidebar has loaded
function createWindow(opts = {}) {
  const ctx = newWinCtx();
  windows.push(ctx);
  zOrder.unshift(ctx);
  useWin(ctx);
  lastFocused = ctx;
  const W = (fn) => (...a) => { if (!windows.includes(ctx)) return; useWin(ctx); return fn(...a); };   // run as this window

  const base = settings.bounds || { width: 1280, height: 820 };
  let b = opts.bounds || (opts.snapshot && opts.snapshot.bounds) || base;
  if (!opts.bounds && !(opts.snapshot && opts.snapshot.bounds) && windows.length > 1) {
    // Cascade new windows so they don't sit exactly on top of each other.
    const n = windows.length - 1;
    b = { ...base, x: (base.x || 80) + 28 * n, y: (base.y || 60) + 28 * n };
  }
  win = new BaseWindow({
    ...b, minWidth: 640, minHeight: 420, frame: false, show: false,
    title: 'Drift', backgroundColor: isDark() ? '#141417' : '#ebebef',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
  });
  ctx.win = win;
  const wantMax = opts.snapshot ? opts.snapshot.maximized : (windows.length === 1 && settings.maximized && !opts.bounds);
  if (wantMax) win.maximize();

  ui = new WebContentsView({
    webPreferences: { preload: path.join(UI_DIR, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  ctx.ui = ui;
  ui.setBackgroundColor('#00000000');
  win.contentView.addChildView(ui);
  ui.webContents.loadURL('drift://ui/index.html');
  ui.webContents.on('before-input-event', W((e, input) => {
    // Let normal typing go to the sidebar inputs; only intercept real shortcuts.
    if (handleShortcut(input)) e.preventDefault();
  }));
  ui.webContents.once('did-finish-load', W(() => {
    ctx.ready = true; layout(); win.show(); push();
    if (extensions) sendExtensionsTo(ctx);
    if (bookmarks) sendBookmarks();
    if (opts.onReady) opts.onReady(ctx);
  }));
  ui.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  ui.webContents.on('will-navigate', (e) => e.preventDefault());

  const saveBounds = debounce(W(() => {
    if (win.isDestroyed()) return;
    settings.maximized = win.isMaximized();
    if (!win.isMaximized() && !win.isFullScreen() && !win.isMinimized()) settings.bounds = win.getBounds();
    saveSettings(); saveSession();
  }), 500);
  win.on('resize', W(() => { layout(); saveBounds(); }));
  win.on('move', saveBounds);
  win.on('maximize', W(() => { layout(); push(); saveBounds(); }));
  win.on('unmaximize', W(() => { layout(); push(); saveBounds(); }));
  win.on('enter-full-screen', W(() => layout()));
  win.on('leave-full-screen', W(() => {
    if (htmlFullscreen) { htmlFullscreen = false; const t = activeTab(); t?.view?.webContents.executeJavaScript('document.fullscreenElement && document.exitFullscreen()').catch(() => {}); }
    layout();
  }));
  win.on('app-command', W((_e, cmd) => {
    const wc = activeTab()?.view?.webContents; if (!wc) return;
    if (cmd === 'browser-backward' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    if (cmd === 'browser-forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  }));
  win.on('focus', W(() => {
    lastFocused = ctx;
    const z = zOrder.indexOf(ctx); if (z > 0) { zOrder.splice(z, 1); zOrder.unshift(ctx); }
    const t = activeTab();
    if (extensions && t && t.view) { try { extensions.selectTab(t.view.webContents); } catch {} }
    if (!overlay) focusPage();
  }));
  // Closing the last window quits Drift and keeps its tabs for next time; closing another
  // window closes its tabs (like Chrome).
  win.on('close', W(() => {
    if (windows.length === 1 && !quitting) { writeJSONSync('session.json', sessionSnapshot()); writeJSONSync('settings.json', settings); }
  }));
  win.on('closed', () => closeWindowCtx(ctx));

  // First pages.
  const snap = opts.snapshot;
  if (snap && snap.tabs && snap.tabs.length) {
    snap.tabs.forEach((t) => createTab(t.url, { title: t.title, favicon: t.favicon, pinned: t.pinned, lazy: true, activate: false }));
    for (const [i, j, ratio, dir] of snap.splits || []) {
      if (tabs[i] && tabs[j] && !splitOf(tabs[i].id) && !splitOf(tabs[j].id)) splits.push({ a: tabs[i].id, b: tabs[j].id, ratio: ratio || 0.5, dir: dir === 'col' ? 'col' : 'row' });
    }
  }
  const urls = opts.urls || [];
  (opts.gate || Promise.resolve()).then(W(() => {
    if (snap && snap.tabs && snap.tabs.length && tabs.length) activate(tabs[Math.min(snap.active || 0, tabs.length - 1)].id);
    for (const u of urls) createTab(u);
    if (!tabs.length && !opts.empty) createTab(NEWTAB);
  }));
  return ctx;
}

// A window was closed: close its tabs and forget it. Quit when it was the last one.
function closeWindowCtx(ctx) {
  const i = windows.indexOf(ctx); if (i < 0) return;
  useWin(ctx);
  for (const t of [...tabs]) { try { destroyView(t); } catch {} }
  splits = []; tabs = [];
  try { if (toastView) toastView.webContents.close(); } catch {}
  try { if (ui && !ui.webContents.isDestroyed()) ui.webContents.close(); } catch {}
  windows.splice(i, 1);
  const z = zOrder.indexOf(ctx); if (z >= 0) zOrder.splice(z, 1);
  cur = null;
  win = ui = toastView = null; tabs = []; activeId = null; overlay = null;
  if (lastFocused === ctx) lastFocused = windows[windows.length - 1] || null;
  if (!windows.length) { app.quit(); return; }
  useWin(lastFocused || windows[0]);
  if (!quitting) { saveSession(); push(); }
}

// Open a new window (Ctrl+N, the taskbar menu, "Open link in new window").
function newWindow(urls = []) {
  const ctx = createWindow({ urls });
  return ctx;
}

// Move a tab (its page keeps running) into another window, at `index` or the end.
function moveTabToWindow(tab, target, index) {
  const src = ctxOfTab(tab);
  if (!src || !target || src === target || !windows.includes(target)) return;
  useWin(src);
  const wasActive = activeId === tab.id;
  const sp = splitOf(tab.id); if (sp) splits = splits.filter(x => x !== sp);
  const i = tabs.indexOf(tab); if (i >= 0) tabs.splice(i, 1);
  if (tab.view) { try { win.contentView.removeChildView(tab.view); } catch {} }
  if (!tabs.length) setImmediate(() => { if (src.win && !src.win.isDestroyed()) src.win.close(); });
  else { if (wasActive) activate((tabs[i] || tabs[i - 1] || tabs[0]).id); else layout(); }
  useWin(target);
  tab.wid = target.id;
  const pinnedCount = tabs.filter(t => t.pinned).length;
  const at = index == null ? tabs.length : Math.max(tab.pinned ? 0 : pinnedCount, Math.min(index, tabs.length));
  tabs.splice(tab.pinned ? Math.min(at, pinnedCount) : at, 0, tab);
  const st = extensions && extensions.ctx && extensions.ctx.store;
  if (st && tab.view) { try { st.tabToWindow.set(tab.view.webContents, win); st.addWindow(win); } catch {} }
  activate(tab.id);
  if (win && !win.isDestroyed()) win.focus();
  push(); saveSession();
}
// Put a tab in a window of its own (near `at`, a screen point, when it was dragged out).
function tabToNewWindow(tab, at) {
  const src = ctxOfTab(tab); if (!src) return;
  useWin(src);
  let b = win.isMaximized() || win.isFullScreen() ? win.getNormalBounds() : win.getBounds();
  if (win.isMaximized()) {   // a maximized window's normal size can be the whole screen too; use a comfortable size
    const wa = screen.getDisplayNearestPoint(at || { x: b.x, y: b.y }).workArea;
    b = { ...b, width: Math.min(b.width, Math.round(wa.width * 0.75)), height: Math.min(b.height, Math.round(wa.height * 0.8)) };
  }
  if (tabs.length === 1) {   // already alone: just move its window there
    if (at) win.setBounds({ ...b, x: Math.round(at.x - 140), y: Math.round(at.y - 20) });
    return;
  }
  const bounds = at ? { x: Math.round(at.x - 140), y: Math.round(at.y - 20), width: b.width, height: b.height }
    : { x: b.x + 32, y: b.y + 32, width: b.width, height: b.height };
  const ctx = createWindow({ bounds, empty: true });
  moveTabToWindow(tab, ctx);
}
// A tab was dragged out of a window's sidebar and dropped somewhere that isn't a tab list.
function tabDroppedOutside(tab, x, y) {
  const src = ctxOfTab(tab); if (!src) return;
  const inside = (w) => { const b = w.getBounds(); return x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height; };
  // (Dropping onto this window's own page, outside the sidebar, detaches it too —
  // unless it's the window's only tab.)
  if (src.tabs.length <= 1 && src.win && inside(src.win)) return;
  const other = zOrder.find(c => c !== src && c.win && !c.win.isDestroyed() && !c.win.isMinimized() && inside(c.win));   // the one on top there
  if (other) moveTabToWindow(tab, other);
  else tabToNewWindow(tab, { x, y });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

// Note: this call replaces any earlier registration, so crx (extension icons) is listed here too.
protocol.registerSchemesAsPrivileged([
  { scheme: 'drift', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'crx', privileges: { bypassCSP: true } },
]);
app.userAgentFallback = chromeUA();
app.setName('Drift');
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');
// Faster downloads: fetch large files over several connections at once (Chromium's parallel
// downloading). Servers that don't support it fall back to a normal single download.
app.commandLine.appendSwitch('enable-features', 'ParallelDownloading:parallel_request_count/6/min_slice_size/1048576/parallel_request_delay/0');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Drift was launched again (taskbar menu, a link from another app): use the open window.
  app.on('second-instance', (_e, argv) => {
    const urls = argv.filter(a => /^https?:\/\//.test(a));
    if (argv.includes('--new-window') || !windows.length) { createWindow({ urls }); return; }
    const c = lastFocused || windows[0]; useWin(c);
    if (win.isMinimized()) win.restore();
    win.focus();
    urls.forEach(u => createTab(u));
    if (argv.includes('--new-tab')) createTab(NEWTAB);
  });

  app.whenReady().then(async () => {
    PERF('ready');
    if (PERF_ON) {
      setTimeout(() => {
        for (const w of webContents.getAllWebContents()) PERF(`wc ${w.id} ${w.getType()} pid=${w.getOSProcessId()} ${w.getURL().slice(0, 70)}`);
        let tot = 0; for (const m of app.getAppMetrics()) { tot += m.memory.workingSetSize; PERF(`proc ${m.pid} ${m.type} ${(m.memory.workingSetSize/1024).toFixed(0)}MB cpu=${m.cpu.percentCPUUsage.toFixed(1)}`); }
        PERF(`total ${(tot/1024).toFixed(0)}MB`);
      }, 8000);
      app.on('web-contents-created', (_e, w) => { PERF('created wc' + w.id + ' ' + w.getType()); w.on('did-finish-load', () => PERF('loaded wc' + w.id + ' ' + w.getURL().slice(0, 60))); w.once('destroyed', () => PERF('destroyed wc' + w.id)); });
    }
    settings = { ...DEFAULT_SETTINGS, ...readJSON('settings.json', {}) };
    nativeTheme.themeSource = settings.theme;
    history = new Map(readJSON('history.json', []).map(h => [h.url, h]));
    bookmarks = new Bookmarks(() => readJSON('bookmarks.json', null), (d) => writeJSON('bookmarks.json', d));
    passwords = new Passwords(file('passwords.json'));
    faviconStore = readJSON('favicons.json', {});
    Menu.setApplicationMenu(null);
    const ses = session.defaultSession;
    ses.setUserAgent(chromeUA());
    ses.setSpellCheckerLanguages(['en-US']);
    setupProtocol();
    setupPermissions(ses);
    setupCertificates(ses);
    ses.registerPreloadScript({ id: 'drift-page', type: 'frame', filePath: path.join(__dirname, 'page-preload.js') });
    setupDownloads(ses);
    setupIPC();
    setupPageIPC();
    nativeTheme.on('updated', () => {
      push(); refreshNewTabs(); folderMenuIcon = null; prepareBookmarkMenuIcons();
      for (const t of allTabs()) if (t.view && !t.view.webContents.isDestroyed()) t.view.setBackgroundColor(baseFor(t.view.webContents.getURL()));
    });
    // Temp files from background saves cut off by a crash.
    fs.promises.readdir(userData()).then(fs_ => { for (const f of fs_) if (/\.\d+-\d+\.tmp$/.test(f)) fs.promises.unlink(file(f)).catch(() => {}); }).catch(() => {});
    PERF('setup done');
    await setupExtensions(ses);
    PERF('extensions loaded');
    // uBlock Origin (or the built-in blocker) starts while the window and its UI load; the
    // first page waits for both, so it's filtered and carries the right identity from its
    // first request. Capped so a slow first-run filter download can't hold the window up.
    const shieldsReady = initShields().then(() => PERF('shields ready'));
    let openGate; startupGate = new Promise(r => { openGate = r; });
    // Reopen every window from last time (older sessions hold one window at the top level).
    const urls = process.argv.slice(1).filter(a => /^https?:\/\//.test(a));
    const saved = settings.restoreTabs ? readJSON('session.json', null) : null;
    const snaps = saved ? (Array.isArray(saved.windows) && saved.windows.length ? saved.windows : [saved]).filter(w => w && w.tabs && w.tabs.length) : [];
    const first = createWindow({ snapshot: snaps[0], urls, gate: startupGate });
    for (const w of snaps.slice(1)) createWindow({ snapshot: w, gate: startupGate });
    if (process.argv.includes('--new-window') && snaps.length) createWindow({ gate: startupGate });
    else if (process.argv.includes('--new-tab') && !urls.length) startupGate.then(() => { useWin(first); createTab(NEWTAB); });
    useWin(first);
    PERF('window created');
    const uiReady = new Promise(r => first.ui.webContents.once('did-finish-load', r)).then(() => { setTimeout(prepareBookmarkMenuIcons, 300); return initIdentity(); });
    Promise.race([Promise.all([shieldsReady, uiReady]), new Promise(r => setTimeout(r, 2000))]).then(() => { PERF('gate open'); openGate(); });
    setupUpdates();
    startPerfLog();











    // Taskbar right-click menu (Windows jump list).
    if (process.platform === 'win32') {
      try {
        app.setUserTasks([
          { program: process.execPath, arguments: '--new-window', iconPath: process.execPath, iconIndex: 0, title: 'New window', description: 'Open a new Drift window' },
          { program: process.execPath, arguments: '--new-tab', iconPath: process.execPath, iconIndex: 0, title: 'New tab', description: 'Open a new tab in Drift' },
        ]);
      } catch {}
    }
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    if (!quitting) flushSaves();
    if (windows.length && !quitting) { writeJSONSync('session.json', sessionSnapshot()); writeJSONSync('settings.json', settings); }
    quitting = true;
  });
  app.on('web-contents-created', (_e, wc) => {
    // Block navigation into the sidebar UI and harden every webContents.
    wc.on('will-attach-webview', (e) => e.preventDefault());
    // Tabs and sign-in popups both need the Google sign-in user agent switch.
    if (wc.getType() === 'window' || wc.getType() === 'browserView') guardUserAgent(wc);
    // Web pages (tabs and their popups) get the reported Chrome identity on their first web load.
    if (wc.getType() === 'window' || wc.getType() === 'browserView') {
      wc.on('did-start-navigation', (e) => {
        if (!wc.__driftIdentity && !wc.__driftSignin && e.isMainFrame && /^https?:/.test(e.url) && !isSignin(e.url)) applyIdentity(wc);
      });
    }
  });
}
