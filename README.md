# Rosey CloudCannon Connector

Client-side locale switching for [Rosey](https://rosey.app/) translations in [CloudCannon's](https://cloudcannon.com/) Visual Editor.

The script auto-detects all `data-rosey` tagged elements on the page, injects a floating locale switcher, and uses clone+replace to enable in-place visual editing of translations — no server-side conditionals or component refactoring required.

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

When the page loads in the Visual Editor, a floating locale switcher appears. Clicking a locale swaps each translatable element's `data-prop` to point at the corresponding locale data file.

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

1. On init, the script snapshots all `[data-rosey]` elements (storing their `outerHTML` and position)
2. A floating locale switcher UI is injected
3. When a locale is selected, each snapshotted element is cloned and its `data-prop` is rewritten to `@data[locales_{locale}].{resolvedKey}.value`
4. When "Original" is selected, elements are restored from their snapshots

CloudCannon does **not** re-bind editable regions when attributes are mutated on existing elements. Only removing a node and inserting a new one triggers re-binding — this is why the script uses `replaceChild` rather than `setAttribute`.

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
