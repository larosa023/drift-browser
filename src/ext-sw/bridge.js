// Drift: the helper page for this extension's background service worker (see drift-shim.js).
// It makes the browser calls the worker can't, and passes events back to it.
const subs = new Set();
const plain = (v) => { try { return v === undefined ? null : JSON.parse(JSON.stringify(v)); } catch { return null; } };
async function callApi(path, args) {
  const [api, fn] = String(path).split('.');
  const obj = chrome[api], f = obj && obj[fn];
  if (typeof f !== 'function') throw new Error(`${path} isn't supported in Drift`);
  return plain(await f.apply(obj, args || []));
}
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (!m || !m.__driftBridge || sender.tab || sender.id !== chrome.runtime.id) return;
  if (m.op === 'call') {
    callApi(m.path, m.args).then((r) => reply({ ok: true, r }), (e) => reply({ ok: false, e: String((e && e.message) || e) }));
    return true;
  }
  if (m.op === 'sub') {
    const [api, ev] = String(m.path).split('.');
    if (!subs.has(m.path) && chrome[api] && chrome[api][ev] && chrome[api][ev].addListener) {
      subs.add(m.path);
      chrome[api][ev].addListener((...args) => { chrome.runtime.sendMessage({ __driftEvent: m.path, args: plain(args) }).catch(() => {}); });
    }
    reply({ ok: true });
  }
});
