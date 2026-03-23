# Getting Started

This guide walks you through going from zero to a working translation editing setup. There are four things to configure:

1. Mark up your HTML with `data-rosey` attributes
2. Import the client-side script in your layout
3. Configure `cloudcannon.config.yml` with `data_config` entries for each locale
4. Set up a postbuild script to run `write-locales` and `rosey build`

## Quick Start (non-interactive)

If you're automating setup (CI, scripting, or agent-driven), you can skip all prompts with `--yes`:

```bash
npx rosey-cloudcannon-connector init --yes --locales fr,de
```

This uses sensible defaults for everything not specified. You can override any default:

```bash
npx rosey-cloudcannon-connector init --yes \
  --locales fr,de,es \
  --default-language en \
  --build-dir dist \
  --rosey-dir rosey \
  --content-at-root \
  --collection
```

Run `npx rosey-cloudcannon-connector init --help` for the full list of flags.

After running `init`, you still need to tag your templates with `data-rosey` attributes (Step 1 below) and import the client-side script (Step 2 below).

## Step 1: Add `data-rosey` to translatable elements

Any element with a `data-rosey` attribute is automatically picked up by both Rosey and this connector. The attribute value is the translation key:

```html
<h1 data-rosey="hero:title">Welcome to my site</h1>
<p data-rosey="hero:subtitle">The best site on the internet</p>
```

`data-rosey` is all that's needed — the connector creates its own inline editors and does not require editable regions or Bookshop. If your site already uses CloudCannon's editable regions, the two work together:

```html
<editable-text data-editable="text" data-prop="title" data-rosey="hero:title">
  Welcome to my site
</editable-text>
```

See [Tagging Content](tagging-content.md) for full details on namespacing and key resolution.

## Step 2: Import the script in your layout

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

## Step 3: Configure `cloudcannon.config.yml`

For the connector to read and write translation data, each locale needs a `data_config` entry in your CloudCannon config. The key **must** follow the format `locales_{code}`:

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

## Step 4: Set up the postbuild script

Create `.cloudcannon/postbuild` in your repo root. This runs after every CloudCannon build and handles three things: generating `base.json`, creating/updating locale files, and building the translated site.

```bash
#!/usr/bin/env bash

# 1. Generate Rosey's base.json from the built HTML
npx rosey generate --source dist

# 2. Create/update locale JSON files + write the locale manifest
npx rosey-cloudcannon-connector write-locales --source rosey --dest dist

# 3. Build the translated site with Rosey
mv ./dist ./_untranslated_site
npx rosey build --source _untranslated_site --dest dist --default-language en --default-language-at-root --exclusions "\.(html?)$"
```

Adjust `--source dist` and `--default-language en` if your SSG outputs to a different directory or uses a different source language.

### Why `--exclusions`?

Rosey's default exclusion regex (`\.(html?|json)$`) prevents JSON files from being copied through the build as assets. The `--exclusions "\.(html?)$"` override lets JSON files pass through, so `_rcc/locales.json` (the RCC locale manifest) and `_cloudcannon/info.json` (Bookshop component data) end up in the final output without any manual `cp` steps.

## What happens at runtime

When the page loads in CloudCannon's Visual Editor:

1. The script waits for the `cloudcannon:load` event
2. Acquires the CloudCannon JS API handle
3. Fetches `/_rcc/locales.json` to discover available locales
4. Finds the snapshot boundary (`[data-rcc]` element, or falls back to `<main>`)
5. Tracks all `[data-rosey]` elements (excluding `[data-rcc-ignore]`)
6. Pre-scans input configs from the original container
7. Injects a draggable locale switcher FAB (floating action button) in the bottom-right corner
8. Clicking the FAB opens a popover listing all available locales plus "Original"
9. Selecting a locale:
   - Clones the snapshot boundary and strips all CloudCannon editing infrastructure from the clone
   - Swaps the original container out, the clean clone in
   - Fetches locale data and creates inline ProseMirror editors on each translatable element
   - Edits are pushed directly to the locale JSON file via CloudCannon's data API
10. Selecting "Original" swaps the original container back in — CloudCannon's editing automatically reconnects

The FAB can be dragged anywhere on the page; its position persists across reloads via `sessionStorage`.

## Full Example: Astro Site

### `package.json`

```json
{
  "dependencies": {
    "astro": "^5.0.0",
    "rosey": "^2.3.10",
    "rosey-cloudcannon-connector": "latest"
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
    <div data-rcc>
      <nav>
        <a data-rosey="nav:home" href="/">Home</a>
        <a data-rosey="nav:about" href="/about">About</a>
      </nav>
      <main>
        <slot />
      </main>
      <footer>
        <p data-rosey="footer:copyright">&copy; 2025 My Company</p>
      </footer>
    </div>
    <script>
      if (window?.inEditorMode) {
        import("rosey-cloudcannon-connector");
      }
    </script>
  </body>
</html>
```

The `data-rcc` wrapper includes navigation and footer so their translatable content appears in the locale switcher. If you only need to translate content inside `<main>`, you can omit the wrapper — the connector falls back to `<main>` automatically. See [Configuration: Snapshot boundary](configuration.md#snapshot-boundary) for details.

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
npx rosey build --source _untranslated_site --dest dist --default-language en --default-language-at-root --exclusions "\.(html?)$"
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

With `data-rosey-root` on `<main>` in the layout (or on the page itself), the resolved keys would be namespaced further — see [Tagging Content](tagging-content.md) for full details.
