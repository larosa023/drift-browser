// electron-builder afterSign hook: VMP-signs the packaged app with castlabs EVS, so streaming
// sites that insist on a verified browser (Netflix, Disney+ and similar) accept Drift's Widevine.
// Runs only when EVS credentials are set (GitHub secrets EVS_ACCOUNT_NAME and EVS_PASSWD; the
// account is free at castlabs). Without them the build is unsigned, which most sites accept.
// Runs as afterSign, the last step that touches the app: electron-builder edits Drift.exe (icon,
// version info) after afterPack, which would break a signature made any earlier.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

exports.default = async function vmpSign(ctx) {
  // castlabs ships a signature for its own electron.exe; it doesn't match Drift.exe.
  try { fs.unlinkSync(path.join(ctx.appOutDir, 'electron.exe.sig')); } catch {}
  const { EVS_ACCOUNT_NAME: user, EVS_PASSWD: pass } = process.env;
  if (!user || !pass) { console.log('  • VMP signing skipped (no EVS credentials)'); return; }
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const run = (args) => execFileSync(py, args, { stdio: 'inherit' });
  run(['-m', 'castlabs_evs.account', '-n', 'refresh', '-A', user, '-P', pass]);
  run(['-m', 'castlabs_evs.vmp', '-n', 'sign-pkg', ctx.appOutDir]);
  console.log('  • VMP signed', ctx.appOutDir);
};
