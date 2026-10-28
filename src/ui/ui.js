/* Drift sidebar UI */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const send = (...a) => window.drift.send(...a);

let S = null;          // last state from main
let content = { x: 0, y: 0, width: 0, height: 0 };
let panel = null;      // null | 'settings' | 'downloads'
let paletteNewTab = false;
let paletteItems = [];
let paletteSel = 0;
let dragId = null;
let EXT = [];          // installed extensions
let BM = [];           // bookmarks bar items
let PW = [];           // saved password list (no secrets)
let lastLayout = null;
let paletteAnchored = false;

// Fill static icons
document.querySelectorAll('[data-i]').forEach(el => { el.insertAdjacentHTML('afterbegin', icon(el.dataset.i, el.classList.contains('wb') ? 14 : 16)); });

function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }
function isInternal(u) { return !u || u.startsWith('drift:') || u === 'about:blank'; }

const PALETTE = ['#e5484d', '#f76b15', '#ffb224', '#30a46c', '#12a594', '#0090ff', '#6e56cf', '#d6409f'];
function letterColor(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; }

function favHTML(t, size = 16) {
  if (t.loading && !t.asleep) return `<span class="fav"><span class="spinner"></span></span>`;
  if (isInternal(t.url)) return `<span class="fav" style="color:var(--accent)">${icon('globe', size)}</span>`;
  const h = hostOf(t.url) || '?';
  const letter = `<span class="letter" style="background:${letterColor(h)};width:${size}px;height:${size}px">${esc(h[0])}</span>`;
  if (!t.favicon) return `<span class="fav" style="width:${size}px;height:${size}px">${letter}</span>`;
  return `<span class="fav" style="width:${size}px;height:${size}px"><img src="${esc(t.favicon)}" style="width:${size}px;height:${size}px"><template>${letter}</template></span>`;
}

// Broken favicon → fall back to a letter badge (CSP forbids inline onerror)
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.nextElementSibling && img.nextElementSibling.tagName === 'TEMPLATE')
    img.replaceWith(img.nextElementSibling.content.cloneNode(true));
}, true);

function tabTitle(t) {
  if (t.title) return t.title;
  if (isInternal(t.url)) return 'New Tab';
  return hostOf(t.url) || t.url;
}

// ---------------------------------------------------------------------- render
// Only touch the page when something changed: rewriting identical markup or values still
// makes the browser restyle and repaint, which adds up while a busy page loads.
function setCls(el, c) { if (el && el.className !== c) el.className = c; }
function setHTML(el, html) { if (el && el.__h !== html) { el.innerHTML = html; el.__h = html; } }
const varCache = {};
function setVar(name, v) { if (varCache[name] !== v) { varCache[name] = v; document.documentElement.style.setProperty(name, v); } }
function render() {
  if (!S) return;
  const b = document.body;
  b.classList.toggle('dark', S.dark);
  b.classList.toggle('light', !S.dark);
  b.classList.toggle('hidden-bar', S.settings.sidebarHidden);
  b.classList.toggle('docked', !S.settings.sidebarHidden);
  b.classList.toggle('over-palette', ['palette', 'modal', 'extmenu', 'siteinfo', 'dlmenu', 'railpeek', 'bmpop'].includes(S.overlay));
  b.classList.toggle('rail', !!S.settings.sidebarRail && !S.settings.sidebarHidden);
  b.classList.toggle('bm-on', !!S.settings.titleBar && !!S.settings.bookmarksBar);
  b.classList.toggle('over-peek', S.overlay === 'peek');
  b.classList.toggle('no-titlebar', !S.settings.titleBar);
  const act = S.tabs.find(t => t.id === S.activeId);
  document.title = act ? (tabTitle(act) + ' — Drift') : 'Drift';
  if (!b.classList.contains('platform-' + S.platform)) { [...b.classList].filter(c => c.startsWith('platform-')).forEach(c => b.classList.remove(c)); b.classList.add('platform-' + S.platform); }
  setVar('--accent', S.settings.accent);
  setVar('--sw', S.settings.sidebarWidth + 'px');
  setVar('--fw', Math.round(Math.min(S.settings.sidebarWidth, 260) * 0.88) + 'px');   // slide-out width
  applyHole();
  applyWallpaper();
  const inSplit = (S.splits || []).find(sp => sp.a === S.activeId || sp.b === S.activeId);
  const spb = $('#a-split');
  spb.classList.toggle('on', !!inSplit);
  setHTML(spb, icon(inSplit && inSplit.dir === 'col' ? 'splitcol' : 'split'));
  spb.title = inSplit ? 'Split view options' : 'Split view';

  // nav
  document.querySelectorAll('[data-nav=back]').forEach(b => b.disabled = !S.nav.canGoBack);
  document.querySelectorAll('[data-nav=fwd]').forEach(b => b.disabled = !S.nav.canGoForward);
  document.querySelectorAll('[data-nav=reload]').forEach(b => { setHTML(b, icon(S.nav.loading ? 'stop' : 'reload')); b.title = S.nav.loading ? 'Stop' : 'Reload (Ctrl+R)'; });
  const railTitle = S.settings.sidebarRail ? 'Expand sidebar' : 'Collapse sidebar to icons';
  $('#tb-sidebar').title = railTitle; $('#btn-collapse').title = railTitle;
  renderAddr();
  document.querySelectorAll('[data-win=max]').forEach(b => { setHTML(b, icon(S.maximized ? 'restore' : 'max', 14)); b.title = S.maximized ? 'Restore' : 'Maximize'; });

  // url pill
  const url = S.nav.url;
  const ut = $('#u-text'), ui = $('#u-icon');
  if (isInternal(url)) {
    if (ut.textContent !== 'Search or enter address' || ut.__h) { ut.textContent = 'Search or enter address'; ut.__h = null; } setCls(ut, 'u-text placeholder');
    setHTML(ui, icon('search')); setCls(ui, 'u-icon');
  } else {
    let host = url, rest = '';
    try { const u = new URL(url); host = u.hostname.replace(/^www\./, ''); rest = (u.pathname === '/' ? '' : u.pathname) + u.search; } catch {}
    setHTML(ut, `${esc(host)}<span class="path">${esc(rest)}</span>`); setCls(ut, 'u-text');
    setHTML(ui, icon(S.nav.secure ? 'lock' : 'info', 15)); setCls(ui, 'u-icon' + (S.nav.secure ? ' secure' : ''));
    ui.title = S.nav.secure ? 'Connection is secure' : 'Connection is not secure';
  }
  const sh = $('#btn-shield');
  sh.classList.toggle('off', !S.nav.shieldsOn);
  setHTML(sh.querySelector('span'), icon(S.nav.shieldsOn ? 'shield' : 'shieldoff'));
  $('#shield-count').textContent = S.nav.shieldsOn && S.nav.blocked ? S.nav.blocked : '';
  sh.title = isInternal(url) ? 'Shields' : S.nav.shieldsOn
    ? `Shields are up on ${hostOf(url)} — ${S.nav.blocked} blocked. Click to turn off for this site.`
    : `Shields are down on ${hostOf(url)}. Click to turn on.`;
  sh.hidden = isInternal(url);

  setHTML($('#blocked-total'), S.blockedTotal ? `${icon('shield', 12)}${S.blockedTotal.toLocaleString()} blocked` : '');
  renderDownloadIndicators();

  renderTabs();
  syncActions();
  if (panel === 'settings') renderSettings();
  if (panel === 'extensions') renderExtensions();
  if (panel === 'volume') renderVolume();
  $('#vol-dot').hidden = !S.tabs.some(t => t.volume !== 1);
  if (panel === 'downloads') renderDownloads();
  $('#palette-wrap').hidden = S.overlay !== 'palette';
  $('#modal-wrap').hidden = S.overlay !== 'modal';
  if (S.overlay !== 'extmenu') $('#extmenu-wrap').hidden = true;
  if (S.overlay !== 'siteinfo') $('#siteinfo-wrap').hidden = true;
  if (S.overlay !== 'dlmenu') $('#dlmenu-wrap').hidden = true; else renderDlMenu();
  if (S.overlay !== 'railpeek' && document.body.classList.contains('rail-open') && !(pendingOverlay && pendingOverlay.mode === 'railpeek')) instantRail(() => document.body.classList.remove('rail-open', 'rail-in'));
  if (S.overlay !== 'bmpop') closeBmPopups(true);
  if (panel === 'passwords') renderPasswords();
  placeActions();
  $('#findbar').hidden = !S.findOpen;
}

// The toolbar's address field (separate from the sidebar pill used when the toolbar is off).
function renderAddr() {
  const url = S.nav.url;
  const at = $('#a-text'), ai = $('#a-icon');
  if (isInternal(url)) {
    if (at.textContent !== 'Search or enter address' || at.__h) { at.textContent = 'Search or enter address'; at.__h = null; } setCls(at, 'a-text placeholder');
    setHTML(ai, icon('search', 15)); setCls(ai, 'a-icon'); ai.title = '';
  } else {
    let host = url, rest = '';
    try { const u = new URL(url); host = u.hostname.replace(/^www\./, ''); rest = (u.pathname === '/' ? '' : u.pathname) + u.search; } catch {}
    setHTML(at, `${esc(host)}<span class="path">${esc(rest)}</span>`); setCls(at, 'a-text');
    setHTML(ai, icon(S.nav.secure ? 'lock' : 'info', 14)); setCls(ai, 'a-icon' + (S.nav.secure ? ' secure' : '') + ' clickable');
    ai.title = (S.nav.secure ? 'Connection is secure' : 'Connection is not secure') + ' · click for site info';
  }
  const internal = isInternal(url);
  const star = $('#a-star');
  star.hidden = internal;
  setHTML(star, icon(S.nav.bookmarked ? 'starfill' : 'star', 15));
  star.classList.toggle('on', S.nav.bookmarked);
  star.title = S.nav.bookmarked ? 'Remove bookmark (Ctrl+D)' : 'Bookmark this page (Ctrl+D)';
  const dk = $('#a-dark');
  dk.hidden = internal || !S.settings.forceDark;
  setHTML(dk, icon(S.nav.dark ? 'moonfill' : 'moon', 14));
  dk.classList.toggle('on', S.nav.dark);
  dk.title = S.nav.darkSite ? `Force dark is on for ${hostOf(url)} — click to turn it off for this site` : `Force dark is off for ${hostOf(url)} — click to turn it on`;
  const sh = $('#a-shield');
  sh.hidden = internal;
  sh.classList.toggle('off', !S.nav.shieldsOn);
  setHTML(sh.querySelector('span'), icon(S.nav.shieldsOn ? 'shield' : 'shieldoff', 15));
  const blockedNow = uboBlocked();
  $('#a-shield-count').textContent = S.uboId ? blockedNow : (S.nav.shieldsOn && S.nav.blocked ? S.nav.blocked : '');
  sh.title = S.uboId ? `uBlock Origin${blockedNow ? ` — ${blockedNow} blocked on this page` : ''}. Click for options, or to turn it off for this site.` : $('#btn-shield').title;
  if (S.uboId) { sh.classList.remove('off'); setHTML(sh.querySelector('span'), icon('shield', 15)); }
}

function applyWallpaper() {
  const css = S.wallpaperCss || '';
  document.body.classList.toggle('has-wp', !!css);
  const wp = $('#wp');
  if (wp.dataset.css !== css) { wp.style.background = css; wp.dataset.css = css; }
  const blur = Number(S.settings.wallpaperBlur) || 0;
  wp.style.filter = blur ? `blur(${blur}px)` : '';
  wp.style.inset = blur ? `-${blur * 2}px` : '0';
  document.documentElement.style.setProperty('--wp-dim', String(S.settings.wallpaperDim ?? 0.35));
}

// Extension buttons live in the toolbar when it's on, otherwise under the sidebar pill.
function placeActions() {
  const list = $('#actions'), wrap = $('#actions-wrap');
  const target = S && S.settings.titleBar ? $('#tb-actions') : $('#ext-bar');
  if (wrap.parentElement !== target) target.append(wrap);
  list.setAttribute('alignment', S && S.settings.titleBar ? 'bottom left' : 'bottom right');
}

function applyHole() {
  const w = $('#wash');
  if (S && ['palette', 'modal', 'extmenu', 'siteinfo', 'dlmenu', 'railpeek', 'bmpop'].includes(S.overlay)) {
    const { x, y, width: cw, height: ch } = content;
    w.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x}px ${y}px, ${x + cw}px ${y}px, ${x + cw}px ${y + ch}px, ${x}px ${y + ch}px, ${x}px ${y}px)`;
  } else w.style.clipPath = '';
}

// Tabs are updated in place (keyed by tab id) instead of rebuilt, so a tab you're pressing or
// dragging is never replaced mid-gesture: a rebuild would cancel the drag. While a drag is in
// progress, updates wait until it ends.
let tabsPending = false;
function syncKeyed(container, items) {
  const have = new Map([...container.children].filter(el => el.dataset.id).map(el => [el.dataset.id, el]));
  items.forEach((it, i) => {
    let el = have.get(String(it.id));
    if (!el) { el = document.createElement('div'); el.dataset.id = String(it.id); el.draggable = true; }
    else have.delete(String(it.id));
    if (el.className !== it.cls) el.className = it.cls;
    if (el.title !== it.title) el.title = it.title;
    if (el.__html !== it.html) { el.innerHTML = it.html; el.__html = it.html; }
    const at = container.children[i];
    if (at !== el) container.insertBefore(el, at || null);
  });
  for (const el of have.values()) el.remove();
  for (const el of [...container.children]) if (!el.dataset.id) el.remove();   // stray drop markers
}
function renderTabs() {
  if (dragId != null) { tabsPending = true; return; }
  tabsPending = false;
  const ess = $('#essentials'), list = $('#tablist');
  const pinned = S.tabs.filter(t => t.pinned);
  const normal = S.tabs.filter(t => !t.pinned);
  syncKeyed(ess, pinned.map(t => ({
    id: t.id, cls: `ess ${t.id === S.activeId ? 'active' : ''} ${t.asleep ? 'asleep' : ''}`.trim(), title: tabTitle(t),
    html: `${favHTML(t, 18)}${t.audible || t.muted ? `<button class="audio" data-act="mute" title="${t.muted ? 'Unmute' : 'Mute'} tab">${icon(t.muted ? 'muted' : 'sound', 13)}</button>` : ''}`,
  })));
  const splitClass = (t) => {
    const sp = (S.splits || []).find(x => x.a === t.id || x.b === t.id);
    if (!sp) return '';
    const i = normal.indexOf(t), partner = sp.a === t.id ? sp.b : sp.a;
    const prevIs = normal[i - 1] && normal[i - 1].id === partner, nextIs = normal[i + 1] && normal[i + 1].id === partner;
    return 'in-split' + (nextIs ? ' split-first' : prevIs ? ' split-last' : '');
  };
  syncKeyed(list, normal.map(t => ({
    id: t.id, cls: `tab ${t.id === S.activeId ? 'active' : ''} ${t.asleep ? 'asleep' : ''} ${splitClass(t)}`.replace(/\s+/g, ' ').trim(),
    title: tabTitle(t) + (t.asleep ? ' (sleeping)' : ''),
    html: `${favHTML(t)}<span class="title">${esc(tabTitle(t))}</span>${t.audible || t.muted || t.volume !== 1 ? `<button class="audio" data-act="mute" title="${t.muted ? 'Unmute' : 'Mute'} · volume ${Math.round(t.volume * 100)}% (scroll to adjust)">${icon(t.muted ? 'muted' : 'sound', 18)}</button>` : ''}<button class="close" data-act="close" title="Close (Ctrl+W)">${icon('x', 9)}</button>`,
  })));
}

// ---------------------------------------------------------------------- tab interactions
function tabEvents(container) {
  container.addEventListener('mousedown', (e) => {
    const el = e.target.closest('[data-id]'); if (!el) return;
    const id = Number(el.dataset.id);
    if (e.button === 1) { e.preventDefault(); send('close-tab', id); return; }
    if (e.button !== 0) return;
    const act = e.target.closest('[data-act]');
    if (!act) send('activate', id, true);   // focus moves to the page on release (or after a drag)
  });
  container.addEventListener('click', (e) => {
    const el = e.target.closest('[data-id]'); if (!el) return;
    const id = Number(el.dataset.id);
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'close') send('close-tab', id);
    if (act && act.dataset.act === 'mute') send('toggle-mute', id);
    if (!act) send('focus-page');
  });
  container.addEventListener('contextmenu', (e) => {
    const el = e.target.closest('[data-id]'); if (!el) return;
    e.preventDefault(); send('tab-menu', Number(el.dataset.id));
  });
  container.addEventListener('dragstart', (e) => {
    const el = e.target.closest('[data-id]'); if (!el) return;
    dragId = Number(el.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(dragId));
    e.dataTransfer.setData('application/x-drift-tab', String(dragId));   // lets other Drift windows take it
    requestAnimationFrame(() => el.classList.add('dragging'));
    $('#essentials').classList.add('drop-target');
  });
  container.addEventListener('dragend', (e) => {
    // Dropped where nothing took it (outside the window, or onto another window's page):
    // Drift moves it to that window or opens a new one there.
    if (dragId != null && e.dataTransfer && e.dataTransfer.dropEffect === 'none') {
      const r = $('#sidebar').getBoundingClientRect();
      send('tab-drop-out', dragId, { x: r.left, y: r.top, width: r.width, height: r.height });
    }
    dragId = null;
    document.querySelectorAll('.dragging').forEach(x => x.classList.remove('dragging'));
    document.querySelectorAll('.drop-line').forEach(x => x.remove());
    $('#essentials').classList.remove('drop-target');
    clearBmDrop();
    send('focus-page');
    if (tabsPending && S) renderTabs();
    if (bmPending) renderBookmarks();
  });
}
tabEvents($('#tablist'));
tabEvents($('#essentials'));

// Drop into the tab list → reorder / unpin
// A tab dragged from another Drift window.
const foreignTab = (e) => dragId == null && e.dataTransfer && [...e.dataTransfer.types].includes('application/x-drift-tab');
$('#tablist').addEventListener('dragover', (e) => {
  if (foreignTab(e)) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.drop-line').forEach(x => x.remove());
    const rows = [...$('#tablist').querySelectorAll('.tab')];
    const before = rows.find(r => e.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
    const line = document.createElement('div'); line.className = 'drop-line';
    before ? before.before(line) : $('#tablist').append(line);
    return;
  }
  if (dragId == null) return;
  e.preventDefault();
  document.querySelectorAll('.drop-line').forEach(x => x.remove());
  const rows = [...$('#tablist').querySelectorAll('.tab')];
  const before = rows.find(r => e.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
  const line = document.createElement('div'); line.className = 'drop-line';
  before ? before.before(line) : $('#tablist').append(line);
});
$('#tablist').addEventListener('dragleave', (e) => { if (!e.relatedTarget || !$('#tablist').contains(e.relatedTarget)) document.querySelectorAll('.drop-line').forEach(x => x.remove()); });
$('#tablist').addEventListener('drop', (e) => {
  if (foreignTab(e)) {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData('application/x-drift-tab'));
    const rows = [...$('#tablist').querySelectorAll('.tab')];
    const before = rows.find(r => e.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
    const idx = before ? S.tabs.findIndex(t => t.id === Number(before.dataset.id)) : S.tabs.length;
    document.querySelectorAll('.drop-line').forEach(x => x.remove());
    if (id) send('tab-adopt', id, idx < 0 ? S.tabs.length : idx);
    return;
  }
  if (dragId == null) return;
  e.preventDefault();
  const rows = [...$('#tablist').querySelectorAll('.tab')].filter(r => Number(r.dataset.id) !== dragId);
  const before = rows.find(r => e.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
  const pinnedCount = S.tabs.filter(t => t.pinned && t.id !== dragId).length;
  let idx;
  if (before) idx = S.tabs.filter(t => t.id !== dragId).findIndex(t => t.id === Number(before.dataset.id));
  else idx = S.tabs.length;
  send('move-tab', dragId, Math.max(idx, pinnedCount), false);
});
// Drop onto pinned area → pin
$('#essentials').addEventListener('dragover', (e) => { if (dragId != null) e.preventDefault(); });
$('#essentials').addEventListener('drop', (e) => {
  if (dragId == null) return;
  e.preventDefault();
  const tiles = [...$('#essentials').querySelectorAll('.ess')].filter(r => Number(r.dataset.id) !== dragId);
  const before = tiles.find(r => { const b = r.getBoundingClientRect(); return e.clientY < b.bottom && e.clientX < b.left + b.width / 2; });
  const idx = before ? S.tabs.filter(t => t.id !== dragId).findIndex(t => t.id === Number(before.dataset.id)) : tiles.length;
  send('move-tab', dragId, idx, true);
});

// ---------------------------------------------------------------------- top controls
document.querySelectorAll('[data-nav=back]').forEach(b => b.onclick = () => send('back'));
document.querySelectorAll('[data-nav=fwd]').forEach(b => b.onclick = () => send('forward'));
document.querySelectorAll('[data-nav=reload]').forEach(b => b.onclick = () => send('reload'));
const toggleRail = () => {
  if (S && S.settings.sidebarHidden) { send('toggle-sidebar'); return; }
  if (panel) togglePanel(null);
  send('set', 'sidebarRail', !(S && S.settings.sidebarRail));
};
$('#btn-collapse').onclick = toggleRail;
$('#tb-sidebar').onclick = toggleRail;
$('#addr').addEventListener('click', (e) => {
  if (e.target.closest('#a-icon.clickable')) { openSiteInfo(); return; }
  if (!e.target.closest('.a-btn, .a-shield')) openPalette(false, true);
});
$('#a-star').onclick = () => send('bm-toggle');
$('#a-dark').onclick = () => send('force-dark-site');
// With uBlock Origin as the engine, the shield opens its popup (per-site switch, counts, logger).
function openShields(btn) {
  if (S && S.uboId && window.browserAction) {
    const r = btn.getBoundingClientRect();
    window.browserAction.activate('_self', { eventType: 'click', extensionId: S.uboId, tabId: S.activeWcId,
      alignment: 'bottom left', anchorRect: { x: r.left, y: r.top, width: r.width, height: r.height } });
  } else send('site-shields');
}
function uboBlocked() {
  if (!S || !S.uboId || !window.browserAction) return '';
  const a = window.browserAction.getAction(S.uboId);
  const t = a && a.tabs && a.tabs[S.activeWcId];
  return (t && t.text) || '';
}
if (window.browserAction) window.browserAction.addEventListener('update', () => { if (S) renderAddr(); });
$('#a-shield').onclick = (e) => openShields(e.currentTarget);
document.addEventListener('dblclick', (e) => { if (e.target.closest('#titlebar') && !e.target.closest('button, #addr')) send('win', 'max'); });
document.querySelectorAll('[data-win]').forEach(b => b.onclick = () => send('win', b.dataset.win));
$('#btn-newtab').onclick = () => openPalette(true);
$('#urlbar').onclick = (e) => { if (!e.target.closest('#btn-shield')) openPalette(false); };
$('#btn-shield').onclick = (e) => openShields(e.currentTarget);
let bmSources = null;
$('#btn-settings').onclick = async () => {
  togglePanel('settings');
  if (bmSources === null) { bmSources = await window.drift.invoke('bm-sources') || []; if (panel === 'settings') renderSettings(); }
};
$('#btn-downloads').onclick = () => { togglePanel('downloads'); if (panel === 'downloads') send('downloads-seen'); };
$('#btn-extensions').onclick = () => togglePanel('extensions');
$('#btn-volume').onclick = () => togglePanel('volume');
$('#vol-reset').onclick = () => S.tabs.filter(t => t.volume !== 1).forEach(t => send('tab-volume', t.id, 1));
$('#ext-store').onclick = () => send('ext-store');
$('#dl-folder').onclick = () => send('open-downloads-folder');
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => togglePanel(null));
document.addEventListener('dblclick', (e) => { if (e.target.closest('.topbar') && !e.target.closest('button')) send('win', 'max'); });

function togglePanel(name) {
  if (name && S && S.settings.sidebarRail) send('set', 'sidebarRail', false);  // panels need the full sidebar
  panel = panel === name ? null : name;
  $('#main-panel').hidden = panel !== null;
  $('#settings-panel').hidden = panel !== 'settings';
  $('#downloads-panel').hidden = panel !== 'downloads';
  $('#extensions-panel').hidden = panel !== 'extensions';
  $('#volume-panel').hidden = panel !== 'volume';
  $('#passwords-panel').hidden = panel !== 'passwords';
  if (panel === 'passwords') { send('pw-list'); openPw = null; }
  volKey = '';
  if (panel === 'extensions') send('ext-list');
  render();
}

// Peek: reveal a floating sidebar when the mouse touches the left edge
$('#edge').addEventListener('mouseenter', () => send('overlay', 'peek'));
$('#sidebar').addEventListener('mouseleave', (e) => {
  if (S && S.overlay === 'peek' && !e.relatedTarget) send('overlay', null);
});
document.documentElement.addEventListener('mouseleave', () => { if (S && S.overlay === 'peek') send('overlay', null); });

// Sidebar resizing
$('#resizer').addEventListener('mousedown', (e) => {
  e.preventDefault();
  let raf = 0;
  const move = (ev) => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => send('sidebar-width', ev.clientX)); };
  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
});

// ---------------------------------------------------------------------- command palette
// Bring up an overlay without a flash: the UI layer moves above the page when the overlay
// opens, so first draw the see-through hole over the page area (and hide the page frame),
// wait for that frame to be painted, and only then ask for the layer to come up.
let pendingOverlay = null;
function raiseOverlay(mode) {
  pendingOverlay = { mode, at: Date.now() };
  if (S) S.overlay = mode;
  document.body.classList.add('over-palette');
  applyHole();
  requestAnimationFrame(() => requestAnimationFrame(() => send('overlay', mode)));
}
function openPalette(newTab, anchored) {
  preparePalette(newTab, anchored);
  raiseOverlay('palette');
}
// anchored = drop down from the toolbar address field instead of the centered command bar
function preparePalette(newTab, anchored) {
  paletteNewTab = newTab;
  paletteAnchored = !!anchored && !!(S && S.settings.titleBar) && !(lastLayout && lastLayout.fullscreen);
  const wrap = $('#palette-wrap'), pal = $('#palette');
  wrap.classList.toggle('anchored', paletteAnchored);
  if (paletteAnchored) {
    const r = $('#addr').getBoundingClientRect();
    Object.assign(pal.style, { left: (r.left - 4) + 'px', top: (r.top - 4) + 'px', width: (r.width + 8) + 'px' });
  } else Object.assign(pal.style, { left: '', top: '', width: '' });
  const inp = $('#p-input');
  inp.placeholder = newTab ? 'Search or enter address — opens in a new tab' : 'Search or enter address';
  inp.value = !newTab && S && !isInternal(S.nav.url) ? S.nav.url : '';
  $('#palette-wrap').hidden = false;
  setTimeout(() => { inp.focus(); inp.select(); }, 0);
  updatePalette();
}
function closePalette() { pendingOverlay = null; send('overlay', null); }

function looksLikeUrl(t) {
  return /^(https?|file|drift|about):/i.test(t) || /^localhost(:\d+)?/i.test(t) ||
    (!/\s/.test(t) && /^[^\s/]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(t));
}

let seq = 0;
// Inline autocomplete: after typing (not deleting), the best match from history fills in
// after the caret, selected, so Enter goes there and typing on replaces it.
let typedText = null;      // what the user actually typed while a completion is shown
async function updatePalette(completeInline) {
  const input = $('#p-input');
  const q = input.value.trim();
  const my = ++seq;
  const engine = S ? S.engines[S.settings.searchEngine] : 'the web';
  const baseFor = (text, typed) => {
    const b = [];
    if (text) {
      if (looksLikeUrl(text)) b.push({ kind: 'go', text, title: text, sub: 'Open address' });
      b.push({ kind: 'search', text: typed, title: typed, sub: `Search ${engine}` });
    }
    return b;
  };
  renderPalette(baseFor(q, q), null);
  const r = await window.drift.suggest(q);
  if (my !== seq) return;
  const inline = r && r.inline;
  if (completeInline && inline && input.value === q && input.selectionStart === q.length && inline.toLowerCase().startsWith(q.toLowerCase())) {
    input.value = q + inline.slice(q.length);
    input.setSelectionRange(q.length, input.value.length);
    typedText = q;
    paletteSel = 0;
    renderPalette(baseFor(input.value, q), r);
    return;
  }
  renderPalette(baseFor(q, q), r);
}

function renderPalette(base, r) {
  const items = [...base];
  const groups = [];
  if (r) {
    const tabs = (r.items || []).filter(i => i.kind === 'tab');
    const hist = (r.items || []).filter(i => i.kind === 'history');
    const bms = (r.items || []).filter(i => i.kind === 'bookmark');
    const searches = (r.searches || []).map(s => ({ kind: 'search', text: s, title: s, sub: '' }));
    if (searches.length) items.push(...searches);
    if (tabs.length) { groups.push([items.length, 'Open tabs']); items.push(...tabs.map(t => ({ ...t, kind: 'tab' }))); }
    if (bms.length) { groups.push([items.length, 'Bookmarks']); items.push(...bms); }
    if (hist.length) { groups.push([items.length, base.length ? 'History' : 'Recent']); items.push(...hist); }
  }
  paletteItems = items;
  paletteSel = Math.min(paletteSel, Math.max(0, items.length - 1));
  if (!base.length && paletteSel === 0 && !items.length) paletteSel = 0;
  const html = [];
  items.forEach((it, i) => {
    const g = groups.find(([at]) => at === i); if (g) html.push(`<div class="p-sep">${g[1]}</div>`);
    let ic, title, sub, badge = '';
    if (it.kind === 'go') { ic = icon('globe'); title = it.title; sub = it.sub; }
    else if (it.kind === 'search') { ic = icon('search'); title = it.title; sub = it.sub; }
    else if (it.kind === 'tab') { ic = icon('tab'); title = it.title; sub = hostOf(it.url); badge = 'Switch to tab'; }
    else if (it.kind === 'bookmark') { ic = icon('star'); title = it.title; sub = it.url.replace(/^https?:\/\/(www\.)?/, ''); }
    else { ic = icon('clock'); title = it.title; sub = it.url.replace(/^https?:\/\/(www\.)?/, ''); }
    html.push(`<div class="pr ${i === paletteSel ? 'sel' : ''}" data-i="${i}"><span class="pi">${ic}</span>
      <span class="pt"><b>${esc(title)}</b><span>${esc(sub)}</span></span>${badge ? `<span class="badge">${badge}</span>` : ''}</div>`);
  });
  $('#p-results').innerHTML = html.join('');
  if ($('#p-input').value.trim()) warm(paletteItems[paletteSel]);
}

function runItem(it, forceNew) {
  if (!it) return;
  const newTab = paletteNewTab || forceNew;
  if (it.kind === 'tab') send('switch-to', it.id);
  else if (it.kind === 'go') send('navigate', it.text, newTab);
  else if (it.kind === 'search') send('navigate', '?' + it.text, newTab);
  else send('navigate', it.url, newTab);
}

$('#p-input').addEventListener('input', (e) => {
  paletteSel = 0; typedText = null;
  updatePalette(/^insert(Text|CompositionText)?$/.test(e.inputType || '') && !/\s/.test($('#p-input').value));
});
$('#p-input').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); paletteSel = Math.min(paletteSel + 1, paletteItems.length - 1); highlight(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); paletteSel = Math.max(paletteSel - 1, 0); highlight(); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    const q = $('#p-input').value.trim();
    const it = paletteItems[paletteSel];
    if (!q && !it) { if (paletteNewTab) send('navigate', '', true); closePalette(); return; }
    if (!it) send('navigate', q, paletteNewTab || e.altKey);
    else runItem(it, e.altKey);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    const inp = $('#p-input');
    if (typedText !== null && inp.selectionEnd > inp.selectionStart) { inp.value = typedText; typedText = null; paletteSel = 0; updatePalette(false); return; }
    closePalette();
  }
});
function highlight() {
  document.querySelectorAll('.pr').forEach(el => el.classList.toggle('sel', Number(el.dataset.i) === paletteSel));
  const sel = document.querySelector('.pr.sel'); if (sel) sel.scrollIntoView({ block: 'nearest' });
  warm(paletteItems[paletteSel]);
}
// Open a connection to where the highlighted suggestion or hovered bookmark leads, so the page
// starts loading sooner if it's picked (Chrome does the same).
let warmTimer = 0;
function warm(it) {
  clearTimeout(warmTimer);
  if (!it) return;
  const target = it.kind === 'go' ? it.text : it.kind === 'search' ? '?' + it.text : it.url;
  if (!target || it.kind === 'tab') return;
  warmTimer = setTimeout(() => send('preconnect', target), 80);
}
$('#p-results').addEventListener('mousemove', (e) => {
  const el = e.target.closest('.pr'); if (!el) return;
  const i = Number(el.dataset.i); if (i !== paletteSel) { paletteSel = i; highlight(); }
});
$('#p-results').addEventListener('click', (e) => {
  const el = e.target.closest('.pr'); if (!el) return;
  runItem(paletteItems[Number(el.dataset.i)], e.altKey || e.ctrlKey);
});
$('#palette-wrap').addEventListener('mousedown', (e) => { if (e.target.id === 'palette-wrap') closePalette(); });

// ---------------------------------------------------------------------- find bar
let findTimer;
$('#find-input').addEventListener('input', () => {
  clearTimeout(findTimer);
  findTimer = setTimeout(() => send('find', $('#find-input').value, true, false), 80);
});
$('#find-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); send('find', $('#find-input').value, !e.shiftKey, true); }
  if (e.key === 'Escape') { e.preventDefault(); send('find-close'); }
});
$('#find-next').onclick = () => send('find', $('#find-input').value, true, true);
$('#find-prev').onclick = () => send('find', $('#find-input').value, false, true);
$('#find-close').onclick = () => send('find-close');
function placeFind() {
  const f = $('#findbar');
  f.style.left = content.x + 'px';
  f.style.width = Math.min(460, content.width) + 'px';
  f.style.left = (content.x + content.width - Math.min(460, content.width)) + 'px';
  f.style.top = (content.y - 42) + 'px';
}

// ---------------------------------------------------------------------- settings
const ACCENTS = ['#ff6a3d', '#f43f5e', '#ec4899', '#a855f7', '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#84cc16', '#eab308'];

let rangeHeld = false;
document.addEventListener('pointerup', () => { rangeHeld = false; }, true);
function renderSettings() {
  if (rangeHeld) return;   // don't redraw under a slider that's being dragged
  const s = S.settings;
  const sw = (key, on) => `<button class="switch ${on ? 'on' : ''}" data-set="${key}" data-val="${!on}"></button>`;
  $('#settings-body').innerHTML = `
    <div class="group"><h4>Search</h4>
      <div class="row"><span class="lbl">Search engine</span>
        <select data-sel="searchEngine">${Object.entries(S.engines).map(([k, n]) => `<option value="${k}" ${k === s.searchEngine ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="row"><span class="lbl">Search suggestions<small>From DuckDuckGo as you type</small></span>${sw('suggestions', s.suggestions)}</div>
    </div>
    <div class="group"><h4>Appearance</h4>
      <div class="row"><span class="lbl">Theme</span><div class="seg">
        ${['system', 'dark', 'light'].map(t => `<button class="${s.theme === t ? 'on' : ''}" data-set="theme" data-val="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></div>
      <div class="row"><span class="lbl">Top toolbar<small>Address bar, window buttons and a drag area at the top</small></span>${sw('titleBar', s.titleBar)}</div>
      <div class="row"><span class="lbl">Bookmarks bar<small>${s.titleBar ? 'Under the address bar' : 'Needs the top toolbar'} · Ctrl+Shift+B</small></span>${sw('bookmarksBar', s.bookmarksBar)}</div>
      <div class="row"><span class="lbl">Icon-only sidebar<small>Or drag the sidebar's edge all the way in</small></span>${sw('sidebarRail', s.sidebarRail)}</div>
      <div class="row"><span class="lbl">Force dark pages<small>Darkens sites that don't have a dark theme. Turn it off for one site with the moon in the address bar.</small></span>${sw('forceDark', s.forceDark)}</div>
      ${s.forceDark && s.forceDarkOff.length ? `<div class="row" style="display:block"><span class="lbl">Force dark off on<small>Click × to darken these sites again</small></span>
        <div class="chips">${s.forceDarkOff.map(h => `<span class="chip">${esc(h)}<button data-undark="${esc(h)}">${icon('x', 11)}</button></span>`).join('')}</div></div>` : ''}
      <div class="row" style="display:block"><span class="lbl">Wallpaper<small>Shows behind the sidebar and toolbar${s.wallpaperNewTab ? ' and on new tabs' : ''}</small></span>
        <div class="wp-grid">
          <button class="wp-sw none ${!s.wallpaper ? 'on' : ''}" data-wp="" title="No wallpaper (accent glow)">None</button>
          ${S.wallpapers.map(w => `<button class="wp-sw ${s.wallpaper === 'builtin:' + w.id ? 'on' : ''}" data-wp="builtin:${w.id}" title="${esc(w.name)}" style="background:${w.css}"><span class="n">${esc(w.name)}</span></button>`).join('')}
          ${s.wallpaper.startsWith('file:') ? `<button class="wp-sw on" data-wp="${esc(s.wallpaper)}" title="Your image" style="background:${S.wallpaperCss}"><span class="n">Your image</span></button>` : ''}
          <button class="wp-sw add" id="wp-choose" title="Use an image from your PC">${icon('image', 18)}</button>
          ${S.desktopWallpaper ? `<button class="wp-sw add" id="wp-desktop" title="Use your Windows desktop wallpaper">${icon('desktop', 18)}</button>` : ''}
        </div></div>
      ${s.wallpaper ? `
      <div class="row" style="display:block"><span class="lbl">Dim</span>
        <div class="range-row"><input type="range" min="0" max="85" step="5" value="${Math.round(s.wallpaperDim * 100)}" data-range="wallpaperDim" data-scale="100"><span class="val">${Math.round(s.wallpaperDim * 100)}%</span></div></div>
      <div class="row" style="display:block"><span class="lbl">Blur</span>
        <div class="range-row"><input type="range" min="0" max="40" step="2" value="${s.wallpaperBlur}" data-range="wallpaperBlur" data-scale="1"><span class="val">${s.wallpaperBlur}px</span></div></div>
      <div class="row"><span class="lbl">Show on new tab page</span>${sw('wallpaperNewTab', s.wallpaperNewTab)}</div>` : ''}
      <div class="row" style="flex-wrap:wrap"><span class="lbl">Accent color</span>
        <div class="swatches">${ACCENTS.map(c => `<button class="sw ${c === s.accent ? 'on' : ''}" style="background:${c};color:${c}" data-set="accent" data-val="${c}"></button>`).join('')}</div></div>
    </div>
    <div class="group"><h4>Shields</h4>
      <div class="row"><span class="lbl">Block ads & trackers<small>${s.shieldsEngine === 'ubo' ? 'Click the shield in the address bar for per-site controls' : S.blockedTotal.toLocaleString() + ' blocked this session'}</small></span>${sw('shields', s.shields)}</div>
      <div class="row"><span class="lbl">Blocker<small>${s.shieldsEngine === 'ubo' ? 'uBlock Origin (built in): strongest blocking, works with extensions that watch network traffic' : 'Built-in: lighter on memory, but extensions that watch network traffic stop working'}</small></span>
        <div class="seg"><button class="${s.shieldsEngine === 'ubo' ? 'on' : ''}" data-set="shieldsEngine" data-val="ubo">uBlock</button><button class="${s.shieldsEngine !== 'ubo' ? 'on' : ''}" data-set="shieldsEngine" data-val="builtin">Built-in</button></div></div>
      ${S.uboId ? `<div class="row"><span class="lbl">uBlock Origin dashboard<small>Filter lists, custom rules, whitelist</small></span><button class="mini" data-uboopts>Open</button></div>` : ''}
      ${s.shieldsAllow.length ? `<div class="row" style="display:block"><span class="lbl">Shields off on<small>Click × to turn shields back on</small></span>
        <div class="chips">${s.shieldsAllow.map(h => `<span class="chip">${esc(h)}<button data-unallow="${esc(h)}">${icon('x', 11)}</button></span>`).join('')}</div></div>` : ''}
    </div>
    <div class="group"><h4>Tabs & memory</h4>
      <div class="row"><span class="lbl">Reopen tabs on startup</span>${sw('restoreTabs', s.restoreTabs)}</div>
      <div class="row"><span class="lbl">Sleep inactive tabs<small>Frees memory; tabs reload when you open them</small></span>${sw('sleepTabs', s.sleepTabs)}</div>
      ${s.sleepTabs ? `<div class="row"><span class="lbl">Sleep after</span><select data-sel="sleepMinutes" data-num>
        ${[5, 10, 20, 30, 60, 120].map(m => `<option value="${m}" ${m === s.sleepMinutes ? 'selected' : ''}>${m < 60 ? m + ' min' : m / 60 + ' hr'}</option>`).join('')}</select></div>` : ''}
    </div>
    <div class="group"><h4>Passwords</h4>
      <div class="row"><span class="lbl">Saved passwords<small>${S.passwordCount} saved · ${S.passwordsEncrypted ? 'encrypted with your Windows account' : 'encryption unavailable on this system'}</small></span><button class="mini" id="pw-manage">Manage</button></div>
      <div class="row"><span class="lbl">Offer to save passwords</span>${sw('offerPasswords', s.offerPasswords)}</div>
      <div class="row"><span class="lbl">Import passwords<small>CSV from Chrome, Edge, Firefox, Bitwarden and others</small></span><button class="mini" id="pw-import">Choose file</button></div>
      <div class="row"><span class="lbl">Export passwords<small>Saves an unencrypted .csv</small></span><button class="mini" id="pw-export">Export</button></div>
    </div>
    <div class="group"><h4>Bookmarks</h4>
      <div class="row" style="display:block"><span class="lbl">Import from a browser on this PC</span>
        <div class="src-btns">${(bmSources || []).map(n => `<button data-bmsrc="${esc(n)}">${esc(n)}</button>`).join('') || '<small style="color:var(--muted)">No other browsers found</small>'}</div></div>
      <div class="row"><span class="lbl">Import from file<small>bookmarks.html from any browser</small></span><button class="mini" data-bmsrc="file">Choose file</button></div>
      <div class="row"><span class="lbl">Export bookmarks<small>As a bookmarks.html file</small></span><button class="mini" id="bm-export">Export</button></div>
    </div>
    <div class="group"><h4>Privacy</h4>
      <button class="btn danger" id="clear-data">Clear browsing data…</button>
    </div>
    <div class="group"><h4>Keyboard shortcuts</h4><div class="kbd-list">
      <div><span>Command bar / new tab</span><span><kbd>Ctrl</kbd><kbd>T</kbd></span></div>
      <div><span>Edit address</span><span><kbd>Ctrl</kbd><kbd>L</kbd></span></div>
      <div><span>Close tab</span><span><kbd>Ctrl</kbd><kbd>W</kbd></span></div>
      <div><span>Reopen closed tab</span><span><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>T</kbd></span></div>
      <div><span>Next / previous tab</span><span><kbd>Ctrl</kbd><kbd>Tab</kbd></span></div>
      <div><span>Jump to tab 1–9</span><span><kbd>Ctrl</kbd><kbd>1</kbd>…<kbd>9</kbd></span></div>
      <div><span>Find on page</span><span><kbd>Ctrl</kbd><kbd>F</kbd></span></div>
      <div><span>Hide / show sidebar</span><span><kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>S</kbd></span></div>
      <div><span>Bookmark page</span><span><kbd>Ctrl</kbd><kbd>D</kbd></span></div>
      <div><span>Show bookmarks bar</span><span><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>B</kbd></span></div>
      <div><span>Zoom</span><span><kbd>Ctrl</kbd><kbd>+</kbd> <kbd>−</kbd> <kbd>0</kbd></span></div>
      <div><span>Developer tools</span><span><kbd>F12</kbd></span></div>
    </div></div>
    <div class="group"><h4>About</h4>
      <div class="row"><span class="lbl">Drift ${esc(S.appVersion)}<small>${({
          checking: 'Checking for updates…',
          downloading: `Downloading ${esc(S.update.version)}… ${S.update.percent ? S.update.percent + '%' : ''}`,
          ready: `Version ${esc(S.update.version)} is ready to install`,
          none: "You're up to date",
          error: `Couldn't update (${esc(S.update.why || 'unexpected error')}) — try again`,
          portable: 'Portable version — install Drift to get automatic updates' })[S.update.status] || 'Updates download automatically'} · Chromium ${esc(S.chrome || '')}</small></span>
        ${S.update.status === 'ready' ? `<button class="mini accent" id="upd-install">Restart to update</button>`
          : S.update.status === 'checking' || S.update.status === 'downloading' ? `<button class="mini" disabled>${S.update.status === 'checking' ? 'Checking…' : 'Downloading…'}</button>`
          : S.update.status !== 'portable' ? `<button class="mini" id="upd-check">Check for updates</button>` : ''}</div>
    </div>`;
}
$('#settings-body').addEventListener('click', (e) => {
  const b = e.target.closest('[data-set]');
  if (b) {
    let v = b.dataset.val;
    if (v === 'true' || v === 'false') v = v === 'true';
    send('set', b.dataset.set, v);
  }
  const u = e.target.closest('[data-unallow]'); if (u) send('remove-allow', u.dataset.unallow);
  const ud = e.target.closest('[data-undark]'); if (ud) send('undark', ud.dataset.undark);
  const src = e.target.closest('[data-bmsrc]'); if (src) send('bm-import', src.dataset.bmsrc);
  if (e.target.id === 'clear-data') send('clear-data');
  if (e.target.id === 'upd-check') send('update-check');
  if (e.target.id === 'upd-install') send('update-install');
  if (e.target.closest('[data-uboopts]')) send('ext-options', S.uboId);
  if (e.target.id === 'pw-manage') togglePanel('passwords');
  if (e.target.id === 'pw-import') send('pw-import');
  if (e.target.id === 'pw-export') send('pw-export');
  if (e.target.id === 'bm-export') send('bm-export');
  const wpb = e.target.closest('[data-wp]'); if (wpb) send('set', 'wallpaper', wpb.dataset.wp);
  if (e.target.closest('#wp-choose')) send('wp-choose');
  if (e.target.closest('#wp-desktop')) send('wp-desktop');
});
// Wallpaper sliders preview live while dragging and save when released.
$('#settings-body').addEventListener('pointerdown', (e) => { if (e.target.closest('[data-range]')) rangeHeld = true; });
$('#settings-body').addEventListener('input', (e) => {
  const r = e.target.closest('[data-range]'); if (!r) return;
  const v = Number(r.value) / Number(r.dataset.scale);
  r.nextElementSibling.textContent = r.dataset.range === 'wallpaperBlur' ? r.value + 'px' : r.value + '%';
  if (r.dataset.range === 'wallpaperDim') document.documentElement.style.setProperty('--wp-dim', String(v));
  if (r.dataset.range === 'wallpaperBlur') { const wp = $('#wp'); wp.style.filter = v ? `blur(${v}px)` : ''; wp.style.inset = v ? `-${v * 2}px` : '0'; }
});
$('#settings-body').addEventListener('change', (e) => {
  const r = e.target.closest('[data-range]');
  if (r) { send('set', r.dataset.range, Number(r.value) / Number(r.dataset.scale)); return; }
  const s = e.target.closest('[data-sel]'); if (!s) return;
  send('set', s.dataset.sel, 'num' in s.dataset ? Number(s.value) : s.value);
});

// ---------------------------------------------------------------------- downloads
function fmtBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
  while (n >= 1024 && i < 3) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}
// The toolbar button (shown while downloading, and until you've seen a finished download) and
// the sidebar button both get a progress ring and a dot: pulsing while downloading, green when done.
let dlLastCount = 0;
function renderDownloadIndicators() {
  const ds = S.downloads || [];
  const active = ds.filter(d => d.state === 'progressing');
  const unseen = ds.some(d => !d.seen && d.state === 'completed');
  const known = active.filter(d => d.total > 0);
  const pct = known.length ? Math.round(known.reduce((a, d) => a + d.received, 0) / known.reduce((a, d) => a + d.total, 0) * 100) : 0;
  const tb = $('#tb-dl');
  // Stays in the toolbar once anything has been downloaded this session.
  const show = ds.length > 0 || (S && S.overlay === 'dlmenu');
  if (show && tb.hidden) { tb.classList.remove('dl-new'); void tb.offsetWidth; tb.classList.add('dl-new'); }
  tb.hidden = !show;
  for (const [btn, dot] of [[tb, $('#tb-dl-dot')], [$('#btn-downloads'), $('#dl-dot')]]) {
    btn.classList.toggle('dl-active', active.length > 0);
    btn.classList.toggle('dl-unknown', active.length > 0 && !known.length);
    btn.style.setProperty('--p', String(pct));
    // Toolbar: the ring shows progress, the dot means "finished, not looked at yet".
    dot.hidden = btn === tb ? !(unseen && !active.length) : !(active.length || unseen);
    dot.className = 'dot ' + (active.length ? 'active' : 'done');
  }
  const title = active.length ? `Downloading ${active.length === 1 ? active[0].name : active.length + ' files'}${known.length ? ` · ${pct}%` : ''}` : unseen ? 'Download finished' : 'Downloads';
  tb.title = title; $('#btn-downloads').title = title;
  if (ds.length !== dlLastCount) { dlLastCount = ds.length; }
  // Live progress notice over the page while anything downloads (in the window it started in).
  const mine = active.filter(d => !d.wid || d.wid === S.windowId);
  if (mine.length) {
    const active = mine, known = mine.filter(d => d.total > 0);
    const pct = known.length ? Math.round(known.reduce((a, d) => a + d.received, 0) / known.reduce((a, d) => a + d.total, 0) * 100) : 0;
    const name = active.length === 1 ? active[0].name : `${active.length} files`;
    const sizes = known.length ? ` · ${pct}%` : '';
    const html = `${icon('download')}<span class="t-dl"><span class="t-name">Downloading ${esc(name)}${sizes}</span>`
      + `<i class="t-bar ${known.length ? '' : 'busy'}"><b style="width:${known.length ? pct : 30}%"></b></i></span>`;
    if (html !== dlToastHtml) { dlToastHtml = html; toast(html, 20000, [{ label: 'Show', run: () => openDlMenu() }]); }
  } else dlToastHtml = '';
}
let dlToastHtml = '';
function dlRows(ds) {
  return ds.map(d => {
      const pct = d.total ? Math.round(d.received / d.total * 100) : 0;
      const sub = d.state === 'progressing' ? `${fmtBytes(d.received)}${d.total ? ' of ' + fmtBytes(d.total) + ` · ${pct}%` : ''}`
        : d.state === 'completed' ? fmtBytes(d.received) : d.state === 'cancelled' ? 'Cancelled' : 'Failed';
      return `<div class="dl ${d.state === 'completed' ? 'done' : ''}" data-dl="${d.id}">
        <span class="ic">${icon('file', 18)}</span>
        <div class="meta"><div class="name" data-open title="${d.state === 'completed' ? 'Open' : ''}">${esc(d.name)}</div><div class="sub">${sub}</div>
          ${d.state === 'progressing' ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}</div>
        ${d.state === 'progressing' ? `<button class="ib" data-cancel title="Cancel">${icon('x', 14)}</button>`
          : d.state === 'completed' ? `<button class="ib" data-show title="Show in folder">${icon('folder', 15)}</button>` : ''}
      </div>`;
  }).join('');
}
function renderDlMenu() {
  const ds = (S.downloads || []).slice(0, 6);
  $('#dlmenu-list').innerHTML = ds.length ? dlRows(ds) : `<div class="empty">No downloads yet</div>`;
}
function openDlMenu() {
  const r = $('#tb-dl').getBoundingClientRect(), m = $('#dlmenu');
  renderDlMenu();
  m.style.left = Math.max(8, Math.min(window.innerWidth - 338, r.right - 330)) + 'px';
  m.style.top = (r.bottom + 6) + 'px';
  $('#dlmenu-wrap').hidden = false;
  raiseOverlay('dlmenu');
  send('downloads-seen');
  setTimeout(() => m.focus({ preventScroll: true }), 0);
}
function closeDlMenu() { pendingOverlay = null; $('#dlmenu-wrap').hidden = true; if (S && S.overlay === 'dlmenu') send('overlay', null); }
$('#tb-dl').addEventListener('click', () => { if (S && S.overlay === 'dlmenu') closeDlMenu(); else openDlMenu(); });
$('#dlmenu-wrap').addEventListener('mousedown', (e) => { if (e.target.id === 'dlmenu-wrap') closeDlMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S && S.overlay === 'dlmenu') closeDlMenu(); });
$('#dlmenu-all').addEventListener('click', () => { closeDlMenu(); if (panel !== 'downloads') togglePanel('downloads'); });
$('#dlmenu-list').addEventListener('click', (e) => {
  const row = e.target.closest('[data-dl]'); if (!row) return;
  const id = Number(row.dataset.dl);
  if (e.target.closest('[data-cancel]')) send('cancel-download', id);
  else if (e.target.closest('[data-show]')) { send('show-download', id); closeDlMenu(); }
  else if (row.classList.contains('done')) { send('open-download', id); closeDlMenu(); }
});

function renderDownloads() {
  const ds = S.downloads;
  $('#downloads-body').innerHTML = !ds.length ? `<div class="empty">${icon('download', 22)}<br>Files you download appear here.</div>` :
    ds.map(d => {
      const pct = d.total ? Math.round(d.received / d.total * 100) : 0;
      const sub = d.state === 'progressing' ? `${fmtBytes(d.received)}${d.total ? ' of ' + fmtBytes(d.total) : ''}`
        : d.state === 'completed' ? fmtBytes(d.received) : d.state === 'cancelled' ? 'Cancelled' : 'Failed';
      return `<div class="dl ${d.state === 'completed' ? 'done' : ''}" data-dl="${d.id}">
        <span class="ic">${icon('file', 18)}</span>
        <div class="meta"><div class="name" data-open>${esc(d.name)}</div><div class="sub">${sub}</div>
          ${d.state === 'progressing' ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}</div>
        ${d.state === 'progressing' ? `<button class="ib" data-cancel title="Cancel">${icon('x', 14)}</button>`
          : d.state === 'completed' ? `<button class="ib" data-show title="Show in folder">${icon('folder', 15)}</button>` : ''}
      </div>`;
    }).join('') + `<button class="link" id="dl-clear" style="margin-top:6px">Clear list</button>`;
}
$('#downloads-body').addEventListener('click', (e) => {
  if (e.target.id === 'dl-clear') return send('clear-downloads');
  const row = e.target.closest('[data-dl]'); if (!row) return;
  const id = Number(row.dataset.dl);
  if (e.target.closest('[data-cancel]')) send('cancel-download', id);
  else if (e.target.closest('[data-show]')) send('show-download', id);
  else if (e.target.closest('[data-open]') && row.classList.contains('done')) send('open-download', id);
});

// ---------------------------------------------------------------------- extensions
// The extension buttons come from <browser-action-list> (electron-chrome-extensions).
// We point it at the active tab and hide the ones the user tucked away.
// Only pinned extensions sit in the toolbar; the puzzle button lists all of them.
function syncActions() {
  for (const list of [$('#actions'), $('#actions-all')]) {
    if (S && list.getAttribute('tab') !== String(S.activeWcId)) list.setAttribute('tab', String(S.activeWcId));
  }
  const withButtons = EXT.filter(e => e.hasAction && !e.builtin);
  $('#ext-bar').hidden = withButtons.length === 0 || panel === 'extensions';
  $('#ext-menu-btn').hidden = withButtons.length === 0;
  applyHiddenActions();
  if (S && S.overlay === 'extmenu') renderExtMenu();
}
function applyHiddenActions() {
  const root = $('#actions').shadowRoot;
  if (root) {
    const hidden = new Set(EXT.filter(e => e.hidden || e.builtin).map(e => e.id));
    root.querySelectorAll('.action').forEach(b => { b.style.display = hidden.has(b.id) ? 'none' : ''; });
  }
  const all = $('#actions-all').shadowRoot;
  if (all) {
    const builtin = new Set(EXT.filter(e => e.builtin).map(e => e.id));
    all.querySelectorAll('.action').forEach(b => { b.style.display = builtin.has(b.id) ? 'none' : ''; });
  }
}
customElements.whenDefined('browser-action-list').then(() => {
  for (const id of ['#actions', '#actions-all']) {
    const root = $(id).shadowRoot;
    if (root) new MutationObserver(() => { applyHiddenActions(); if (S && S.overlay === 'extmenu') renderExtMenu(); }).observe(root, { childList: true });
  }
});

// Rows line up with the buttons of the second <browser-action-list>, which opens the popups.
function extMenuButtons() {
  const root = $('#actions-all').shadowRoot; if (!root) return [];
  return [...root.querySelectorAll('.action')].filter(b => b.style.display !== 'none');
}
function renderExtMenu() {
  const btns = extMenuButtons();
  $('#em-rows').innerHTML = btns.map(b => {
    const e = EXT.find(x => x.id === b.id) || { name: b.id, hidden: true };
    return `<div class="em-row" data-ext="${esc(b.id)}" title="${esc(e.name)}"><span>${esc(e.name)}</span>
      <button class="em-pin ${e.hidden ? '' : 'on'}" data-pin title="${e.hidden ? 'Pin to toolbar' : 'Unpin from toolbar'}">${icon('pin', 15)}</button></div>`;
  }).join('');
  $('#em-empty').hidden = btns.length > 0;
}
function openExtMenu() {
  const r = $('#ext-menu-btn').getBoundingClientRect();
  const m = $('#extmenu');
  $('#extmenu-wrap').hidden = false;
  renderExtMenu();
  const left = Math.max(8, Math.min(window.innerWidth - 308, r.right - 300));
  m.style.left = left + 'px'; m.style.top = (r.bottom + 6) + 'px';
  m.tabIndex = -1;
  raiseOverlay('extmenu');
  setTimeout(() => m.focus({ preventScroll: true }), 0);
}
function closeExtMenu(keepFocus) { pendingOverlay = null; $('#extmenu-wrap').hidden = true; if (S && S.overlay === 'extmenu') send('overlay', null, !!keepFocus); }
$('#ext-menu-btn').addEventListener('click', () => { if (S && S.overlay === 'extmenu') closeExtMenu(); else openExtMenu(); });
$('#extmenu-wrap').addEventListener('mousedown', (e) => { if (e.target.id === 'extmenu-wrap') closeExtMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S && S.overlay === 'extmenu') closeExtMenu(); });
$('#em-manage').addEventListener('click', () => { closeExtMenu(); if (panel !== 'extensions') togglePanel('extensions'); });
$('#em-rows').addEventListener('click', (e) => {
  const row = e.target.closest('[data-ext]'); if (!row) return;
  const id = row.dataset.ext;
  if (e.target.closest('[data-pin]')) { const x = EXT.find(z => z.id === id); send('ext-visible', id, !x || x.hidden); return; }
  const btn = extMenuButtons().find(b => b.id === id);
  if (btn) { btn.click(); setTimeout(() => closeExtMenu(true), 50); }
});
$('#em-rows').addEventListener('mouseover', (e) => {
  const row = e.target.closest('[data-ext]');
  document.querySelectorAll('.em-row.hover').forEach(x => x.classList.remove('hover'));
  if (row) row.classList.add('hover');
});
// Clicking an icon in the menu opens its popup too; close the menu after.
$('#actions-all').addEventListener('click', () => setTimeout(() => closeExtMenu(true), 50));

function renderExtensions() {
  const body = $('#extensions-body');
  const rows = EXT.map(e => `
    <div class="ext" data-ext="${esc(e.id)}" title="${esc(e.description)}">
      <img src="crx://extension-icon/${esc(e.id)}/32/2?partition=_self" alt="">
      <div class="meta"><div class="name">${esc(e.name)}</div><div class="sub">${e.builtin ? 'Built in · Shields · ' : e.unpacked ? 'Unpacked · ' : ''}${esc(e.version)}</div></div>
      ${e.hasAction && !e.builtin ? `<button class="ib ${e.hidden ? 'off' : 'on'}" data-act="vis" title="${e.hidden ? 'Pin button to toolbar' : 'Unpin button from toolbar'}">${icon('pin', 15)}</button>` : ''}
      ${e.options ? `<button class="ib" data-act="opt" title="Options">${icon('gear', 15)}</button>` : ''}
      ${e.builtin ? '' : `<button class="ib" data-act="rm" title="Remove">${icon('trash', 15)}</button>`}
    </div>`).join('');
  body.innerHTML = (rows || `<div class="empty">${icon('puzzle', 22)}<br>No extensions yet.<br>Click <b>Get extensions</b> to browse the Chrome Web Store, then press <b>Add to Chrome</b>.</div>`) + `
    <button class="btn" id="ext-unpacked" style="margin-top:8px">Load unpacked extension…</button>
    <div class="note">Ad blocking is built in (<b>Shields</b>), so ad-blocker extensions aren't needed and may not work here.</div>`;
}
$('#extensions-body').addEventListener('click', (e) => {
  if (e.target.closest('#ext-unpacked')) return send('ext-unpacked');
  const row = e.target.closest('[data-ext]'); const act = e.target.closest('[data-act]');
  if (!row || !act) return;
  const id = row.dataset.ext;
  if (act.dataset.act === 'rm') send('ext-remove', id);
  if (act.dataset.act === 'opt') send('ext-options', id);
  if (act.dataset.act === 'vis') { const x = EXT.find(z => z.id === id); send('ext-visible', id, x.hidden); }
});

// ---------------------------------------------------------------------- volume mixer
// Slider runs 0–300%. The first two thirds of the track cover 0–100% so normal
// adjustments get most of the travel; the last third is boost up to 300%.
const toSlider = (v) => v <= 1 ? v * 200 : 200 + (v - 1) * 50;     // 0..300
const fromSlider = (x) => x <= 200 ? x / 200 : 1 + (x - 200) / 50;  // -> 0..3
let volKey = '';
let draggingVol = null;

function renderVolume() {
  const list = S.tabs.filter(t => t.hadAudio || t.audible || t.volume !== 1);
  const key = list.map(t => `${t.id}:${t.muted}:${t.audible}:${t.title}:${t.id === S.activeId}`).join('|');
  const body = $('#volume-body');
  if (key !== volKey) {
    volKey = key;
    body.innerHTML = !list.length ? `<div class="empty">${icon('sound', 22)}<br>Tabs that play sound show up here.<br>Drag a slider to make one quieter or louder.</div>` :
      list.map(t => `
      <div class="vol ${t.muted ? 'muted' : ''} ${t.id === S.activeId ? 'active-tab' : ''}" data-vol="${t.id}">
        <div class="top">
          ${favHTML(t)}
          <span class="name" data-act="go" title="Go to tab">${esc(tabTitle(t))}</span>
          <span class="pct" data-act="reset" title="Click to reset to 100%"></span>
          <button class="ib ${t.audible && !t.muted ? 'on' : ''}" data-act="mute" title="${t.muted ? 'Unmute' : 'Mute'}">${icon(t.muted ? 'muted' : 'sound', 15)}</button>
        </div>
        <div class="slider"><input type="range" min="0" max="300" step="2"></div>
        <div class="marks"><span style="left:0;transform:none">0</span><span style="left:66.67%">100%</span><span style="right:0;transform:none">300%</span></div>
      </div>`).join('') + `<div class="note">Scroll on a tab's speaker icon to adjust it quickly. Over 100% boosts quiet streams.</div>`;
  }
  for (const t of list) {
    const row = body.querySelector(`[data-vol="${t.id}"]`); if (!row) continue;
    const r = row.querySelector('input');
    if (draggingVol !== t.id) r.value = toSlider(t.volume);
    paintVol(row, draggingVol === t.id ? fromSlider(Number(r.value)) : t.volume);
  }
}
function paintVol(row, v) {
  const r = row.querySelector('input');
  r.style.setProperty('--fill', (toSlider(v) / 3) + '%');
  const pct = row.querySelector('.pct');
  pct.textContent = Math.round(v * 100) + '%';
  pct.classList.toggle('boost', v > 1.001);
}
let volRaf = 0;
$('#volume-body').addEventListener('input', (e) => {
  if (e.target.type !== 'range') return;
  const row = e.target.closest('[data-vol]'); const id = Number(row.dataset.vol);
  let v = fromSlider(Number(e.target.value));
  if (Math.abs(v - 1) < 0.03) { v = 1; }            // gentle snap to 100%
  draggingVol = id; paintVol(row, v);
  cancelAnimationFrame(volRaf); volRaf = requestAnimationFrame(() => send('tab-volume', id, v));
});
$('#volume-body').addEventListener('change', () => { draggingVol = null; });
$('#volume-body').addEventListener('pointerup', () => { draggingVol = null; });
$('#volume-body').addEventListener('click', (e) => {
  const row = e.target.closest('[data-vol]'); const act = e.target.closest('[data-act]');
  if (!row || !act) return;
  const id = Number(row.dataset.vol);
  if (act.dataset.act === 'mute') send('toggle-mute', id);
  if (act.dataset.act === 'reset') send('tab-volume', id, 1);
  if (act.dataset.act === 'go') send('activate', id);
});

// Scroll over a tab's speaker icon: ±10% per notch.
function wheelVolume(e) {
  const btn = e.target.closest('.audio'); if (!btn) return;
  const el = e.target.closest('[data-id]'); if (!el) return;
  e.preventDefault();
  const t = S.tabs.find(x => x.id === Number(el.dataset.id)); if (!t) return;
  const step = e.deltaY < 0 ? 0.1 : -0.1;
  const v = Math.max(0, Math.min(3, Math.round((t.volume + step) * 10) / 10));
  send('tab-volume', t.id, v);
  toast(`${icon('sound')}<span>${esc(tabTitle(t))} — ${Math.round(v * 100)}%</span>`);
}
$('#tablist').addEventListener('wheel', wheelVolume, { passive: false });
$('#essentials').addEventListener('wheel', wheelVolume, { passive: false });

// ---------------------------------------------------------------------- bookmarks bar
function findBm(id, list = BM) {
  for (const it of list) {
    if (it.id === id) return it;
    if (it.type === 'folder') { const f = findBm(id, it.children); if (f) return f; }
  }
  return null;
}
function bmIcon(it) {
  if (it.type === 'folder') return icon('folder', 14);
  return favHTML({ url: it.url, favicon: it.icon }, 14);
}
let bmPending = false;
function renderBookmarks() {
  if (bmDrag != null || dragId != null) { bmPending = true; return; }
  bmPending = false;
  const box = $('#bm-items');
  box.innerHTML = BM.length ? BM.map(it => `
    <button class="bm ${it.type === 'folder' ? 'folder' : ''}" data-bm="${esc(it.id)}" draggable="true" title="${esc(it.type === 'folder' ? it.title : (it.title ? it.title + '\n' : '') + it.url)}">
      ${bmIcon(it)}${it.title ? `<span>${esc(it.title)}</span>` : ''}${it.type === 'folder' ? `<span style="display:flex;opacity:.6">${icon('chev', 12)}</span>` : ''}
    </button>`).join('')
    : `<span class="bm-hint">Bookmark pages with the ☆ in the address bar or Ctrl+D<button id="bm-import-hint">Import bookmarks</button></span>`;
  const hint = $('#bm-import-hint');
  if (hint) hint.onclick = async () => { await openSettingsAt(); };
  layoutBookmarks();
}
async function openSettingsAt() {
  if (panel !== 'settings') togglePanel('settings');
  if (bmSources === null) { bmSources = await window.drift.invoke('bm-sources') || []; renderSettings(); }
}
// Hide items that don't fit and list them behind the » button.
function layoutBookmarks() {
  const box = $('#bm-items'), more = $('#bm-more');
  const items = [...box.querySelectorAll('.bm')];
  items.forEach(b => b.style.display = '');
  more.hidden = true;
  if (!items.length) return;
  const limit = box.getBoundingClientRect().right;
  let overflow = items.filter(b => b.getBoundingClientRect().right > limit + 0.5);
  if (overflow.length) {
    more.hidden = false;
    const limit2 = box.getBoundingClientRect().right;
    overflow = items.filter(b => b.getBoundingClientRect().right > limit2 + 0.5);
    overflow.forEach(b => b.style.display = 'none');
  }
  more.innerHTML = icon('more', 14);
  more.dataset.ids = JSON.stringify(overflow.map(b => b.dataset.bm));
}
window.addEventListener('resize', () => layoutBookmarks());
$('#bm-more').onclick = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  const items = JSON.parse(e.currentTarget.dataset.ids || '[]').map(id => findBm(id)).filter(Boolean);
  openBmPopup(items, r.right - 260, r.bottom + 4, null);
};
$('#bm-items').addEventListener('mouseover', (e) => {
  const b = e.target.closest('[data-bm]'); if (!b) return;
  const it = findBm(b.dataset.bm); if (it && it.type !== 'folder') warm({ url: it.url });
});
$('#bm-items').addEventListener('click', (e) => {
  const b = e.target.closest('[data-bm]'); if (!b) return;
  const it = findBm(b.dataset.bm); if (!it) return;
  if (it.type === 'folder') { const r = b.getBoundingClientRect(); openBmPopup(it.children, r.left, r.bottom + 4, it); }
  else send('bm-open', it.id, e.ctrlKey || e.metaKey || e.shiftKey);
});
// Middle-click (scroll-wheel click) opens a bookmark in a background tab, or a folder's
// bookmarks all at once. Pressing the wheel would otherwise start autoscroll on Windows,
// which swallows the click.
$('#bm-items').addEventListener('mousedown', (e) => { if (e.button === 1 && e.target.closest('[data-bm]')) e.preventDefault(); });
$('#bm-items').addEventListener('auxclick', (e) => {
  const b = e.target.closest('[data-bm]'); if (!b || e.button !== 1) return;
  e.preventDefault(); send('bm-open-background', b.dataset.bm);
});
$('#bmbar').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const b = e.target.closest('[data-bm]');
  if (b) send('bm-menu', b.dataset.bm); else send('bm-bar-menu');
});
// Drag to reorder bookmarks, or drop a tab from the sidebar to bookmark it.
let bmDrag = null;
$('#bm-items').addEventListener('dragstart', (e) => {
  const b = e.target.closest('[data-bm]'); if (!b) return;
  bmDrag = b.dataset.bm; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', bmDrag);
  requestAnimationFrame(() => b.classList.add('dragging'));
});
$('#bm-items').addEventListener('dragend', () => { bmDrag = null; document.querySelectorAll('.bm.dragging').forEach(x => x.classList.remove('dragging')); clearBmDrop(); if (bmPending) renderBookmarks(); });
function clearBmDrop() { document.querySelectorAll('.bm-drop').forEach(x => x.remove()); document.querySelectorAll('.bm.drop-into').forEach(x => x.classList.remove('drop-into')); $('#bmbar').classList.remove('drop-target'); }
function bmDropIndex(x) {
  const items = [...$('#bm-items').querySelectorAll('.bm')].filter(b => b.style.display !== 'none' && b.dataset.bm !== bmDrag);
  const i = items.findIndex(b => { const r = b.getBoundingClientRect(); return x < r.left + r.width / 2; });
  return { items, before: i < 0 ? null : items[i] };
}
// Over the middle of a folder, a drop goes into the folder; elsewhere it reorders the bar.
function bmFolderUnder(e) {
  const f = e.target.closest && e.target.closest('.bm.folder');
  if (!f || f.dataset.bm === bmDrag) return null;
  const r = f.getBoundingClientRect();
  return e.clientX > r.left + r.width * 0.2 && e.clientX < r.right - r.width * 0.2 ? f : null;
}
$('#bmbar').addEventListener('dragover', (e) => {
  if (bmDrag == null && dragId == null) return;
  e.preventDefault();
  clearBmDrop();
  if (dragId != null) $('#bmbar').classList.add('drop-target');
  const folder = bmFolderUnder(e);
  if (folder) { folder.classList.add('drop-into'); return; }
  const { before } = bmDropIndex(e.clientX);
  const line = document.createElement('i'); line.className = 'bm-drop';
  before ? before.before(line) : $('#bm-items').append(line);
});
$('#bmbar').addEventListener('dragleave', (e) => { if (!e.relatedTarget || !$('#bmbar').contains(e.relatedTarget)) clearBmDrop(); });
$('#bmbar').addEventListener('drop', (e) => {
  e.preventDefault();
  const folder = bmFolderUnder(e);
  if (folder) {
    if (bmDrag != null) send('bm-move-into', bmDrag, folder.dataset.bm);
    else if (dragId != null) send('bm-add-tab-into', dragId, folder.dataset.bm);
    clearBmDrop(); return;
  }
  const { before } = bmDropIndex(e.clientX);
  const idx = before ? BM.findIndex(b => b.id === before.dataset.bm) : BM.length;
  if (bmDrag != null) send('bm-move', bmDrag, idx < 0 ? BM.length : idx);
  else if (dragId != null) send('bm-add-tab', dragId, idx < 0 ? BM.length : idx);
  clearBmDrop();
});

// ---------------------------------------------------------------------- dialogs
let modalSubmit = null;
function openModal(html, onSubmit, focusSel) {
  const m = $('#modal');
  m.innerHTML = html;
  modalSubmit = onSubmit;
  $('#modal-wrap').hidden = false;
  raiseOverlay('modal');
  setTimeout(() => { const f = m.querySelector(focusSel || 'input'); if (f) { f.focus(); f.select(); } }, 30);
}
function closeModal() { pendingOverlay = null; modalSubmit = null; send('overlay', null); }
$('#modal').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData($('#modal')).entries());
  if (modalSubmit && modalSubmit(data) !== false) closeModal();
});
$('#modal').addEventListener('click', (e) => {
  const b = e.target.closest('[data-m]'); if (!b) return;
  if (b.dataset.m === 'cancel') closeModal();
  if (b.dataset.m === 'delete' && b.dataset.bm) { send('bm-delete', b.dataset.bm); closeModal(); }
  if (b.dataset.m === 'delete' && b.dataset.pw) { closeModal(); send('pw-delete', b.dataset.pw); }
});
$('#modal-wrap').addEventListener('mousedown', (e) => { if (e.target.id === 'modal-wrap') closeModal(); });
$('#modal').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closeModal(); } });

function editBookmark(b) {
  const isFolder = b.type === 'folder';
  openModal(`
    <h3>${b.id ? (isFolder ? 'Edit folder' : 'Edit bookmark') : (isFolder ? 'New folder' : 'New bookmark')}</h3>
    <label>Name<input name="title" value="${esc(b.title || '')}" spellcheck="false"></label>
    ${isFolder ? '' : `<label>Address<input name="url" value="${esc(b.url || '')}" spellcheck="false"></label>`}
    <div class="actions">${b.id ? `<button type="button" class="danger" data-m="delete" data-bm="${esc(b.id)}">Delete</button>` : ''}
      <span class="grow"></span><button type="button" data-m="cancel">Cancel</button><button type="submit" class="primary">Save</button></div>`,
  (d) => { send('bm-save', b.id || null, { type: b.type, title: d.title, url: d.url }); });
}

// ---------------------------------------------------------------------- passwords panel
let openPw = null;
let revealed = {};   // id -> password text currently shown
function renderPasswords(fromData) {
  const q = $('#pw-filter').value.trim().toLowerCase();
  const list = PW.filter(p => !q || p.host.includes(q) || (p.username || '').toLowerCase().includes(q));
  const body = $('#passwords-body');
  if (!fromData && body.dataset.key === JSON.stringify([q, openPw, Object.keys(revealed), PW.length])) return;
  body.dataset.key = JSON.stringify([q, openPw, Object.keys(revealed), PW.length]);
  body.innerHTML = !PW.length ? `<div class="empty">${icon('key', 22)}<br>No saved passwords yet.<br>Drift offers to save them when you sign in,<br>or <button class="link" id="pw-import-empty">import a CSV file</button>.</div>`
    : !list.length ? `<div class="empty">No matches</div>`
    : list.map(p => `
    <div class="pw ${openPw === p.id ? 'open' : ''}" data-pw="${esc(p.id)}">
      <div class="pw-row" data-act="toggle">
        <span class="letter" style="background:${letterColor(p.host)}">${esc(p.host[0] || '?')}</span>
        <div class="meta"><div class="name">${esc(p.host)}</div><div class="sub">${esc(p.username || '(no username)')}</div></div>
        <span class="chev">${icon('chev', 14)}</span>
      </div>
      <div class="pw-detail">
        <div class="pw-field"><span class="k">Username</span><span class="v">${esc(p.username || '—')}</span>
          <button class="ib" data-act="copy-user" title="Copy username">${icon('copy', 14)}</button></div>
        <div class="pw-field"><span class="k">Password</span><span class="v secret">${revealed[p.id] !== undefined ? esc(revealed[p.id]) : '••••••••••'}</span>
          <button class="ib" data-act="reveal" title="${revealed[p.id] !== undefined ? 'Hide' : 'Show'} password">${icon(revealed[p.id] !== undefined ? 'eyeoff' : 'eye', 14)}</button>
          <button class="ib" data-act="copy-pass" title="Copy password (cleared from clipboard after 30s)">${icon('copy', 14)}</button></div>
        <div class="pw-actions"><button data-act="open">Open site</button><button data-act="edit">Edit</button><button class="danger" data-act="delete">Delete</button></div>
      </div>
    </div>`).join('');
  const imp = $('#pw-import-empty'); if (imp) imp.onclick = () => send('pw-import');
}
$('#pw-filter').addEventListener('input', () => renderPasswords(true));
$('#pw-add').onclick = () => editPassword(null);
$('#passwords-body').addEventListener('click', async (e) => {
  const row = e.target.closest('[data-pw]'); const act = e.target.closest('[data-act]');
  if (!row || !act) return;
  const id = row.dataset.pw; const p = PW.find(x => x.id === id); if (!p) return;
  const a = act.dataset.act;
  if (a === 'toggle') { openPw = openPw === id ? null : id; renderPasswords(true); }
  if (a === 'copy-user') { send('pw-copy', id, 'username'); toast(`${icon('copy')}<span>Username copied</span>`); }
  if (a === 'copy-pass') { send('pw-copy', id, 'password'); toast(`${icon('copy')}<span>Password copied — clears in 30s</span>`); }
  if (a === 'reveal') {
    if (revealed[id] !== undefined) delete revealed[id];
    else {
      revealed[id] = await window.drift.invoke('pw-reveal', id) || '';
      setTimeout(() => { delete revealed[id]; if (panel === 'passwords') renderPasswords(true); }, 20000);
    }
    renderPasswords(true);
  }
  if (a === 'open') send('navigate', p.url, true);
  if (a === 'edit') editPassword(p);
  if (a === 'delete') send('pw-delete', id);
});
function editPassword(p) {
  openModal(`
    <h3>${p ? 'Edit password' : 'Add password'}</h3>
    <label>Website<input name="url" value="${esc(p ? p.url : '')}" placeholder="https://example.com" spellcheck="false" ${p ? 'readonly' : ''}></label>
    <label>Username<input name="username" value="${esc(p ? p.username : '')}" spellcheck="false"></label>
    <label>Password<input name="password" type="password" placeholder="${p ? 'Leave blank to keep the current password' : ''}"></label>
    <div class="actions">${p ? `<button type="button" class="danger" data-m="delete" data-pw="${esc(p.id)}">Delete</button>` : ''}<span class="grow"></span>
      <button type="button" data-m="cancel">Cancel</button><button type="submit" class="primary">Save</button></div>`,
  (d) => {
    if (!p && (!d.url || !d.password)) return false;
    send('pw-save', p ? p.id : null, { url: d.url, username: d.username, password: d.password });
  }, p ? 'input[name=username]' : 'input[name=url]');
}

// ---------------------------------------------------------------------- split view
function renderPanes(l) {
  const box = $('#panes'), div = $('#split-divider');
  const split = !!(l.split && l.panes && l.panes.length === 2 && !l.fullscreen);
  document.body.classList.toggle('split', split);
  if (!split) { box.innerHTML = ''; div.hidden = true; return; }
  box.innerHTML = l.panes.map(p => `<div class="pane ${p.id === l.activeId ? 'active' : ''}" style="left:${p.rect.x}px;top:${p.rect.y}px;width:${p.rect.width}px;height:${p.rect.height}px"></div>`).join('');
  const [a, b] = l.panes.map(p => p.rect);
  div.hidden = false;
  div.classList.toggle('col', l.split.dir === 'col');
  if (l.split.dir === 'col') Object.assign(div.style, { left: a.x + 'px', top: (a.y + a.height) + 'px', width: a.width + 'px', height: (b.y - a.y - a.height) + 'px' });
  else Object.assign(div.style, { left: (a.x + a.width) + 'px', top: a.y + 'px', width: (b.x - a.x - a.width) + 'px', height: a.height + 'px' });
}
$('#a-split').onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); send('split-menu', r.left, r.bottom + 4); };
$('#split-divider').addEventListener('mousedown', (e) => {
  e.preventDefault();
  const l = lastLayout; if (!l || !l.split) return;
  const area = l.content, col = l.split.dir === 'col';
  const div = $('#split-divider'); div.classList.add('dragging');
  document.body.classList.add('split-dragging'); document.body.classList.toggle('col-drag', col);
  let raf = 0;
  const move = (ev) => {
    const r = col ? (ev.clientY - area.y) / area.height : (ev.clientX - area.x) / area.width;
    cancelAnimationFrame(raf); raf = requestAnimationFrame(() => send('split-ratio', r));
  };
  const up = () => {
    div.classList.remove('dragging'); document.body.classList.remove('split-dragging', 'col-drag');
    window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
  };
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
});
$('#split-divider').addEventListener('dblclick', () => send('split-ratio', 0.5));

// ---------------------------------------------------------------------- toast
let toastTimer;
// toast(html, ms, actions): actions are [{ label, run }] buttons. Notices float above the bottom
// of the page (the sidebar is narrow, and in icon mode anything wider sits under the page);
// Drift sends button clicks back here. The sidebar corner is only a fallback before startup.
let toastActions = [], toastSeq = 0;
function toast(html, ms = 3200, actions = []) {
  toastActions = actions; const token = ++toastSeq;
  const full = html + actions.map((a, i) => `<button class="t-act" data-tact="${i}">${esc(a.label)}</button>`).join('');
  const t = $('#toast');
  if (S) {   // normally: float above the page (the sidebar is too narrow, and hidden in icon mode)
    t.hidden = true; clearTimeout(toastTimer);
    send('toast-float', { html: full, ms: ms + (actions.length ? 2000 : 0), token });
    return;
  }
  t.innerHTML = full; t.hidden = false;
  t.querySelectorAll('[data-tact]').forEach(b => b.onclick = () => { const a = toastActions[Number(b.dataset.tact)]; t.hidden = true; if (a) a.run(); });
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), ms + (actions.length ? 2000 : 0));
}
window.drift.on('toast-action', ({ token, index }) => { if (token === toastSeq && toastActions[index]) toastActions[index].run(); });

// ---------------------------------------------------------------------- messages from main
// An overlay opened here is shown before Drift confirms it; a state update sent just before
// the confirmation still says "no overlay" and must not close it.
window.drift.on('state', (s) => {
  if (pendingOverlay) {
    if (s.overlay === pendingOverlay.mode || Date.now() - pendingOverlay.at > 1000) pendingOverlay = null;
    else s.overlay = pendingOverlay.mode;
  }
  S = s; render();
  if (S.overlay === 'railpeek' && railWant && document.body.classList.contains('rail-open') && !document.body.classList.contains('rail-in')) startRailSweep();
});
window.drift.on('extensions', (list) => { EXT = list; render(); });
window.drift.on('bookmarks', (list) => { BM = list; renderBookmarks(); });
window.drift.on('passwords', (list) => { PW = list; if (panel === 'passwords') renderPasswords(true); });
window.drift.on('toast', (t) => {
  const actions = [];
  if (t.action && t.action.bm) actions.push({ label: t.action.label, run: () => { const b = findBm(t.action.bm); if (b) editBookmark(b); } });
  if (t.action && t.action.update) actions.push({ label: t.action.label, run: () => send('update-install') });
  toast(`${icon(t.icon || 'info')}<span>${esc(t.text)}</span>`, 3200, actions);
});
window.drift.on('bm-edit', (b) => editBookmark(b));
window.drift.on('layout', (l) => {
  content = l.content;
  const pf = $('#page-frame');
  Object.assign(pf.style, { left: content.x + 'px', top: content.y + 'px', width: content.width + 'px', height: content.height + 'px' });
  pf.hidden = l.fullscreen;
  document.body.classList.toggle('fullscreen', !!l.fullscreen);
  lastLayout = l;
  renderPanes(l);
  document.documentElement.style.setProperty('--th', (l.titleH || 40) + 'px');
  document.documentElement.style.setProperty('--bmh', (l.bmH || 0) + 'px');
  document.documentElement.style.setProperty('--cx', content.x + 'px');
  layoutBookmarks();
  placeFind();
  applyHole();
});
window.drift.on('palette', ({ newTab }) => { preparePalette(newTab, !newTab); raiseOverlay('palette'); });
window.drift.on('panel', (name) => { if (panel !== name) togglePanel(name); });
window.drift.on('find-open', () => {
  $('#findbar').hidden = false;
  const i = $('#find-input'); setTimeout(() => { i.focus(); i.select(); if (i.value) send('find', i.value, true, false); }, 0);
});
window.drift.on('find-result', ({ active, matches }) => {
  const q = $('#find-input').value;
  $('#find-count').textContent = q ? `${active}/${matches}` : '';
  $('#findbar').classList.toggle('nomatch', !!q && matches === 0);
});
// (Download start and progress are shown by renderDownloadIndicators.)
window.drift.on('download-done', ({ id, name, state }) => {
  if (state !== 'completed') { toast(`${icon('x')}<span>${state === 'cancelled' ? 'Cancelled' : 'Download failed'}: ${esc(name)}</span>`); return; }
  toast(`${icon('check')}<span>Downloaded ${esc(name)}</span>`, 6000, [
    { label: 'Open', run: () => { send('open-download', id); send('downloads-seen'); } },
    { label: 'Show in folder', run: () => { send('show-download', id); send('downloads-seen'); } },
  ]);
});

send('ready');
send('ext-list');
send('bm-list');


// ---------------------------------------------------------------------- site info (lock icon)
let siteData = null;
const fmtDate = (ms) => { try { return new Date(ms).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return ''; } };
function renderSiteInfo() {
  const d = siteData, box = $('#siteinfo');
  if (!d) { box.innerHTML = `<div class="si-sec">Site info isn't available for this page.</div>`; return; }
  const c = d.cert;
  const secure = d.secure && (!c || c.ok);
  const certHtml = !d.secure ? `<div class="si-warn">Information you send to this site (like passwords or card numbers) can be read by others on the network.</div>`
    : !c ? `<div class="si-row"><span class="n">Certificate details appear after the page loads over a new connection.</span></div>`
    : `<div class="si-kv">
        <span>Issued to</span><span>${esc(c.subject)}</span>
        <span>Issued by</span><span>${esc(c.issuer)}${c.issuerCN && c.issuerCN !== c.issuer ? ` (${esc(c.issuerCN)})` : ''}</span>
        <span>Valid</span><span>${esc(fmtDate(c.validStart))} – ${esc(fmtDate(c.validExpiry))}</span>
        <span>Fingerprint</span><span class="si-fp">${esc(c.fingerprint.replace(/^sha256\//, 'SHA-256 '))}</span>
        ${c.ok ? '' : `<span>Problem</span><span class="si-warn">${esc(c.error)}</span>`}
      </div>`;
  box.innerHTML = `
    <div class="si-head ${secure ? '' : 'insecure'}"><span class="si-ic">${icon(secure ? 'lock' : 'info', 16)}</span>
      <span style="min-width:0"><b>${esc(d.host)}</b><small>${secure ? 'Connection is secure' : d.secure ? 'Certificate problem' : 'Connection is not secure'}</small></span></div>
    <div class="si-sec"><h4>Connection</h4>${certHtml}</div>
    <div class="si-sec"><h4>Permissions</h4>
      ${d.perms.map(p => `<div class="si-row"><span>${esc(p.label)}</span>
        <select data-perm="${esc(p.perm)}" class="${p.value}">
          <option value="ask" ${p.value === 'ask' ? 'selected' : ''}>Ask</option>
          <option value="allow" ${p.value === 'allow' ? 'selected' : ''}>Allow</option>
          <option value="block" ${p.value === 'block' ? 'selected' : ''}>Block</option>
        </select></div>`).join('')}
    </div>
    <div class="si-sec"><h4>Privacy</h4>
      <div class="si-row"><span>Ads & trackers blocked</span><span class="n">${d.shields ? d.blocked.toLocaleString() + ' on this page' : 'Shields off for this site'}</span></div>
      <div class="si-row"><span>Cookies</span><span class="n">${d.cookies} stored by this site</span></div>
      <button class="si-btn" id="si-clear">Clear cookies and site data</button>
    </div>`;
}
async function openSiteInfo() {
  const r = $('#a-icon').getBoundingClientRect(), box = $('#siteinfo');
  siteData = await window.drift.invoke('site-info');
  renderSiteInfo();
  box.style.left = Math.max(8, Math.min(window.innerWidth - 348, r.left - 6)) + 'px';
  box.style.top = (r.bottom + 10) + 'px';
  $('#siteinfo-wrap').hidden = false;
  raiseOverlay('siteinfo');
  setTimeout(() => box.focus({ preventScroll: true }), 0);
}
function closeSiteInfo() { pendingOverlay = null; $('#siteinfo-wrap').hidden = true; if (S && S.overlay === 'siteinfo') send('overlay', null); }
$('#siteinfo-wrap').addEventListener('mousedown', (e) => { if (e.target.id === 'siteinfo-wrap') closeSiteInfo(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S && S.overlay === 'siteinfo') closeSiteInfo(); });
$('#siteinfo').addEventListener('change', (e) => {
  const sel = e.target.closest('select[data-perm]'); if (!sel || !siteData) return;
  sel.className = sel.value;
  send('site-perm', siteData.origin, sel.dataset.perm, sel.value);
});
$('#siteinfo').addEventListener('click', async (e) => {
  const b = e.target.closest('#si-clear'); if (!b || !siteData) return;
  b.disabled = true; b.textContent = 'Clearing…';
  const ok = await window.drift.invoke('site-clear', siteData.origin);
  b.textContent = ok ? 'Cleared — page reloaded' : "Couldn't clear site data";
  if (ok) { siteData.cookies = 0; const n = [...$('#siteinfo').querySelectorAll('.si-row')].find(r => r.textContent.includes('Cookies')); if (n) n.querySelector('.n').textContent = '0 stored by this site'; }
});


// ---------------------------------------------------------------------- sidebar hover (icon mode)
// With the sidebar collapsed to icons, resting the pointer on it opens the full sidebar over the
// page; moving off collapses it again. (Not while another menu or the command bar is open.)
let railTimer = 0, railCloseAfterDrag = false, railEndTimer = 0;
const railMode = () => S && S.settings.sidebarRail && !S.settings.sidebarHidden;
// Step 1, as soon as the pointer arrives: lay out the panel (still looks like the icon strip)
// and bring the sidebar above the page, so nothing heavy happens once the slide starts.
function prepRail() {
  if (!railMode() || (S.overlay && S.overlay !== 'railpeek')) return false;
  clearTimeout(railEndTimer); railEndTimer = 0;
  instantRail(() => document.body.classList.add('rail-open'));
  if (S.overlay !== 'railpeek') raiseOverlay('railpeek');
  return true;
}
// Step 2, after the hover pause: slide out (once the sidebar is actually above the page).
function openRail() {
  if (!prepRail()) return;
  railWant = true;
  if (S.overlay === 'railpeek') startRailSweep();
}
let railWant = false;
// Apply a class change to the sidebar without any transition (flush styles, then re-enable).
function instantRail(fn) {
  const b = document.body;
  b.classList.add('rail-noanim');
  fn();
  void $('#sidebar').offsetWidth;
  b.classList.remove('rail-noanim');
}
function startRailSweep() {
  requestAnimationFrame(() => {
    if (railWant && document.body.classList.contains('rail-open')) document.body.classList.add('rail-in');
  });
}
// Closing: slide back, then return to the icon layout and drop below the page.
function closeRail() {
  const b = document.body;
  railWant = false;
  if (!b.classList.contains('rail-open')) return;
  const wasIn = b.classList.contains('rail-in');
  b.classList.remove('rail-in');
  clearTimeout(railEndTimer);
  railEndTimer = setTimeout(() => {
    railEndTimer = 0;
    if (b.classList.contains('rail-in') || railWant) return;
    instantRail(() => b.classList.remove('rail-open'));
    if (pendingOverlay && pendingOverlay.mode === 'railpeek') pendingOverlay = null;
    if (S && S.overlay === 'railpeek') send('overlay', null, true);
  }, wasIn ? 260 : 0);
}
$('#sidebar').addEventListener('mouseenter', () => {
  clearTimeout(railTimer);
  if (!railMode()) return;
  if (document.body.classList.contains('rail-in')) { railWant = true; clearTimeout(railEndTimer); railEndTimer = 0; return; }
  prepRail();
  railTimer = setTimeout(openRail, 150);
});
$('#sidebar').addEventListener('mouseleave', () => {
  clearTimeout(railTimer);
  if (!document.body.classList.contains('rail-open')) return;
  if (dragId != null || bmDrag != null) { railCloseAfterDrag = true; return; }
  if (!document.body.classList.contains('rail-in')) { closeRail(); return; }   // left before it opened
  railTimer = setTimeout(closeRail, 140);
});
document.addEventListener('dragend', () => {
  if (!railCloseAfterDrag) return;
  railCloseAfterDrag = false;
  setTimeout(() => { if (!$('#sidebar').matches(':hover')) closeRail(); }, 50);
});


// ---------------------------------------------------------------------- bookmark folder dropdowns
// Drift's own menus (not native ones) so middle-click works: click opens, middle-click opens in
// a background tab (the menu stays open to pick more), Ctrl/Shift+click opens a new tab.
// Subfolders open to the side on hover.
const bmPops = [];   // open panels, one per folder level
function bmPopHtml(items, folder) {
  const links = items.filter(c => c.type === 'link');
  const rows = items.map(it => `<div class="bp-row ${it.type === 'folder' ? 'folder' : ''}" data-bp="${esc(it.id)}" title="${esc(it.type === 'folder' ? it.title : (it.title ? it.title + '\n' : '') + it.url)}">
      <span class="bp-ic">${bmIcon(it)}</span><span class="bp-t">${esc(it.title || it.url || 'Folder')}</span>${it.type === 'folder' ? `<span class="bp-more">${icon('more', 12)}</span>` : ''}</div>`).join('');
  return (rows || `<div class="bp-empty">(empty)</div>`)
    + (folder && links.length ? `<div class="bp-sep"></div><div class="bp-row bp-all" data-bp-all="${esc(folder.id)}"><span class="bp-ic">${icon('ext', 14)}</span><span class="bp-t">Open all (${links.length})</span></div>` : '');
}
function openBmPopup(items, x, y, folder, level = 0) {
  closeBmPopups(false, level);
  const wrap = $('#bmpop-wrap');
  const el = document.createElement('div');
  el.className = 'bmpop'; el.tabIndex = -1; el.dataset.level = String(level);
  el.innerHTML = bmPopHtml(items, folder);
  wrap.append(el); wrap.hidden = false;
  const w = 260, maxH = window.innerHeight - y - 12;
  el.style.maxHeight = Math.max(160, maxH) + 'px';
  el.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, x)) + 'px';
  el.style.top = y + 'px';
  bmPops[level] = el;
  if (level === 0) { raiseOverlay('bmpop'); setTimeout(() => el.focus({ preventScroll: true }), 0); }
}
function closeBmPopups(fromRender, fromLevel = 0) {
  while (bmPops.length > fromLevel) { const p = bmPops.pop(); if (p) p.remove(); }
  if (fromLevel === 0) {
    $('#bmpop-wrap').hidden = true;
    if (!fromRender) { if (pendingOverlay && pendingOverlay.mode === 'bmpop') pendingOverlay = null; if (S && S.overlay === 'bmpop') send('overlay', null); }
  }
}
let bpHoverTimer = 0;
$('#bmpop-wrap').addEventListener('mousedown', (e) => {
  if (e.target.id === 'bmpop-wrap') { closeBmPopups(false); return; }
  if (e.button === 1 && e.target.closest('[data-bp]')) e.preventDefault();   // no autoscroll
});
$('#bmpop-wrap').addEventListener('click', (e) => {
  const all = e.target.closest('[data-bp-all]');
  if (all) { send('bm-open-background', all.dataset.bpAll); closeBmPopups(false); return; }
  const row = e.target.closest('[data-bp]'); if (!row) return;
  const it = findBm(row.dataset.bp); if (!it) return;
  if (it.type === 'folder') { openSub(row, it); return; }
  send('bm-open', it.id, e.ctrlKey || e.metaKey || e.shiftKey);
  closeBmPopups(false);
});
$('#bmpop-wrap').addEventListener('auxclick', (e) => {
  if (e.button !== 1) return;
  const row = e.target.closest('[data-bp]'); if (!row) return;
  e.preventDefault();
  send('bm-open-background', row.dataset.bp);
  row.classList.add('opened'); setTimeout(() => row.classList.remove('opened'), 600);
});
$('#bmpop-wrap').addEventListener('contextmenu', (e) => {
  const row = e.target.closest('[data-bp]'); if (!row) return;
  e.preventDefault(); send('bm-menu', row.dataset.bp);
});
function openSub(row, it) {
  const level = Number(row.closest('.bmpop').dataset.level) + 1;
  const r = row.getBoundingClientRect();
  const x = r.right + 262 > window.innerWidth ? r.left - 262 : r.right + 2;
  openBmPopup(it.children, x, r.top - 5, it, level);
  row.closest('.bmpop').querySelectorAll('.bp-row.open').forEach(x => x.classList.remove('open'));
  row.classList.add('open');
}
$('#bmpop-wrap').addEventListener('mouseover', (e) => {
  const row = e.target.closest('.bp-row'); if (!row) return;
  clearTimeout(bpHoverTimer);
  const pop = row.closest('.bmpop'), level = Number(pop.dataset.level);
  bpHoverTimer = setTimeout(() => {
    const it = row.dataset.bp && findBm(row.dataset.bp);
    if (it && it.type === 'folder') { if (!row.classList.contains('open')) openSub(row, it); }
    else if (bmPops.length > level + 1) { closeBmPopups(false, level + 1); pop.querySelectorAll('.bp-row.open').forEach(x => x.classList.remove('open')); }
  }, 220);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S && S.overlay === 'bmpop') closeBmPopups(false); });
