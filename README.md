# Vault Badge Styles

Vault Badge Styles adds badge-like icons, colors, and shortened labels to Obsidian vault items.

The plugin is rule-based: styles are configured in plugin settings, not in note frontmatter.

## Features

- Folder rules with optional cascade to nested files and folders.
- Exact file rules for any vault file format.
- External link rules by URL prefix, for example `tg://`, `tel:`, `https://vk.com/`.
- SVG icons from configurable vault folders.
- Emoji or text icons.
- Text and background colors for badges.
- Shared badge background opacity.
- Internal link path shortening in Reading View.
- Nested tag shortening in Reading View.
- Rendering in File Explorer, Reading View, properties, Bases, backlinks-like panels, and tab headers.
- Rule search in settings.
- Matched path preview and rule/icon validation commands.
- Config export/import via `vault-badge-styles.config.json`.

## Installation via BRAT

1. Install the Obsidian plugin **Obsidian42 - BRAT**.
2. Open Command Palette.
3. Run `BRAT: Add a beta plugin for testing`.
4. Paste this repository URL:

   `https://github.com/hubbleDJ/obsidian-vault-badge-styles`

5. Select the latest version.
6. Enable **Vault Badge Styles** in Obsidian Community Plugins.

## Manual installation

1. Download the latest release.
2. Copy these files:

   - `main.js`
   - `manifest.json`
   - `styles.css`

3. Put them into:

   `.obsidian/plugins/vault-badge-styles/`

4. Restart Obsidian.
5. Enable **Vault Badge Styles** in Community Plugins.

## Icon folders

Configure icon search folders in plugin settings. Each folder path is relative to the vault root.

For example:

```text
_Artifacts/Attachments/icons/me
_Artifacts/Attachments/icons
.obsidian/icons
```

If a rule uses icon name `golang`, the plugin tries:

```text
_Artifacts/Attachments/icons/me/golang.svg
_Artifacts/Attachments/icons/me/golang/golang.svg
_Artifacts/Attachments/icons/golang.svg
_Artifacts/Attachments/icons/golang/golang.svg
.obsidian/icons/golang.svg
.obsidian/icons/golang/golang.svg
```

## Rules

Settings are split into three sections:

- Folder rules
- File rules
- External link rules

Folder rules can cascade to nested files and folders. A closer nested rule wins over a parent cascade rule.

File rules are exact path rules and can target any file format in the vault.

External link rules match by prefix. Longer prefixes win over shorter prefixes.

## Commands

- `Vault Badge Styles: Rebuild icon/style index`
- `Vault Badge Styles: Refresh file explorer icons`
- `Vault Badge Styles: Refresh reading view links`
- `Vault Badge Styles: Preview matched paths`
- `Vault Badge Styles: Debug current file style`
- `Vault Badge Styles: Validate rules and icons`
- `Vault Badge Styles: Export config to vault root`
- `Vault Badge Styles: Import config from vault root`

## Export and import

`Export config to vault root` writes:

```text
vault-badge-styles.config.json
```

`Import config from vault root` reads the same file and replaces plugin settings.

This mode exports config only. SVG files are not bundled yet.

## Known limitations

- Live Preview styling is intentionally disabled by default. Full Live Preview support requires CodeMirror decorations and should be implemented separately.
- Search results and Quick Switcher may need extra adapters if Obsidian changes their DOM.
- The plugin styles rendered UI only. It does not rewrite markdown files.
