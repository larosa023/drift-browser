// What's new in each release, shown on the What's new page (drift://whatsnew) after an update.
// Newest first. Kinds: new, faster, fixed, changed. Written for people using Drift.
module.exports = [
  { version: '1.18.1', date: '2026-10-30', items: [
    ['fixed', 'Alt+click opens Glance everywhere, including links in embedded frames and on the new tab page (it could download the page as an .html file instead).'],
    ['fixed', 'Double-clicking an HTML file in Explorer opens it in Drift (Windows added an invisible character to the file path).'],
  ] },
  { version: '1.18.0', date: '2026-10-30', items: [
    ['new', 'Pop-up blocker: pages can open a new tab or window only right after you click, one per click. Pop-under ads that turn a click on the page (or on an invisible layer over it) into an ad are stopped too. When something is blocked, a small notice lets you open it or always allow that site; manage it in Settings → Shields.'],
    ['new', 'Glance: Alt+click a link (or right-click → Glance) to preview it floating over the page. Open as tab keeps it (Ctrl+Enter); Esc or a click beside it closes it.'],
    ['new', 'Picture in picture: hover a video and press Pop out to keep it playing in a small window on top while you do other things. Also in the right-click menu on videos.'],
    ['changed', 'Every release now checks its protected-video verification before it ships.'],
  ] },
  { version: '1.17.2', date: '2026-10-30', items: [
    ['fixed', 'Protected video (NBA and other streaming sites) gets its licence: the verification added in 1.17.1 was being undone by a later build step.'],
  ] },
  { version: '1.17.1', date: '2026-10-30', items: [
    ['fixed', 'Drift is now verified for protected video (Widevine VMP), so streaming sites that require a verified browser accept it.'],
  ] },
  { version: '1.17.0', date: '2026-10-30', items: [
    ['new', 'Protected video plays: sites that use DRM (NBA, Spotify, streaming services) no longer fail with "no key system". Drift fetches the Widevine video module from Google the first time (about 10 MB) and keeps it updated.'],
  ] },
  { version: '1.16.2', date: '2026-10-30', items: [
    ['fixed', 'Opening a file or link from Windows while Drift is already running hands it over more reliably.'],
    ['changed', 'Launches and hand-offs are noted in a small log (logs\\launch.log) to track down anything that still does not open.'],
  ] },
  { version: '1.16.1', date: '2026-10-30', items: [
    ['fixed', 'Double-clicking an HTML file (or opening it with Drift from Explorer) opens it in a tab again, also while Drift is already running.'],
  ] },
  { version: '1.16.0', date: '2026-10-30', items: [
    ['new', 'Open files from your computer: press Ctrl+O, drag files onto the sidebar or toolbar, or paste a file path (like C:\\Users\\you\\page.html, quotes and all) into the address bar.'],
    ['new', 'Local web pages load with their own styles, scripts and images, and links between them work.'],
  ] },
  { version: '1.15.6', date: '2026-10-29', items: [
    ['fixed', "New versions are noticed much sooner: Drift checks every 30 minutes and whenever you come back to it after 10 minutes away (it used to check only hourly, so a release could go unnoticed for an hour)."],
    ['changed', 'The dot on the settings gear appears as soon as a new version starts downloading; hover it to see the progress. The Update button appears when it is ready.'],
  ] },
  { version: '1.15.5', date: '2026-10-29', items: [
    ['changed', 'A test release to check the new update notification. No other changes.'],
  ] },
  { version: '1.15.4', date: '2026-10-29', items: [
    ['new', 'When a new version is ready, a small dot appears on the settings gear and an Update button in the sidebar footer. One click restarts into the new version.'],
    ['changed', 'Drift checks for new versions every hour instead of every four.'],
  ] },
  { version: '1.15.3', date: '2026-10-29', items: [
    ['changed', 'The page now fills the window to the right and bottom edges: no more thin border around it, just one clean view.'],
  ] },
  { version: '1.15.2', date: '2026-10-29', items: [
    ['changed', 'The portable zip download is back to its smaller size.'],
  ] },
  { version: '1.15.1', date: '2026-10-29', items: [
    ['faster', 'Updates install faster: Drift now installs about 27 files instead of about 680 (the built-in ad blocker ships as one file and unpacks itself only when it changes).'],
    ['faster', 'Starting on a new tab is about twice as fast.'],
    ['fixed', 'Ads are blocked on the very first page after Drift starts (pages used to load before the blocker had its filter lists ready).'],
    ['faster', 'A tab dragged out of the window opens in its new window straight away.'],
    ['changed', 'Diagnostic logging switches itself off after two days.'],
  ] },
  { version: '1.15.0', date: '2026-10-29', items: [
    ['new', 'Drift can be your default browser: it now appears in Windows Settings → Apps → Default apps. Settings → About → Default browser takes you there and shows when Drift is the default.'],
    ['new', 'Links from other apps and web files (.html, .svg, .pdf and more) open in Drift when it is the default.'],
  ] },
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
