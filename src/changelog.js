// What's new in each release, shown on the What's new page (drift://whatsnew) after an update.
// Newest first. Kinds: new, faster, fixed, changed. Written for people using Drift.
module.exports = [
  { version: '1.23.1', date: '2026-11-07', items: [
    ['changed', 'Blocked sites is now No-download sites (Settings → Privacy): you can still use the sites on your list, but nothing downloads while you\'re on them or from them, even if you click a download button. A notice says when a download was stopped.'],
  ] },
  { version: '1.23.0', date: '2026-11-07', items: [
    ['new', 'Blocked sites (Settings → Privacy): list sites you never want anything from. Their pages are blocked right away; after a restart, Drift won\'t even look them up, so no script, ad or file from them or their subdomains can load, download or land in the cache.'],
  ] },
  { version: '1.22.10', date: '2026-11-06', items: [
    ['fixed', '"Sign in with Google" on sites like Cloudflare no longer drops you back at the login page. Drift now switches back to its normal identity before Google returns you to the site, so the site sees the same browser that started the sign-in.'],
  ] },
  { version: '1.22.9', date: '2026-11-05', items: [
    ['fixed', 'Twitch follows and sign-in work again. The block came from Twitch\'s side and cleared after its stored data was cleared; Test Twitch (Settings → Privacy) stays in case it comes back.'],
    ['changed', 'Removed three changes from 1.22.3 to 1.22.5 that tried to fix Twitch without helping: Drift no longer adds Chrome-imitation details to pages, no longer attaches its debugging connection to every tab, and asks for site permissions the usual way again.'],
  ] },
  { version: '1.22.8', date: '2026-11-05', items: [
    ['changed', 'Test Twitch also checks a saved test profile with Drift\'s extension support, Chrome Web Store support, certificate viewer and uBlock Origin added one at a time.'],
  ] },
  { version: '1.22.7', date: '2026-11-05', items: [
    ['changed', 'Test Twitch now checks each part of your everyday profile on its own (your Twitch cookies, Drift\'s site permission answers, its request headers, uBlock Origin), to find the one Twitch objects to.'],
  ] },
  { version: '1.22.6', date: '2026-11-05', items: [
    ['new', 'Settings → Privacy → Test Twitch: finds out why Twitch won\'t let you follow channels or claim points. It opens Twitch in a few signed-out test windows, each with less of Drift switched on, and shows which ones Twitch accepts (the results are copied, ready to paste).'],
  ] },
  { version: '1.22.5', date: '2026-11-05', items: [
    ['fixed', 'Sites asking what they may use now get the same answers as in Chrome: "not decided yet" for notifications, location, camera and the like (Drift answered "denied" for everything, which anti-bot checks such as Twitch\'s read as an automated browser). Asking still works: click a site\'s button that asks, and Drift shows its usual question.'],
    ['fixed', 'Sites you allowed to show notifications were told they were not allowed.'],
  ] },
  { version: '1.22.4', date: '2026-11-05', items: [
    ['fixed', 'Drift identifies to sites as Google Chrome the way Chrome itself does (it reported only "Chromium", which anti-bot services associate with automation tools; Twitch then refused follows and channel-point claims). Pages, embedded frames, background workers and request headers all agree.'],
  ] },
  { version: '1.22.3', date: '2026-11-04', items: [
    ['fixed', "Sites see Drift more like Chrome: Chrome's window.chrome details (loadTimes, csi, app) were missing, which bot checks such as Twitch's take as a sign of a fake browser (Twitch then refuses to let you follow)."],
  ] },
  { version: '1.22.2', date: '2026-11-04', items: [
    ['fixed', "Following channels on Twitch works. Drift no longer changes any of a page's built-in functions: Twitch's anti-bot check took those changes for a bot and refused the follow."],
    ['changed', 'WebGPU (off unless allowed in Settings) is now turned off inside the engine, so sites simply see no graphics adapter, as on PCs without WebGPU support. Changing the setting takes effect after restarting Drift.'],
  ] },
  { version: '1.22.1', date: '2026-11-04', items: [
    ['fixed', 'Download anyway works: a download held for starting without a click is now paused and kept, not thrown away (files a site makes itself, like an export, could not be fetched again and failed).'],
    ['changed', 'Only file types that can carry malware (programs, scripts, archives, macro-enabled Office files) need a click to download. Documents, data files, pictures and video download as usual, including ones a site makes for you.'],
  ] },
  { version: '1.22.0', date: '2026-11-03', items: [
    ['new', 'Stronger protection against malware: downloads a site starts on its own (without you clicking) are blocked, with a notice to download anyway. Program and script files (.exe, .msi, .bat, .ps1, .js, .hta, .lnk, .iso and similar) ask before they are kept.'],
    ['new', 'Pop-up windows a site opens follow the pop-up blocker too, so they can no longer open more pop-ups on their own. Notification requests made without a click are blocked silently (scam pages use them for fake virus alerts).'],
    ['new', 'Workspaces (Settings → Tabs & memory): separate sets of tabs, like Work and Personal, switched at the top of the sidebar. Essentials are shared by all of them. Right-click a workspace to rename it or change its icon; right-click a tab to move it to another workspace.'],
    ['new', 'Compact mode (Settings → Appearance, or Ctrl+Alt+C): the page fills the whole window. Move the mouse to the left edge for the sidebar, or to the top edge for the toolbar and bookmarks.'],
    ['new', 'Tab previews: rest the pointer on a tab in the sidebar to see a picture of its page, its site and whether it is sleeping or playing audio.'],
    ['new', 'Clean links: copying a link (or the address from the address bar) removes tracking junk like utm_ tags, fbclid and YouTube\'s si=. Can be turned off in Settings → Shields.'],
  ] },
  { version: '1.21.0', date: '2026-11-01', items: [
    ['new', 'Zoom button in the address bar. When a page is zoomed it shows the level (like 125%); click it for − and + and a Reset to 100%. Ctrl+scroll, Ctrl+plus/minus and Ctrl+0 still work and update it.'],
  ] },
  { version: '1.20.2', date: '2026-10-31', items: [
    ['fixed', 'A blocked pop-up no longer leaves an empty tab behind. Ad scripts often open a blank page and then fill it in; those are now blocked like other pop-ups (on sites you allow, they open as a pop-up window the site can fill).'],
  ] },
  { version: '1.20.1', date: '2026-10-31', items: [
    ['changed', 'Tabs in split view are easy to spot: the two join into one outlined box in the sidebar with a split badge between them, in both the full and the slim sidebar. The pair on screen is highlighted, and so is the side you are using.'],
  ] },
  { version: '1.20.0', date: '2026-10-30', items: [
    ['changed', 'Essentials are kept for good: saved on their own, so they stay through restarts, closed windows and PC restarts, even with Reopen tabs on startup turned off. They stay until you remove them.'],
    ['new', 'Every window shows the same Essentials. Adding, removing or reordering them in one window updates the others.'],
    ['new', 'Add Essentials with the + tile at the end of them: type a site, or pick this tab, an open tab, a bookmark or a recent site.'],
    ['new', 'Drag Essentials to rearrange them; a space opens where the tile will land, in both the full and the slim sidebar.'],
  ] },
  { version: '1.19.0', date: '2026-10-30', items: [
    ['new', 'Essentials (like Zen): your always-there sites as icon tiles at the top of the sidebar. Drag a tab up into them, or right-click a tab → Add to Essentials.'],
    ['new', 'Closing an Essential (Ctrl+W, middle-click, or right-click → Unload) only unloads it, freeing its memory; the tile stays, and clicking it opens its site again. Right-click → Remove from Essentials turns it back into a normal tab.'],
    ['new', 'Each Essential remembers its site: after browsing elsewhere in it, unloading takes it back there. Right-click → Make this page its site to change it.'],
    ['faster', 'Essentials stay asleep at startup until you click them. Dimmed tiles are not loaded.'],
  ] },
  { version: '1.18.2', date: '2026-10-30', items: [
    ['faster', 'Glance opens sooner: on the new tab page, Alt+click starts the preview straight away (it used to wait for the site to answer a download first), links start loading as you press the mouse button, and the dimmed backdrop is ready as soon as you hold Alt.'],
    ['faster', 'Resting the pointer on a new tab page tile starts connecting to that site, so it opens sooner when you click.'],
  ] },
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
