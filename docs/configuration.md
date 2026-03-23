# Configuration

The connector is designed to work with minimal configuration. Most sites only need `data-rosey` attributes on translatable elements, `data_config` entries in `cloudcannon.config.yml`, and the postbuild script. This page covers all available configuration options.

## Snapshot boundary

The connector needs to know which part of the page contains translatable content. When you switch to a locale, it clones this container, strips all CloudCannon editing infrastructure from the clone, and swaps it into the DOM. This isolates the connector's inline editors from CloudCannon's normal editing system.

### Default: `<main>`

If no `data-rcc` attribute is found, the connector falls back to `<main>`. This works well when all your translatable content lives inside `<main>`:

```html
<body>
  <nav><!-- not affected by locale switching --></nav>
  <main>
    <!-- everything in here is cloned and translated -->
    <h1 data-rosey="title">Welcome</h1>
  </main>
  <footer><!-- not affected by locale switching --></footer>
</body>
```

### Including navigation and footer: `data-rcc`

Navigation and footer text is commonly translated (menu labels, copyright notices, CTAs). Since the default `<main>` boundary excludes these areas, add `data-rcc` to a wrapper that encompasses everything you want to translate in the Visual Editor:

```html
<body>
  <div data-rcc>
    <nav>
      <a data-rosey="nav:home" href="/">Home</a>
      <a data-rosey="nav:about" href="/about">About</a>
    </nav>
    <main>
      <h1 data-rosey="hero:title">Welcome</h1>
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
```

If your layout already has a wrapper element around the page content (e.g., `<div class="page-wrapper">`), just add `data-rcc` to it. Otherwise, add a thin wrapper `<div data-rcc>` around the content you want to translate.

> **Why not `<body>`?** The connector swaps the boundary element out of the DOM with a clean clone. `<body>` cannot be used because it hosts the connector's own UI (the FAB, popover, stale panel), CloudCannon's editing infrastructure, and `<script>` tags — swapping it would destroy all of those. Any normal element inside `<body>` works fine.

The lookup order is: `[data-rcc]` then `<main>`. If neither exists, the connector logs a warning and does nothing.

### What the boundary affects

- Content **inside** the boundary is cloned and gets inline translation editors in the Visual Editor
- Content **outside** the boundary is untouched during locale switching
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

## Toolbar configuration

The connector resolves toolbar configuration for each translation editor in priority order:

1. **Prescanned config from editable regions** — If the element has editable regions (`data-editable="text"` / `<editable-text>` with `data-prop`), the connector captures the exact `inputConfig` CC uses for that field at init time, including expanded toolbar options from `_inputs` defaults.

2. **CC defaults** — If no per-field config is available, CloudCannon's built-in defaults are used with the auto-detected element type.

> **Note:** The connector always forces `type: "html"` regardless of what's configured, because Rosey translations are always HTML (the SSG has already rendered Markdown to HTML at build time). Toolbar options like `bold`, `italic`, and `link` are preserved.

If you need custom toolbar options (e.g. enabling `subscript`, disabling `image`) but your site doesn't use editable regions, [open an issue](https://github.com/tomrcc/rcc-v2/issues) on the repo and we'll look at adding a configuration path for that.

### Element type detection

The connector auto-detects whether each element should use an inline (`"span"`) or block-level (`"block"`) editor based on its DOM content. Elements containing block-level children (e.g., a `<div>` wrapping `<p>` tags) get a block editor with paragraph formatting. Everything else (headings, paragraphs with inline text, spans, buttons) gets an inline editor. You can override this by adding `data-type="block"` or `data-type="span"` to the element.

## Locale discovery

The connector discovers available locales by fetching `/_rcc/locales.json` at runtime. This manifest is a JSON object:

```json
{
  "locales": ["fr", "de", "es"]
}
```

The `locales` array is required.

The `write-locales --dest` command generates this file automatically. If you're using your own script instead of `write-locales`, you must produce this manifest yourself — see [write-locales: Using your own script](write-locales.md#using-your-own-script-instead-of-write-locales).

No HTML attributes are needed for locale discovery.
