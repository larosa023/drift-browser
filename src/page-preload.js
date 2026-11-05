// Runs at document start in every web page, in Drift's own isolated script world: the page's
// built-in functions are never changed here. (Anti-bot checks, like Twitch's and Google
// sign-in's, treat changed built-ins as a bot: Twitch then refuses to let you follow a
// channel.) Per-tab volume hooks a page only on tabs whose volume you change (audio-hook.js),
// and WebGPU is turned off in the engine instead (see main.js).

// Only for web pages: extension pages (some run without context isolation) and Drift's
// own pages are left alone.
const IS_WEB_PAGE = process.contextIsolated && /^(https?|file):$/.test(location.protocol);

// Chrome fills window.chrome with loadTimes, csi and app; the engine Drift is built on leaves
// it empty, which bot checks (Twitch's, among others) read as "not a real Chrome" and then
// refuse things like following a channel. Fill in what Chrome has, with what Chrome returns.
// This only adds Chrome's own missing parts: none of the page's built-in functions change.
if (IS_WEB_PAGE) require('electron').contextBridge.executeInMainWorld({ func: () => {
  const c = window.chrome;
  if (!c || typeof c !== 'object' || 'loadTimes' in c) return;
  // Bound functions read as built-in ("function () { [native code] }"), like Chrome's own.
  const native = (name, fn) => { const f = fn.bind(null); Object.defineProperty(f, 'name', { value: name }); return f; };
  const nav = () => performance.getEntriesByType('navigation')[0] || {};
  const at = (ms) => ms ? (performance.timeOrigin + ms) / 1000 : 0;
  c.loadTimes = native('loadTimes', () => {
    const n = nav(), proto = n.nextHopProtocol || 'http/1.1', paint = performance.getEntriesByName('first-paint')[0];
    return { requestTime: at(n.requestStart || n.startTime || 1), startLoadTime: at(n.startTime || 1), commitLoadTime: at(n.responseStart),
      finishDocumentLoadTime: at(n.domContentLoadedEventEnd), finishLoadTime: at(n.loadEventEnd), firstPaintTime: at(paint && paint.startTime),
      firstPaintAfterLoadTime: 0, navigationType: 'Other', wasFetchedViaSpdy: proto === 'h2' || proto === 'h3', wasNpnNegotiated: proto !== 'http/1.1',
      npnNegotiatedProtocol: proto === 'http/1.1' ? 'unknown' : proto, wasAlternateProtocolAvailable: false, connectionInfo: proto };
  });
  c.csi = native('csi', () => {
    const n = nav();
    return { startE: Math.round(performance.timeOrigin), onloadT: Math.round(performance.timeOrigin + (n.domContentLoadedEventEnd || 0)), pageT: performance.now(), tran: 15 };
  });
  const InstallState = { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' };
  const RunningState = { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' };
  c.app = {   // same order as Chrome's
    isInstalled: false,
    getDetails: native('getDetails', () => null),
    getIsInstalled: native('getIsInstalled', () => false),
    installState: native('installState', (cb) => { if (typeof cb === 'function') setTimeout(() => cb(InstallState.NOT_INSTALLED), 0); }),
    runningState: native('runningState', () => RunningState.CANNOT_RUN),
    InstallState, RunningState,
  };
} });

// ---------------------------------------------------------------------------
// Passwords: offer saved logins on sign-in forms, and offer to save new ones.
// Runs in the isolated world, so the page's own scripts can't call into it.
// Saved passwords are only handed over after the user clicks one, and the main
// process checks the requesting frame's real address before returning anything.
// ---------------------------------------------------------------------------
const { ipcRenderer } = require('electron');

if (IS_WEB_PAGE && /^https?:$/.test(location.protocol)) {
  let accounts = null;        // [{ id, username }] for this site, fetched once
  let picker = null;
  const seen = new WeakSet();

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const textInputs = 'input:not([type]), input[type=text], input[type=email], input[type=tel]';

  function userFieldFor(pw) {
    const scope = pw.form || document;
    const all = [...scope.querySelectorAll(`${textInputs}, input[type=password]`)];
    const i = all.indexOf(pw);
    for (let j = i - 1; j >= 0; j--) if (all[j].type !== 'password' && visible(all[j])) return all[j];
    const byName = scope.querySelector('input[autocomplete=username], input[name*=user i], input[name*=email i], input[id*=user i], input[id*=email i]');
    return byName && byName.type !== 'password' ? byName : null;
  }
  function passwordFieldFor(user) {
    const scope = user.form || document;
    return [...scope.querySelectorAll('input[type=password]')].find(visible) || null;
  }

  function setValue(el, v) {
    if (!el) return;
    el.focus();
    el.value = v;  // isolated world → native setter, so framework value trackers see the change
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function closePicker() { if (picker) { picker.remove(); picker = null; } }

  function showPicker(anchor) {
    closePicker();
    if (!accounts || !accounts.length) return;
    const r = anchor.getBoundingClientRect();
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;z-index:2147483647;left:${Math.round(r.left)}px;top:${Math.round(r.bottom + 4)}px;`;
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>
      .box{font:13px/1.3 "Segoe UI",system-ui,sans-serif;min-width:${Math.max(220, Math.round(r.width))}px;max-width:360px;background:#202026;color:#ececf1;
        border-radius:10px;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 10px 30px rgba(0,0,0,.4);padding:5px;}
      .hd{font-size:11px;color:#8d8d99;padding:5px 9px 4px;display:flex;gap:6px;align-items:center}
      button{all:unset;display:flex;align-items:center;gap:9px;box-sizing:border-box;width:100%;padding:8px 9px;border-radius:7px;cursor:default}
      button:hover,button:focus{background:rgba(255,255,255,.08)}
      .k{width:22px;height:22px;border-radius:6px;background:#ff6a3d;display:grid;place-items:center;font-weight:700;font-size:11px;color:#fff;flex:none;text-transform:uppercase}
      .u{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.m{color:#8d8d99;font-size:11.5px}</style>
      <div class="box"><div class="hd">Saved in Drift</div></div>`;
    const box = root.querySelector('.box');
    for (const a of accounts) {
      const b = document.createElement('button');
      b.innerHTML = `<span class="k"></span><span><div class="u"></div><div class="m">••••••••</div></span>`;
      b.querySelector('.k').textContent = (a.username || '?')[0];
      b.querySelector('.u').textContent = a.username || '(no username)';
      b.addEventListener('mousedown', async (e) => {
        e.preventDefault();
        const cred = await ipcRenderer.invoke('pw-fill', a.id);
        closePicker();
        if (!cred) return;
        const pw = anchor.type === 'password' ? anchor : passwordFieldFor(anchor);
        const user = anchor.type === 'password' ? userFieldFor(anchor) : anchor;
        if (user && cred.username) setValue(user, cred.username);
        if (pw) setValue(pw, cred.password);
      });
      box.append(b);
    }
    document.documentElement.append(host);
    picker = host;
  }

  async function attach(pw) {
    if (seen.has(pw)) return;
    seen.add(pw);
    if (accounts === null) accounts = await ipcRenderer.invoke('pw-accounts').catch(() => []) || [];
    const user = userFieldFor(pw);
    for (const el of [pw, user].filter(Boolean)) {
      if (seen.has(el) && el !== pw) continue;
      seen.add(el);
      el.addEventListener('focus', () => showPicker(el));
      el.addEventListener('click', () => { if (!picker) showPicker(el); });
      el.addEventListener('blur', () => setTimeout(closePicker, 150));
      el.addEventListener('input', closePicker);
    }
    if (document.activeElement === pw || document.activeElement === user) showPicker(document.activeElement);
  }

  function scan() { document.querySelectorAll('input[type=password]').forEach(pw => { if (visible(pw)) attach(pw); }); }

  // Offer to save: remember what was typed and report it when the form is sent.
  let lastSent = '';
  function capture(pwEl) {
    const pw = pwEl && pwEl.value;
    if (!pw) return;
    const user = userFieldFor(pwEl);
    const key = (user ? user.value : '') + '\u0000' + pw;
    if (key === lastSent) return;
    lastSent = key;
    ipcRenderer.send('pw-submitted', { username: user ? user.value : '', password: pw });
  }
  const activePassword = (scope) => [...(scope || document).querySelectorAll('input[type=password]')].find(el => el.value);
  document.addEventListener('submit', (e) => capture(activePassword(e.target)), true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement && (e.target.type === 'password' || e.target.form)) capture(activePassword(e.target.form));
  }, true);
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button, input[type=submit], [role=button]');
    if (b) { const pw = activePassword(b.form || b.closest('form')) || activePassword(); if (pw) capture(pw); }
  }, true);

  // Event-driven: look for sign-in fields once the page has loaded and whenever a text field
  // gets focus. (Watching the whole page for changes cost real CPU on busy sites like Twitch,
  // whose chat and player change the page many times a second.)
  const start = () => {
    scan();
    document.addEventListener('focusin', (e) => { if (e.target instanceof HTMLInputElement) scan(); }, true);
    window.addEventListener('scroll', closePicker, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}

// ---------------------------------------------------------------------------
// Links: when the pointer rests on a link to another site (or presses it), ask Drift to open
// the connection to that site early, so the page starts loading sooner after the click.
// ---------------------------------------------------------------------------
if (IS_WEB_PAGE && /^https?:$/.test(location.protocol)) {
  let hoverTimer = 0, lastOrigin = '';
  const ask = (a) => {
    let u; try { u = new URL(a.href, location.href); } catch { return; }
    if (!/^https?:$/.test(u.protocol) || u.origin === location.origin || u.origin === lastOrigin) return;
    lastOrigin = u.origin;
    ipcRenderer.send('drift-preconnect', u.origin);
  };
  document.addEventListener('mouseover', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    clearTimeout(hoverTimer);
    if (a) hoverTimer = setTimeout(() => ask(a), 150);
  }, { passive: true, capture: true });
  document.addEventListener('pointerdown', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a) ask(a);
  }, { passive: true, capture: true });
}

// ---------------------------------------------------------------------------
// Pop-up blocker: tell Drift what each click or Enter/Space press landed on, so a page can't
// turn a click on plain content (or on a see-through layer over the page) into a pop-up ad.
// Listening on window in the capture phase, registered before any page script, so the page
// can't hide clicks from it. Only real (trusted) input counts.
// ---------------------------------------------------------------------------
if (IS_WEB_PAGE) {
  const CONTROLS = 'a[href],button,input,select,textarea,label,summary,option,audio,[role=button],[role=link],[role=menuitem],[role=tab],[role=option],[role=checkbox],[role=switch],[role=radio],[onclick],[contenteditable]';
  const report = (e, el) => {
    if (!e.isTrusted) return;
    let interactive = false, link = '';
    try {
      if (el && el.nodeType !== 1) el = el.parentElement;
      if (el && el.closest) {
        const hit = el.closest(CONTROLS);
        interactive = !!hit || getComputedStyle(el).cursor === 'pointer';
        // A layer covering most of the window is how click-hijacking ads catch every click.
        const box = (hit || el).getBoundingClientRect();
        if (box.width * box.height > innerWidth * innerHeight * 0.6) interactive = false;
        const a = interactive && hit && hit.closest('a[href]');
        if (a) {
          const u = new URL(a.href, location.href);
          if (/^https?:$/.test(u.protocol) && !(u.origin === location.origin && u.pathname === location.pathname && u.search === location.search)) link = u.href;
        }
      }
    } catch {}
    ipcRenderer.send('drift-act', interactive, link);
  };
  window.addEventListener('pointerdown', (e) => report(e, e.composedPath()[0] || e.target), { capture: true, passive: true });
  window.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') report(e, document.activeElement); }, { capture: true, passive: true });

  // Glance: Alt+click a link to preview it over the page (Chromium would download it instead).
  // Starts as the button goes down, not when it comes back up, so the preview loads sooner; the
  // click that follows is swallowed.
  const altLink = (e) => {
    if (!e.isTrusted || !e.altKey || e.ctrlKey || e.shiftKey || e.metaKey || e.button !== 0) return null;
    const t = e.composedPath()[0] || e.target;
    const a = t && t.closest ? t.closest('a[href]') : null;
    return a && /^https?:/i.test(a.href) ? a : null;
  };
  let glanced = 0;
  window.addEventListener('pointerdown', (e) => {
    const a = altLink(e); if (!a) return;
    glanced = Date.now();
    ipcRenderer.send('drift-glance', a.href);
  }, { capture: true });
  for (const type of ['mousedown', 'mouseup', 'click', 'auxclick']) window.addEventListener(type, (e) => {
    if (Date.now() - glanced < 3000 && altLink(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, { capture: true });
}

// ---------------------------------------------------------------------------
// Picture in picture: a small button over a video while the pointer is on it. It lives in a
// closed shadow root so page styles can't touch it, and is only created once a video shows up.
// ---------------------------------------------------------------------------
if (IS_WEB_PAGE) {
  const videos = document.getElementsByTagName('video');   // live list, nothing to keep in sync
  let host = null, btn = null, target = null, hideTimer = 0, lastMove = 0;
  const build = () => {
    host = document.createElement('drift-pip');
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>
      :host { all: initial; position: fixed; z-index: 2147483647; display: none; }
      button { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px 0 8px;
        border-radius: 999px; background: rgba(20,20,24,.72); color: #fff; font: 600 12px/1 "Segoe UI", system-ui, sans-serif;
        backdrop-filter: blur(8px); box-shadow: 0 2px 10px rgba(0,0,0,.35); cursor: pointer; opacity: 0; transition: opacity .15s; }
      :host(.on) button { opacity: .92; } button:hover { opacity: 1 !important; background: rgba(20,20,24,.88); }
      svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    </style><button title="Picture in picture"><svg viewBox="0 0 24 24"><rect x="2.5" y="4.5" width="19" height="15" rx="2"/><rect x="12" y="11.5" width="7" height="5" rx="1" fill="currentColor" stroke="none"/></svg><span>Pop out</span></button>`;
    btn = root.querySelector('button');
    btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); }, true);
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); e.preventDefault();
      const v = target; if (!v) return;
      if (document.pictureInPictureElement === v) { document.exitPictureInPicture().catch(() => {}); return; }
      try { v.disablePictureInPicture = false; } catch {}
      v.requestPictureInPicture().catch(() => {});
      hide();
    }, true);
    document.documentElement.appendChild(host);
  };
  const hide = () => { if (host) { host.classList.remove('on'); host.style.display = 'none'; } target = null; };
  const show = (v, r) => {
    if (!host || !host.isConnected) build();
    target = v;
    host.style.display = 'block';
    host.style.left = Math.max(4, r.right - 110) + 'px';
    host.style.top = Math.max(4, r.top + 10) + 'px';
    requestAnimationFrame(() => host && host.classList.add('on'));
    clearTimeout(hideTimer); hideTimer = setTimeout(hide, 2500);
  };
  document.addEventListener('mousemove', (e) => {
    if (!videos.length) return;
    const now = performance.now(); if (now - lastMove < 120) return; lastMove = now;
    if (document.fullscreenElement) { hide(); return; }
    if (host && e.composedPath()[0] === host) { clearTimeout(hideTimer); return; }
    for (const v of videos) {
      const r = v.getBoundingClientRect();
      if (r.width < 220 || r.height < 124 || v === document.pictureInPictureElement || !v.isConnected) continue;
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) { show(v, r); return; }
    }
    if (target) hide();
  }, { passive: true, capture: true });
  document.addEventListener('fullscreenchange', hide);
}
