# Rosey CloudCannon Connector

Client-side locale switching for [Rosey](https://rosey.app/) translations in [CloudCannon's](https://cloudcannon.com/) Visual Editor.

The connector auto-detects all `data-rosey` tagged elements on the page, injects a floating locale switcher, and creates inline editors connected to your locale data files through CloudCannon's live editing API — no server-side conditionals or component refactoring required.

## Prerequisites

- A static site built with any SSG (Astro, Hugo, Eleventy, Jekyll, etc.) hosted on [CloudCannon](https://cloudcannon.com/)
- [Rosey](https://rosey.app/) v2 generating `base.json` from your built site
- Translatable elements tagged with `data-rosey` attributes
- CloudCannon Visual Editor enabled

## Install

```bash
npm install rosey-cloudcannon-connector
```

The package ships a **client-side injector** (auto-runs in the Visual Editor) and a **CLI tool** (`write-locales`) for build-time locale file management.

## Quick Start

**1. Tag translatable elements** with `data-rosey`:

```html
<h1 data-rosey="hero:title">Welcome to my site</h1>
```

**2. Import the script** in your layout (Astro example):

```astro
<script>
  if (window?.inEditorMode) {
    import("rosey-cloudcannon-connector");
  }
</script>
```

**3. Add `data_config`** entries to `cloudcannon.config.yml`:

```yaml
data_config:
  locales_fr:
    path: rosey/locales/fr.json
  locales_de:
    path: rosey/locales/de.json
```

**4. Set up the postbuild** at `.cloudcannon/postbuild`:

```bash
#!/usr/bin/env bash
npx rosey generate --source dist
npx rosey-cloudcannon-connector write-locales --source rosey --dest dist
mv ./dist ./_untranslated_site
npx rosey build --source _untranslated_site --dest dist --default-language-at-root
cp -r _untranslated_site/_rcc dist/_rcc
```

See the [full setup guide](docs/getting-started.md) for detailed explanations of each step.

## Data Attributes

| Attribute | Where | Purpose |
| --- | --- | --- |
| `data-rosey="{key}"` | Translatable elements | Rosey translation key |
| `data-rcc-ignore` | Translatable elements | Opt out of locale switching |
| `data-rosey-root="{prefix}"` | Parent elements | Root namespace prefix (stops upward traversal) |
| `data-rosey-ns="{segment}"` | Parent elements | Namespace segment for child keys |
| `data-rcc` | Container element | Override the snapshot boundary (defaults to `<main>`) |
| `data-rcc-exclude="de,es"` | Container element | Hide locales from the switcher on this page |
| `data-rcc-verbose` | Any element | Enable verbose console logging |

## Bookshop Compatibility

Sites using [Bookshop](https://github.com/CloudCannon/bookshop) for component-based live editing work out of the box. The connector automatically detects Bookshop's live-editing markers and pauses its re-rendering cycle during locale view, preventing conflicts between Bookshop's component rendering and the connector's inline translation editors. Switching back to "Original" fully restores Bookshop live editing.

## Documentation

- **[Getting Started](docs/getting-started.md)** — Full setup guide with complete examples
- **[Tagging Content](docs/tagging-content.md)** — How to tag elements and use namespacing
- **[Configuration](docs/configuration.md)** — Snapshot boundary, locale exclusion, CloudCannon config
- **[write-locales CLI](docs/write-locales.md)** — CLI reference, programmatic API, locale file format
- **[Stale Translation Detection](docs/stale-translations.md)** — Detecting and resolving out-of-date translations
- **[Known Issues & Troubleshooting](docs/known-issues.md)** — Common issues and workarounds
- **[Migrating from v1](docs/migration-from-v1.md)** — Step-by-step guide for upgrading from RCC v1

## Development

```bash
npm run build    # Build CJS + ESM output via tsup
npm run dev      # Watch mode
npm run biome    # Lint and format
```

## License

MIT
