// Reader view: Mozilla's Readability (what Firefox's Reader View uses) finds the article on the
// page; this runs in an isolated world on a copy of the page, then cleans the result so only
// plain article markup is left (no scripts, frames, forms, event handlers or styles).
const fs = require('fs');
let lib = null;

function extract() {
  /* global Readability */
  const doc = document.cloneNode(true);
  let art = null;
  try { art = new Readability(doc, { charThreshold: 300, keepClasses: false }).parse(); } catch { art = null; }
  if (!art || !art.content) return null;
  const tpl = document.createElement('template');
  tpl.innerHTML = art.content;
  const root = tpl.content;
  root.querySelectorAll('script, style, link, meta, base, iframe, frame, frameset, object, embed, applet, form, input, button, textarea, select, option, noscript, template, dialog, portal').forEach(e => e.remove());
  const abs = (v) => { try { const u = new URL(v, location.href); return /^(https?|data):$/.test(u.protocol) ? u.href : null; } catch { return null; } };
  for (const el of root.querySelectorAll('*')) {
    // Images that load lazily keep their real address in data- attributes.
    if (el.tagName === 'IMG' && !el.getAttribute('src')) {
      const lazy = el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || el.getAttribute('data-original');
      if (lazy) el.setAttribute('src', lazy);
    }
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      if (n === 'href') { const v = abs(a.value); if (v && !v.startsWith('data:')) el.setAttribute('href', v); else el.removeAttribute(a.name); }
      else if (n === 'src') { const v = abs(a.value); if (v) el.setAttribute('src', v); else el.removeAttribute(a.name); }
      else if (['alt', 'title', 'colspan', 'rowspan', 'width', 'height', 'datetime', 'lang', 'dir', 'start', 'reversed', 'scope', 'headers', 'abbr', 'cite'].includes(n)) { if (n === 'cite') { const v = abs(a.value); if (v) el.setAttribute('cite', v); else el.removeAttribute(a.name); } }
      else el.removeAttribute(a.name);
    }
    if (el.tagName === 'A') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
    if (el.tagName === 'IMG') el.setAttribute('loading', 'lazy');
  }
  // SVG can carry scripts and links of its own: keep it out.
  root.querySelectorAll('svg, math').forEach(e => e.remove());
  const div = document.createElement('div'); div.appendChild(root);
  return {
    title: (art.title || document.title || '').slice(0, 300),
    byline: (art.byline || '').slice(0, 200),
    site: (art.siteName || location.hostname).slice(0, 100),
    lang: (art.lang || document.documentElement.lang || '').slice(0, 20),
    published: (art.publishedTime || '').slice(0, 40),
    html: div.innerHTML,
    words: (art.textContent || '').trim().split(/\s+/).length,
    url: location.href,
  };
}

module.exports = {
  code() {
    if (!lib) lib = fs.readFileSync(require.resolve('@mozilla/readability/Readability.js'), 'utf8');
    return `${lib}\n;(${extract.toString()})()`;
  },
};
