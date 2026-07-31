# Migrating from v1

This guide covers upgrading from RCC v1 (form-based YAML editing in CloudCannon's Data Editor) to v2 (inline editing in the Visual Editor). The two versions use the same npm package name (`rosey-cloudcannon-connector`) but the workflow is fundamentally different.

## What changed


| Aspect                        | v1                                                | v2                                                 |
| ----------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| **Editing interface**         | Form-based Data Editor (YAML files)               | Inline Visual Editor with locale switcher          |
| **Translation format**        | YAML files in `rosey/translations/`               | JSON files in `rosey/locales/`                     |
| **Configuration**             | `rosey/rcc.yaml`                                  | `data_config` entries in `cloudcannon.config.yml`  |
| **Locale discovery**          | `locales` array in `rcc.yaml`                     | `/_rcc/locales.json` manifest (auto-generated)     |
| **Stale detection**           | None                                              | Built-in (amber indicators, resolve panel)         |
| **Client-side script**        | None                                              | Injector with floating locale switcher             |
| **Auto-tagger**               | `data-rosey-tagger` attribute + `tag` CLI command | Removed                                            |
| **`generateRoseyId` utility** | Exported from `rosey-cloudcannon-connector/utils` | Removed                                            |
| **Smartling integration**     | Built-in                                          | Removed — write your own postbuild step            |
| **Postbuild commands**        | `tag` + `generate` + `rosey build`                | `rosey generate` + `write-locales` + `rosey build` |
| **CloudCannon collection**    | `translations` collection with YAML files         | `data_config` entries for locale JSON files        |
| **Staging site**              | Separate staging-to-production workflow           | Not needed — single site covers all cases          |

For the complete itemised list of what was added and removed, see the
[changelog](../CHANGELOG.md). The steps below cover everything you need to *do*.

Two notes before you start:

- **Machine translation.** v2 bundles no translation service. Because everything
  now lives in one JSON format, plugging one in is a standalone postbuild step
  that reads and writes `rosey/locales/*.json` — see
  [External Integrations](integrations.md). Smartling users will need to port
  their integration, but it's a smaller job than v1's multi-step chain.
- **Staging sites.** If you ran the v1 staging-to-production split, you can
  decommission the staging site once the migration is verified.

## Migration steps

### 1. Save existing translations

Before migrating, make sure all translations are saved and up to date. Run a final v1 build to ensure `rosey/locales/*.json` files are current — these contain your actual translations and you'll want to preserve them.

### 2. Update the postbuild script

Replace the v1 postbuild with the v2 version. The key differences: no `tag` command, `write-locales` instead of `generate`, an `install-client` step (v1 had no client-side component at all), and an `--exclusions` override so JSON assets (like the `_rcc` manifest and `_cloudcannon/info.json`) pass through the Rosey build.

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
npx rosey-cloudcannon-connector install-client --dest dist
mv ./dist ./_untranslated_site
npx rosey build --source _untranslated_site --dest dist --default-language en --default-language-at-root --exclusions "\.(html?)$"
```

`install-client` is only needed if your layout imports the client by URL rather than as a bare specifier — that is, on any SSG that doesn't bundle browser JS. It's harmless to include either way. See step 4.

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

Place this inside the `<body>`, before or after your `<main>` element. See [Getting Started: Step 2](getting-started.md#step-2-import-the-script-in-your-layout) for more detail.

**Framework note:** The import above works in Astro and other Vite-based frameworks because Vite bundles `node_modules` imports automatically. On **11ty, Hugo, Jekyll** and other non-bundled SSGs the browser can't resolve a package name, so add `install-client` to your postbuild (step 2 above) and import the URL it writes instead:

```html
<script>
  if (window?.inEditorMode) {
    import("/_rcc/client.mjs").catch(console.error);
  }
</script>
```

No build configuration is needed for this on any generator — `install-client` runs after your site build and copies the client into the output directory. See [SSG Setup](ssg-setup.md) for the layout snippet in each generator's template language.

### 5. Set the snapshot boundary

v1 had no client-side component, so no snapshot boundary was needed. v2 clones a container when switching locales and needs to know which part of the page contains translatable content.

If your header and footer contain translatable text (nav links, copyright, etc.), wrap them alongside `<main>` in a `data-rcc` element:

```html
<body>
  <div data-rcc>
    <Header />
    <main>
      <slot />
    </main>
    <Footer />
  </div>
  <script>
    if (window?.inEditorMode) {
      import("rosey-cloudcannon-connector");
    }
  </script>
</body>
```

If only `<main>` content is translatable, you can skip `data-rcc` — the connector falls back to `<main>` automatically.

### 6. Clean up v1 artifacts

Remove files and config that v2 doesn't use:

- **Delete `rosey/rcc.yaml`** — configuration now lives in `cloudcannon.config.yml`
- **Delete `rosey/translations/`** — the YAML translation files are replaced by locale JSON files
- **Delete Smartling config and files** if you used the Smartling integration (`smartling-translations/`, `outgoing-smartling-translations.json`)
- **Keep `*.urls.json` files** (`base.urls.json`, `locales/*.urls.json`) — these are native Rosey URL translation files, not RCC artifacts. Rosey uses them at build time to generate translated URL paths. v1 exposed them for editing through the `translations` collection; the connector does not provide a visual UI for URL translations, but you can expose them as a CloudCannon collection for form-based editing — see [Configuration: URL translation files](configuration.md#url-translation-files). Do not delete these files if they contain translated URLs.
- **Remove** `data-rosey-tagger` attributes from your HTML templates (or replace with your own script, if needed)
- **Remove** `generateRoseyId` **imports** — replace with static key strings (or replace with your own helper function, if needed)
- **Remove the `declare module 'rosey-cloudcannon-connector/utils'`** line from your TypeScript declarations (e.g. `env.d.ts`)

### 7. Replace content-derived keys with static keys

v1 recommended using `generateRoseyId()` to slugify element text as the Rosey key. v2 recommends **static, descriptive keys** that don't change when content changes. This works better with stale translation detection — when the source text changes, the key stays stable and the connector flags the translation as stale. You can however stick with the content-as-key approach if it suits your usecase, and you don't mind not getting stale translation detection. Whichever approach you decide to use for constructing Rosey keys is ultimately up to you.

**v1 (Astro example):**

```astro
---
import { generateRoseyId } from "rosey-cloudcannon-connector/utils";
---
<h1 data-rosey={generateRoseyId(heading.text)}>{heading.text}</h1>
```

**v2:**

```astro
<h1 data-rosey="hero-title">{heading.text}</h1>
```

#### Strategies by component type

**Single-instance elements** (hero headings, copyright text): Use descriptive static keys like `"heading"`, `"copyright"`. Namespacing via `data-rosey-ns` on a parent provides uniqueness.

**Iterated data arrays** (nav links, footer links): Use a simple inline transform of the text content as the key. Since link text is short and stable, `link.text.toLowerCase().replace(/\s+/g, "-")` produces keys like `blog`, `github` — readable and stable unless the link text itself changes.

**Tags and categories**: Tags are typically already lowercase slugs (e.g. `"seo"`, `"tailwind"`). Use the tag value directly as the `data-rosey` key.

**Rendered markdown blocks**: v1 used `data-rosey-tagger` to auto-tag individual elements inside rendered markdown. v2 removes the auto-tagger. Instead, wrap the entire markdown block in a single `data-rosey` tag:

```astro
<div class="markdown-text" data-rosey="markdown" set:html={markdownContent} />
```

This translates the full block as one unit, which works for shorter content. For pages with large body content (blog posts, documentation), consider the split-by-directory approach instead — where body content lives in per-locale content collections and Rosey handles only shared UI strings (nav, footer, breadcrumbs). You can use both on the same site (split-by-directory for blog posts, Rosey for everything else), but they are alternatives for any given piece of content.

#### Locale picker links

If your site has a visitor-facing locale picker, add `data-rosey-ignore` to the picker's `<a>` tags. Rosey rewrites internal links to add locale prefixes — without `data-rosey-ignore`, the "switch to English" link on a French page would be rewritten to point to the French version.

### 8. Remap existing translations

> **Important:** Changing Rosey keys means existing translations won't match the new keys. You need to remap translations from old keys to new ones before the old keys are cleaned up.

By default, `write-locales` removes keys that are no longer in `base.json`. To preserve old keys long enough to remap their translations, use the `--keep-unused` flag:

1. Build the site with your new v2 keys in place
2. Run `rosey generate` to produce a `base.json` with the new keys
3. Run `write-locales --keep-unused` — this adds new entries alongside the old translated entries without deleting anything

```bash
npx rosey generate --source dist
npx rosey-cloudcannon-connector write-locales --keep-unused --source rosey --dest dist
```

4. Run a remap script you write — for each new key with an empty `value`, find an old key with the same `original` text and copy the `value` across, e.g.

```bash
node scripts/remap-locale-keys.mjs
```

5. Run `write-locales` again **without** the flag to clean up orphaned old keys

```bash
npx rosey-cloudcannon-connector write-locales --source rosey --dest dist
```

Old keys can be identified because they won't have `_base_original` set (only keys present in `base.json` receive this field) — that's the signal your remap script uses to tell new keys from stale ones.

A ready-to-adapt sample lives in this repo at [`scripts/remap-locale-keys.mjs`](../scripts/remap-locale-keys.mjs). It matches new keys to old translations by source text; copy it into your site and tweak the matching rule if your migration is fuzzier. Pass `--dry-run` to preview before writing.

### 9. Verify

After completing the migration:

1. Push your changes and trigger a CloudCannon build
2. Open a page in the Visual Editor
3. Confirm the locale switcher FAB appears
4. Switch to a locale and verify translations load
5. Make an edit and confirm it saves

If the switcher doesn't appear, check the [troubleshooting guide](known-issues.md#troubleshooting).