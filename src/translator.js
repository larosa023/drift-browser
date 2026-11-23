// "Translate page": the parts that run inside the page (in an isolated world, so the page's own
// scripts can't see or change them). Drift's main process sends the text to Ollama in batches.
//   collect()      gathers the page's text pieces (what's on screen first) and shows the bar
//   apply(map)     puts translated pieces in place, updates the bar
//   state()        { stopped } (the bar's Stop button)
//   done(msg)      final bar text

function trCollect(opts) {
  const old = window.__driftTr;
  if (old) { old.restore(); old.host.remove(); }
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'CODE', 'PRE', 'KBD', 'SAMP', 'SVG', 'MATH', 'CANVAS', 'IFRAME', 'TEMPLATE']);
  const nodes = [], orig = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const v = n.nodeValue;
      if (!v || v.trim().length < 2 || !/\p{L}/u.test(v)) return NodeFilter.FILTER_REJECT;
      for (let e = n.parentElement; e; e = e.parentElement) {
        if (SKIP.has(e.tagName) || e.isContentEditable || e.getAttribute('translate') === 'no' || e.classList.contains('notranslate')) return NodeFilter.FILTER_REJECT;
        if (e === document.body) break;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n; (n = walker.nextNode()) && nodes.length < 4000;) nodes.push(n);
  // What you can see first, then the rest in page order.
  const vh = innerHeight;
  const pos = nodes.map((n, i) => {
    let top = 1e9;
    try { const r = n.parentElement.getBoundingClientRect(); if (r.width || r.height) top = r.top; } catch {}
    const onScreen = top > -50 && top < vh + 50;
    return { i, key: onScreen ? top : 1e7 + i };
  }).sort((a, b) => a.key - b.key);
  nodes.forEach(n => orig.push(n.nodeValue));

  const host = document.createElement('drift-translate');
  host.style.cssText = 'all:initial;position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
    .bar { display: flex; align-items: center; gap: 10px; padding: 7px 8px 7px 14px; border-radius: 12px; background: #1d1d22; color: #ececf1; font: 13px/1.3 "Segoe UI", system-ui, sans-serif; box-shadow: 0 8px 30px rgba(0,0,0,.4), 0 0 0 1px rgba(255,255,255,.08); white-space: nowrap; }
    .msg { color: #ececf1; } .msg small { color: #9a9aa5; }
    .track { width: 90px; height: 4px; border-radius: 2px; background: rgba(255,255,255,.12); overflow: hidden; }
    .fill { height: 100%; width: 0; background: ${opts.accent || '#ff6a3d'}; transition: width .25s; }
    button { font: inherit; font-size: 12.5px; border: 0; border-radius: 8px; padding: 4px 11px; cursor: pointer; background: rgba(255,255,255,.08); color: inherit; }
    button:hover { background: rgba(255,255,255,.15); }
    .x { padding: 4px 8px; }
  </style>
  <div class="bar"><span class="msg">Translating to ${opts.lang}…</span><div class="track"><div class="fill"></div></div><button class="orig">Show original</button><button class="stop">Stop</button></div>`;
  document.documentElement.appendChild(host);
  const msg = root.querySelector('.msg'), fill = root.querySelector('.fill'), track = root.querySelector('.track');
  const origBtn = root.querySelector('.orig'), stopBtn = root.querySelector('.stop');
  const tr = new Map();   // index -> translated text
  const st = { nodes, orig, host, stopped: false, showing: 'translated', total: nodes.length, done: 0 };
  const withSpace = (o, t) => (o.match(/^\s*/)[0]) + t.trim() + (o.match(/\s*$/)[0]);
  st.restore = () => { nodes.forEach((n, i) => { if (n.nodeValue !== orig[i]) n.nodeValue = orig[i]; }); };
  st.apply = (map) => {
    for (const [k, v] of Object.entries(map)) {
      const i = +k; if (!nodes[i] || typeof v !== 'string' || !v.trim()) continue;
      tr.set(i, withSpace(orig[i], v));
      if (st.showing === 'translated' && nodes[i].isConnected) nodes[i].nodeValue = tr.get(i);
    }
    st.done = Math.min(st.total, st.done + Object.keys(map).length);
    fill.style.width = Math.round(100 * st.done / Math.max(1, st.total)) + '%';
  };
  st.finish = (text) => {
    msg.innerHTML = text; track.remove();
    stopBtn.textContent = '✕'; stopBtn.className = 'x'; stopBtn.title = 'Close';
  };
  origBtn.onclick = () => {
    if (st.showing === 'translated') { st.showing = 'original'; st.restore(); origBtn.textContent = 'Show translation'; }
    else { st.showing = 'translated'; tr.forEach((v, i) => { if (nodes[i].isConnected) nodes[i].nodeValue = v; }); origBtn.textContent = 'Show original'; }
  };
  stopBtn.onclick = () => {
    if (stopBtn.className === 'x') { host.remove(); return; }
    st.stopped = true; st.finish(`Stopped <small>· ${st.done} of ${st.total} translated</small>`);
  };
  window.__driftTr = st;
  return pos.map(p => ({ i: p.i, t: orig[p.i].trim().slice(0, 600) }));
}

module.exports = {
  collect: (opts) => `(${trCollect.toString()})(${JSON.stringify(opts)})`,
  apply: (map) => `(() => { const s = window.__driftTr; if (!s) return false; s.apply(${JSON.stringify(map)}); return !s.stopped; })()`,
  state: () => `(() => { const s = window.__driftTr; return s ? { stopped: s.stopped } : { stopped: true }; })()`,
  finish: (html) => `(() => { const s = window.__driftTr; if (s && !s.stopped) s.finish(${JSON.stringify(html)}); })()`,
};
