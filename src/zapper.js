// Element zapper: runs inside a page (in its own isolated world) when you choose
// "Hide an element…". Hover highlights what's under the pointer, the mouse wheel picks a
// bigger (up) or smaller (down) area, click hides it. Undo / Done in the little bar; Esc ends.
// Resolves with the CSS selectors of what you hid, for Drift to keep hiding on this site.
function zapper(start) {
  if (window.__driftZap) { window.__driftZap.finish(); return Promise.resolve(null); }
  return new Promise((resolve) => {
    const host = document.createElement('drift-zapper');
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>
      .box { position: fixed; pointer-events: none; border: 2px solid #ff5a5a; background: rgba(255,90,90,.18); border-radius: 3px; transition: all .06s linear; display: none; }
      .tag { position: fixed; pointer-events: none; font: 600 11px/1.6 "Segoe UI", system-ui, sans-serif; color: #fff; background: #ff5a5a; padding: 0 6px; border-radius: 4px; white-space: nowrap; max-width: 60vw; overflow: hidden; text-overflow: ellipsis; display: none; }
      .bar { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); pointer-events: auto; display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 14px; border-radius: 12px; background: #1d1d22; color: #ececf1; font: 13px/1.3 "Segoe UI", system-ui, sans-serif; box-shadow: 0 8px 30px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.08); user-select: none; }
      .bar span, .bar b { white-space: nowrap; }
      .bar small { color: #9a9aa5; font-size: 12px; }
      .bar b { color: #ff7b7b; }
      button { font: inherit; font-size: 12.5px; border: 0; border-radius: 8px; padding: 5px 12px; cursor: pointer; background: rgba(255,255,255,.08); color: inherit; }
      button:hover { background: rgba(255,255,255,.14); }
      button.done { background: #ff5a5a; color: #fff; font-weight: 600; }
      button:disabled { opacity: .4; cursor: default; }
    </style>
    <div class="box"></div><div class="tag"></div>
    <div class="bar"><span>Click what to hide <small>· scroll for a bigger or smaller area · Esc when done</small></span><b class="n"></b><button class="undo" disabled>Undo</button><button class="done">Done</button></div>`;
    document.documentElement.appendChild(host);
    const box = root.querySelector('.box'), tag = root.querySelector('.tag'), bar = root.querySelector('.bar');
    const undoBtn = root.querySelector('.undo'), count = root.querySelector('.n');
    const hidden = [];   // { el, prev, sel }
    let target = null, chain = [], level = 0;

    const usable = (el) => el && el.nodeType === 1 && el !== host && el !== document.documentElement && el !== document.body;
    function pickAt(x, y) {
      host.style.display = 'none';
      let el = document.elementFromPoint(x, y);
      host.style.display = '';
      if (!usable(el)) return;
      chain = [];
      for (let e = el; usable(e); e = e.parentElement) chain.push(e);
      level = 0; show(chain[0]);
    }
    function show(el) {
      target = el;
      if (!el) { box.style.display = tag.style.display = 'none'; return; }
      const r = el.getBoundingClientRect();
      Object.assign(box.style, { display: 'block', left: r.left - 2 + 'px', top: r.top - 2 + 'px', width: r.width + 4 + 'px', height: r.height + 4 + 'px' });
      const name = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ([...el.classList].slice(0, 2).map(c => '.' + c).join(''));
      tag.textContent = `${name}  ${Math.round(r.width)}×${Math.round(r.height)}`;
      Object.assign(tag.style, { display: 'block', left: Math.max(4, r.left) + 'px', top: (r.top > 24 ? r.top - 22 : r.bottom + 4) + 'px' });
    }
    // A selector that finds this element again on the next visit: ids and readable class names
    // (not generated-looking ones), with positions only where needed.
    function selectorFor(el) {
      const okName = (s) => /^[a-zA-Z_-][\w-]{1,50}$/.test(s) && !/\d{4,}|[a-f0-9]{8,}|^(css|sc|jsx|emotion)-/i.test(s);
      const parts = [];
      for (let e = el; e && e.nodeType === 1 && e !== document.documentElement; e = e.parentElement) {
        if (e.id && okName(e.id)) { parts.unshift('#' + CSS.escape(e.id)); break; }
        let p = e.tagName.toLowerCase();
        const cls = [...e.classList].filter(okName).slice(0, 3);
        if (cls.length) p += '.' + cls.map(c => CSS.escape(c)).join('.');
        const par = e.parentElement;
        if (par && [...par.children].filter(x => x !== e && x.matches(p)).length) p += `:nth-of-type(${[...par.children].filter(x => x.tagName === e.tagName).indexOf(e) + 1})`;
        parts.unshift(p);
        const s = parts.join(' > ');
        try { if (document.querySelectorAll(s).length === 1 && parts.length >= 2) break; } catch {}
        if (parts.length >= 7 || e === document.body) break;
      }
      return parts.join(' > ');
    }
    function zap() {
      if (!target) return;
      const sel = selectorFor(target);
      hidden.push({ el: target, prev: target.style.getPropertyValue('display'), prio: target.style.getPropertyPriority('display'), sel });
      target.style.setProperty('display', 'none', 'important');
      undoBtn.disabled = false; count.textContent = hidden.length + ' hidden';
      show(null);
    }
    function undo() {
      const h = hidden.pop(); if (!h) return;
      if (h.prev) h.el.style.setProperty('display', h.prev, h.prio); else h.el.style.removeProperty('display');
      undoBtn.disabled = !hidden.length; count.textContent = hidden.length ? hidden.length + ' hidden' : '';
    }
    const inBar = (e) => e.composedPath().includes(bar);
    const stop = (e) => { if (inBar(e)) return; e.preventDefault(); e.stopImmediatePropagation(); };
    const onMove = (e) => { if (inBar(e)) { show(null); return; } pickAt(e.clientX, e.clientY); };
    const onClick = (e) => {
      if (inBar(e)) {
        const b = e.composedPath().find(n => n.tagName === 'BUTTON');
        if (b === undoBtn) undo(); else if (b && b.classList.contains('done')) finish();
        return;
      }
      stop(e); zap();
    };
    const onWheel = (e) => {
      if (inBar(e) || !chain.length) return;
      e.preventDefault(); e.stopImmediatePropagation();
      level = Math.max(0, Math.min(chain.length - 1, level + (e.deltaY < 0 ? 1 : -1)));
      show(chain[level]);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopImmediatePropagation(); undo(); }
    };
    const evs = [['mousemove', onMove], ['click', onClick], ['mousedown', stop], ['mouseup', stop], ['pointerdown', stop], ['pointerup', stop], ['auxclick', stop], ['contextmenu', stop], ['wheel', onWheel], ['keydown', onKey]];
    for (const [t, f] of evs) window.addEventListener(t, f, { capture: true, passive: false });
    const onScroll = () => { if (target) show(target); };
    window.addEventListener('scroll', onScroll, true);
    function finish() {
      for (const [t, f] of evs) window.removeEventListener(t, f, { capture: true });
      window.removeEventListener('scroll', onScroll, true);
      host.remove(); delete window.__driftZap;
      resolve(hidden.map(h => h.sel).filter(Boolean));
    }
    window.__driftZap = { finish };
    if (start && typeof start.x === 'number') pickAt(start.x, start.y);
  });
}
module.exports = (start) => `(${zapper.toString()})(${JSON.stringify(start || null)})`;
