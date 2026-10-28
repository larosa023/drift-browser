// Runs at document start in every page. Inserts a pass-through gain node in front
// of each Web Audio destination so per-tab volume can reach sounds made with the
// Web Audio API (games, some players). At 100% it does nothing audible.
const { contextBridge } = require('electron');

// Only for web pages: extension pages (some run without context isolation) and Drift's
// own pages are left alone.
const IS_WEB_PAGE = process.contextIsolated && /^(https?|file):$/.test(location.protocol);

// Not on Google's sign-in pages, which check that built-in browser functions are untouched.
if (IS_WEB_PAGE && !/^accounts\.google\./i.test(location.hostname)) contextBridge.executeInMainWorld({
  func: () => {
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
  },
});

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
