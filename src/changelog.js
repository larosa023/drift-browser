// What's new in each release, shown on the What's new page (drift://whatsnew) after an update.
// Newest first. Kinds: new, faster, fixed, changed. Written for people using Drift.
module.exports = [
  { version: '1.33.6', date: '2026-11-28', items: [
    ['changed', 'Page scrollbars match Drift: a slim rounded bar that takes your theme\'s accent colour when you hover or grab it, and follows theme changes right away. Sites that style their own scrollbars keep theirs.'],
    ['new', 'Settings → Look → Page scrollbars: Drift, Hidden (scroll with the wheel, touchpad or keys), or Windows\' own.'],
  ] },
  { version: '1.33.5', date: '2026-11-28', items: [
    ['changed', 'Drift\'s own look for its questions. "Save password?" and site permission requests are now a small card under the toolbar instead of a plain Windows box, and confirmations like deleting history or adding an extension are Drift dialogs. Esc cancels, Enter picks the highlighted button.'],
  ] },
  { version: '1.33.4', date: '2026-11-25', items: [
    ['fixed', 'No more "A JavaScript error occurred in the main process" box when an extension updates or installs (seen with Hoopology Play Finder). An extension\'s page asking for events while the extension is briefly reloading is now skipped; it asks again a moment later.'],
  ] },
  { version: '1.33.3', date: '2026-11-25', items: [
    ['improved', 'Volume mixer is smooth: dragging a slider only changes the level, and the slower setup happens once when you let go, so pages keep running smoothly while you drag. The sound glides to the new level instead of stepping (no crackle).'],
    ['improved', 'Fewer updates while dragging (about 30 a second instead of one per screen refresh on high-refresh monitors), and the deep search for hidden players only runs when nothing quicker finds them, once per page.'],
    ['fixed', 'Scrolling quickly on a tab\'s speaker icon now counts every notch, and the slider no longer jumps back for a moment after you let go.'],
  ] },
  { version: '1.33.2', date: '2026-11-25', items: [
    ['fixed', 'Volume mixer: now reaches players it used to miss. That covers players a site keeps out of the page, players inside page components, and players in embeds from other sites (like a Spotify or YouTube player on another site). It also finds them again each time a new clip starts.'],
    ['fixed', 'The "reload to apply" message only shows when the sound really can\'t be changed while it plays.'],
  ] },
  { version: '1.33.1', date: '2026-11-25', items: [
    ['fixed', 'Volume mixer: works on music sites whose player isn\'t part of the page (and so was never found), and on tabs whose volume you set before they play: once a tab\'s volume is changed, it applies from the start of every page load in that tab.'],
    ['fixed', 'If a page started its sound in a way Drift can\'t reach while it plays, changing its volume now says so and offers to reload the tab, instead of the slider doing nothing.'],
  ] },
  { version: '1.33.0', date: '2026-11-24', items: [
    ['new', 'Drag to split: drag a tab from the sidebar onto the left or right half of the page. The half it will fill shows "Split on the left / right" while the page moves aside, and letting go opens the two side by side. Already in split view? The tab takes the place of the page on that side.'],
    ['new', 'Drop a tab onto another tab in the sidebar to split them. Drag one out of the pair to put it back on its own.'],
    ['changed', 'A split pair sits side by side in one row of the sidebar.'],
    ['changed', 'Tabs switch when you let go of the click, so you can press and drag a tab without leaving the page you\'re on.'],
  ] },
  { version: '1.32.0', date: '2026-11-24', items: [
    ['new', 'Reader view: the book button in the address bar (or Ctrl+Alt+R) shows just the article, with text size, sans/serif, column width and light / sepia / dark. Click it again or press Esc to go back.'],
    ['new', 'Screenshots: Ctrl+Shift+S copies what you see and saves it to Pictures\\Drift Screenshots. Right-click a page → Screenshot for the whole page.'],
    ['new', 'QR code for a page: right-click → "QR code for this page" and scan it with your phone to open it there.'],
    ['new', 'More ways to make Drift look your way (Settings → Appearance): floating pages with rounded corners, a see-through Windows 11 background, the font, tab size, and your own CSS for the interface.'],
    ['changed', 'Chrome Web Store: the "Switch to Chrome to install extensions" banner is gone. Drift installs them.'],
  ] },
  { version: '1.31.2', date: '2026-11-23', items: [
    ['new', 'Cast YouTube to your TV: "Cast to TV…" on a YouTube video opens it in the TV\'s YouTube app, at the same spot (and playlist), with Drift as the remote.'],
    ['changed', 'Speakers (Google Home / Nest speakers) are marked "Speaker · sound only" in the cast list and listed after TVs.'],
  ] },
  { version: '1.31.1', date: '2026-11-23', items: [
    ['fixed', "Extensions with a side panel (like Hoopology Play Finder) work now: their toolbar button opens the extension's panel in Drift's side panel, and the panel can talk to the extension and your tabs."],
    ['fixed', "Newer (Manifest V3) extensions that use a side panel can now also use windows, tabs and their toolbar button's click from their background script."],
  ] },
  { version: '1.31.0', date: '2026-11-23', items: [
    ['new', 'Cast to TV: right-click a page, a video or a tab and choose "Cast to TV…" to send the video to a Chromecast or Google TV on your Wi-Fi. Drift becomes the remote: play, pause, seek, TV volume and Stop, from the cast button at the top. Live streams work too, since Drift passes the stream to the TV the way the site expects. The first time, allow Drift through Windows Firewall on private networks.'],
    ['changed', "Casting can't send copy-protected video (Netflix, Disney+ and the like), and YouTube isn't supported yet."],
  ] },
  { version: '1.30.0', date: '2026-11-23', items: [
    ['new', 'Translate page with AI: right-click a page and choose "Translate page". Your local Ollama model rewrites the text in place, starting with what is on screen. "Show original" flips back and forth, and Stop halts it. Pick the language in Settings → AI.'],
    ['new', 'Sort downloads: turn it on in Settings → Downloads and videos, pictures, music, documents, installers and ZIPs each go into their own folder inside Downloads.'],
  ] },
  { version: '1.29.1', date: '2026-11-22', items: [
    ['new', '"Picture in picture" is now in the right-click menu anywhere on a page (not only right on a bare video) — it pops out the video you clicked on, or the page\'s main video, including ones inside embedded players like Twitch and YouTube. It\'s in a tab\'s right-click menu too.'],
    ['new', 'Right-click any tab — including the one you\'re on — for "Split view with…" and pick the other tab (or a new one).'],
  ] },
  { version: '1.29.0', date: '2026-11-20', items: [
    ['new', 'Element zapper: right-click any annoying part of a site → "Hide an element…" (or press Ctrl+Shift+X). Hover to highlight, scroll to pick a bigger or smaller area, click to hide it — as many as you like, with Undo. It stays hidden every time you visit that site. To bring things back, use Undo on the notice, or "Show again" in the site info panel (the icon left of the address). In private windows things are hidden for that visit only.'],
  ] },
  { version: '1.28.0', date: '2026-11-19', items: [
    ['new', 'AI panel, powered by Ollama on your own PC (free, private, works offline). Open it with the ✦ button in the top bar or Ctrl+Alt+I: summarize the page, list its key points, or ask anything about it. Right-click a page for "Summarize this page with AI", or select text and pick "Ask AI about this". Answers stream in as they\'re written; pick any model you have in Ollama at the top.'],
    ['new', 'Multiviewer: watch 2 to 4 tabs at once in one window. Click the split button in the address bar → "Multiviewer with…", or right-click a tab → "Open in multiviewer with current tab". Choose equal tiles or one big with the others small; sound comes from the one you click into (or from all of them). It\'s kept after a restart.'],
    ['new', 'Colour themes (Settings → Appearance): Midnight, Ocean, Forest, Grape, Rose, Ember, Sand and Graphite tint Drift and its pages, each with a matching accent. "Match Windows" follows your Windows accent colour and your desktop wallpaper\'s colours.'],
  ] },
  { version: '1.27.3', date: '2026-11-18', items: [
    ['fixed', 'Dragging the window from the empty part of the top bar (next to the address bar) only worked some of the time. When Windows misses the drag there, Drift now moves the window itself and fixes the spot for next time; double-clicking there maximizes as usual.'],
  ] },
  { version: '1.27.2', date: '2026-11-11', items: [
    ['fixed', 'The empty part of the top bar between the address bar and the buttons on the right sometimes wouldn\'t drag the window. Drift now refreshes where the bar can be dragged whenever its buttons change size.'],
  ] },
  { version: '1.27.1', date: '2026-11-11', items: [
    ['fixed', 'With two windows open, a video (or any busy page) in one made the other lag: every ad blocked and every change to an extension\'s badge refreshed the sidebar and extension buttons in every window, and reloaded the extension icons each time. Now each window only refreshes for its own changes, badge updates are capped at about ten a second, and extension icons are only reloaded when they change.'],
  ] },
  { version: '1.27.0', date: '2026-11-10', items: [
    ['new', 'Right-click in the address bar, the find box or any text field in the sidebar for Cut, Copy and Paste, plus "Paste and go" (or "Paste and search") in the address bar.'],
    ['new', 'Ctrl+Shift+C copies the page\'s link, Ctrl+M mutes or unmutes the tab, Ctrl+Shift+PgUp / PgDn moves the tab up or down the list (stepping over folders), and Ctrl+Shift+W closes the window.'],
    ['new', 'Right-click a link → "Open link in split view". Right-click a tab → "Close duplicate tabs". Copying a link now says "Link copied".'],
    ['improved', 'The address bar shows your open tabs, bookmarks and history the moment you type; the web\'s search suggestions join a moment later instead of holding everything up.'],
    ['improved', 'The sidebar does less work while pages load: site icons are sent to it only when they change, and updates that change nothing are skipped.'],
    ['improved', 'Ctrl+Tab, and closing a tab, skip tabs tucked away in a folded-up folder.'],
    ['fixed', 'Rename… on a tab folder (and naming a new folder) did nothing. So did Rename / change icon… on a workspace.'],
    ['fixed', 'A copied password is now really cleared from the clipboard after 30 seconds (it stayed there).'],
    ['fixed', 'Private windows: the new tab page no longer shows your top sites, your normal tabs no longer appear in the address bar\'s suggestions (or the other way round), "Open link in new window" opens a private one, site info and its permissions and "Clear data" apply to the private window, the shield button works there (uBlock doesn\'t run in private windows; the built-in blocker does, and now follows the main Shields switch), and private downloads only show in private windows.'],
    ['fixed', 'Clear browsing data now also empties the list Ctrl+Shift+T reopens from.'],
    ['fixed', 'The shortcuts list in Settings showed "Private window" twice.'],
  ] },
  { version: '1.26.1', date: '2026-11-09', items: [
    ['fixed', 'Folders on the bookmarks bar showed only their arrow, without their name, when the sidebar was narrow (1.26.0).'],
  ] },
  { version: '1.26.0', date: '2026-11-09', items: [
    ['new', 'Private windows (Ctrl+Shift+N, or right-click a link or tab): sites can\'t see your normal cookies or sign-ins, nothing goes into History or search history, and everything the sites stored is wiped when you close the last private window. Ad blocking still works; extensions don\'t run there.'],
    ['new', 'Side panel (Ctrl+Alt+P, or the button next to Downloads): keep a site open beside your tabs, like Twitch chat, a schedule or a feed. Drag its edge to resize; it stays across restarts. Right-click a link or tab for "Open in side panel".'],
    ['new', 'Tab folders: right-click a tab → Add to new folder. Click a folder to fold it away, right-click it to rename, recolour, ungroup or close it, drag tabs onto it to add them. Folders are kept after a restart.'],
    ['fixed', 'Removed extensions could come back after a restart, when Windows hadn\'t let go of one of their files at the time. Drift now finishes removing them at the next start, before extensions load.'],
  ] },
  { version: '1.25.3', date: '2026-11-08', items: [
    ['new', 'A download button in the address bar: click it to block all downloads on the site you\'re on (it turns red and crossed out), click again to allow them. It uses the No-download sites list in Settings → Privacy.'],
  ] },
  { version: '1.25.2', date: '2026-11-08', items: [
    ['new', 'Blocked sites (Settings → Privacy), next to No-download sites: nothing from the sites you list loads at all, not even inside other pages (like a shady video player on a stream site), so nothing from them can reach your cache. Pages from them are blocked as soon as you save; click Restart Drift to block everything else they load.'],
  ] },
  { version: '1.25.1', date: '2026-11-08', items: [
    ['new', 'Right-click a video or audio player: Save video as…, Open in new tab and Copy address, when it\'s a plain file. Streamed video (most big sites) says it can\'t be saved.'],
  ] },
  { version: '1.25.0', date: '2026-11-08', items: [
    ['new', 'Tabs keep their Back and Forward history after Drift restarts, when you reopen a closed tab (Ctrl+Shift+T), and when you duplicate one.'],
    ['new', 'Closed a window by mistake? Ctrl+Shift+T brings the whole window back, with its tabs.'],
    ['new', 'Sites remember their zoom level, even after a restart.'],
    ['new', 'Downloads: the list is kept after a restart; shows speed and time left; download again a failed, cancelled or deleted file; remove single entries; drag a finished file straight into a folder or another app. Ctrl+J opens the list.'],
    ['new', 'Settings has a search box.'],
    ['new', 'Right-click a link for Save link as… and Copy link text; right-click a page for Copy page link and View page source.'],
    ['new', 'Ctrl+Enter in the address bar turns "example" into www.example.com.'],
    ['new', 'History: in Sites, pick a site and remove everything from it in one go.'],
    ['changed', 'Test Twitch is quicker (two test windows, under a minute) and, when only your profile is flagged, offers to clear what Twitch stored. Leftover test profiles from earlier versions are deleted.'],
    ['fixed', 'Settings no longer redraws many times a second while pages load (drop-downs could close on their own).'],
    ['fixed', 'Two downloads with the same name at the same time no longer write to the same file.'],
    ['fixed', '"Close other tabs" and "Close tabs below" only close tabs in the workspace you\'re looking at.'],
    ['fixed', '"Open link here" uses the right identity and dark-mode setting for the site.'],
    ['fixed', 'A page that failed to load because you were offline reloads itself when the connection comes back.'],
    ['fixed', 'The new tab page clock changes on the minute.'],
  ] },
  { version: '1.24.1', date: '2026-11-08', items: [
    ['new', 'Open a blank homepage tab any time: Ctrl+Alt+T, or right-click (or middle-click) the + button.'],
    ['new', 'Settings → New tabs open your homepage: makes + and Ctrl+T open the homepage instead of the command bar.'],
  ] },
  { version: '1.24.0', date: '2026-11-07', items: [
    ['new', 'History (Ctrl+H, or Settings → Privacy): everything you search for, grouped by day, from the address bar and on Google, YouTube, Amazon, Twitch, Reddit and more. Filter by where you searched, find old searches, click one to search again, or remove it.'],
    ['new', 'History also lists the sites you\'ve visited, by day, with a filter for each site.'],
  ] },
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
