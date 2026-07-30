# Changelog

All notable changes to the Rosey CloudCannon Connector are documented here.

## v2.0.0 (Unreleased)

Ground-up rewrite. The connector is now a client-side Visual Editor plugin that
creates inline translation editors on the page, replacing v1's build-time YAML
generator feeding CloudCannon's Data Editor. Build-time tooling collapses to a
single `write-locales` CLI over flat JSON locale files.

- Upgrading from v1? → [Migrating from v1](docs/migration-from-v1.md)
- New install? → [Getting Started](docs/getting-started.md)

### Breaking changes

Ordered by what you touch to upgrade.

1. **Postbuild pipeline** — new command sequence. `tag` is gone, `write-locales`
   replaces `generate`, and `rosey build` now needs `--exclusions "\.(html?)$"`
   so JSON assets (`_rcc/locales.json`, `_cloudcannon/info.json`) pass through.
2. **Configuration** — `rosey/rcc.yaml` is gone. Config now lives in
   `cloudcannon.config.yml` (`data_config` entries) and `data-rcc-*` HTML
   attributes.
3. **CloudCannon collection** — the `translations` collection pointing at YAML
   is replaced by `data_config` entries pointing at locale JSON. A browsable
   sidebar collection is now optional (`--collection` on `init`).
4. **Translation format** — YAML in `rosey/translations/` replaced by flat JSON
   in `rosey/locales/`. Each entry stores `original`, `value`, and
   `_base_original`.
5. **Templates** — `data-rosey-tagger` no longer exists; add `data-rosey`
   attributes directly.
6. **Package exports** — `rosey-cloudcannon-connector/utils` (`generateRoseyId`)
   removed; `rosey-cloudcannon-connector/write-locales` added.
7. **CLI commands** — `generate`, `tag`, and `generate-config` replaced by
   `write-locales` and `init`.
8. **Editing model** — form-based Data Editor editing replaced by inline Visual
   Editor editing with a floating locale switcher.

### Added

#### Editing experience

- **Inline Visual Editor editing** — ProseMirror editors on every `data-rosey`
  element, wired to locale data files through CloudCannon's JS API. No editable
  regions or Bookshop required.
- **Floating locale switcher** — draggable FAB with a popover menu for switching
  locales and returning to the original. Position persists across sessions.
- **Stale translation detection** — source text that changed since a translation
  was last acknowledged gets an amber dashed border, a count badge on the FAB,
  and a panel for resolving items individually or in bulk. Combines a build-time
  signal (`_base_original` vs `original`) with a live in-editor signal, so an
  in-session source edit flags affected translations before any rebuild. See
  [Stale Translations](docs/stale-translations.md).
- **Missing-entry handling** — elements with no locale entry yet stay editable,
  falling back to the source text. The first edit writes a new entry and seeds
  `_base_original`, so stale detection works without waiting for a build.

#### CLI and build pipeline

- **`init` setup wizard** — configures the full Rosey + RCC stack in one command:
  installs deps, creates the postbuild script, updates `cloudcannon.config.yml`.
  Interactive, or headless (`--yes --locales fr,de`) for CI and agent workflows.
- **`write-locales` CLI** — reads Rosey's `base.json` and creates/updates locale
  JSON. `--dest` emits the runtime manifest; `--keep-unused` preserves old keys
  during migration; locales are auto-detected from existing files when
  `--locales` is omitted. See [write-locales](docs/write-locales.md).
- **`/_rcc/locales.json` manifest** — runtime locale discovery from a build-time
  manifest, so no HTML attributes are needed to detect locales.
- **Composable postbuild pipeline** — one set of files and one `write-locales`
  step, so you can run your own middleware before or after it, or replace it
  entirely. See [External Integrations](docs/integrations.md).

#### Attributes

- **`data-rcc`** — sets the snapshot boundary to include nav/footer in locale
  switching (defaults to `<main>` if absent).
- **`data-rcc-exclude`** — comma-separated locale codes to hide from the switcher
  on a per-page basis.
- **`data-rcc-ignore`** — opts individual elements out of locale switching.
- **`data-rcc-verbose`** — enables verbose console logging for debugging.

#### Compatibility

- **Bookshop** — strips live-editing comments from the locale clone, pauses
  Bookshop's update cycle during locale view, and recovers `data-cms-bind`
  overlays on restore.
- **Editable regions** — prescans input config from existing CloudCannon editable
  regions and inherits toolbar settings for translation editors.
- **Zero runtime dependencies** — devDependencies only.

#### Documentation

- Getting started, tagging content, configuration, stale translations,
  split-by-directory, AI translation, incremental translation, RTL support,
  known issues, and migration from v1 and from other i18n systems.

### Removed

- **`tag` CLI and `data-rosey-tagger`** → add `data-rosey` attributes directly.
  See [Tagging Content](docs/tagging-content.md).
- **`generate` and `generate-config` CLI commands** → `write-locales` and `init`.
- **`generateRoseyId` utility (`/utils` export)** → use static, descriptive keys.
  v2's stale detection makes content-derived keys unnecessary.
- **YAML translation file generation** → flat JSON locale files.
- **`rcc.yaml` config file** → `cloudcannon.config.yml` and `data-rcc-*`
  attributes.
- **Built-in Smartling integration** → no bundled translation service. Any
  service (Smartling, DeepL, Google Translate, AI) plugs in as your own postbuild
  step reading and writing the same locale JSON. v2's single-format pipeline
  makes this substantially less work than v1's multi-step chain. See
  [External Integrations](docs/integrations.md).
- **`namespace_pages` config** → shared translations use consistent
  `data-rosey-root` / `data-rosey-ns` attributes in a single locale file.
- **Staging-to-production workflow** → v2 needs no separate staging site; the
  single-site setup covers all cases (with a root redirect page if desired).
- **`input_lengths`, `markdown_keys`, `see_on_page_comment`, `git_history_link`
  config options** → not applicable to inline visual editing.
- **Bundled agent skills** → skills are maintained in
  [CloudCannon/agent-skills](https://github.com/CloudCannon/agent-skills) rather
  than shipped in this package. Add them with
  `npx skills add CloudCannon/agent-skills --all`. See
  [AI Translation](docs/ai-translation.md).

---

## v1.x (legacy)

v1 was developed in a separate repository; its commit history is not part of this
repo. Entries are preserved below for continuity — both versions share the npm
package name `rosey-cloudcannon-connector`.

### v1.2.2 (October 7, 2025)

- Fixed bug where the `index.yaml` translation file was incorrectly being archived.

### v1.2.1 (October 7, 2025)

- Fixed bug where the `index.html` YAML translation file was incorrectly named `index.html` instead of `index.yaml`.

### v1.2.0 (October 7, 2025)

- Added customizable markdown keys in config.
- Added config option `index_html_pages_only` for pages built at e.g. `about.html` instead of `about/index.html`.
- Remove translation files that only contain IDs that have been removed from the built site.
- Fixed bug where cleared translations don't always update the `locale.json` file.
- Added automatic config migrator for configs missing new keys.
