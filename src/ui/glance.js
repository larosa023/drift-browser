// The Glance backdrop: dims the page behind a link preview and holds its title and buttons.
// The preview itself is a page view Drift places over #card.
const $ = (s) => document.querySelector(s);
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
window.glanceBridge.onState((d) => {
  document.documentElement.style.setProperty('--accent', d.accent);
  const c = d.card;
  Object.assign($('#card').style, { left: c.x + 'px', top: c.y + 'px', width: c.width + 'px', height: c.height + 'px' });
  const bar = $('#bar');
  Object.assign(bar.style, { left: c.x + 'px', width: c.width + 'px', top: Math.max(6, c.y - 44) + 'px' });
  bar.hidden = false;
  $('#title').textContent = d.title || host(d.url);
  $('#url').textContent = host(d.url);
  $('#spin').hidden = !d.loading;
});
$('#scrim').addEventListener('mousedown', () => window.glanceBridge.close());
$('#close').addEventListener('click', () => window.glanceBridge.close());
$('#expand').addEventListener('click', () => window.glanceBridge.expand());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.glanceBridge.close();
  if (e.key === 'Enter' && e.ctrlKey) window.glanceBridge.expand();
});
