// Per-tab volume hook. Injected into every frame of a tab (main world) when its
// volume is changed from 100%. Safe to run more than once.
//
// - <video>/<audio>: the site's own volume setting is preserved (the page still sees
//   the value it set) and the real output is scaled by the tab volume.
// - Above 100% (boost), media is routed through a Web Audio gain node when the
//   browser allows it (blob:/same-origin media — this covers Twitch and YouTube).
// - Sounds the page makes with the Web Audio API go through a per-context master gain.
(function () {
  if (window.__driftAudio) return;
  const S = window.__driftAudio = { gain: 1 };

  const proto = HTMLMediaElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'volume');
  const realGet = desc.get, realSet = desc.set;
  const origConnect = AudioNode.prototype.connect.__drift || AudioNode.prototype.connect;
  const intended = new WeakMap();   // element -> volume the page asked for
  const routed = new WeakMap();     // element -> GainNode (boost path)
  const elements = new Set();       // WeakRefs of media we've seen
  let ctx = null;

  function canRoute(el) {
    if (el.crossOrigin) return true;
    const src = el.currentSrc || el.src || '';
    if (!src || src.startsWith('blob:') || src.startsWith('data:')) return true;
    try { return new URL(src, location.href).origin === location.origin; } catch { return false; }
  }

  function route(el) {
    if (routed.has(el) || !canRoute(el)) return;
    try {
      ctx = ctx || new AudioContext();
      const source = ctx.createMediaElementSource(el);
      const gain = ctx.createGain();
      origConnect.call(source, gain);
      origConnect.call(gain, ctx.destination);
      routed.set(el, gain);
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch { /* already routed by the page, or not allowed */ }
  }

  function apply(el) {
    if (!(el instanceof HTMLMediaElement)) return;
    if (!intended.has(el)) {
      intended.set(el, realGet.call(el));
      elements.add(new WeakRef(el));
    }
    const want = intended.get(el);
    if (S.gain > 1) route(el);
    const g = routed.get(el);
    if (g) { realSet.call(el, want); g.gain.value = S.gain; }
    else realSet.call(el, Math.max(0, Math.min(1, want * Math.min(S.gain, 1))));
  }

  Object.defineProperty(proto, 'volume', {
    configurable: true, enumerable: desc.enumerable,
    get() { return intended.has(this) ? intended.get(this) : realGet.call(this); },
    set(v) {
      realSet.call(this, v);            // validates the range like the real setter
      intended.set(this, Number(v));
      apply(this);
    },
  });

  // Media that never touches the DOM (new Audio()) is caught when it starts playing.
  const origPlay = proto.play;
  proto.play = function () { try { apply(this); } catch {} return origPlay.apply(this, arguments); };

  // Web Audio made by the page: a master gain sits in front of each destination.
  // Normally page-preload.js installs this at document start; if it didn't run
  // (older frame), install it now for contexts created from here on.
  const masters = window.__driftMasters = window.__driftMasters || new Set();
  if (!AudioNode.prototype.connect.__drift) {
    const patched = function (dest, ...rest) {
      if (dest instanceof AudioDestinationNode) {
        const c = dest.context;
        let m = c.__driftMaster;
        if (!m) {
          m = c.createGain();
          origConnect.call(m, dest);
          Object.defineProperty(c, '__driftMaster', { value: m });
          masters.add(new WeakRef(m));
        }
        m.gain.value = S.gain;
        origConnect.call(this, m, ...rest);
        return dest;
      }
      return origConnect.call(this, dest, ...rest);
    };
    patched.__drift = origConnect;
    AudioNode.prototype.connect = patched;
  }

  function scan(root) {
    if (root.querySelectorAll) root.querySelectorAll('video, audio').forEach(apply);
  }
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n instanceof HTMLMediaElement) apply(n); else if (n.nodeType === 1) scan(n);
    }
  }).observe(document.documentElement || document, { childList: true, subtree: true });

  S.set = (g) => {
    S.gain = Math.max(0, Math.min(6, Number(g) || 0));
    scan(document);
    for (const r of elements) { const el = r.deref(); if (el) apply(el); else elements.delete(r); }
    for (const r of masters) { const m = r.deref(); if (m) m.gain.value = S.gain; else masters.delete(r); }
  };
})();
