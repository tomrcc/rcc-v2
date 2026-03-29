# Changelog

All notable changes to the Rosey CloudCannon Connector will be documented in this file.

## v2.0.0 (Unreleased)

v2 is a ground-up rewrite. The connector is now a **client-side Visual Editor plugin** that creates inline translation editors directly on the page, replacing the form-based YAML editing workflow from v1. The build-time tooling has been simplified to a single `write-locales` CLI that reads/writes flat JSON locale files.

See [Migrating from v1](docs/migration-from-v1.md) for a step-by-step upgrade guide.

### Breaking Changes

- **Architecture**: No longer a build-time YAML generator. The connector is now a client-side script that runs inside CloudCannon's Visual Editor, paired with a simpler `write-locales` CLI.
- **Translation format**: YAML files in `rosey/translations/` replaced by flat JSON files in `rosey/locales/`. Each entry stores `original`, `value`, and `_base_original`.
- **Configuration**: `rosey/rcc.yaml` is gone. All config now lives in `cloudcannon.config.yml` (`data_config` entries) and HTML attributes (`data-rcc-*`).
- **Editing model**: Form-based Data Editor editing replaced by inline Visual Editor editing with a floating locale switcher.
- **CLI commands**: `generate`, `tag`, and `generate-config` replaced by `write-locales`, `init`, and `add-skills`.
- **Package exports**: `rosey-cloudcannon-connector/utils` (`generateRoseyId`) removed. New export: `rosey-cloudcannon-connector/write-locales`.
- **Postbuild pipeline**: New command sequence; `rosey build` now requires `--exclusions "\.(html?)$"` so JSON assets (`_rcc/locales.json`, `_cloudcannon/info.json`) pass through.
- **CloudCannon collection**: The `translations` collection pointing at YAML files is replaced by `data_config` entries pointing at locale JSON. A browsable sidebar collection is now optional (via `--collection` on `init`).

### Added

- **Inline Visual Editor editing** — ProseMirror editors on every `data-rosey` element, connected to locale data files through CloudCannon's JS API. No editable regions or Bookshop required.
- **Floating locale switcher** — draggable FAB with a popover menu for switching between locales and returning to the original. Position persists across sessions.
- **Stale translation detection** — when source text changes after a translation was last acknowledged, the element gets an amber dashed border and the FAB shows a count badge. A floating panel lets editors resolve items individually or in bulk.
- **`_base_original` field** — new field in locale entries that tracks the current source text from `base.json`, powering stale detection.
- **`init` setup wizard** — configures the full Rosey + RCC stack in one command: installs deps, creates the postbuild script, updates `cloudcannon.config.yml`. Supports interactive prompts and headless mode (`--yes --locales fr,de`) for CI and agent workflows.
- **`add-skills` CLI** — copies AI agent skills into the user's project for translation, setup, i18n migration, and v1-to-v2 migration workflows.
- **`write-locales` CLI** — reads Rosey's `base.json` and creates/updates locale JSON files. `--dest` generates the `_rcc/locales.json` runtime manifest. `--keep-unused` preserves old keys during migration. Auto-detects locales from existing files when `--locales` is omitted.
- **Simplified, composable postbuild pipeline** — v1 required a multi-step chain (base.json to per-page YAML to locale JSON) with Smartling baked in. v2 collapses this to a single set of files (locale JSON). `write-locales` is one straightforward step, making it easy to run your own middleware before or after it, replace it entirely with a custom script, or integrate any external translation service as a standalone add-on.
- **`/_rcc/locales.json` manifest** — runtime locale discovery from a build-time manifest. No HTML attributes needed for locale detection.
- **`data-rcc` attribute** — sets the snapshot boundary to include nav/footer in locale switching (defaults to `<main>` if absent).
- **`data-rcc-exclude` attribute** — comma-separated locale codes to hide from the switcher on a per-page basis.
- **`data-rcc-ignore` attribute** — opts individual elements out of locale switching.
- **`data-rcc-verbose` attribute** — enables verbose console logging for debugging.
- **Bookshop compatibility** — automatically strips Bookshop live-editing comments from the locale clone, pauses Bookshop's update cycle during locale view, and recovers `data-cms-bind` overlays on restore.
- **Editable regions compatibility** — prescans input config from existing CC editable regions and inherits toolbar settings for translation editors.
- **Zero runtime dependencies** — no npm dependencies at runtime; devDependencies only.
- **Missing-entry handling** — elements with no locale entry (e.g. added after the last build) render at reduced opacity and are non-editable until the next `write-locales` run populates the locale files.
- **Comprehensive documentation** — getting started, tagging content, configuration, stale translations, split-by-directory, AI translation, incremental translation, known issues, and migration from v1.

### Removed

- **`tag` CLI and `data-rosey-tagger`** — the auto-tagging command and attribute are gone. Add `data-rosey` attributes directly to templates. See [Tagging Content](docs/tagging-content.md) for strategies.
- **`generateRoseyId` utility** — the `/utils` export no longer exists. Use static, descriptive keys instead; v2's stale detection makes content-derived keys unnecessary.
- **Built-in Smartling integration** — removed in favour of a modular middleware approach. Any translation service (Smartling, DeepL, Google Translate, AI) can plug in as a standalone postbuild step that reads/writes the same locale JSON files.
- **`rcc.yaml` config file** — all configuration now lives in `cloudcannon.config.yml` and HTML attributes.
- **`namespace_pages` config** — shared translations are handled through consistent `data-rosey-root` / `data-rosey-ns` attributes in a single locale file.
- **`generate` and `generate-config` CLI commands** — replaced by `write-locales` and `init`.
- **YAML translation file generation** — replaced by flat JSON locale files.
- **`input_lengths`, `markdown_keys`, `see_on_page_comment`, `git_history_link` config options** — no longer applicable with inline visual editing.

---

## v1.2.2 (October 7, 2025)

- Fixed bug where the `index.yaml` translation file was incorrectly being archived.

## v1.2.1 (October 7, 2025)

- Fixed bug where the `index.html` YAML translation file was incorrectly named `index.html` instead of `index.yaml`.

## v1.2.0 (October 7, 2025)

- Added customizable markdown keys in config.
- Added config option `index_html_pages_only` for pages built at e.g. `about.html` instead of `about/index.html`.
- Remove translation files that only contain IDs that have been removed from the built site.
- Fixed bug where cleared translations don't always update the `locale.json` file.
- Added automatic config migrator for configs missing new keys.
