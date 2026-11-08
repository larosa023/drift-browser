// Twitch check (Settings → Privacy → Test Twitch): when Twitch refuses follows and channel-point
// claims ("failed integrity check"), finds out whether Drift itself or data stored in your
// profile is the cause, and offers the fix.
//
// Each test loads Twitch and asks Twitch's own anti-bot check for a verdict: the follow request
// it sends carries no sign-in, so nothing happens to any account. A browser Twitch trusts gets
// "unauthenticated"; one it doesn't gets "failed integrity check".
const { app, BrowserWindow, session, dialog, clipboard } = require('electron');

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

// One test in a visible window (hidden pages behave differently): your profile, or a fresh,
// signed-out one that lives only in memory.
async function probeIn(opts = {}) {
  const ses = opts.session || session.fromPartition('twcheck-' + Date.now() + Math.floor(Math.random() * 1e6));
  if (opts.ua) ses.setUserAgent(opts.ua);
  if (opts.preload) ses.registerPreloadScript({ id: 'drift-page', type: 'frame', filePath: opts.preload });
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
  }
}

// Settings → Test Twitch. ctx: { ua, preload, applyIdentity, parent, clearTwitch }.
let running = false;
async function run(ctx) {
  if (running) return;
  running = true;
  try {
    const go = await dialog.showMessageBox(ctx.parent, { type: 'info', buttons: ['Start', 'Cancel'], defaultId: 0, cancelId: 1, noLink: true,
      title: 'Test Twitch', message: 'Find out why Twitch won\'t let you follow',
      detail: 'Drift opens Twitch in two test windows, one after the other (under a minute). The test asks Twitch without your sign-in, so nothing happens to your account.' });
    if (go.response !== 0) return;
    const mine = await probeIn({ session: session.defaultSession, prepare: ctx.applyIdentity });
    const fresh = await probeIn({ ua: ctx.ua, preload: ctx.preload, prepare: ctx.applyIdentity });
    const text = [`Drift ${app.getVersion()} (engine ${process.versions.chrome}, ${process.platform}) Twitch check`,
      `Your profile: ${mine}`, `Fresh profile: ${fresh}`].join('\n');
    clipboard.writeText(text);
    if (mine === 'PASS') {
      await dialog.showMessageBox(ctx.parent, { type: 'info', buttons: ['OK'], noLink: true, title: 'Test Twitch',
        message: 'Twitch accepts Drift', detail: text + '\n\nIf following still fails, sign out of Twitch and back in. (Results copied.)' });
    } else if (fresh === 'PASS') {
      // Drift is fine; data Twitch stored in your profile was flagged. Clearing it fixed this before.
      const r = await dialog.showMessageBox(ctx.parent, { type: 'warning', buttons: ['Clear Twitch data', 'Not now'], defaultId: 0, cancelId: 1, noLink: true, title: 'Test Twitch',
        message: 'Twitch has flagged data stored in your profile',
        detail: text + '\n\nDrift itself passes. Clearing what Twitch stored (and Drift\'s cache) usually fixes it. You\'ll be signed out of Twitch only. (Results copied.)' });
      if (r.response === 0 && ctx.clearTwitch) await ctx.clearTwitch();
    } else {
      await dialog.showMessageBox(ctx.parent, { type: 'warning', buttons: ['OK'], noLink: true, title: 'Test Twitch',
        message: 'Twitch rejects Drift right now', detail: text + '\n\nThis can be temporary on Twitch\'s side; try again later. The results are copied, ready to paste.' });
    }
  } finally {
    running = false;
  }
}

module.exports = { run };
