---
name: migrate-rcc-v1-to-v2
description: >-
  Migrate a site from RCC v1 (form-based YAML editing) to RCC v2 (inline Visual
  Editor editing). Use when the user wants to upgrade from rosey-cloudcannon-connector
  v1 to v2, replace the old translations collection with data_config, or switch
  from generateRoseyId / data-rosey-tagger to static keys with inline editing.
---

# Migrate from RCC v1 to v2

Step-by-step workflow for upgrading a site from the Rosey CloudCannon Connector v1 (form-based Data Editor with YAML files) to v2 (inline Visual Editor with floating locale switcher). Both versions use the npm package name `rosey-cloudcannon-connector`.

## Prerequisites

- The site is already using RCC v1 (`rosey-cloudcannon-connector@^1.x`)
- The site builds to static HTML via an SSG
- Existing translations in `rosey/locales/*.json` are up to date (run a final v1 build if unsure)

## Phase 1: Audit the v1 Setup

Before changing anything, document what the site currently uses.

### Detection checklist

| Signal | Where to look |
|---|---|
| **`generateRoseyId` imports** | Grep for `from "rosey-cloudcannon-connector/utils"` across `src/` |
| **`data-rosey-tagger`** | Grep for `data-rosey-tagger` in templates — v1's auto-tagger |
| **`rcc.yaml`** | `rosey/rcc.yaml` — v1 config with locales, Smartling, namespace pages |
| **`translations/` YAML files** | `rosey/translations/{locale}/*.yaml` — v1's intermediate format |
| **`translations` collection** | `cloudcannon.config.yml` `collections_config.translations` |
| **Postbuild pipeline** | `.cloudcannon/postbuild` — look for `tag`, `generate` commands |
| **Smartling** | `rosey/smartling-translations/`, `outgoing-smartling-translations.json` |
| **URL translation files** | `rosey/base.urls.json`, `rosey/locales/*.urls.json` |
| **TypeScript declarations** | `env.d.ts` with `declare module 'rosey-cloudcannon-connector/utils'` |

### Document your findings

Note:
1. Which locales are configured (check `rcc.yaml` `locales:` array)
2. How many files import `generateRoseyId` and what pattern they use
3. Whether `data-rosey-tagger` is used (markdown auto-tagging)
4. Whether Smartling integration is active
5. The existing postbuild pipeline commands

## Phase 2: Update Dependencies and Postbuild

### Update `package.json`

Replace the v1 dependency:

```json
"rosey-cloudcannon-connector": "^2.0.0"
```

Run `npm install`.

### Replace the postbuild script

**v1 pattern:**

```bash
npx rosey-cloudcannon-connector tag --source dist
npx rosey generate --source dist
npx rosey-cloudcannon-connector generate
mv ./dist ./untranslated_site
npx rosey build --source untranslated_site --dest dist --default-language-at-root
```

**v2 replacement:**

```bash
npx rosey generate --source dist
npx rosey-cloudcannon-connector write-locales --source rosey --dest dist
mv ./dist ./_untranslated_site
npx rosey build --source _untranslated_site --dest dist --default-language en --default-language-at-root --exclusions "\.(html?)$"
```

Key changes:
- Remove the `tag` command (auto-tagger is gone)
- Replace `generate` with `write-locales --source rosey --dest dist`
- Add `--exclusions "\.(html?)$"` so JSON assets like `_rcc/locales.json` flow through
- Add `--default-language en` (or the site's source language)
- Underscore-prefix the untranslated dir name

> **Important:** For the first build during migration, add `--keep-unused` to the `write-locales` command so old translation keys survive long enough to remap (see Phase 8). Remove the flag after remapping is complete.

Keep any non-RCC commands (Bookshop generate, Pagefind, etc.) in their original positions.

## Phase 3: Update CloudCannon Config

### Remove the `translations` collection

Delete the `collections_config.translations` entry that pointed at `rosey/rcc.yaml` and `translations/**`.

### Add `data_config` entries for each locale

```yaml
data_config:
  locales_fr-FR:
    path: rosey/locales/fr-FR.json
  locales_de-DE:
    path: rosey/locales/de-DE.json
```

The key must follow the `locales_{code}` naming convention. Use the same locale codes from the v1 `rcc.yaml`.

### Optionally add a browsable locales collection

```yaml
collections_config:
  locales:
    path: rosey/locales
    name: Locales
    icon: translate
    disable_add: true
    disable_add_folder: true
    disable_file_actions: true
    _inputs:
      value:
        type: html
        label: Translation
        cascade: true
      original:
        hidden: true
        cascade: true
      _base_original:
        disabled: true
        cascade: true
```

### Update `collection_groups`

Replace any reference to `translations` with `locales` (or remove if not using the optional collection).

## Phase 4: Add the Client-Side Script and Snapshot Boundary

v1 had no client-side component. v2 needs two things in the root layout:

### Import the RCC script

Add before `</body>`:

```html
<script>
  if (window?.inEditorMode) {
    import("rosey-cloudcannon-connector");
  }
</script>
```

### Set the snapshot boundary

If header/footer contain translatable text (nav links, copyright, locale names), wrap them with `<main>` inside a `data-rcc` element:

```html
<body>
  <div data-rcc>
    <Header />
    <main><slot /></main>
    <Footer />
  </div>
  <!-- RCC script goes here, outside the boundary -->
</body>
```

If only `<main>` content is translatable, skip `data-rcc` — the connector falls back to `<main>`.

## Phase 5: Replace `generateRoseyId` with Static Keys

This is typically the largest change. Search for all `generateRoseyId` imports and replace each call site.

### Strategy by component type

**Single-instance elements** (hero headings, copyright, section titles):
Use descriptive static keys. Namespacing via `data-rosey-ns` on a parent provides uniqueness.

```astro
<!-- v1 -->
<h1 data-rosey={generateRoseyId(heading.text)}>{heading.text}</h1>

<!-- v2 -->
<h1 data-rosey="heading">{heading.text}</h1>
```

**Iterated data arrays** (nav links, footer links):
Use a simple inline transform of the text content. Link text is short and stable, so a lowercase slugify works:

```astro
<!-- v1 -->
<a data-rosey={generateRoseyId(link.text)}>{link.text}</a>

<!-- v2 -->
<a data-rosey={link.text.toLowerCase().replace(/\s+/g, "-")}>{link.text}</a>
```

**Tags and categories** (already lowercase slugs):
Use the tag value directly as the key:

```astro
<span data-rosey={tag}>{tag}</span>
```

**Rendered markdown blocks** (previously used `data-rosey-tagger`):
Replace the auto-tagger with a single `data-rosey` on the wrapper, translating the block as one unit:

```astro
<!-- v1 -->
<div data-rosey-ns="rcc-markdown" data-rosey-tagger set:html={content} />

<!-- v2 -->
<div data-rosey="markdown" set:html={content} />
```

### Remove the import

Delete the `import { generateRoseyId } from "rosey-cloudcannon-connector/utils"` line from every file.

## Phase 6: Fix Locale Picker Links

If the site has a visitor-facing locale picker, add `data-rosey-ignore` to the picker's `<a>` tags. Without it, Rosey rewrites the links to add locale prefixes, breaking the "switch to English" link on translated pages.

```html
<a href={`/${locale.code}${pagePath}`} data-rosey-ignore>
```

## Phase 7: Clean Up v1 Artifacts

Delete files that v2 doesn't use:

- `rosey/rcc.yaml`
- `rosey/translations/` (entire directory)
- `rosey/smartling-translations/` (if exists)
- `rosey/outgoing-smartling-translations.json` (if exists)

Update `src/env.d.ts` — remove `declare module 'rosey-cloudcannon-connector/utils'`.

**Keep:**
- `rosey/base.json` and `rosey/locales/*.json` — your actual translations
- `rosey/base.urls.json` and `rosey/locales/*.urls.json` — native Rosey URL translation files. These are **not** RCC artifacts. Rosey uses them at build time to generate translated URL paths (e.g. `/fr/a-propos/` instead of `/fr/about/`). v1 exposed them for editing through the `translations` collection; v2 does not provide a UI for editing URL translations, but the files are still consumed by `rosey build`. **Do not delete them** if they contain translated URLs.

## Phase 8: Remap Existing Translation Keys

Since keys changed, existing translations won't match new keys. The first v2 build must use `write-locales --keep-unused` (see Phase 2 note) so that old translated entries are preserved alongside the new keys. Without `--keep-unused`, `write-locales` deletes keys not present in `base.json` — destroying old translations before you can remap them.

After the first v2 build (which runs `write-locales --keep-unused` and populates `_base_original` on new keys), run a remapping script:

1. For each new key with an empty `value`, find an old key with the same `original` text
2. Copy the `value` from the old key to the new key
3. Remove orphaned old keys (those without `_base_original`)

Sample Node.js script logic:

```javascript
const locale = JSON.parse(readFileSync(localePath, "utf-8"));

// Build lookup: original text -> value (prefer entries with translations)
const byOriginal = new Map();
for (const [key, entry] of Object.entries(locale)) {
  const orig = (entry.original || "").trim();
  if (!orig) continue;
  const existing = byOriginal.get(orig);
  if (!existing || (!existing.value && entry.value)) {
    byOriginal.set(orig, { key, value: entry.value });
  }
}

// Fill empty values from matching originals
for (const [key, entry] of Object.entries(locale)) {
  if (!entry.value && byOriginal.has(entry.original?.trim())) {
    entry.value = byOriginal.get(entry.original.trim()).value;
  }
}

// Remove orphaned keys (no _base_original = not in current base.json)
for (const key of Object.keys(locale)) {
  if (locale[key]._base_original === undefined) delete locale[key];
}
```

After remapping is complete, remove `--keep-unused` from the postbuild `write-locales` command so that future builds clean up stale keys normally.

## Phase 9: Verify

1. Build the site locally and check `rosey/base.json` for correct keys
2. Run the full postbuild pipeline
3. Push to CloudCannon and open a page in the Visual Editor
4. Confirm the locale switcher FAB appears
5. Switch to a locale and verify translations load
6. Make an edit and confirm it saves

## Checklist

- [ ] `package.json` updated to v2
- [ ] `.cloudcannon/postbuild` uses v2 pipeline
- [ ] `cloudcannon.config.yml` has `data_config` entries, `translations` collection removed
- [ ] Client-side RCC script added to root layout
- [ ] `data-rcc` boundary set (if header/footer need translation)
- [ ] All `generateRoseyId` imports removed and replaced with static keys
- [ ] `data-rosey-tagger` removed, markdown blocks use single `data-rosey` tag
- [ ] `data-rosey-ignore` added to locale picker links
- [ ] v1 artifacts deleted (rcc.yaml, translations/, smartling, urls.json)
- [ ] `env.d.ts` cleaned up
- [ ] Translation keys remapped after first v2 build
- [ ] Site builds and Visual Editor locale switching works

## Gotchas

- **Key remapping is the biggest risk.** When switching from content-derived to static keys, existing translations become orphaned. Always back up locale files before migrating and use a remapping script after the first v2 build. Matching by `original` text works for most entries, but fails when multiple old keys share the same original (e.g. `common:Blog` and `blog:Blog` both have `"original": "Blog"`). Manual review is needed for collisions.
- **`--keep-unused` is required for the first build.** By default, `write-locales` removes locale keys not present in `base.json`. During migration, old keys (with their translations) must survive long enough for the remapping script to copy values to new keys. Add `--keep-unused` to the `write-locales` command in the postbuild for the first v2 build, then remove it after remapping is complete.
- **`data-rosey-tagger` removal is a trade-off.** v1 auto-tagged individual elements inside rendered markdown. v2 wraps the whole block in one `data-rosey` tag instead. This means the markdown is translated as one unit rather than per-element. For large body content, the recommended v2 approach is split-by-directory (per-locale content collections) rather than Rosey — Rosey handles shared UI strings.
- **Nav/footer links need `data-rosey-ns`.** The v1 starter uses `data-rosey-ns="common"` on header and footer elements, giving nav link keys the `common:` prefix. Make sure this namespace is preserved when replacing `generateRoseyId` — otherwise keys won't be namespaced and may collide with other pages.
- **Locale picker links need `data-rosey-ignore`.** Without it, Rosey rewrites the locale picker's URLs and breaks the "switch to default language" link on translated pages. v1 didn't have this issue because it had no client-side URL rewriting concern.
- **`data-rcc` boundary is new.** v1 had no client-side component, so there was no concept of a snapshot boundary. When migrating, decide early whether header/footer need to be inside the boundary. If they contain `data-rosey` elements, they must be inside `data-rcc`.
- **`_base_original` distinguishes live from orphaned keys.** After `write-locales` runs, every key present in `base.json` gets `_base_original`. Orphaned old keys lack this field, making cleanup scriptable.
- **`*.urls.json` files are native Rosey, not RCC.** Do NOT delete `base.urls.json` or `locales/*.urls.json` during migration — they contain translated URL paths that Rosey uses at build time. v1 exposed them for editing through the `translations` collection in CloudCannon's Data Editor. v2 does not provide a UI for editing URL translations, so they must be edited manually or via a custom workflow. This is a feature gap to be aware of when migrating sites that use translated URLs.
- **`write-locales` auto-detection picks up `.urls.json` files.** When `--locales` is not passed, `write-locales` auto-detects locales by scanning `rosey/locales/*.json`. If `.urls.json` files are present, they get treated as locales (e.g. `fr-FR.urls`) and trigger a spurious "Missing data_config" warning. This was fixed in rcc-v2 by filtering out `*.urls.json` during auto-detection. If you see this warning on an older build, pass `--locales fr-FR,de-DE` explicitly to bypass auto-detection.
