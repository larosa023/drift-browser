// Tab preview card: title, site, state and (for loaded tabs) a picture of the page.
const $ = (s) => document.querySelector(s);
let lastId = null;
window.hoverBridge.onShow((d) => {
  document.body.className = d.dark ? 'dark' : 'light';
  if (d.id !== lastId) { const c = $('#card'); c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; lastId = d.id; }
  $('#title').textContent = d.title;
  $('#sub').textContent = d.sub;
  const fav = $('#fav');
  if (d.favicon) { fav.src = d.favicon; fav.classList.remove('none'); } else fav.classList.add('none');
  const shot = $('#shot');
  shot.className = d.shot ? '' : d.waiting ? 'wait' : 'none';
  shot.style.backgroundImage = d.shot ? `url("${d.shot}")` : '';
});
