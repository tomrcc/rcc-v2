# Rosey CloudCannon Connector

Client-side locale switching for [Rosey](https://rosey.app/) translations in [CloudCannon's](https://cloudcannon.com/) Visual Editor.

The connector auto-detects all `data-rosey` tagged elements on the page, injects a floating locale switcher, and creates inline editors connected to your locale data files through CloudCannon's live editing API — no server-side conditionals or component refactoring required.

## Prerequisites

- A static site built with any SSG (Astro, Hugo, Eleventy, Jekyll, etc.) hosted on [CloudCannon](https://cloudcannon.com/)
- [Rosey](https://rosey.app/) v2 generating `base.json` from your built site
- Translatable elements tagged with `data-rosey` attributes
- CloudCannon Visual Editor enabled

> **No existing editing setup required.** The connector does not depend on editable regions, or Bookshop. It creates its own inline editors on every `data-rosey` element — sites with no editing infrastructure still get full visual translation editing. Editable regions and Bookshop are compatible enhancements (the connector handles them automatically), not prerequisites.

## Install

```bash
npm install rosey-cloudcannon-connector
```

The package ships a **client-side injector** (auto-runs in the Visual Editor), three **CLI tools** (`init`, `write-locales`, `add-skills`), and **agent skills** for AI-assisted translation and setup.

## Quick Start

The fastest way to get set up is with the `init` wizard. It installs dependencies, creates the postbuild script, and configures `cloudcannon.config.yml` for you:

```bash
npx rosey-cloudcannon-connector init
```

Or skip all prompts in CI / agent workflows:

```bash
npx rosey-cloudcannon-connector init --yes --locales fr,de
```

After running `init`, you still need to:

1. **Tag translatable elements** with `data-rosey`:

```html
<h1 data-rosey="hero:title">Welcome to my site</h1>
```

1. **Import the script** in your layout (Astro example):

```astro
<script>
  if (window?.inEditorMode) {
    import("rosey-cloudcannon-connector");
  }
</script>
```

See the [full setup guide](docs/getting-started.md) for detailed explanations and all available `init` flags.

### Manual Setup

If you prefer to configure things yourself, the steps `init` automates are:

**1. Add `data_config`** entries to `cloudcannon.config.yml`:

```yaml
data_config:
  locales_fr:
    path: rosey/locales/fr.json
  locales_de:
    path: rosey/locales/de.json
```

**2. Set up the postbuild** at `.cloudcannon/postbuild`:

```bash
#!/usr/bin/env bash
npx rosey generate --source dist
npx rosey-cloudcannon-connector write-locales --source rosey --dest dist
mv ./dist ./_untranslated_site
npx rosey build --source _untranslated_site --dest dist --default-language en --default-language-at-root --exclusions "\.(html?)$"
```

The `--exclusions` flag overrides Rosey's default (`\.(html?|json)$`) so that JSON files like `_rcc/locales.json` and `_cloudcannon/info.json` flow through the build as assets. Without it, those files are excluded and must be manually copied back.

> **Note: Rosey JSON translation users.** If your site uses [Rosey's JSON translation feature](https://rosey.app/docs/translating-json/) (`.rosey.json` schema files), be aware that this exclusion override lets all JSON files pass through as-is — including any JSON data files that Rosey would normally process via their `.rosey.json` schemas. If you use both the RCC and Rosey JSON translation, you may need a more targeted exclusion regex (e.g. keeping specific JSON files excluded) or handle the translated JSON output separately.

## Data Attributes


| Attribute                    | Where                 | Purpose                                                                                          |
| ---------------------------- | --------------------- | ------------------------------------------------------------------------------------------------ |
| `data-rosey="{key}"`         | Translatable elements | Rosey translation key                                                                            |
| `data-rcc-ignore`            | Translatable elements | Opt out of locale switching                                                                      |
| `data-rosey-root="{prefix}"` | Parent elements       | Root namespace prefix (stops upward traversal)                                                   |
| `data-rosey-ns="{segment}"`  | Parent elements       | Namespace segment for child keys                                                                 |
| `data-rcc`                   | Container element     | Set the snapshot boundary — use to include nav/footer in locale switching (defaults to `<main>`) |
| `data-rcc-exclude="de,es"`   | Container element     | Hide locales from the switcher on this page                                                      |
| `data-rcc-verbose`           | Any element           | Enable verbose console logging                                                                   |


## Bookshop Compatibility

Sites using [Bookshop](https://github.com/CloudCannon/bookshop) for component-based live editing work out of the box. The connector automatically detects Bookshop's live-editing markers and pauses its re-rendering cycle during locale view, preventing conflicts between Bookshop's component rendering and the connector's inline translation editors. Switching back to "Original" fully restores Bookshop live editing.

## AI-Powered Translation

Rosey locale files are flat JSON with a predictable three-field structure per entry (`original`, `value`, `_base_original`). This makes them ideal for AI translation — untranslated entries are instantly detectable (`value === original`), stale entries are flagged (`original !== _base_original`), and already-translated content is left untouched. No wasted tokens, reviewable diffs, idempotent runs.

The package includes agent skills that guide AI coding assistants through translation and setup workflows. Add them to your project:

```bash
npx rosey-cloudcannon-connector add-skills [--dest .cursor/skills]
```

See [AI-Powered Translation](docs/ai-translation.md) for the full guide.

## Stale Translation Detection

When the source text of an element changes after it was last translated, the connector flags the translation as stale. In the Visual Editor, stale elements get an amber dashed border, and the locale switcher FAB shows a count badge. Clicking a locale button reveals a panel where editors can resolve stale items individually or all at once. Editing a translation auto-resolves its stale flag. See [Stale Translation Detection](docs/stale-translations.md) for details.

Accurate stale detection and element activation depend on each element having a unique, stable Rosey key — see [Tagging Content: Key uniqueness and stability](docs/tagging-content.md#key-uniqueness-and-stability) for guidance on avoiding key collisions in repeating structures. Elements whose key has no entry in the locale file (e.g. newly added content before a build has run) appear at reduced opacity and are non-editable until the next build populates the locale files.

## Documentation

- **[Getting Started](docs/getting-started.md)** — Full setup guide with complete examples
- **[Tagging Content](docs/tagging-content.md)** — How to tag elements and use namespacing
- **[Configuration](docs/configuration.md)** — Snapshot boundary, locale exclusion, CloudCannon config
- **[write-locales CLI](docs/write-locales.md)** — CLI reference, programmatic API, locale file format
- **[AI-Powered Translation](docs/ai-translation.md)** — Using AI to translate locale files, agent skills, and the `add-skills` CLI
- **[Stale Translation Detection](docs/stale-translations.md)** — Detecting and resolving out-of-date translations
- **[Split-by-Directory Translation](docs/split-by-directory.md)** — Translating body content via per-locale content collections alongside Rosey
- **[Incremental Translation](docs/incremental-translation.md)** — Strategies for translating your site progressively (fallback content, branching workflows)
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