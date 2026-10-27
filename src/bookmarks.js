// Bookmarks: storage, lookup, and import/export (Chromium-family JSON, Netscape HTML).
//
// Shape: { bar: Item[] } where Item is
//   { id, type: 'link', title, url, icon? }  or  { id, type: 'folder', title, children: Item[] }

const fs = require('fs');
const path = require('path');
const os = require('os');

let nextId = 1;
const newId = () => 'b' + Date.now().toString(36) + (nextId++).toString(36);

function walk(items, fn, parent = null) {
  for (const it of items) {
    if (fn(it, parent, items) === false) return false;
    if (it.type === 'folder' && walk(it.children, fn, it) === false) return false;
  }
  return true;
}

class Bookmarks {
  constructor(load, save) {
    const data = load() || {};
    this.bar = Array.isArray(data.bar) ? data.bar : [];
    this._save = save;
  }
  save() { this._save({ bar: this.bar }); }

  find(id) {
    let hit = null;
    walk(this.bar, (it, parent, list) => { if (it.id === id) { hit = { item: it, parent, list }; return false; } });
    return hit;
  }
  findByUrl(url) {
    let hit = null;
    walk(this.bar, (it) => { if (it.type === 'link' && it.url === url) { hit = it; return false; } });
    return hit;
  }
  all() {
    const out = [];
    walk(this.bar, (it) => { if (it.type === 'link') out.push(it); });
    return out;
  }

  add(item, index) {
    const it = { id: newId(), type: item.type || 'link', title: item.title || '', ...(item.type === 'folder' ? { children: item.children || [] } : { url: item.url, icon: item.icon || '' }) };
    if (index === undefined || index < 0 || index > this.bar.length) this.bar.push(it);
    else this.bar.splice(index, 0, it);
    this.save();
    return it;
  }
  remove(id) {
    const hit = this.find(id); if (!hit) return;
    hit.list.splice(hit.list.indexOf(hit.item), 1);
    this.save();
  }
  update(id, fields) {
    const hit = this.find(id); if (!hit) return;
    if (typeof fields.title === 'string') hit.item.title = fields.title;
    if (typeof fields.url === 'string' && hit.item.type === 'link') hit.item.url = fields.url;
    this.save();
  }
  // Move an item to a position on the bar (top level).
  move(id, toIndex) {
    const hit = this.find(id); if (!hit) return;
    const from = hit.list.indexOf(hit.item);
    hit.list.splice(from, 1);
    if (hit.list === this.bar && from < toIndex) toIndex--;
    this.bar.splice(Math.max(0, Math.min(toIndex, this.bar.length)), 0, hit.item);
    this.save();
  }
  // Remember favicons for bookmarked pages as they are visited.
  noteIcon(url, icon) {
    if (!icon) return;
    let changed = false;
    walk(this.bar, (it) => { if (it.type === 'link' && it.url === url && it.icon !== icon) { it.icon = icon; changed = true; } });
    if (changed) this.save();
  }

  // Merge imported items: straight onto the bar if it's empty, otherwise into one folder.
  merge(items, sourceName) {
    const assign = (list) => list.map(it => it.type === 'folder'
      ? { id: newId(), type: 'folder', title: it.title, children: assign(it.children || []) }
      : { id: newId(), type: 'link', title: it.title || it.url, url: it.url, icon: '' });
    const fresh = assign(items);
    let count = 0; walk(fresh, (it) => { if (it.type === 'link') count++; });
    if (!this.bar.length) this.bar.push(...fresh);
    else this.bar.push({ id: newId(), type: 'folder', title: `Imported from ${sourceName}`, children: fresh });
    this.save();
    return count;
  }
}

// --------------------------------------------------------------------------- import: Chromium family

function chromiumProfiles() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const home = os.homedir();
  const cands = process.platform === 'win32' ? [
    ['Chrome', path.join(local, 'Google', 'Chrome', 'User Data')],
    ['Edge', path.join(local, 'Microsoft', 'Edge', 'User Data')],
    ['Brave', path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data')],
    ['Vivaldi', path.join(local, 'Vivaldi', 'User Data')],
    ['Opera', path.join(roaming, 'Opera Software', 'Opera Stable')],
    ['Opera GX', path.join(roaming, 'Opera Software', 'Opera GX Stable')],
  ] : process.platform === 'darwin' ? [
    ['Chrome', path.join(home, 'Library', 'Application Support', 'Google', 'Chrome')],
    ['Edge', path.join(home, 'Library', 'Application Support', 'Microsoft Edge')],
    ['Brave', path.join(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser')],
  ] : [
    ['Chrome', path.join(home, '.config', 'google-chrome')],
    ['Chromium', path.join(home, '.config', 'chromium')],
    ['Brave', path.join(home, '.config', 'BraveSoftware', 'Brave-Browser')],
    ['Edge', path.join(home, '.config', 'microsoft-edge')],
  ];
  const found = [];
  for (const [name, dir] of cands) {
    // Opera keeps Bookmarks in the root (older) or in Default (newer); others use Default / Profile N.
    const tries = [path.join(dir, 'Default', 'Bookmarks'), path.join(dir, 'Bookmarks')];
    try { for (const d of fs.readdirSync(dir)) if (/^Profile \d+$/.test(d)) tries.push(path.join(dir, d, 'Bookmarks')); } catch {}
    const file = tries.find(f => { try { return fs.statSync(f).isFile(); } catch { return false; } });
    if (file) found.push({ name, file });
  }
  return found;
}

function fromChromiumJSON(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const conv = (node) => (node.children || []).map(n => n.type === 'folder'
    ? { type: 'folder', title: n.name, children: conv(n) }
    : { type: 'link', title: n.name, url: n.url }).filter(n => n.type === 'folder' || /^(https?|ftp|file):/i.test(n.url || ''));
  const roots = data.roots || {};
  const items = conv(roots.bookmark_bar || {});
  const other = conv(roots.other || {});
  if (other.length) items.push({ type: 'folder', title: 'Other bookmarks', children: other });
  return items;
}

// --------------------------------------------------------------------------- import/export: Netscape HTML

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const encode = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Parses the "bookmarks.html" format every browser exports.
function fromNetscapeHTML(html) {
  const root = { children: [] };
  const stack = [root];
  let pendingFolder = null;
  const re = /<DT>\s*<H3[^>]*>([\s\S]*?)<\/H3>|<DT>\s*<A\s([^>]*)>([\s\S]*?)<\/A>|<DL[^>]*>|<\/DL>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tok = m[0];
    if (m[1] !== undefined) {
      pendingFolder = { type: 'folder', title: decode(m[1].trim()), children: [] };
      stack[stack.length - 1].children.push(pendingFolder);
    } else if (m[2] !== undefined) {
      const href = /HREF\s*=\s*"([^"]*)"/i.exec(m[2]);
      if (href && /^(https?|ftp|file):/i.test(decode(href[1])))
        stack[stack.length - 1].children.push({ type: 'link', title: decode(m[3].replace(/<[^>]+>/g, '').trim()), url: decode(href[1]) });
    } else if (/^<DL/i.test(tok)) {
      if (pendingFolder) { stack.push(pendingFolder); pendingFolder = null; }
      else if (stack.length > 1 || root.children.length) stack.push(stack[stack.length - 1]); // stray DL: stay in same list
    } else if (/^<\/DL/i.test(tok)) {
      if (stack.length > 1) stack.pop();
    }
  }
  // Firefox wraps everything in "Bookmarks Toolbar" / "Bookmarks Menu"; flatten a lone toolbar folder.
  let items = root.children;
  const toolbar = items.find(i => i.type === 'folder' && /^(bookmarks (toolbar|bar)|favorites bar)$/i.test(i.title));
  if (toolbar) items = [...toolbar.children, ...items.filter(i => i !== toolbar)];
  return items;
}

function toNetscapeHTML(bar) {
  const lines = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>', '<H1>Bookmarks</H1>', '<DL><p>',
    '    <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>', '    <DL><p>'];
  const out = (items, depth) => {
    const pad = '    '.repeat(depth);
    for (const it of items) {
      if (it.type === 'folder') {
        lines.push(`${pad}<DT><H3>${encode(it.title)}</H3>`, `${pad}<DL><p>`);
        out(it.children, depth + 1);
        lines.push(`${pad}</DL><p>`);
      } else lines.push(`${pad}<DT><A HREF="${encode(it.url)}">${encode(it.title)}</A>`);
    }
  };
  out(bar, 2);
  lines.push('    </DL><p>', '</DL><p>');
  return lines.join('\n');
}

module.exports = { Bookmarks, chromiumProfiles, fromChromiumJSON, fromNetscapeHTML, toNetscapeHTML };
