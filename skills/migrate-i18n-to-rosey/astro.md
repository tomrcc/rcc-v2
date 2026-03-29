# Astro Built-in i18n — Migration Patterns

Framework-specific details for migrating an Astro site from Astro's built-in i18n (and/or the official recipe pattern) to the Rosey/RCC/CloudCannon stack. Read alongside the main `SKILL.md` workflow.

> **Third-party packages** like `astro-i18next` or `paraglide` have their own config files, runtime APIs, and removal steps beyond what's covered here. This supplement focuses on Astro's built-in `i18n` config and the dictionary/`t()` recipe from the Astro docs.

## What Astro Built-in i18n Actually Is

Astro's "built-in i18n" is **routing infrastructure only**. It provides locale-aware URL routing, helper functions (`getRelativeLocaleUrl`), browser language detection (`Astro.preferredLocale`), and fallback routing. It does **not** provide a translation runtime, `t()` function, or dictionary format — those come from a recipe (example code) in the Astro docs that users copy into their project.

A typical site using this pattern has some or all of:

| Piece | Location |
|---|---|
| i18n config | `i18n: { ... }` block in `astro.config.mjs` |
| Dictionary | `src/i18n/ui.ts` — TS object with `{ en: { ... }, fr: { ... } }` |
| Helpers | `src/i18n/utils.ts` — `getLangFromUrl()`, `useTranslations()`, `useTranslatedPath()` |
| URL helpers | `getRelativeLocaleUrl()` / `getAbsoluteLocaleUrl()` from `astro:i18n` |
| Locale detection | `Astro.currentLocale` in components |
| Duplicated pages | `src/pages/fr/about.astro`, `src/pages/es/about.astro`, etc. |
| Content collections | `src/content/blog/en/`, `src/content/blog/fr/` with `[locale]` dynamic routes |
| Language picker | Component using `getRelativeLocaleUrl()` or manual path construction |
| Middleware | `src/middleware.ts` with i18n logic |

## Detection (supplements Phase 1)

Beyond the generic skill's checklist, look for these Astro-specific signals:

- **`astro.config.mjs`**: An `i18n` key with `locales`, `defaultLocale`, `routing`, `fallback`
- **`astro:i18n` imports**: `getRelativeLocaleUrl`, `getAbsoluteLocaleUrl` in components
- **`Astro.currentLocale`** or **`Astro.preferredLocale`** in component frontmatter
- **`src/i18n/`** directory with `ui.ts` and `utils.ts` (the recipe pattern)
- **Duplicated page trees**: `src/pages/fr/`, `src/pages/es/` mirroring the default-language pages

## Translation Extraction (supplements Phase 2)

The Astro recipe stores translations in a TypeScript object:

```ts
// src/i18n/ui.ts
export const ui = {
  en: {
    'nav.home': 'Home',
    'nav.about': 'About',
    'hero.title': 'Welcome to our site',
  },
  fr: {
    'nav.home': 'Accueil',
    'nav.about': 'À propos',
    'hero.title': 'Bienvenue sur notre site',
  },
} as const;
```

Target Rosey format (`rosey/locales/fr.json`):

```json
{
  "nav:home": {
    "original": "Home",
    "value": "Accueil"
  },
  "nav:about": {
    "original": "About",
    "value": "À propos"
  },
  "hero:title": {
    "original": "Welcome to our site",
    "value": "Bienvenue sur notre site"
  }
}
```

**Key separator change**: The recipe uses `.` as a separator (`nav.home`), but CloudCannon's data API uses `.` as a path delimiter. Rosey uses `:` instead (`nav:home`). When extracting, replace `.` with `:` in all keys.

### Conversion script

For sites with many translations, automate the extraction:

```js
import { ui } from './src/i18n/ui.ts';

const defaultLang = 'en';
const locales = Object.keys(ui).filter(l => l !== defaultLang);

for (const locale of locales) {
  const result = {};
  for (const [key, enValue] of Object.entries(ui[defaultLang])) {
    const roseyKey = key.replace(/\./g, ':');
    result[roseyKey] = {
      original: enValue,
      value: ui[locale]?.[key] ?? enValue,
    };
  }
  // Write result to rosey/locales/${locale}.json
}
```

The final key names must match the `data-rosey` attributes you'll add in Phase 3. Plan your naming scheme before running this.

## Page Triage (supplements Phase 3)

Not all duplicated locale pages should be deleted. For each set, decide:

**Pages where locale copies are structurally identical** (same layout, same components, only UI strings differ — e.g., About, Contact, Home): delete the locale copies, keep only the default-language page, and add `data-rosey` attributes. Rosey generates locale copies at build time.

**Pages where body content genuinely differs per locale** (blog posts, documentation, case studies): keep them as split-by-directory content collections. Follow Phase 7 of the `make-site-multilingual` skill and the split-by-directory section of `astro.md` in that skill's directory.

## Removal Specifics (supplements Phase 3)

Work through these in order after extracting translations.

### Remove the i18n config

Delete the entire `i18n` block from `astro.config.mjs`:

```diff
  export default defineConfig({
-   i18n: {
-     locales: ["es", "en", "fr"],
-     defaultLocale: "en",
-     routing: { prefixDefaultLocale: false },
-     fallback: { fr: "es" },
-   },
  });
```

### Replace `t()` calls

Each `t()` call becomes static default-language text with a `data-rosey` attribute:

```diff
- <h1>{t('hero.title')}</h1>
+ <h1 data-rosey="hero:title">Welcome to our site</h1>
```

```diff
- <a href={translatePath('/about/')}>{t('nav.about')}</a>
+ <a href="/about/" data-rosey="nav:about">About</a>
```

### Remove URL helpers

`getRelativeLocaleUrl()` and `getAbsoluteLocaleUrl()` calls are replaced with plain default-language paths. Rosey rewrites internal links on generated locale pages automatically:

```diff
- import { getRelativeLocaleUrl } from 'astro:i18n';
- <a href={getRelativeLocaleUrl('fr', 'about')}>À propos</a>
+ <a href="/about/" data-rosey="nav:about">About</a>
```

### Remove helper files

Delete `src/i18n/utils.ts` (`getLangFromUrl`, `useTranslations`, `useTranslatedPath`) and `src/i18n/ui.ts` (the dictionary). Remove all imports referencing them.

### Audit `Astro.currentLocale`

Search for `Astro.currentLocale` and `Astro.preferredLocale` across all components. Common usages and how to handle them:

- **Date formatting** (`date.toLocaleString(Astro.currentLocale)`): Use the default locale. If locale-specific formatting is critical for certain pages, move those pages to split-by-directory.
- **Conditional rendering** (showing different content per locale): Move the page to split-by-directory, or use `data-rosey` with different content in each locale file.
- **`<html lang>` attribute**: Replace `Astro.currentLocale` with a hardcoded default (e.g., `<html lang="en">`). Rosey sets the correct `lang` on generated locale pages.

### Delete duplicate page directories

For pages that passed triage as "Rosey-only" (structurally identical across locales), delete the locale copies:

```
src/pages/
  fr/          ← delete
  es/          ← delete
  about.astro  ← keep, add data-rosey
  index.astro  ← keep, add data-rosey
```

### Remove middleware

Delete any i18n-related logic in `src/middleware.ts`. If the middleware only handled i18n, delete the file entirely. If it has other logic, remove only the i18n parts.

## Locale Picker

Replace Astro's `getRelativeLocaleUrl()`-based picker with the Rosey-compatible version from `make-site-multilingual/astro.md`. The critical difference is `data-rosey-ignore` on every `<a>` element — without it, Rosey rewrites the links and breaks the "switch to default language" action.

## Fallback Behavior Change

Astro's `fallback: { fr: "es" }` redirects or rewrites entire pages to another locale when a page doesn't exist in the requested locale. Rosey has no per-page locale fallback — it falls back **per-key** to the original (default-language) text when a translation is missing. This is a behavioral change editors should be aware of: instead of seeing a Spanish page when French doesn't exist, visitors see the French URL with untranslated strings showing in the default language.

## Gotchas

- **Key separator change.** The Astro recipe uses `.` (`nav.home`), Rosey uses `:` (`nav:home`). This must be consistent between the extraction script, the `data-rosey` attributes, and the locale file keys. Automate the replacement rather than doing it by hand.
- **`Astro.currentLocale` silently disappears.** After removing the `i18n` config, `Astro.currentLocale` returns `undefined` instead of throwing an error. Any component using it for conditional logic will silently fall through to the else/default branch. Audit all usages before removing the config.
- **`prefixDefaultLocale: true` changes URL structure.** If the old site used `prefixDefaultLocale: true`, default-language pages lived under `/en/about/`. After migration, they move to `/about/`. Set up redirects from `/en/*` to `/*` if the site has inbound links to the prefixed paths.
- **Content collections with `[locale]` routes.** If the old site used Astro's `[locale]` dynamic parameter with i18n-aware `getStaticPaths`, these routes need to be converted to the split-by-directory pattern (separate collection per locale, explicit locale routes). See `make-site-multilingual/astro.md` for the implementation.
- **Route translation (`routes` in `ui.ts`).** The Astro recipe supports translating URL slugs (e.g., `/fr/prestations-de-service/` instead of `/fr/services/`). Rosey handles URL translation via `*.urls.json` files — see the Rosey docs for the equivalent.
