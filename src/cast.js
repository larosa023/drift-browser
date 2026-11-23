// Casting to Chromecast / Google TV devices, without Chrome's built-in Cast:
//   discover()  finds Cast devices on the network (mDNS, _googlecast._tcp)
//   CastSession talks the Cast v2 protocol (TLS on port 8009) to play a video URL on the TV
//               with Google's Default Media Receiver, and controls it
//   Relay       a small HTTP server on this PC that fetches the video for the TV through the
//               tab's own browser session (cookies, referer), adds CORS and rewrites HLS
//               playlists, so streams that only play inside a browser also play on the TV.
const dgram = require('dgram');
const os = require('os');
const tls = require('tls');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { EventEmitter } = require('events');

// ---------------------------------------------------------------------------
// Discovery (multicast DNS)
// ---------------------------------------------------------------------------
const SERVICE = '_googlecast._tcp.local';

function dnsQuery(name) {
  const parts = name.split('.').filter(Boolean);
  const q = Buffer.concat([...parts.map(p => Buffer.concat([Buffer.from([p.length]), Buffer.from(p)])), Buffer.from([0])]);
  const head = Buffer.alloc(12); head.writeUInt16BE(1, 4);   // one question
  const tail = Buffer.alloc(4); tail.writeUInt16BE(12, 0); tail.writeUInt16BE(1, 2);   // PTR, IN
  return Buffer.concat([head, q, tail]);
}
function readName(buf, off) {
  const labels = []; let jumped = false, end = off, guard = 0;
  while (off < buf.length && guard++ < 128) {
    const len = buf[off];
    if (len === 0) { if (!jumped) end = off + 1; break; }
    if ((len & 0xc0) === 0xc0) { if (!jumped) end = off + 2; off = ((len & 0x3f) << 8) | buf[off + 1]; jumped = true; continue; }
    labels.push(buf.toString('utf8', off + 1, off + 1 + len)); off += len + 1;
  }
  return { name: labels.join('.'), end };
}
function parseDns(buf) {
  const recs = [];
  if (buf.length < 12) return recs;
  const qd = buf.readUInt16BE(4), total = buf.readUInt16BE(6) + buf.readUInt16BE(8) + buf.readUInt16BE(10);
  let off = 12;
  for (let i = 0; i < qd; i++) { off = readName(buf, off).end + 4; }
  for (let i = 0; i < total && off + 10 <= buf.length; i++) {
    const n = readName(buf, off); off = n.end;
    const type = buf.readUInt16BE(off), len = buf.readUInt16BE(off + 8); off += 10;
    const d = off; off += len;
    if (off > buf.length) break;
    const r = { name: n.name.toLowerCase(), type };
    if (type === 12) r.data = readName(buf, d).name.toLowerCase();
    else if (type === 33) { r.port = buf.readUInt16BE(d + 4); r.target = readName(buf, d + 6).name.toLowerCase(); }
    else if (type === 1 && len === 4) r.ip = [...buf.subarray(d, d + 4)].join('.');
    else if (type === 16) {
      r.txt = {}; let p = d;
      while (p < d + len) { const l = buf[p]; const s = buf.toString('utf8', p + 1, p + 1 + l); p += l + 1; const k = s.indexOf('='); if (k > 0) r.txt[s.slice(0, k)] = s.slice(k + 1); }
    } else continue;
    recs.push(r);
  }
  return recs;
}
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a);
  return out;
}

// Look for Cast devices for `ms` milliseconds; onFound(device) for each new one.
function discover(ms = 4000, onFound = () => {}) {
  return new Promise((resolve) => {
    const recs = [], found = new Map(), socks = [];
    const query = dnsQuery(SERVICE);
    const take = (msg) => {
      let rs; try { rs = parseDns(msg); } catch { return; }
      recs.push(...rs);
      // instance (PTR) -> SRV (port, host) -> A (ip); TXT has the name
      for (const ptr of recs.filter(r => r.type === 12 && r.name === SERVICE)) {
        const inst = ptr.data, srv = recs.find(r => r.type === 33 && r.name === inst);
        const txt = (recs.find(r => r.type === 16 && r.name === inst) || {}).txt || {};
        if (!srv) continue;
        const a = recs.find(r => r.type === 1 && r.name === srv.target);
        if (!a) continue;
        const id = txt.id || inst;
        if (found.has(id)) continue;
        const dev = { id, name: txt.fn || inst.split('.')[0], model: txt.md || '', host: a.ip, port: srv.port || 8009 };
        found.set(id, dev); onFound(dev);
      }
    };
    const ask = () => { for (const s of socks) try { s.send(query, 5353, '224.0.0.251'); } catch {} };
    // One socket per network adapter (answers come back to it directly), plus one on the mDNS
    // port for devices that only answer to everyone.
    for (const a of lanAddresses()) {
      const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      s.on('error', () => {}); s.on('message', take);
      try { s.bind(0, a.address, () => { try { s.setMulticastInterface(a.address); s.setMulticastTTL(255); } catch {} ask1(s); }); socks.push(s); } catch {}
    }
    function ask1(s) { try { s.send(query, 5353, '224.0.0.251'); } catch {} }
    try {
      const m = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      m.on('error', () => {}); m.on('message', take);
      m.bind(5353, () => { for (const a of lanAddresses()) try { m.addMembership('224.0.0.251', a.address); } catch {} });
      socks.push(m);
    } catch {}
    const again = setTimeout(ask, 1200);
    setTimeout(() => { clearTimeout(again); for (const s of socks) try { s.close(); } catch {} resolve([...found.values()]); }, ms);
  });
}

// ---------------------------------------------------------------------------
// Cast v2 protocol: length-prefixed protobuf CastMessage frames over TLS.
// ---------------------------------------------------------------------------
function varint(n) { const b = []; while (n > 127) { b.push((n & 127) | 128); n >>>= 7; } b.push(n); return Buffer.from(b); }
function encodeMsg(m) {
  const str = (f, s) => { const v = Buffer.from(s, 'utf8'); return Buffer.concat([Buffer.from([(f << 3) | 2]), varint(v.length), v]); };
  const body = Buffer.concat([Buffer.from([0x08, 0x00]), str(2, m.source), str(3, m.dest), str(4, m.ns), Buffer.from([0x28, 0x00]), str(6, m.data)]);
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  return Buffer.concat([len, body]);
}
function decodeMsg(buf) {
  const m = {}; let p = 0;
  const rv = () => { let r = 0, s = 0, b; do { b = buf[p++]; r += (b & 127) * 2 ** s; s += 7; } while (b & 128 && p < buf.length); return r; };
  while (p < buf.length) {
    const key = rv(), f = key >> 3, wt = key & 7;
    if (wt === 0) { rv(); continue; }
    if (wt !== 2) break;
    const l = rv(), v = buf.subarray(p, p + l); p += l;
    if (f === 2) m.source = v.toString(); else if (f === 3) m.dest = v.toString(); else if (f === 4) m.ns = v.toString(); else if (f === 6) m.data = v.toString();
  }
  return m;
}

const NS = {
  conn: 'urn:x-cast:com.google.cast.tp.connection',
  beat: 'urn:x-cast:com.google.cast.tp.heartbeat',
  recv: 'urn:x-cast:com.google.cast.receiver',
  media: 'urn:x-cast:com.google.cast.media',
};
const DEFAULT_APP = 'CC1AD845';   // Google's Default Media Receiver

// One cast to one device. Events: 'status' (media status), 'volume', 'closed' (reason).
class CastSession extends EventEmitter {
  constructor(dev) {
    super();
    this.dev = dev; this.me = 'sender-drift-' + crypto.randomBytes(3).toString('hex');
    this.reqId = 1; this.waiting = new Map(); this.buf = Buffer.alloc(0);
    this.transport = null; this.appSession = null; this.mediaSession = null; this.closed = false;
  }
  connect() {
    return new Promise((resolve, reject) => {
      const s = tls.connect({ host: this.dev.host, port: this.dev.port, rejectUnauthorized: false, timeout: 8000 });
      this.sock = s;
      const fail = (e) => { if (!this.ready) reject(e); else this.close(e && e.message || 'connection lost'); };
      s.once('secureConnect', () => {
        this.ready = true; s.setTimeout(0);
        this.raw('receiver-0', NS.conn, { type: 'CONNECT' });
        this.beat = setInterval(() => this.raw('receiver-0', NS.beat, { type: 'PING' }), 5000);
        resolve();
      });
      s.on('timeout', () => { s.destroy(); fail(new Error("Couldn't reach the TV")); });
      s.on('error', fail);
      s.on('close', () => this.close('connection closed'));
      s.on('data', (d) => this.onData(d));
    });
  }
  raw(dest, ns, obj) {
    if (!this.sock || this.sock.destroyed) return;
    this.sock.write(encodeMsg({ source: this.me, dest, ns, data: JSON.stringify(obj) }));
  }
  request(dest, ns, obj, ms = 10000) {
    const requestId = this.reqId++;
    this.raw(dest, ns, { ...obj, requestId });
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.waiting.delete(requestId); reject(new Error('The TV did not answer')); }, ms);
      this.waiting.set(requestId, (m) => { clearTimeout(t); resolve(m); });
    });
  }
  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 4) {
      const len = this.buf.readUInt32BE(0);
      if (len > 1 << 20) { this.close('bad data'); return; }
      if (this.buf.length < 4 + len) break;
      const m = decodeMsg(this.buf.subarray(4, 4 + len)); this.buf = this.buf.subarray(4 + len);
      let j = {}; try { j = JSON.parse(m.data || '{}'); } catch {}
      this.onMessage(m, j);
    }
  }
  onMessage(m, j) {
    if (m.ns === NS.beat && j.type === 'PING') return this.raw(m.source, NS.beat, { type: 'PONG' });
    if (m.ns === NS.conn && j.type === 'CLOSE') {
      if (m.source === this.transport) return this.close('stopped on the TV');
      return;
    }
    if (j.requestId && this.waiting.has(j.requestId)) { const f = this.waiting.get(j.requestId); this.waiting.delete(j.requestId); f(j); }
    if (m.ns === NS.recv && j.type === 'RECEIVER_STATUS' && j.status) {
      const v = j.status.volume; if (v) this.emit('volume', { level: v.level, muted: v.muted });
      const apps = j.status.applications || [];
      if (this.appSession && !apps.some(a => a.sessionId === this.appSession)) this.close('another app took over the TV');
    }
    if (m.ns === NS.media && j.type === 'MEDIA_STATUS' && Array.isArray(j.status)) {
      const st = j.status[0];
      if (st) { if (st.mediaSessionId) this.mediaSession = st.mediaSessionId; this.emit('status', st); }
    }
  }
  async launch() {
    const r = await this.request('receiver-0', NS.recv, { type: 'LAUNCH', appId: DEFAULT_APP }, 20000);
    if (r.type !== 'RECEIVER_STATUS') throw new Error(r.reason ? `The TV said: ${r.reason}` : "The TV couldn't start the player");
    const app = (r.status.applications || []).find(a => a.appId === DEFAULT_APP);
    if (!app) throw new Error("The TV couldn't start the player");
    this.transport = app.transportId; this.appSession = app.sessionId;
    this.raw(this.transport, NS.conn, { type: 'CONNECT' });
    if (r.status.volume) this.emit('volume', { level: r.status.volume.level, muted: r.status.volume.muted });
  }
  async load(media, currentTime = 0) {
    const r = await this.request(this.transport, NS.media, { type: 'LOAD', media, autoplay: true, currentTime }, 30000);
    if (r.type === 'MEDIA_STATUS' && r.status && r.status[0]) { this.mediaSession = r.status[0].mediaSessionId; return r.status[0]; }
    throw new Error(r.type === 'LOAD_FAILED' ? "The TV couldn't play this video" : r.type === 'LOAD_CANCELLED' ? 'Cancelled on the TV' : (r.reason || r.type || "The TV couldn't play this video"));
  }
  media(type, extra = {}) {
    if (!this.transport || !this.mediaSession) return Promise.resolve(null);
    return this.request(this.transport, NS.media, { type, mediaSessionId: this.mediaSession, ...extra }).catch(() => null);
  }
  status() { return this.transport ? this.request(this.transport, NS.media, { type: 'GET_STATUS' }, 5000).catch(() => null) : Promise.resolve(null); }
  volume(v) { return this.request('receiver-0', NS.recv, { type: 'SET_VOLUME', volume: v }).catch(() => null); }
  async stop() {
    try { if (this.appSession) await this.request('receiver-0', NS.recv, { type: 'STOP', sessionId: this.appSession }, 4000); } catch {}
    this.close('stopped');
  }
  close(reason) {
    if (this.closed) return; this.closed = true;
    clearInterval(this.beat);
    for (const f of this.waiting.values()) try { f({ type: 'CLOSED' }); } catch {}
    this.waiting.clear();
    try { this.sock.destroy(); } catch {}
    this.emit('closed', reason);
  }
}

// ---------------------------------------------------------------------------
// Relay: http://<this PC>:<port>/c/<token>/<origin>/<path>  ->  fetched with the tab's session.
// The path keeps the original's shape, so relative links in playlists and DASH manifests keep
// working; HLS playlists are rewritten so every link goes through the relay too.
// ---------------------------------------------------------------------------
const b64u = (s) => Buffer.from(s).toString('base64url');
const unb64u = (s) => Buffer.from(s, 'base64url').toString();
const isM3u8 = (u, ct, head) => /mpegurl/i.test(ct || '') || /\.m3u8?(\?|$)/i.test(u) || /^\s*#EXTM3U/.test(head || '');

// A plain HTTP(S) GET with the headers a browser tab would send (Chromium's own networking
// refuses a custom Referer, and many video sites check it). perHop(url) adds headers for each
// address on the way (the cookies for that site). Answers like fetch: status, url, headers.get,
// text(), and stream (the response itself, for piping).
function httpGet(url, { method = 'GET', headers = {}, perHop, timeout = 15000 } = {}, hops = 0) {
  return new Promise(async (resolve, reject) => {
    let u; try { u = new URL(url); } catch (e) { return reject(e); }
    const extra = perHop ? await perHop(url).catch(() => ({})) : {};
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method, headers: { accept: '*/*', 'accept-encoding': 'identity', ...headers, ...extra }, timeout }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops < 6) {
        res.resume();
        return httpGet(new URL(res.headers.location, url).href, { method, headers, perHop, timeout }, hops + 1).then(resolve, reject);
      }
      res.setTimeout(0);
      resolve({
        status: res.statusCode, url, stream: res,
        headers: { get: (k) => { const v = res.headers[k.toLowerCase()]; return Array.isArray(v) ? v.join(', ') : (v || null); } },
        text: () => new Promise((ok, bad) => { const parts = []; let n = 0; res.on('data', d => { n += d.length; if (n > 8e6) { res.destroy(); bad(new Error('too big')); } else parts.push(d); }); res.on('end', () => ok(Buffer.concat(parts).toString('utf8'))); res.on('error', bad); }),
      });
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
    req.end();
  });
}

class Relay {
  constructor(fetchFn) { this.fetchFn = fetchFn; this.server = null; this.token = crypto.randomBytes(12).toString('hex'); this.ctx = null; }
  // ctx: { referer, origin, ses } for the video being cast
  async start() {
    if (this.server) return;
    this.server = http.createServer((req, res) => this.handle(req, res).catch(() => { try { res.writeHead(502); res.end(); } catch {} }));
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(0, '0.0.0.0', resolve); });
    this.port = this.server.address().port;
  }
  stop() { try { this.server && this.server.close(); } catch {} this.server = null; }
  urlFor(upstream, lanIp) {
    const u = new URL(upstream);
    return `http://${lanIp}:${this.port}/c/${this.token}/${b64u(u.origin)}${u.pathname}${u.search}`;
  }
  async handle(req, res) {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': '*' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const m = /^\/c\/([a-f0-9]+)\/([A-Za-z0-9_-]+)(\/.*)?$/.exec(req.url);
    if (!m || m[1] !== this.token || !this.ctx || (req.method !== 'GET' && req.method !== 'HEAD')) { res.writeHead(404, cors); return res.end(); }
    let upstream; try { upstream = new URL(unb64u(m[2]) + (m[3] || '/')).href; } catch { res.writeHead(400, cors); return res.end(); }
    if (!/^https?:/.test(upstream)) { res.writeHead(400, cors); return res.end(); }
    const headers = {};
    if (this.ctx.referer) headers.referer = this.ctx.referer;
    if (this.ctx.origin) headers.origin = this.ctx.origin;
    if (req.headers.range) headers.range = req.headers.range;
    const up = await this.fetchFn(upstream, { headers, method: req.method });
    const ct = up.headers.get('content-type') || '';
    const out = { ...cors, 'cache-control': 'no-store' };
    for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified']) { const v = up.headers.get(k); if (v) out[k] = v; }
    const lanIp = req.socket.localAddress.replace(/^::ffff:/, '');
    if (isM3u8(upstream, ct) && req.method === 'GET') {
      const text = await up.text();
      const body = Buffer.from(this.rewriteM3u8(text, up.url || upstream, lanIp));
      delete out['content-length']; delete out['content-range'];
      out['content-type'] = 'application/vnd.apple.mpegurl'; out['content-length'] = body.length;
      res.writeHead(up.status, out); return res.end(body);
    }
    res.writeHead(up.status, out);
    if (req.method === 'HEAD') { up.stream.resume(); return res.end(); }
    res.on('close', () => up.stream.destroy());
    up.stream.on('error', () => res.destroy());
    up.stream.pipe(res);
  }
  rewriteM3u8(text, base, lanIp) {
    const abs = (u) => { try { return this.urlFor(new URL(u, base).href, lanIp); } catch { return u; } };
    return text.split(/\r?\n/).map(line => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, u) => /^(data|skd):/i.test(u) ? `URI="${u}"` : `URI="${abs(u)}"`);
      return abs(t);
    }).join('\n');
  }
}

// The PC's address on the same network as the TV.
function lanIpFor(host) {
  const addrs = lanAddresses();
  const toInt = (ip) => ip.split('.').reduce((a, b) => (a << 8) + +b, 0) >>> 0;
  for (const a of addrs) {
    const mask = toInt(a.netmask || '255.255.255.0');
    if ((toInt(a.address) & mask) === (toInt(host) & mask)) return a.address;
  }
  return addrs[0] ? addrs[0].address : '127.0.0.1';
}

module.exports = { discover, CastSession, Relay, httpGet, lanIpFor, isM3u8, parseDns, encodeMsg, decodeMsg, dnsQuery };
