# Migrating from v1

This guide covers upgrading from RCC v1 (form-based YAML editing in CloudCannon's Data Editor) to v2 (inline editing in the Visual Editor). The two versions use the same npm package name (`rosey-cloudcannon-connector`) but the workflow is fundamentally different.

## What changed

| Aspect | v1 | v2 |
| --- | --- | --- |
| **Editing interface** | Form-based Data Editor (YAML files) | Inline Visual Editor with locale switcher |
| **Translation format** | YAML files in `rosey/translations/` | JSON files in `rosey/locales/` |
| **Configuration** | `rosey/rcc.yaml` | `data_config` entries in `cloudcannon.config.yml` |
| **Locale discovery** | `locales` array in `rcc.yaml` | `/_rcc/locales.json` manifest (auto-generated) |
| **Stale detection** | None | Built-in (amber indicators, resolve panel) |
| **Client-side script** | None | Injector with floating locale switcher |
| **Auto-tagger** | `data-rosey-tagger` attribute + `tag` CLI command | Removed |
| **`generateRoseyId` utility** | Exported from `rosey-cloudcannon-connector/utils` | Removed |
| **Smartling integration** | Built-in | Removed (planned as separate package) |
| **Postbuild commands** | `tag` + `generate` + `rosey build` | `rosey generate` + `write-locales` + `rosey build` |
| **CloudCannon collection** | `translations` collection with YAML files | `data_config` entries for locale JSON files |

### Removed features

- **Auto-tagger (`data-rosey-tagger`):** The `tag` CLI command and `data-rosey-tagger` attribute are gone. Add `data-rosey` attributes manually to your templates. See [Tagging Content](tagging-content.md#automatic-tagging) for alternatives.
- **`generateRoseyId` utility:** The `/utils` export no longer exists. Use static, descriptive keys instead — v2's stale detection makes content-derived keys unnecessary.
- **Smartling integration:** Not included in v2. If you need machine translations, you can run your own middleware after `write-locales` — see [write-locales: Using your own script](write-locales.md#using-your-own-script-instead-of-write-locales).
- **`rcc.yaml` config file:** All configuration now lives in `cloudcannon.config.yml` (`data_config` entries) and HTML attributes (`data-rcc-*`).
- **Namespace pages:** The `namespace_pages` config option is gone. In v2, shared translations are simply handled through consistent `data-rosey-root` / `data-rosey-ns` attributes and live in the same locale file as everything else.
- **Staging-to-production workflow:** v2 doesn't require a separate staging site. The single-site setup works for all cases (including with a root redirect page if desired).

### Added features

- **Inline Visual Editor editing** — edit translations directly on the page
- **Floating locale switcher** — draggable FAB with popover menu
- **Stale translation detection** — amber indicators when source text has changed
- **`_base_original` field** — powers stale detection in locale files
- **`write-locales` CLI** — replaces the `generate` command with a simpler, JSON-only workflow
- **`data-rcc-ignore`** — opt individual elements out of locale switching
- **`data-rcc-exclude`** — hide specific locales per page

## Migration steps

### 1. Save existing translations

Before migrating, make sure all translations are saved and up to date. Run a final v1 build to ensure `rosey/locales/*.json` files are current — these contain your actual translations and you'll want to preserve them.

### 2. Update the postbuild script

Replace the v1 postbuild with the v2 version. The key differences: no `tag` command, `write-locales` instead of `generate`, and a `cp` step for the `_rcc` manifest.

**v1:**

```bash
#!/usr/bin/env bash
npx rosey-cloudcannon-connector tag --source dist
npx rosey generate --source dist
npx rosey-cloudcannon-connector generate
mv ./dist ./untranslated_site
npx rosey build --source untranslated_site --dest dist --default-language-at-root
```

**v2:**

```bash
#!/usr/bin/env bash
npx rosey generate --source dist
npx rosey-cloudcannon-connector write-locales --source rosey --dest dist
mv ./dist ./_untranslated_site
npx rosey build --source _untranslated_site --dest dist --default-language-at-root --exclusions "\.(html?)$"
```

### 3. Update `cloudcannon.config.yml`

Replace the `translations` collection with `data_config` entries for each locale:

**v1:**

```yaml
collections_config:
  translations:
    path: rosey
    icon: translate
    disable_url: true
    disable_add: true
    disable_add_folder: true
    glob:
      - rcc.yaml
      - 'translations/**'
    _inputs:
      urlTranslation:
        type: text
        comment: Provide a translated URL...
```

**v2:**

```yaml
data_config:
  locales_fr:
    path: rosey/locales/fr.json
  locales_de:
    path: rosey/locales/de.json
```

Add one entry per locale. The key must follow the `locales_{code}` naming convention.

If you had `collection_groups` referencing `translations`, remove that entry too.

### 4. Add the client-side script

Import the connector in your site's layout file. This is new in v2 — v1 had no client-side component.

```html
<script>
  if (window?.inEditorMode) {
    import("rosey-cloudcannon-connector");
  }
</script>
```

Place this inside the `<body>`, before or after your `<main>` element. See [Getting Started: Step 2](getting-started.md#step-2-import-the-script-in-your-layout) for framework-specific examples.

### 5. Clean up v1 artifacts

Remove files and config that v2 doesn't use:

- **Delete `rosey/rcc.yaml`** — configuration now lives in `cloudcannon.config.yml`
- **Delete `rosey/translations/`** — the YAML translation files are replaced by locale JSON files
- **Delete Smartling config and files** if you used the Smartling integration
- **Remove `data-rosey-tagger`** attributes from your HTML templates
- **Remove `generateRoseyId` imports** — replace with static key strings

### 6. Update `CLOUDCANNON_SYNC_PATHS`

If you set `CLOUDCANNON_SYNC_PATHS=/rosey/` as an environment variable in CloudCannon, verify it still covers the files you need synced. The locale files are still in `rosey/locales/`, so the path should still work. Remove it if it's no longer needed.

### 7. Replace content-derived keys with static keys

v1 recommended using `generateRoseyId()` to slugify element text as the Rosey key. v2 recommends **static, descriptive keys** that don't change when content changes. This works better with stale translation detection — when the source text changes, the key stays stable and the connector flags the translation as stale.

**v1 (Astro example):**

```astro
---
import { generateRoseyId } from "rosey-cloudcannon-connector/utils";
---
<h1 data-rosey={generateRoseyId(heading.text)}>{heading.text}</h1>
```

**v2:**

```astro
<h1 data-rosey="hero:title">{heading.text}</h1>
```

> **Important:** Changing Rosey keys means existing translations won't match the new keys. After updating keys, run a build so `write-locales` creates new entries. You'll need to re-enter translations for the new keys (or write a script to remap old keys to new ones in your locale files).

### 8. Verify

After completing the migration:

1. Push your changes and trigger a CloudCannon build
2. Open a page in the Visual Editor
3. Confirm the locale switcher FAB appears
4. Switch to a locale and verify translations load
5. Make an edit and confirm it saves

If the switcher doesn't appear, check the [troubleshooting guide](known-issues.md#troubleshooting).
