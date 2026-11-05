// Twitch check (Settings → Privacy → Test Twitch): finds which part of Drift makes Twitch's
// anti-bot check fail (Twitch then refuses follows and channel-point claims).
//
// Each test loads Twitch in a fresh, signed-out window and asks Twitch's own check for a
// verdict: the follow request it sends carries no sign-in, so nothing happens to any account.
// A browser Twitch trusts gets "unauthenticated"; one it doesn't gets "failed integrity check".
// The tests strip Drift down step by step (its page script, its identity settings, its engine
// switches), so the first one that passes shows what Twitch objects to.
const { app, BrowserWindow, session, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const URL_ = 'https://www.twitch.tv/';
// Runs in the Twitch page (as the page's own code would): waits for Twitch's anti-bot script,
// gets a check token, then asks for a follow without a sign-in.
const PROBE = `(async () => {
  for (let i = 0; i < 40 && !(window.KPSDK && window.KPSDK.isReady && window.KPSDK.isReady()); i++) await new Promise(r => setTimeout(r, 500));
  const C = 'kimne78kx3ncx6brgo4mv6wki5h1ko', d = (document.cookie.match(/unique_id=([^;]+)/) || [])[1] || '';
  const t = (await (await fetch('https://gql.twitch.tv/integrity', { method: 'POST', headers: { 'Client-Id': C, 'X-Device-Id': d } })).json()).token || '';
  const r = await (await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-Id': C, 'X-Device-Id': d, 'Client-Integrity': t },
    body: JSON.stringify({ operationName: 'FollowButton_FollowUser', variables: { input: { disableNotifications: false, targetID: '12826' } },
      extensions: { persistedQuery: { version: 1, sha256Hash: '800e7346bdf7e5278a3c1d3f21b2b56e2639928f86815677a7126b093b2fdd08' } } }) })).text();
  return r;
})()`;

const verdict = (text) => /IntegrityCheckFailed|failed integrity/i.test(text) ? 'FAIL' : /nauthenticated/.test(text) ? 'PASS' : 'OTHER: ' + String(text).slice(0, 140);

// One test: a visible window (hidden pages behave differently) on a fresh, signed-out session.
async function probeIn(opts = {}) {
  // Saved-to-disk ("persist:") test profiles are needed for anything with extensions; emptied after.
  const ses = opts.session || session.fromPartition((opts.persist ? 'persist:' : '') + 'twcheck-' + Date.now() + Math.floor(Math.random() * 1e6));
  if (opts.ua) ses.setUserAgent(opts.ua);
  if (opts.preload) ses.registerPreloadScript({ id: 'drift-page', type: 'frame', filePath: opts.preload });
  if (opts.setup) { try { await opts.setup(ses); } catch (e) { return 'ERROR: setting up the test failed: ' + (e && e.message || e); } }
  const w = new BrowserWindow({ width: 1000, height: 700, title: 'Drift: testing Twitch…', autoHideMenuBar: true,
    webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    if (opts.prepare) opts.prepare(w.webContents);
    await Promise.race([w.loadURL(URL_), new Promise((_, j) => setTimeout(() => j(new Error('page took over 40 s to load')), 40000))]);
    const text = await Promise.race([w.webContents.executeJavaScript(PROBE, true), new Promise((_, j) => setTimeout(() => j(new Error('no answer in 40 s')), 40000))]);
    return verdict(text);
  } catch (e) {
    return 'ERROR: ' + (e && e.message || e);
  } finally {
    if (!w.isDestroyed()) w.destroy();
    if (opts.persist) ses.clearStorageData().catch(() => {});
  }
}

// A separate Drift process with nothing of Drift's but the version it reports (and, if asked,
// Drift's engine switches): tells Drift's own changes apart from the engine underneath.
function childRun(ua, switches) {
  return new Promise((resolve) => {
    const out = path.join(os.tmpdir(), `drift-twcheck-${process.pid}-${Date.now()}.json`);
    const args = [...(process.defaultApp ? [app.getAppPath()] : []), `--drift-twcheck=${out}`, `--drift-twcheck-ua=${encodeURIComponent(ua)}`];
    if (switches) args.push(`--drift-twcheck-switches=${encodeURIComponent(switches)}`);
    if (app.commandLine.hasSwitch('no-sandbox')) args.push('--no-sandbox');
    let done = false;
    const finish = (r) => { if (done) return; done = true; try { fs.unlinkSync(out); } catch {} resolve(r); };
    // The engine's own settings for its helper processes must not carry over to a new browser.
    const env = { ...process.env }; for (const k of Object.keys(env)) if (/^(ELECTRON_|CHROME_|GOOGLE_)/.test(k) && k !== 'ELECTRON_OVERRIDE_DIST_PATH') delete env[k];
    const p = spawn(process.execPath, args, { env, stdio: 'ignore' });
    const timer = setTimeout(() => { try { p.kill(); } catch {} finish('ERROR: test window took too long'); }, 120000);
    p.on('exit', () => { clearTimeout(timer); try { finish(JSON.parse(fs.readFileSync(out, 'utf8')).result); } catch { finish('ERROR: no result'); } });
    p.on('error', (e) => { clearTimeout(timer); finish('ERROR: ' + e.message); });
  });
}

// The separate process's side (started with --drift-twcheck=<file>; main.js hands over at once).
function child() {
  const arg = (k) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : ''; };
  const out = arg('drift-twcheck'), ua = decodeURIComponent(arg('drift-twcheck-ua')), sw = decodeURIComponent(arg('drift-twcheck-switches'));
  if (sw) for (const part of sw.split(' ')) { const i = part.indexOf('='); if (i > 0) app.commandLine.appendSwitch(part.slice(0, i), part.slice(i + 1)); else if (part) app.commandLine.appendSwitch(part); }
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'drift-twcheck-')));
  app.whenReady().then(async () => {
    const result = await probeIn({ ua: ua || undefined });
    try { fs.writeFileSync(out, JSON.stringify({ result })); } catch {}
    try { fs.rmSync(app.getPath('userData'), { recursive: true, force: true }); } catch {}
    app.exit(0);
  });
}

// Settings → Test Twitch. ctx: { ua, switches, preload, applyIdentity, parent }.
let running = false;
async function run(ctx) {
  if (running) return;
  running = true;
  try {
    const go = await dialog.showMessageBox(ctx.parent, { type: 'info', buttons: ['Start', 'Cancel'], defaultId: 0, cancelId: 1, noLink: true,
      title: 'Test Twitch', message: 'Find out what Twitch objects to',
      detail: 'Drift opens Twitch in a few test windows, one after another (about 4 minutes). The test asks Twitch without your sign-in, so nothing happens to your account. Leave them open until the results appear.' });
    if (go.response !== 0) return;
    // Fresh profiles with one part of your everyday profile added each: the one that fails is it.
    const fresh = (setup) => () => probeIn({ ua: ctx.ua, preload: ctx.preload, prepare: ctx.applyIdentity, setup });
    const saved = (setup) => () => probeIn({ ua: ctx.ua, preload: ctx.preload, prepare: ctx.applyIdentity, setup, persist: true });
    const tests = [
      ['Drift as you use it', () => probeIn({ session: session.defaultSession, prepare: ctx.applyIdentity })],
      ['Drift, fresh profile', fresh()],
      ['Fresh profile saved to disk', saved()],
      ['Saved + extension support', saved(ctx.addExtSupport)],
      ['Saved + Chrome Web Store support', saved(ctx.addWebStore)],
      ['Saved + certificate viewer', saved(ctx.addCerts)],
      ['Saved + uBlock Origin', saved(ctx.addUbo)],
      ['Saved + all of the above and Drift\'s other profile settings', saved(ctx.addAll)],
    ];
    const lines = [`Drift ${app.getVersion()} (engine ${process.versions.chrome}, ${process.platform}) Twitch check`];
    for (const [name, fn] of tests) lines.push(`${name}: ${await fn()}`);
    const text = lines.join('\n');
    clipboard.writeText(text);
    await dialog.showMessageBox(ctx.parent, { type: 'info', buttons: ['OK'], noLink: true, title: 'Test Twitch',
      message: 'Twitch check finished (results copied)', detail: text + '\n\nPASS = Twitch accepts it, FAIL = Twitch rejects it.' });
  } finally {
    running = false;
  }
}

module.exports = { run, child };
