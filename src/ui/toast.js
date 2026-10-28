// Notifications shown above the page when the sidebar is collapsed (see showFloatingToast in
// main.js). The HTML comes from Drift's own UI; buttons are run back in the UI.
const box = document.getElementById('toast');
window.toastBridge.onShow(({ html, dark, accent }) => {
  document.body.className = dark ? 'dark' : 'light';
  if (accent) document.documentElement.style.setProperty('--accent', accent);
  box.innerHTML = html; box.hidden = false;
  // Measured right away: the view isn't on screen yet, so it gets no animation frames.
  const r = box.getBoundingClientRect();
  window.toastBridge.size(Math.ceil(r.width) + 24, Math.ceil(r.height) + 24);
});
box.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tact]');
  if (b) window.toastBridge.act(Number(b.dataset.tact));
});
