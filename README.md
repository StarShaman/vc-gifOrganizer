# GifOrganizer

A [Vencord](https://vencord.dev) userplugin that sorts your favorite GIFs into categories, so you stop scrolling through one giant favorites list.

## Features

- **Category cards** at the top of the GIF picker, before Discord's trending categories — click one to see only that category's GIFs.
- **Folder button on every GIF**, in the picker and directly in chat next to Discord's favorite star — click it to file the GIF into a category or create a new one.
- **Right-click menus** everywhere: GIFs get add/remove options, your category cards get rename/delete, and GIFs in chat get a "GIF categories" submenu.
- Categories are stored locally via Vencord's DataStore. Deleting a category never deletes GIFs — it's just a grouping.

## Quick setup

Prerequisites: [Git](https://git-scm.com/), [Node.js](https://nodejs.org/), and pnpm (`npm i -g pnpm`).

```console
git clone https://github.com/Vendicated/Vencord
cd Vencord
pnpm install --frozen-lockfile
git clone https://github.com/StarShaman/vc-gifOrganizer src/userplugins/gifOrganizer
pnpm build
pnpm inject
```

`pnpm inject` links your Discord install to this build — pick your Discord flavor in the prompt, then fully restart Discord (quit it from the tray, not just the window). Finally enable **GifOrganizer** under Settings → Vencord → Plugins.

Full Vencord installation guide: <https://docs.vencord.dev/installing/>

## Updating

- **Vencord itself**: Settings → Vencord → Updater works for source installs — it pulls the latest Vencord and rebuilds.
- **This plugin**: run `update.ps1` — it pulls the plugin *and* Vencord, then rebuilds everything:

```console
powershell -ExecutionPolicy Bypass -File src\userplugins\gifOrganizer\update.ps1
```

To make that automatic, schedule it with Task Scheduler (example: daily at 09:00):

```console
schtasks /Create /TN VencordPluginUpdate /SC DAILY /ST 09:00 /TR "powershell -ExecutionPolicy Bypass -File \"C:\path\to\Vencord\src\userplugins\gifOrganizer\update.ps1\""
```

Fully restart Discord after an update to load it.

## Settings

- **Video support** *(off by default)* – also save plain videos (uploads and video embeds) to categories, with a folder button on videos in chat. Tenor/Giphy GIFs are always supported regardless. Saved videos show a "VIDEO" tag with their duration in the corner of their tile in category views.
- **Exclusive categories** *(off by default)* – each GIF/video can only be in one category at a time; remove it from its category before filing it into another.
- **Hide favorites star in categories** *(off by default)* – hide Discord's add/remove-favorites star on tiles while browsing your categories.
- **Only show categories** – hide Discord's trending categories entirely.
- **Newest first** – GIF order inside a category view.
- **Card sort** – name / recently updated / newest created.
- **Chat button / chat context menu** – toggle the in-chat integrations.
- **Category prefix** – internal marker used in picker queries (hidden in the UI); only change it if it conflicts with something.
- **Empty category image** – thumbnail for categories with no GIFs yet.

## Notes

- GIFs added from Discord CDN attachment links can expire (Discord rotates those URLs); Tenor/Giphy favorites are stable.
- Webpack patch anchors are modeled after Equicord's GifCollections (GPL-3.0-or-later); the implementation is original.

## License

[GPL-3.0-or-later](LICENSE)
