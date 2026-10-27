// Electron leaves Chromium's User-Agent client hints (Sec-CH-UA*) off navigation requests,
// although the page's JavaScript reports them. Sites such as Google's sign-in treat that
// mismatch as a tampered browser, so add the same values Chromium itself would send.
let low = null, high = null;
const fmt = (list) => list.map(b => `"${b.brand}";v="${b.version}"`).join(', ');
const q = (s) => `"${s}"`;
(async () => {
  const d = navigator.userAgentData;
  if (!d) return;
  low = { 'sec-ch-ua': fmt(d.brands), 'sec-ch-ua-mobile': d.mobile ? '?1' : '?0', 'sec-ch-ua-platform': q(d.platform) };
  try {
    const h = await d.getHighEntropyValues(['architecture', 'bitness', 'fullVersionList', 'model', 'platformVersion', 'wow64']);
    high = {
      'sec-ch-ua-arch': q(h.architecture || ''), 'sec-ch-ua-bitness': q(h.bitness || ''),
      'sec-ch-ua-full-version-list': fmt(h.fullVersionList || []), 'sec-ch-ua-model': q(h.model || ''),
      'sec-ch-ua-platform-version': q(h.platformVersion || ''), 'sec-ch-ua-wow64': h.wow64 ? '?1' : '?0',
    };
  } catch {}
})();
// Google asks for the detailed hints on its own sites (Accept-CH); Chrome remembers and sends them.
const WANTS_HIGH = /(^|\.)(google\.[a-z.]+|youtube\.com|gstatic\.com|googleapis\.com|googleusercontent\.com|withgoogle\.com|blogger\.com|gmail\.com)$/i;
chrome.webRequest.onBeforeSendHeaders.addListener((details) => {
  if (!low || !details.url.startsWith('https:')) return;
  const headers = details.requestHeaders;
  const have = new Set(headers.map(h => h.name.toLowerCase()));
  const add = (set) => { for (const [name, value] of Object.entries(set)) if (!have.has(name)) headers.push({ name, value }); };
  add(low);
  let host = ''; try { host = new URL(details.url).hostname; } catch {}
  if (high && WANTS_HIGH.test(host)) add(high);
  return { requestHeaders: headers };
}, { urls: ['https://*/*'], types: ['main_frame', 'sub_frame'] }, ['blocking', 'requestHeaders', 'extraHeaders']);
