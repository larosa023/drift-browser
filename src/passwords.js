// Saved passwords: encrypted at rest with the OS keystore (Windows DPAPI via
// Electron safeStorage), CSV import from other browsers / managers, CSV export.

const fs = require('fs');
const crypto = require('crypto');
const { safeStorage } = require('electron');

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const originOf = (u) => { try { const x = new URL(u); return x.origin; } catch { return ''; } };

class Passwords {
  constructor(file) {
    this.file = file;
    this.entries = [];
    this.never = [];         // hosts where the user chose "Never save"
    this.encrypted = false;
    this.load();
  }

  canEncrypt() {
    try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
  }

  load() {
    let raw;
    try { raw = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { return; }
    try {
      const json = raw.enc ? safeStorage.decryptString(Buffer.from(raw.data, 'base64')) : raw.data;
      const data = JSON.parse(json);
      this.entries = data.entries || [];
      this.never = data.never || [];
      this.encrypted = !!raw.enc;
    } catch (e) {
      console.error('[passwords] could not decrypt saved passwords:', e.message);
      // Keep the unreadable file instead of overwriting it.
      try { fs.copyFileSync(this.file, this.file + '.unreadable'); } catch {}
    }
  }

  save() {
    const json = JSON.stringify({ entries: this.entries, never: this.never });
    const enc = this.canEncrypt();
    const out = enc ? { enc: true, data: safeStorage.encryptString(json).toString('base64') } : { enc: false, data: json };
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(out), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    this.encrypted = enc;
  }

  // Entries usable on a page: same host, or saved for a parent domain.
  // A login saved on a secure (https) page is never offered on an insecure (http) one, where
  // anyone on the network could have put the form there (same rule as Chrome).
  forUrl(pageUrl) {
    const h = hostOf(pageUrl); if (!h) return [];
    const pageSecure = /^https:/i.test(pageUrl);
    return this.entries.filter(e => { const eh = hostOf(e.url); return eh && (eh === h || h.endsWith('.' + eh)) && (pageSecure || !/^https:/i.test(e.url)); })
      .sort((a, b) => (b.used || 0) - (a.used || 0));
  }

  get(id) { return this.entries.find(e => e.id === id) || null; }

  upsert({ url, username, password }) {
    const origin = originOf(url); if (!origin || !password) return null;
    let e = this.entries.find(x => originOf(x.url) === origin && x.username === (username || ''));
    if (e) { e.password = password; e.updated = Date.now(); }
    else {
      e = { id: crypto.randomUUID(), url: origin, username: username || '', password, created: Date.now(), updated: Date.now(), used: 0 };
      this.entries.push(e);
    }
    this.save();
    return e;
  }

  update(id, fields) {
    const e = this.get(id); if (!e) return;
    if (typeof fields.username === 'string') e.username = fields.username;
    if (typeof fields.password === 'string' && fields.password) e.password = fields.password;
    if (typeof fields.url === 'string' && originOf(fields.url)) e.url = originOf(fields.url);
    e.updated = Date.now();
    this.save();
  }

  remove(id) { this.entries = this.entries.filter(e => e.id !== id); this.save(); }
  markUsed(id) { const e = this.get(id); if (e) { e.used = Date.now(); this.save(); } }
  addNever(url) { const h = hostOf(url); if (h && !this.never.includes(h)) { this.never.push(h); this.save(); } }
  isNever(url) { return this.never.includes(hostOf(url)); }

  // ------------------------------------------------------------------ CSV
  // Understands exports from Chrome/Edge/Brave/Opera (name,url,username,password,note),
  // Firefox (url,username,password,...), Bitwarden (login_uri,login_username,login_password),
  // LastPass, 1Password, Dashlane, Proton Pass and similar.
  importCSV(text) {
    const rows = parseCSV(text.replace(/^﻿/, ''));
    if (rows.length < 2) return { added: 0, updated: 0, skipped: 0 };
    const head = rows[0].map(h => h.trim().toLowerCase());
    const col = (...names) => head.findIndex(h => names.includes(h));
    const iUrl = col('url', 'login_uri', 'website', 'web site', 'origin', 'uri', 'login url', 'urls');
    const iUser = col('username', 'login_username', 'login', 'user', 'email', 'login name', 'user name');
    const iPass = col('password', 'login_password', 'pass');
    if (iUrl < 0 || iPass < 0) throw new Error("This file doesn't look like a password export (no url/password columns).");
    let added = 0, updated = 0, skipped = 0;
    for (const r of rows.slice(1)) {
      let url = (r[iUrl] || '').trim().split(/[\s,]+/)[0];
      const password = r[iPass] || '';
      const username = iUser >= 0 ? (r[iUser] || '') : '';
      if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url;
      if (!/^https?:/i.test(url) || !password) { skipped++; continue; }
      const origin = originOf(url);
      const existing = this.entries.find(x => originOf(x.url) === origin && x.username === username);
      if (existing) { if (existing.password !== password) { existing.password = password; existing.updated = Date.now(); updated++; } else skipped++; }
      else {
        this.entries.push({ id: crypto.randomUUID(), url: origin, username, password, created: Date.now(), updated: Date.now(), used: 0 });
        added++;
      }
    }
    this.save();
    return { added, updated, skipped };
  }

  exportCSV() {
    const q = (s) => /[",\n\r]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : String(s);
    const lines = ['name,url,username,password,note'];
    for (const e of this.entries) lines.push([hostOf(e.url), e.url, e.username, e.password, ''].map(q).join(','));
    return lines.join('\n') + '\n';
  }
}

function parseCSV(text) {
  const rows = []; let row = []; let field = ''; let i = 0; let inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(f => f !== ''));
}

module.exports = { Passwords, hostOf };
