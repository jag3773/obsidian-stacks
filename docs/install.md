# Install

Use a recent Obsidian version with **Bases** enabled for the library views.

1. In Obsidian, open **Settings → Community plugins** and choose **Browse**.
2. Search for **Stacks**, then install and enable it.

## Manual installation

Download `main.js`, `manifest.json`, and `styles.css` from the latest [release](https://github.com/jag3773/obsidian-stacks/releases). Put them in `<vault>/.obsidian/plugins/stacks/`, then enable **Stacks** in Community plugins.

**Upgrading from 0.2.x?** The plugin was renamed from Library to Stacks in 0.3.0, and its ID changed from `library` to `stacks`. Disable the old plugin and keep a backup of its folder. To retain your settings, copy `.obsidian/plugins/library/data.json` into the new `stacks` folder before enabling Stacks, then remove the old folder.

**Upgrading from 0.1.x?** The plugin ID changed from `reference-library` to `library` in 0.2.0. Disable the old plugin and keep a backup of its folder. To retain your settings, copy its `data.json` into the new `library` folder before enabling the new version.

Then [set up your library](getting-started.md#set-up-your-library).
