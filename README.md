# Rosey CloudCannon Connector

Client-side locale switching for [Rosey](https://rosey.app/) translations in [CloudCannon's](https://cloudcannon.com/) Visual Editor.

The script auto-detects all `data-rosey` tagged elements on the page, injects a floating locale switcher, and uses CloudCannon's live editing JavaScript API to create inline editors and read/write locale data directly — no server-side conditionals or component refactoring required.

## Prerequisites

- A site built with any SSG (Astro, Hugo, Eleventy, Jekyll, etc.) and hosted on [CloudCannon](https://cloudcannon.com/)
- [Rosey](https://rosey.app/) v2 set up and generating `base.json` from your built site
- Translatable elements tagged with `data-rosey` attributes in your HTML output
- CloudCannon Visual Editor enabled for the pages you want to translate

## Install

```bash
npm install rosey-cloudcannon-connector
```

The package ships both a **client-side injector** (auto-runs in the Visual Editor) and a **CLI tool** (`write-locales`) for build-time locale file management.

## Quick Start — Full Setup Guide

This walks you through going from zero to a working translation editing setup. There are four things to configure:

1. Mark up your HTML with `data-rosey` attributes (handled by Rosey)
2. Import the client-side script in your layout
3. Configure `cloudcannon.config.yml` with `data_config` entries for each locale
4. Set up a postbuild script to run `write-locales` and `rosey build`

### Step 1: Add `data-rosey` to translatable elements

Any element with a `data-rosey` attribute is automatically picked up by both Rosey and this connector. If you're already using Rosey, you likely have these in place. The attribute value is the translation key:

```html
<h1 data-rosey="hero:title">Welcome to my site</h1>
<p data-rosey="hero:subtitle">The best site on the internet</p>
```

If you're using CloudCannon's editable regions, these work together:

```html
<editable-text data-editable="text" data-prop="title" data-rosey="hero:title">
  Welcome to my site
</editable-text>
```

### Step 2: Import the script in your layout

Import the package in your site's layout file. The script self-initializes when the CloudCannon Visual Editor fires the `cloudcannon:load` event — it does nothing outside the editor, so there's no performance cost in production.

**Astro (recommended — lazy-load in editor only):**

```astro
<script>
  if (window?.inEditorMode) {
    import("rosey-cloudcannon-connector");
  }
</script>
```

The `window.inEditorMode` flag is set by CloudCannon's Visual Editor before your scripts run.

> **Note:** The script must be loaded as a module (`type="module"` or via a bundler `import`). It does not support `<script src="...">` without `type="module"`.

### Step 3: Configure `cloudcannon.config.yml`

For the connector to read and write translation data, each locale needs a `data_config` entry in your CloudCannon config. The key must follow the format `locales_{code}`:

```yaml
# cloudcannon.config.yml
data_config:
  locales_fr:
    path: rosey/locales/fr.json
  locales_de:
    path: rosey/locales/de.json
  locales_es:
    path: rosey/locales/es.json
```

This tells CloudCannon to expose these JSON files through its data API. The connector uses `api.dataset("locales_fr")` to access them, so the naming convention is important.

### Step 4: Set up the postbuild script

Create `.cloudcannon/postbuild` in your repo root. This runs after every CloudCannon build and handles three things: generating `base.json`, creating/updating locale files, and building the translated site.

```bash
#!/usr/bin/env bash

# 1. Generate Rosey's base.json from the built HTML
npx rosey generate --source dist

# 2. Create/update locale JSON files + write the locale manifest
npx rosey-cloudcannon-connector write-locales --source rosey --dest dist

# 3. Build the translated site with Rosey
mv ./dist ./_untranslated_site
npx rosey build --source _untranslated_site --dest dist --default-language-at-root
```

Adjust `--source dist` if your SSG outputs to a different directory (e.g. `_site`, `public`, `build`).

### What happens at runtime

When the page loads in the Visual Editor:

1. A draggable locale switcher button appears in the bottom-right corner (a circular translate icon)
2. Clicking it opens a popover listing all available locales, plus "Original"
3. Selecting a locale clones the page content, swaps in translated values, and creates inline ProseMirror editors on each translatable element
4. Edits are pushed directly to the locale JSON file via CloudCannon's data API
5. Selecting "Original" restores the page to its original state with normal CloudCannon editing
6. The FAB can be dragged anywhere on the page; its position persists across reloads via `sessionStorage`

## CLI: `write-locales`

The package includes an optional CLI tool that generates or updates locale JSON files from Rosey's `base.json`. New keys are added with their original text as the default value; existing translations are preserved. Keys that no longer exist in `base.json` are removed.

```bash
npx rosey-cloudcannon-connector write-locales [options]
```


| Flag                    | Description                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `-s, --source <dir>`    | Rosey directory containing `base.json` (default: `rosey`)                                   |
| `-l, --locales <codes>` | Comma-separated locale codes (e.g. `fr,de,es`); auto-detects from existing files if omitted |
| `-d, --dest <dir>`      | **(required)** Build output directory; writes a locale manifest to `{dest}/_rcc/locales.json` for runtime locale discovery |
| `-h, --help`            | Show help                                                                                   |


### How it works

1. Reads `{source}/base.json` (generated by `rosey generate`)
2. For each locale, reads or creates `{source}/locales/{code}.json`
3. Adds new keys with `{ original, value, _base_original }` — `value` defaults to the original text
4. Updates `_base_original` on all existing entries to the current source text (for stale detection)
5. Removes keys that no longer exist in `base.json`
6. If `--dest` is set, writes `{dest}/_rcc/locales.json` — a JSON array of locale codes the injector fetches at runtime
7. Validates that `cloudcannon.config.yml` has matching `data_config` entries and warns about missing ones

### Auto-detection of locales

If `--locales` is omitted, the CLI scans `{source}/locales/` for existing `.json` files and uses their filenames as locale codes. This means after the initial setup (where you specify locales explicitly), subsequent runs just work.

### Example: first-time setup

```bash
# First run — explicitly specify locales to create the files
npx rosey-cloudcannon-connector write-locales --locales fr,de --dest dist

# Subsequent runs — auto-detects fr.json and de.json
npx rosey-cloudcannon-connector write-locales --dest dist
```

### Programmatic API

You can also call `write-locales` from Node.js:

```typescript
import { writeLocales } from "rosey-cloudcannon-connector/write-locales";

await writeLocales({
  roseyDir: "rosey",
  locales: ["fr", "de"],
  dest: "dist",
});
```

### Using your own script instead of `write-locales`

`write-locales` is optional — its job is simply to get data from Rosey's `base.json` into locale files that the connector can edit. You can replace it with your own script, or use it alongside other tools (e.g. pulling translations from an external service like Smartling).

Since everything runs in a [CloudCannon build hook](https://cloudcannon.com/documentation/articles/extending-your-build-process-with-hooks/), your postbuild script can do whatever it needs: pull data from an API, merge external translations into locale files, then hand off to Rosey. The connector doesn't care how the locale files were produced — it just reads and writes them through CloudCannon's data API.

If you roll your own workflow, here's what the locale files need to contain for the connector to work:

1. **A flat JSON object** keyed by Rosey translation keys (matching the keys in `base.json`)
2. **Each entry must have `original` and `value` fields** — these are standard Rosey locale fields (see the [Rosey docs](https://rosey.app/docs/))
3. **Each entry should have a `_base_original` field** if you want [stale translation detection](#stale-translation-detection). This is the only field not native to Rosey — it stores the current source text from `base.json` so the connector can detect when the original has changed since the translation was last reviewed. Without it, stale detection is skipped for that entry.
4. **A locale manifest** at `{dest}/_rcc/locales.json` — a JSON array of locale codes (e.g. `["fr","de"]`) so the connector knows which locales are available at runtime
5. **Matching `data_config` entries** in `cloudcannon.config.yml` following the `locales_{code}` naming convention

See [Locale File Format](#locale-file-format) for the full field reference.

## Locale File Format

Each locale JSON file is a flat object keyed by Rosey translation keys:

```json
{
  "hero:title": {
    "original": "Welcome to Sendit",
    "value": "Bienvenue chez Sendit",
    "_base_original": "Welcome to Sendit"
  },
  "hero:subtitle": {
    "original": "The best email platform",
    "value": "La meilleure plateforme email",
    "_base_original": "The best email platform"
  }
}
```


| Field            | Description                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `original`       | The source text when the translation was last acknowledged/edited                                                                                                              |
| `value`          | The translated text (HTML)                                                                                                                                                     |
| `_base_original` | The current source text from `base.json`, updated at build time. The only field not native to Rosey — required for [stale translation detection](#stale-translation-detection) |


When `original` and `_base_original` differ, the translation is flagged as stale (see [Stale Translation Detection](#stale-translation-detection)).

## Key Namespacing

Rosey keys can be namespaced using parent attributes. The connector walks up the DOM to build a fully qualified key.

- `data-rosey-root` on a parent sets the root prefix (stops further traversal)
- `data-rosey-ns` on a parent adds a namespace segment

**Example:**

```html
<main data-rosey-root="index">
  <section data-rosey-ns="hero">
    <editable-text data-rosey="title" data-prop="title" data-editable="text">
      Welcome
    </editable-text>
  </section>
</main>
```

The resolved key is `index:hero:title`, which maps to the translation entry in your locale file:

```json
{
  "index:hero:title": {
    "original": "Welcome",
    "value": "Bienvenue"
  }
}
```

Setting `data-rosey-root=""` (empty string) on an element resets the namespace — child keys won't inherit anything above it.

## Snapshot Boundary

The connector needs to know which part of the page contains translatable content. This is the "snapshot boundary" — the container that gets cloned when switching locales.

**Default behavior:** The connector uses `<main>` as the boundary. For most sites, this just works with no configuration needed.

**Custom boundary:** If your site doesn't use `<main>`, or you want to limit the scope, add `data-rcc` to the container element:

```html
<div data-rcc>
  <!-- Only content inside here is affected by locale switching -->
  <h1 data-rosey="title">Hello</h1>
</div>
```

The lookup order is: `[data-rcc]` → `<main>`. If neither exists, the connector logs a warning and does nothing.

### Why a boundary?

When you switch to a locale, the connector clones the boundary container, strips all CloudCannon editing infrastructure from the clone (custom elements, `data-editable`, `data-prop`), and swaps it into the DOM in place of the original. This cleanly deactivates CloudCannon's normal editing so the connector's own inline editors can work without interference. Switching back to "Original" swaps the original container back in and CloudCannon's editing automatically reconnects.

## Opting Out of Translation

Add `data-rcc-ignore` to any `data-rosey` element to exclude it from locale switching:

```html
<editable-text data-rosey="some_key" data-rcc-ignore>
  This element won't appear in the locale switcher
</editable-text>
```

The element keeps its `data-rosey` attribute for Rosey's build-time translation but is invisible to the Visual Editor connector.

## Per-Page Locale Exclusion

To hide specific locales on certain pages (e.g. a page that isn't translated to German yet), use `data-rcc-exclude` on the boundary element:

```html
<main data-rcc-exclude="de">
  <!-- German won't appear in the locale switcher on this page -->
</main>
```

Multiple codes are comma-separated: `data-rcc-exclude="de,es"`.

## Stale Translation Detection

When a source text changes after a translation was last reviewed, the connector highlights out-of-date translations in the Visual Editor.

### How it works

Each locale entry stores three fields: `original` (source text when translation was last acknowledged), `value` (the translation), and `_base_original` (the current source text from `base.json`, updated by `write-locales` on every run).

When `original` and `_base_original` differ, the translation is flagged as stale:

```json
{
  "hero:title": {
    "original": "Welcome to Sendit",
    "value": "Bienvenue chez Sendit",
    "_base_original": "Welcome to Sendit — Email Made Easy"
  }
}
```

In the Visual Editor, stale translations show:

- An **amber dashed border** around the element
- A **warning badge** in the corner with a tooltip showing the old and new source text
- An **amber count badge** on the locale FAB showing the total number of stale translations
- Each locale button in the popover has a toggle that opens a **stale items panel** listing all stale translations with per-item "Mark as reviewed" buttons and a "Resolve all" button

### Resolving stale translations

There are three ways to clear the stale indicator:

1. **Edit the translation** — the `original` field is automatically updated to match `_base_original` when you make any edit
2. **Click "Mark as reviewed"** on a specific item in the stale panel — updates `original` without changing the translation
3. **Click "Resolve all"** in the stale panel — marks all stale translations as reviewed at once

After any of these, the indicator is removed and won't appear again until the source text changes once more.

### Stale detection lifecycle

1. `write-locales` runs at build time and updates `_base_original` for every entry
2. `write-locales` never touches `original` or `value` on existing entries — only the editor does
3. When an editor edits a translation, `original` is set to `_base_original`, clearing staleness
4. When source content changes, the next build updates `_base_original`, creating a mismatch

## Data Attributes Reference


| Attribute                    | Where                 | Purpose                                                                                                               |
| ---------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `data-rosey="{key}"`         | Translatable elements | Rosey translation key (auto-detected by the connector)                                                                |
| `data-rcc-ignore`            | Translatable elements | Opts the element out of locale switching                                                                              |
| `data-rosey-root="{prefix}"` | Parent elements       | Sets the root namespace prefix (stops upward traversal)                                                               |
| `data-rosey-ns="{segment}"`  | Parent elements       | Adds a namespace segment to child keys                                                                                |
| `data-rcc`                   | Container element     | Overrides the snapshot boundary (defaults to `<main>` if absent)                                                      |
| `data-rcc-exclude="de,es"`   | Container element     | Comma-separated locale codes to hide from the switcher on this page                                                   |
| `data-rcc-verbose`           | Any element           | Enables verbose console logging for debugging                                                                         |


## CloudCannon Configuration

### Required: `data_config` entries

Each locale needs a `data_config` entry so CloudCannon's data API can read/write the locale file:

```yaml
# cloudcannon.config.yml
data_config:
  locales_fr:
    path: rosey/locales/fr.json
  locales_de:
    path: rosey/locales/de.json
```

The naming convention `locales_{code}` is required. The connector uses this prefix to look up locale datasets via `api.dataset("locales_fr")`.

### Optional: `_inputs` configuration

The connector respects CloudCannon's `_inputs` configuration for toolbar customization. If you have `_inputs` rules that apply to fields inside your locale data files, the connector will use those toolbar options for the inline editors. For example:

```yaml
_inputs:
  value:
    type: html
    options:
      bold: true
      italic: true
      link: true
      image: false
```

Note: The connector always forces `type: "html"` regardless of what's configured, because Rosey translations are always HTML. But toolbar options (bold, italic, link, etc.) from your `_inputs` config are preserved.

## Locale Discovery

**No HTML attributes are needed for locale discovery.** The `write-locales --dest` command generates a manifest at `/_rcc/locales.json` that the connector fetches automatically at runtime. If you're following the Quick Start guide, this is already set up. If you're using your own script, see [Using your own script instead of `write-locales`](#using-your-own-script-instead-of-write-locales) for the manifest format.

## How It Works — Technical Details

1. The script waits for the `cloudcannon:load` event (set by the Visual Editor)
2. Acquires the CloudCannon JS API handle via `CloudCannonAPI.useVersion("v1", true)`
3. Discovers locales by fetching `/_rcc/locales.json` (generated by `write-locales --dest`)
4. Finds the snapshot boundary: `[data-rcc]` element, or `<main>` by default
5. Filters out any excluded locales (`data-rcc-exclude`)
6. Pre-scans input configs from the original container by dispatching `get-input-config` events
7. Tracks all `[data-rosey]` elements (excluding `[data-rcc-ignore]`)
8. Injects a collapsible, draggable locale FAB with a popover menu
9. When a locale is selected:
  - Tears down any existing translation view (swaps the original container back in)
  - Clones the snapshot boundary container
  - Strips all CC editing infrastructure from the clone (custom elements, `data-editable`, `data-prop`)
  - Swaps the original out of the DOM and the clean clone in
  - Fetches the locale dataset and file via `api.dataset("locales_{locale}").items()`
  - For each tracked element: loads the translated value via `file.data.get()`, updates the element, and creates an inline ProseMirror editor via `api.createTextEditableRegion()`
  - Edits are pushed back to the locale file with `file.data.set()`
  - A `change` listener on the dataset keeps editors in sync with external changes
10. When "Original" is selected, the clone is swapped out and the original container is re-inserted — CloudCannon's MutationObserver auto-reconnects all editables

## Full Example: Astro Site Setup

Here's a complete example of setting up rcc-v2 with an Astro site.

### `package.json`

```json
{
  "dependencies": {
    "astro": "^5.0.0",
    "rosey": "^2.3.10",
    "rosey-cloudcannon-connector": "^0.0.1"
  }
}
```

### `src/layouts/Layout.astro`

```astro
---
// your frontmatter
---
<html lang="en">
  <head><!-- ... --></head>
  <body>
    <nav><!-- navigation, outside the boundary --></nav>
    <script>
      if (window?.inEditorMode) {
        import("rosey-cloudcannon-connector");
      }
    </script>
    <main>
      <slot />
    </main>
    <footer><!-- footer, outside the boundary --></footer>
  </body>
</html>
```

### `cloudcannon.config.yml`

```yaml
data_config:
  locales_fr:
    path: rosey/locales/fr.json
  locales_de:
    path: rosey/locales/de.json
```

### `.cloudcannon/postbuild`

```bash
#!/usr/bin/env bash
npx rosey generate --source dist
npx rosey-cloudcannon-connector write-locales --source rosey --dest dist
mv ./dist ./_untranslated_site
npx rosey build --source _untranslated_site --dest dist --default-language-at-root
```

### A page with translatable content

```astro
---
layout: ../layouts/Layout.astro
title: Home
---
<section data-rosey-ns="hero">
  <h1 data-rosey="title">Welcome to Sendit</h1>
  <p data-rosey="subtitle">Email marketing made easy</p>
</section>

<section data-rosey-ns="features">
  <h2 data-rosey="heading">Features</h2>
  <p data-rosey="description">Everything you need to grow your business</p>
</section>
```

## Logging

- `warn(...)` always outputs to the console for real issues (missing elements, config problems)
- `log(...)` only outputs when `data-rcc-verbose` is present on any element on the page
- All messages are prefixed with `RCC:`

To enable verbose logging, add the attribute to any element (typically the boundary):

```html
<main data-rcc-verbose>
  ...
</main>
```

## Troubleshooting

### The locale switcher doesn't appear

- Confirm you're in the CloudCannon Visual Editor (not the content editor or a local dev server)
- Check that the script is being imported (look for `RCC:` messages in the browser console)
- Ensure `write-locales --dest` ran successfully in your postbuild and `/_rcc/locales.json` is being served
- Ensure at least one `data-rosey` element exists inside the snapshot boundary

### Translations aren't loading

- Check that `data_config` entries exist in `cloudcannon.config.yml` with the correct `locales_{code}` naming
- Verify the locale JSON files exist at the paths specified in `data_config`
- Look for `RCC:` warnings in the browser console
- Enable verbose logging with `data-rcc-verbose` for detailed output

### Edits aren't saving

- CloudCannon's data API handles persistence — ensure you see the "Unsaved changes" indicator in the CloudCannon toolbar after editing
- Check that the `data_config` path matches the actual file location

### Stale badges show unexpected counts

- Run `write-locales` to update `_base_original` fields — this happens automatically in the postbuild script
- If you've edited source content locally, push and trigger a CloudCannon build to regenerate

## Development

```bash
npm run build    # Build CJS + ESM output via tsup
npm run dev      # Watch mode
npm run biome    # Lint and format
```

The package outputs to `dist/` with both CJS and ESM formats, plus TypeScript declarations.

## License

MIT