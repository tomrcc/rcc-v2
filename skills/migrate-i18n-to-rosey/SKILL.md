---
name: migrate-i18n-to-rosey
description: >-
  Migrate a site from an existing i18n/multilingual system to the
  Rosey/RCC/CloudCannon stack. Use when the user wants to replace astro-i18n,
  astro-i18next, next-intl, path-based locale routing, or any other i18n method
  with Rosey and the CloudCannon connector.
---

# Migrate from Existing i18n to Rosey/RCC/CloudCannon

Step-by-step workflow for replacing an existing internationalization system with the Rosey/RCC/CloudCannon stack. This skill assumes you are familiar with the `make-site-multilingual` skill -- read it first if you haven't.

## SSG-Specific Guidance

After identifying the i18n method (Phase 1), read the matching file in this directory for framework-specific removal steps, extraction patterns, and gotchas:

| SSG | File to read |
|-----|---|
| Astro (built-in i18n or recipe pattern) | `astro.md` in this skill directory |

These supplements contain concrete before/after code for replacing `t()` calls, removing config, triaging duplicated pages, and handling framework-specific APIs like `Astro.currentLocale`.

## Phase 1: Identify the Current i18n Method

Detect what system is in use before changing anything.

### Detection checklist

| Signal | What to look for |
|---|---|
| **package.json** | `astro-i18n`, `astro-i18next`, `next-intl`, `i18next`, `vue-i18n`, `react-intl`, `@nuxtjs/i18n` |
| **Framework config** | `astro.config.mjs` `i18n` block (Astro built-in — routing only, no translation runtime), `next.config.js` i18n settings, `nuxt.config.ts` i18n module |
| **Recipe-pattern helpers** | `src/i18n/ui.ts` dictionary, `getLangFromUrl()`, `useTranslations()`, `getRelativeLocaleUrl()` (Astro docs recipe — no package, just copied code) |
| **Folder structure** | Duplicate content folders per locale (`/en/`, `/fr/`), or `locales/` directories with JSON/YAML |
| **Routing** | Locale prefixed routes (`/fr/about`), middleware that detects locale, `[locale]` dynamic segments |
| **Translation files** | `.json`, `.yaml`, `.po` files with key-value translation pairs |
| **Template usage** | `t("key")` function calls, `$t("key")`, `useTranslation()`, `<Trans>` components, `Astro.currentLocale` |

### Document your findings

Before proceeding, note:
1. Which locales are currently supported
2. Where translation files live and their format
3. How locale routing works (path prefix, subdomain, cookie, etc.)
4. Which components use translation functions

## Phase 2: Extract Existing Translations

Convert existing translation data into Rosey's locale JSON format.

### Target format

Each locale file (`rosey/locales/{code}.json`) uses this structure:

```json
{
  "page:section:key": {
    "original": "English source text",
    "value": "Translated text"
  }
}
```

### Extraction strategies by source format

**From flat JSON (`{"key": "value"}`):**
Map each key to a Rosey-namespaced key. The namespace should reflect the page and section the text appears in. Set `original` to the source language value and `value` to the translation.

**From nested JSON (`{"page": {"section": {"key": "value"}}}`):**
Flatten the nested structure using `:` as the separator to match Rosey's namespacing convention.

**From key-value `.po` / `.yaml` files:**
Extract msgid/msgstr pairs or key/value pairs and map them to the Rosey format.

**From duplicated content files (e.g., `/en/about.md` and `/fr/about.md`):**
Compare the source and translated files field by field. Map each translatable field to a Rosey key based on the page slug and field name.

### Write a conversion script if needed

For large sites, write a one-off Node.js script to automate the conversion. The script should:
1. Read existing translation files
2. Map keys to Rosey's `{root}:{ns}:{key}` format (based on where the text appears in the HTML)
3. Output locale JSON files in Rosey's format

> The key mapping is the hardest part. Rosey keys are determined by `data-rosey`, `data-rosey-ns`, and `data-rosey-root` attributes in the HTML -- you must decide on your naming scheme (Phase 3) before finalizing the key mapping.

## Phase 3: Remove Old i18n Infrastructure

Remove the old system piece by piece. Do this **after** extracting translations but **before** adding Rosey.

1. **Remove i18n packages** from `package.json` and run `npm install`
2. **Remove i18n config** from the framework config file
3. **Remove locale routing** -- delete `[locale]` dynamic segments, middleware, redirect logic
4. **Remove translation function calls** -- replace `t("key")` calls with the source-language text (the text Rosey will tag)
5. **Remove duplicate content folders** if the old system used per-locale copies. Keep only the source language.
6. **Remove translation files** in the old format (Rosey will generate its own)
7. **Clean up imports** -- remove unused i18n library imports from components

**Verify the site builds and renders correctly in the source language after removal.** This is your clean baseline.

## Phase 4: Apply the Rosey Stack

**Fastest path (recommended for agents):** After removing the old i18n system, run the setup wizard in headless mode:

```bash
npx rosey-cloudcannon-connector init --yes --locales fr,de
```

Or interactively for humans:

```bash
npx rosey-cloudcannon-connector init
```

This handles steps 1, 4, and 5 below in one command (installation, CC config, and postbuild). You still need to manually tag templates (step 2) and add the RCC import (step 3).

**Full manual steps** (follow the `make-site-multilingual` skill starting from Phase 2 onward):

1. Install `rosey` and `rosey-cloudcannon-connector`
2. Tag templates with `data-rosey`, `data-rosey-root`, `data-rosey-ns`
3. Import RCC conditionally in the root layout
4. Configure `cloudcannon.config.yml` with `data_config` entries
5. Update `.cloudcannon/postbuild`

### Import extracted translations

After running `write-locales` to generate empty locale files, merge your extracted translations (from Phase 2) into the generated files:

- Match keys from your extracted data to the keys Rosey generated in `base.json`
- For each match, set the `value` field in the locale file
- Keys that don't match need manual review -- the naming scheme may differ

## Phase 5: Verify

1. **Build and generate:**
   ```bash
   npm run build
   npx rosey generate --source dist
   ```

2. **Check `base.json`** -- all translatable text should appear with correct namespaced keys.

3. **Check locale files** -- translations from the old system should be present as `value` fields.

4. **Run the full Rosey build:**
   ```bash
   npx rosey-cloudcannon-connector write-locales --source rosey --dest dist
   mv ./dist ./_untranslated_site
   npx rosey build --source _untranslated_site --dest dist --default-language-at-root
   ```

5. **Spot-check translated pages** in the output to confirm translations appear correctly.

6. **Test in CloudCannon's Visual Editor** (if possible) -- verify the locale switcher appears and inline editing works.

## Checklist

- [ ] Existing i18n method identified and documented
- [ ] All existing translations extracted to Rosey format
- [ ] Old i18n packages, config, and routing removed
- [ ] Site builds and renders correctly in source language (clean baseline)
- [ ] Rosey/RCC stack applied (per `make-site-multilingual` skill)
- [ ] Extracted translations merged into generated locale files
- [ ] `base.json` keys match expected namespacing
- [ ] Translated pages render correctly
- [ ] No leftover `t()` calls, `[locale]` routes, or old translation files

## Gotchas

- **Key mapping is the hardest part.** Old i18n systems use arbitrary key names (e.g., `home.hero.title`), while Rosey keys are determined by DOM attributes. Plan the `data-rosey-root` / `data-rosey-ns` / `data-rosey` naming scheme before attempting to map old keys.
- **Don't remove and add simultaneously.** Always get to a clean, working single-language site before adding Rosey. Debugging two systems at once is painful.
- **Duplicated content folders lose structure.** When migrating from per-locale content folders (e.g., `/en/about.md`, `/fr/about.md`), the translated frontmatter fields need to be mapped to Rosey keys based on how they render in the HTML, not their YAML structure.
- **Some i18n systems handle pluralization.** Rosey does not have built-in pluralization. If the old system uses plural forms, each form needs its own `data-rosey` key or the component logic needs adjustment.
