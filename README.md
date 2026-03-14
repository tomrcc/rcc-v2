# Rosey CloudCannon Connector

Client-side locale switching for [Rosey](https://rosey.app/) translations in [CloudCannon's](https://cloudcannon.com/) Visual Editor.

The script auto-detects all `data-rosey` tagged elements on the page, injects a floating locale switcher, and uses CloudCannon's live editing JavaScript API to create inline editors and read/write locale data directly — no server-side conditionals or component refactoring required.

## Install

```bash
npm install rosey-cloudcannon-connector
```

## Quick Start

### 1. Add `data-rosey` to translatable elements

Any element with a `data-rosey` attribute is automatically picked up by the connector:

```html
<editable-text data-editable="text" data-prop="title" data-rosey="hero:title">
  Welcome to my site
</editable-text>
```

### 2. Declare available locales

Add `data-locales` to a parent element (typically `<main>`):

```html
<main data-locales="fr,de">
  <!-- translatable content here -->
</main>
```

### 3. Import the script

Import the package in your layout. The script auto-initializes when the CloudCannon Visual Editor loads.

**Astro (recommended — lazy-load in editor only):**

```astro
<script>
  if (window?.inEditorMode) {
    import("rosey-cloudcannon-connector");
  }
</script>
```

**Plain HTML:**

```html
<script type="module">
  import "rosey-cloudcannon-connector";
</script>
```

When the page loads in the Visual Editor, a draggable locale switcher button appears (a circular translate icon in the bottom-right corner). Clicking it opens a popover with the available locales. Selecting a locale fetches the translation data and creates inline editors on each translatable element, connected directly to the locale data file via the CloudCannon JS API. The button can be dragged to any position on the page; its position is persisted across reloads.

## Key Namespacing

Rosey keys can be namespaced using parent attributes. The connector walks up the DOM to build a fully qualified key.

- `data-rosey-root` on a parent sets the root prefix (stops further traversal)
- `data-rosey-ns` on a parent adds a namespace segment

**Example:**

```html
<main data-rosey-root="index" data-locales="fr,de">
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

## Opting Out

Add `data-rcc-ignore` to any `data-rosey` element to exclude it from locale switching:

```html
<editable-text data-rosey="some_key" data-rcc-ignore>
  This element won't appear in the locale switcher
</editable-text>
```

## CLI: `write-locales`

The package includes a CLI tool that generates or updates locale JSON files from Rosey's `base.json`. New keys are added with their original text as the default value; existing translations are preserved.

```bash
npx rosey-cloudcannon-connector write-locales [options]
```

| Flag | Description |
|---|---|
| `-s, --source <dir>` | Rosey directory (default: `rosey`) |
| `-l, --locales <codes>` | Comma-separated locale codes (e.g. `fr,de`) |
| `-h, --help` | Show help |

If `--locales` is omitted, the CLI auto-detects existing locale files in `<source>/locales/`.

## CloudCannon Setup

### `data_config`

For the Visual Editor to read and write locale files, add a `data_config` entry for each locale in your `cloudcannon.config.yml`:

```yaml
data_config:
  locales_fr:
    path: rosey/locales/fr.json
  locales_de:
    path: rosey/locales/de.json
```

The key format `locales_{code}` must match the locale codes in your `data-locales` attribute.

### Postbuild script

Add a `.cloudcannon/postbuild` script to generate locale files and build the translated site after each CloudCannon build:

```bash
#!/usr/bin/env bash

npx rosey generate --source dist
npx rosey-cloudcannon-connector write-locales --source rosey --locales fr,de
mv ./dist ./_untranslated_site
npx rosey build --source _untranslated_site --dest dist --default-language-at-root
```

This script:

1. Generates `rosey/base.json` from the built site
2. Creates/updates locale JSON files with any new keys
3. Rebuilds the site with Rosey translations

## Data Attributes

| Attribute | Where | Purpose |
|---|---|---|
| `data-rosey="{key}"` | Translatable elements | Rosey translation key (auto-detected by the connector) |
| `data-rcc-ignore` | Translatable elements | Opts the element out of locale switching |
| `data-rosey-root="{prefix}"` | Parent elements | Sets the root namespace prefix (stops upward traversal) |
| `data-rosey-ns="{segment}"` | Parent elements | Adds a namespace segment to child keys |
| `data-locales="fr,de"` | `<main>` | Declares available locales (comma-separated) |
| `data-rcc-verbose` | `<main>` | Enables verbose console logging |

## How It Works

1. On init, the script acquires the CloudCannon JS API handle and tracks all `[data-rosey]` elements (storing live DOM references and original content)
2. A draggable locale FAB (floating action button) with a popover menu is injected
3. When a locale is selected:
   - Any existing editors are torn down and original content is restored
   - The locale dataset and file are fetched via `api.dataset("locales_{locale}").items()`
   - For each tracked element: the translated value is loaded via `file.data.get()`, the element's text is updated, and an inline editor is created via `api.createTextEditableRegion()` — edits are pushed back with `file.data.set()`
   - A `change` listener on the dataset keeps editors in sync with external changes
4. When "Original" is selected, editors are torn down and elements are restored to their original content

## Logging

- `warn(...)` always outputs to the console for real issues (missing elements, config problems)
- `log(...)` only outputs when `data-rcc-verbose` is present on `<main>`
- All messages are prefixed with `RCC:`

## Development

```bash
npm run build    # Build CJS + ESM output
npm run dev      # Watch mode
```

## License

MIT
