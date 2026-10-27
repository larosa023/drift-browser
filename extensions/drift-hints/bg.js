// Electron leaves Chromium's User-Agent client hints (Sec-CH-UA*) off page loads, and never
// sends the detailed ones a site asks for with Accept-CH. Google's sign-in treats a "Chrome"
// without them as a tampered browser, so add the values Chromium itself would send.
// Drift reports the version in identity.json when the engine is older (main.js applies the
// same identity to pages natively, so headers and navigator.userAgentData agree).
let low = null, high = null;          // the reported Chrome identity
let realLow = null, realHigh = null;  // the engine as it is, for Google's sign-in pages
const fmt = (list) => list.map(b => `"${b.brand}";v="${b.version}"`).join(', ');
const q = (s) => `"${s}"`;
function identity() {
  try { const x = new XMLHttpRequest(); x.open('GET', chrome.runtime.getURL('identity.json'), false); x.send(); return JSON.parse(x.responseText); }
  catch { return null; }
}
(async () => {
  const d = navigator.userAgentData;
  if (!d) return;
  let brands = d.brands, h = {};
  try { h = await d.getHighEntropyValues(['architecture', 'bitness', 'fullVersionList', 'model', 'platformVersion', 'wow64']); } catch {}
  let full = h.fullVersionList || [];
  const mk = (br, fl) => [
    { 'sec-ch-ua': fmt(br), 'sec-ch-ua-mobile': d.mobile ? '?1' : '?0', 'sec-ch-ua-platform': q(d.platform) },
    { 'sec-ch-ua-arch': q(h.architecture || ''), 'sec-ch-ua-bitness': q(h.bitness || ''),
      'sec-ch-ua-full-version-list': fmt(fl), 'sec-ch-ua-model': q(h.model || ''),
      'sec-ch-ua-platform-version': q(h.platformVersion || ''), 'sec-ch-ua-wow64': h.wow64 ? '?1' : '?0' },
  ];
  [realLow, realHigh] = mk(brands, full);
  const id = identity();
  const engineMajor = Number((brands.find(b => b.brand === 'Chromium') || {}).version || 0);
  if (id && engineMajor < id.chromeMajor) {
    brands = [{ brand: id.greaseBrand, version: id.greaseVersion }, { brand: 'Chromium', version: String(id.chromeMajor) }];
    full = [{ brand: id.greaseBrand, version: id.greaseVersion + '.0.0.0' }, { brand: 'Chromium', version: id.chromeFull }];
  }
  [low, high] = mk(brands, full);
})();
// Google asks for the detailed hints on its sites (Accept-CH); Chrome remembers and sends them
// on every request there, including the sign-in page's own background requests.
const WANTS_HIGH = /(^|\.)(google\.[a-z.]+|youtube\.com|gstatic\.com|googleapis\.com|googleusercontent\.com|withgoogle\.com|blogger\.com|gmail\.com)$/i;
chrome.webRequest.onBeforeSendHeaders.addListener((details) => {
  if (!low) return;
  const frame = details.type === 'main_frame' || details.type === 'sub_frame';
  let host = ''; try { host = new URL(details.url).hostname; } catch {}
  const google = WANTS_HIGH.test(host);
  // Google's sign-in pages, and everything they load, see the engine as it is (see main.js).
  const SIGNIN = /^accounts\.google\.[a-z.]+$/i;
  let initHost = ''; try { initHost = details.initiator ? new URL(details.initiator).hostname : ''; } catch {}
  const signin = SIGNIN.test(host) && frame || SIGNIN.test(initHost);
  if (!frame && !google) return;
  const headers = details.requestHeaders;
  const have = new Set(headers.map(h => h.name.toLowerCase()));
  const add = (set) => { for (const [name, value] of Object.entries(set)) if (!have.has(name)) headers.push({ name, value }); };
  add(signin ? realLow : low);
  if (google) add(signin ? realHigh : high);
  return { requestHeaders: headers };
}, { urls: ['https://*/*'] }, ['blocking', 'requestHeaders', 'extraHeaders']);
