// Copies Drift's client-hints helper into the bundled uBlock Origin, so it runs in uBO's
// background page instead of needing its own process. The standalone extension in
// extensions/drift-hints is still used when uBlock Origin is turned off.
// Run automatically by npm start / dist / release.
const fs = require('fs');
const path = require('path');
const ext = path.join(__dirname, '..', 'extensions');
const ubo = path.join(ext, 'ublock');
fs.copyFileSync(path.join(ext, 'drift-hints', 'bg.js'), path.join(ubo, 'js', 'drift-hints.js'));
fs.copyFileSync(path.join(ext, 'drift-hints', 'identity.json'), path.join(ubo, 'drift-identity.json'));
const bgPage = path.join(ubo, 'background.html');
let html = fs.readFileSync(bgPage, 'utf8');
if (!html.includes('js/drift-hints.js')) {
  html = html.replace('<script src="lib/lz4/lz4-block-codec-any.js"></script>', '<script src="js/drift-hints.js"></script>\n<script src="lib/lz4/lz4-block-codec-any.js"></script>');
  fs.writeFileSync(bgPage, html);
}
console.log('[sync-hints] helper copied into uBlock Origin');
