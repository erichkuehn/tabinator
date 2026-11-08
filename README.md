# Tabinator

A small Brave/Chrome extension that lets you rename tabs.

## Install (Brave or Chrome)

1. Download `tabinator-<version>.zip` from the
   [latest release](https://github.com/erichkuehn/tabinator/releases/latest)
   and unzip it. Keep the `tabinator` folder somewhere permanent; the browser
   loads the extension from it.
2. Open `brave://extensions` (or `chrome://extensions`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `tabinator` folder.
5. Optional: pin the extension from the puzzle-piece menu.

To update, download the new zip, replace the folder's contents, and click the
reload icon on Tabinator in the extensions page. Your tab names are kept.

Brave may show a warning at startup about developer-mode extensions; that's
expected for extensions installed this way.

## Use

- Click the toolbar icon, or press **Alt+Shift+R**, type a name, press Enter.
- Or right-click anywhere on the page and choose **Rename tab…**.
- **Reset** restores the page's own title. Saving an empty name does the same.
- Pick a **Tab color** in the popup, or from **Tab color** in the page's
  right-click menu. Colors use Brave's tab groups: an ungrouped tab gets its
  own small group, a tab already in a group recolors that whole group, and
  **No color** takes the tab out of its group. Brave restores groups after a
  restart on its own.
- Change the shortcut at `brave://extensions/shortcuts`.

## Behavior

- Names belong to the tab: they stay when you navigate or reload, even if the
  site keeps changing its title (Gmail unread counts, etc.).
- Names survive restarting Brave, as long as Brave reopens your tabs
  (`brave://settings/getStarted` → "Continue where you left off"). After a
  restart, names are matched back to tabs by URL.
- Closing a single tab, or closing a window during the day, forgets its names.
  Only windows still open when you quit Brave keep theirs.
- Browser-internal pages (`brave://…`, the Chrome Web Store, the new tab page)
  can't be renamed; extensions aren't allowed to touch them.

## Files

- `manifest.json`: extension config (Manifest V3)
- `background.js`: stores each tab's name and sends it to the page
- `content.js`: sets `document.title` and re-applies it when the site changes it
- `popup.html` / `popup.js`: the rename box

## License

MIT. See [LICENSE](LICENSE).
