# Drift

A lightweight Chromium browser with Zen-style vertical tabs and Brave-style shields.

## Install (Windows)

Download **Drift-Setup-x.y.z.exe** from [Releases](https://github.com/larosa023/drift-browser/releases/latest) and run it. Windows SmartScreen will warn the first time because the app isn't code-signed: click **More info → Run anyway**.

After that, Drift updates itself: it checks GitHub for new releases, downloads them in the background, and installs on the next restart (Settings → About shows the status). The portable zip is also on each release but doesn't auto-update.

## Releasing a new version

1. Bump `version` in `package.json`, commit, and push to `main`.
2. GitHub Actions builds the installer on Windows and publishes release `v<version>` (pushes that don't change the version are skipped).
3. Installed copies of Drift update themselves.

## Run from source

Requires Node.js 20 or newer.

```
npm install
npm start
```

To build the Windows installer locally: `npm run dist` (output goes to `dist/`).

## Features

- **Vertical tabs** in a resizable sidebar, with drag-to-reorder. Drag the sidebar's edge all the way in (or click the sidebar icon at the top left) for an **icon-only sidebar**.
- **Pinned tabs** shown as tiles at the top (drag a tab up there, or right-click → Pin)
- **Command bar** (Ctrl+T / Ctrl+L): search, open sites, jump to open tabs and history
- **Shields = built-in uBlock Origin 1.75.0.** Click the shield in the address bar for its popup (per-site switch, counts, and the dynamic-filtering grid in advanced mode). Settings → Shields → *uBlock Origin dashboard* opens My filters, filter lists, and advanced settings. A lighter built-in blocker can be chosen instead.
- **Compact mode** (Ctrl+Alt+S): hides the sidebar; touch the left edge to peek at it
- **Tab sleeping**: background tabs are unloaded after 20 minutes to save memory
- **Chrome extensions**: click the puzzle icon → *Get extensions*, then **Add to Chrome** on any Chrome Web Store page. Extension buttons appear under the address pill; their popups, badges and options pages work. Hide a button with the eye icon in the Extensions panel.
- **Volume mixer** (sliders icon at the bottom of the sidebar): per-tab volume from 0 to 300%, mute, reset. Scroll on a tab's speaker icon to adjust it, or right-click a tab → Volume.
- **Top toolbar** with back/forward/reload, an **address bar** you can click into (suggestions drop down from it), bookmark star, Shields, extension buttons, and window buttons. Drag empty space to move the window.
- **Bookmarks bar** under the address bar (Ctrl+Shift+B). Ctrl+D or the star bookmarks a page; drag a tab onto the bar to bookmark it; drag bookmarks to reorder; right-click to edit or delete. Folders open as menus. Import straight from Chrome, Edge, Brave, Opera or Vivaldi on the same PC, or from any browser's bookmarks.html file.
- **Split view**: the split button right of the address bar puts two tabs side by side (or stacked). Pick a new tab or any open tab; drag the divider to resize (double-click it to even them out); click a page to make it the one the toolbar controls. Right-click a tab → *Open in split view* also works.
- **Wallpapers** (Settings → Appearance): 8 built-in, your own image, or your Windows desktop background. Shows behind the sidebar and toolbar and on the new tab page, with dim and blur sliders.
- **Force dark pages** (Settings → Appearance), the same Chromium feature Opera uses. The moon in the address bar turns it off for one site.
- **Passwords** (Settings → Passwords): encrypted with your Windows account, offers to save when you sign in, and suggests saved logins when you click a sign-in field. Import a CSV export from Chrome, Edge, Brave, Opera, Firefox, Bitwarden, 1Password, LastPass and others; export to CSV.
- **Session restore**, downloads panel, find on page, zoom, dark/light themes, 10 accent colors
- Site permissions (camera, mic, location, notifications) prompt you instead of being granted automatically

## Shortcuts

| Action | Keys |
|---|---|
| Command bar / new tab | Ctrl+T |
| Bookmark page | Ctrl+D |
| Show/hide bookmarks bar | Ctrl+Shift+B |
| Edit address | Ctrl+L |
| Close tab / reopen closed tab | Ctrl+W / Ctrl+Shift+T |
| Next / previous tab | Ctrl+Tab / Ctrl+Shift+Tab |
| Jump to tab 1–9 | Ctrl+1 … Ctrl+9 |
| Find on page | Ctrl+F |
| Hide / show sidebar | Ctrl+Alt+S |
| Back / forward | Alt+← / Alt+→ (mouse side buttons work too) |
| Zoom | Ctrl+= / Ctrl+- / Ctrl+0 |
| Fullscreen | F11 |
| Developer tools | F12 |

## Known limitations

- **DRM video** (Netflix, Disney+, Spotify web player) won't play. Stock Electron doesn't ship Widevine. Switching to the castLabs Electron build fixes this.
- **Extensions** work through the `electron-chrome-extensions` library, which covers most but not all of Chrome's extension APIs. uBlock Origin is built in, so don't install another ad blocker on top of it. Extensions that capture tab audio (volume mixers) won't work either, since that API isn't available; use the built-in volume mixer instead.
- **Google sign-in**: Drift presents itself as Firefox on accounts.google.com only, because Google refuses sign-in from browsers it recognises as embedded Chromium.
- Passwords can't be imported directly from another browser's profile (Chrome encrypts them to itself); export a CSV from that browser first and import the file. Delete the CSV afterwards.

## Where data lives

`%APPDATA%\Drift` holds settings, history, bookmarks, the open-tab session, the cached ad-block lists, and `passwords.json` (encrypted with Windows DPAPI).

## Project layout

```
src/main.js          main process: window, tabs, shields, shortcuts, downloads
src/ui/              sidebar, command bar, find bar, settings (HTML/CSS/JS)
src/pages/newtab.html  new tab page
src/bookmarks.js     bookmarks store + import/export
src/passwords.js     encrypted password store + CSV import/export
src/wallpapers.js    built-in wallpapers
extensions/ublock/   bundled uBlock Origin (see DRIFT-CHANGES.txt for the three small patches)
scripts/patch-deps.js  fixes applied to electron-chrome-extensions after npm install
build/               app icon
```
