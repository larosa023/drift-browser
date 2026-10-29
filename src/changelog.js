// What's new in each release, shown on the What's new page (drift://whatsnew) after an update.
// Newest first. Kinds: new, faster, fixed, changed. Written for people using Drift.
module.exports = [
  { version: '1.14.2', date: '2026-10-29', items: [
    ['fixed', 'With two windows open, a notification could stay stuck on screen, show up in the wrong window, or cause an error popup.'],
    ['fixed', 'Results of importing or exporting bookmarks and passwords, and Clear data in site info, always apply to the window you used.'],
    ['fixed', 'A sleeping tab wakes up still muted, at its volume, with its Back and Forward history.'],
    ['fixed', 'Switching tabs while a video is fullscreen leaves fullscreen instead of getting stuck there.'],
    ['fixed', 'Tabs opened from a pinned tab, and tabs you unpin, land in the right place.'],
    ['changed', 'Passwords saved on a secure (https) page are never offered on an insecure (http) one.'],
    ['faster', 'The notification bubble closes its process when unused, saving memory.'],
  ] },
  { version: '1.14.1', date: '2026-10-29', items: [
    ['fixed', 'No more "JavaScript error occurred in the main process" popup when Drift restarts to install an update.'],
    ['fixed', 'Restarting to update keeps all your windows, not just the last one.'],
  ] },
  { version: '1.14.0', date: '2026-10-29', items: [
    ['new', "This page: after each update, Drift shows what changed. You can open it any time from Settings → About."],
  ] },
  { version: '1.13.16', date: '2026-10-29', items: [
    ['fixed', 'Drift could freeze when reopening more than one window, and stop mouse clicks from working anywhere until it was closed.'],
    ['changed', 'Large diagnostic files left by earlier versions are cleaned up, freeing disk space.'],
  ] },
  { version: '1.13.15', date: '2026-10-29', items: [
    ['faster', 'Links to other sites start connecting while you hover them, so pages begin loading sooner after the click.'],
    ['faster', 'Hovering sites inside bookmark folders warms them up too.'],
  ] },
  { version: '1.13.14', date: '2026-10-28', items: [
    ['changed', "The slim sidebar no longer flies out when you hover it. Use the button at the top left to switch between the slim and full sidebar."],
  ] },
  { version: '1.13.13', date: '2026-10-28', items: [
    ['fixed', 'Drag a tab out of the window to open it in a new window, or onto another Drift window to move it there.'],
    ['changed', 'Tab dragging was rebuilt: reorder, pin (drop on the pinned area) and bookmark (drop on the bookmarks bar) all work by dragging. Press Esc to cancel a drag.'],
  ] },
  { version: '1.13.12', date: '2026-10-28', items: [
    ['fixed', 'All Drift windows share one taskbar icon.'],
  ] },
  { version: '1.13.11', date: '2026-10-28', items: [
    ['fixed', 'Twitch no longer freezes the whole window for a couple of seconds while it loads.'],
    ['new', 'Settings → Allow WebGPU, for 3D and AI sites that need it (off by default).'],
  ] },
  { version: '1.13.7', date: '2026-10-28', items: [
    ['faster', 'With force dark on, sites opened from a new tab load once instead of twice.'],
  ] },
  { version: '1.13.6', date: '2026-10-28', items: [
    ['fixed', 'Pages could stop responding to clicks and scrolling after the mouse brushed past the sidebar.'],
  ] },
  { version: '1.13.5', date: '2026-10-28', items: [
    ['faster', 'Tabs use less memory, and each new tab page about 20 MB less.'],
    ['faster', 'Saving history, tabs and bookmarks no longer pauses browsing.'],
  ] },
  { version: '1.13.4', date: '2026-10-28', items: [
    ['fixed', 'The sidebar flyout stays solid while it slides shut, and opening menus no longer blanks the page for a moment.'],
  ] },
];
