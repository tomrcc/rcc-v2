# Configuration

The connector is designed to work with minimal configuration. Most sites only need `data-rosey` attributes on translatable elements, `data_config` entries in `cloudcannon.config.yml`, and the postbuild script. This page covers all available configuration options.

## Snapshot boundary

The connector needs to know which part of the page contains translatable content. When you switch to a locale, it clones this container, strips all CloudCannon editing infrastructure from the clone, and swaps it into the DOM. This isolates the connector's inline editors from CloudCannon's normal editing system.

### Default: `<main>`

For most sites, the connector uses `<main>` as the boundary with no configuration needed:

```html
<body>
  <nav><!-- unaffected by locale switching --></nav>
  <main>
    <!-- everything in here is cloned and translated -->
    <h1 data-rosey="title">Welcome</h1>
  </main>
  <footer><!-- unaffected by locale switching --></footer>
</body>
```

### Custom boundary: `data-rcc`

If your site doesn't use `<main>`, or you want to limit the scope, add `data-rcc` to the container:

```html
<div data-rcc>
  <h1 data-rosey="title">Hello</h1>
</div>
```

The lookup order is: `[data-rcc]` then `<main>`. If neither exists, the connector logs a warning and does nothing.

### What the boundary affects

- Content **inside** the boundary is cloned and gets inline translation editors
- Content **outside** the boundary (navigation, footer, etc.) is untouched during locale switching
- Rosey still translates everything with `data-rosey` at build time, regardless of the boundary — the boundary only matters for the Visual Editor experience

## Per-page locale exclusion

To hide specific locales from the switcher on certain pages, add `data-rcc-exclude` to the boundary element:

```html
<main data-rcc-exclude="de">
  <!-- German won't appear in the locale switcher on this page -->
</main>
```

Multiple codes are comma-separated:

```html
<main data-rcc-exclude="de,es">
```

This is useful for pages that haven't been translated to all locales yet.

## Opting out of translation

Add `data-rcc-ignore` to any `data-rosey` element to exclude it from locale switching:

```html
<h1 data-rosey="some-key" data-rcc-ignore>
  This element won't be affected by the locale switcher
</h1>
```

The element keeps its `data-rosey` attribute for Rosey's build-time translation but is invisible to the connector in the Visual Editor.

## Verbose logging

Add `data-rcc-verbose` to any element to enable detailed console logging:

```html
<main data-rcc-verbose>
  ...
</main>
```

Without this attribute, only warnings are logged. With it, the connector outputs detailed information about initialization, element tracking, locale switching, and data operations — all prefixed with `RCC:`.

## CloudCannon `data_config`

Each locale needs a `data_config` entry so CloudCannon's data API can read and write the locale file. The key **must** follow the format `locales_{code}`:

```yaml
# cloudcannon.config.yml
data_config:
  locales_fr:
    path: rosey/locales/fr.json
  locales_de:
    path: rosey/locales/de.json
```

The connector discovers datasets by calling `api.dataset("locales_fr")`, so the `locales_` prefix and matching locale code are required.

The `write-locales` CLI validates your config and warns about missing entries — see [write-locales](write-locales.md) for details.

## Toolbar configuration with `_inputs`

The connector respects CloudCannon's `_inputs` configuration for toolbar customization. If you have `_inputs` rules that apply to fields inside your locale data files, those toolbar options are used for the inline editors:

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

> **Note:** The connector always forces `type: "html"` regardless of what's configured, because Rosey translations are always HTML (the SSG has already rendered Markdown to HTML at build time). Toolbar options like `bold`, `italic`, and `link` from your `_inputs` config are preserved.

## Locale discovery

The connector discovers available locales by fetching `/_rcc/locales.json` at runtime. This manifest is a JSON array of locale codes:

```json
["fr", "de", "es"]
```

The `write-locales --dest` command generates this file automatically. If you're using your own script instead of `write-locales`, you must produce this manifest yourself — see [write-locales: Using your own script](write-locales.md#using-your-own-script-instead-of-write-locales).

No HTML attributes are needed for locale discovery.
