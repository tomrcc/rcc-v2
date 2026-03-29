# Migrating from an Existing i18n System

If your site already uses a translation system — Astro's built-in i18n, `astro-i18next`, `next-intl`, or any other framework-specific i18n solution — you can migrate to the Rosey/RCC stack. This page covers what changes, what you gain, and how hard it is.

## Why migrate

**What you gain:**
- **Visual editing** — editors see and edit translations in context on the page, not in a disconnected key-value editor
- **Stale translation detection** — when source text changes, out-of-date translations are flagged automatically
- **AI-friendly locale files** — the structured JSON format enables incremental, deterministic AI translation with no wasted tokens
- **Framework-agnostic** — works with any SSG that outputs static HTML (Astro, Hugo, Eleventy, Jekyll, etc.)
- **No source-level translation plumbing** — no `t()` functions, no locale-aware imports, no per-locale routing middleware

**What you trade:**
- **Build-time locale awareness** — your components no longer know which locale they're rendering for at build time. Locale-specific date formatting or conditional rendering needs a different approach (see [split-by-directory](split-by-directory.md)).
- **Post-build step** — Rosey runs after your SSG build to generate locale pages. This adds a step to your build pipeline.

## What Rosey replaces

| Old system concept | Rosey equivalent |
|---|---|
| `i18n` config / locale routing | Rosey generates locale pages at `/{locale}/...` URLs automatically |
| `t("key")` function / translation dictionaries | `data-rosey="key"` attributes on HTML elements |
| Per-locale page copies (`/fr/about.astro`) | Rosey clones pages and injects translations from locale JSON files |
| Translation files (JSON/YAML/PO dictionaries) | `rosey/locales/{code}.json` with `{ original, value, _base_original }` per entry |
| Language picker with locale URL helpers | Static picker with `data-rosey-ignore` on links ([details](../skills/make-site-multilingual/astro.md#visitor-facing-locale-picker)) |
| Locale fallbacks (page-level) | Rosey falls back per-key to default-language text |
| `Astro.currentLocale` / locale detection | Not needed — pages are built once, Rosey handles locale output |

## Migration difficulty by pattern

| Pattern | Difficulty | Notes |
|---|---|---|
| **Dictionary-based UI strings** (`t()` calls) | Straightforward | Replace `t("key")` with static text + `data-rosey`. Extract existing translations into Rosey format. Mostly find-and-replace. |
| **Split-by-directory content** (per-locale content collections) | Minimal change | Keep locale collections as-is. Rosey merges with pre-existing locale pages and only translates `data-rosey` elements. See [split-by-directory](split-by-directory.md). |
| **Full page duplication** (identical structure, different strings) | Moderate | Delete locale copies, add `data-rosey` to the default-language page, map existing translations to Rosey keys. |
| **Locale-conditional logic** (`Astro.currentLocale`, date formatting) | Case-by-case | Audit each usage. Drop locale-awareness where acceptable, or move to split-by-directory for pages that genuinely need it. |

## Getting started

### Using agent skills (recommended)

The package includes agent skills with detailed step-by-step migration workflows. Add them to your project:

```bash
npx rosey-cloudcannon-connector add-skills
```

The `migrate-i18n-to-rosey` skill walks through the full process: detecting the current system, extracting translations, removing old infrastructure, applying the Rosey stack, and verifying the result. It includes an Astro-specific supplement with concrete before/after patterns for Astro's built-in i18n.

### Manual migration

Follow the [Getting Started](getting-started.md) guide for the Rosey/RCC setup, and refer to the high-level migration steps:

1. **Extract** existing translations into Rosey's locale JSON format
2. **Remove** the old i18n system (packages, config, routing, `t()` calls)
3. **Verify** the site builds and renders correctly in the default language
4. **Apply** the Rosey stack (tag elements, import the connector, configure CloudCannon, set up postbuild)
5. **Merge** extracted translations into the generated locale files

## Astro's built-in i18n

Astro's "built-in i18n" is routing infrastructure only — it provides locale-aware URL routing, helper functions, and browser language detection, but no translation runtime. The `t()` function and dictionary pattern come from a recipe in the Astro docs (example code you copy into your project), not a framework feature.

This means the migration is mainly about:
- Replacing the recipe-pattern dictionary and `t()` calls with `data-rosey` attributes
- Removing the `i18n` config block from `astro.config.mjs`
- Deleting duplicate page directories (for pages where only strings differ)
- Replacing `getRelativeLocaleUrl()` calls with plain paths (Rosey rewrites links automatically)

For detailed before/after code patterns, use the `migrate-i18n-to-rosey` agent skill (it includes an Astro-specific supplement), or see the [Astro migration patterns](../skills/migrate-i18n-to-rosey/astro.md) directly.
