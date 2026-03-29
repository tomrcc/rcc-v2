---
name: make-site-multilingual
description: >-
  Convert a non-multilingual site to use the Rosey/RCC/CloudCannon stack for
  translation management. Use when the user wants to add multilingual support,
  add translations, internationalize a site, or set up Rosey with CloudCannon.
---

# Make a Site Multilingual with Rosey/RCC/CloudCannon

Step-by-step workflow for converting a single-language site into a multilingual site managed through CloudCannon's Visual Editor using Rosey and the Rosey CloudCannon Connector (RCC).

## Prerequisites

- The site must build to static HTML (SSG). Rosey operates on built output, not source files.
- CloudCannon must be the CMS (RCC depends on CloudCannon's JS API). The RCC does **not** require editable regions, Bookshop, or any existing inline editing setup — it creates its own ProseMirror editors on every `data-rosey` element. Sites with no editing infrastructure at all still get full visual translation editing. That said, the experience is best when paired with editable regions: the "Original" view gets full inline editing of source text, and the RCC can inherit toolbar/input config from existing editors.
- Confirm which locales the user wants to support (e.g., `fr,de,es`).

## SSG Detection and Framework-Specific Guidance

After auditing the site (Phase 1), identify the SSG and read the matching file in this directory for framework-specific implementation details:

| SSG | File to read |
|-----|---|
| Astro | `astro.md` in this skill directory |
| Eleventy (11ty) | `eleventy.md` in this skill directory |
| Hugo | `hugo.md` in this skill directory |

These files contain slug derivation patterns, content block namespacing examples, split-by-directory details, locale picker examples, and framework-specific gotchas. The phases below reference them where needed.

## Phase 1: Audit the Site

Before touching code, understand what needs to be translated.

1. **Find all translatable text.** Search templates, components, and layouts for user-visible text:
   - Headings, paragraphs, button labels, link text, alt text
   - Text in markdown frontmatter that renders into HTML (titles, descriptions)
   - Text in global data files (navigation labels, footer text, company info)
   - Hardcoded strings in template files

2. **Identify the build output directory.** Common values: `dist/`, `_site/`, `build/`, `out/`. Check the framework config (e.g., `astro.config.mjs`, `eleventy.js`).

3. **Map out the page/content structure.** Understand how pages are generated -- dynamic routes, content collections, data-driven pages. This determines how to set `data-rosey-root` values.

## Phase 2: Install Dependencies

**Fastest path (recommended for agents):** Run the setup wizard in non-interactive mode. It handles installation, postbuild creation, and CloudCannon config in one command with no prompts:

```bash
npx rosey-cloudcannon-connector init --yes --locales fr,de
```

Override any default as needed:

```bash
npx rosey-cloudcannon-connector init --yes \
  --locales fr,de,es \
  --default-language en \
  --build-dir dist \
  --rosey-dir rosey \
  --content-at-root \
  --collection
```

The manual steps below (Phases 3-6) are still needed for tagging templates and importing the RCC, but the wizard covers everything in Phase 5 (Configure CloudCannon) automatically.

**Interactive mode** (if a human is running it):

```bash
npx rosey-cloudcannon-connector init
```

The wizard prompts for locales, default language, build dir, and more.

**Manual install** (if you prefer or need to skip the wizard entirely):

```bash
npm install rosey
npm install rosey-cloudcannon-connector
```

## Phase 3: Tag Templates with `data-rosey`

Add Rosey attributes to the HTML output. Work from the outermost layout inward.

### 3a. Set up `data-rosey-root` on page containers

Each page needs a root namespace so keys don't collide across pages. Add `data-rosey-root` to a top-level element (typically `<main>`) using the page's slug or path:

```html
<main data-rosey-root="about">
```

For dynamic pages, derive the slug from the page's URL at build time (see 3e for SSG-specific patterns):

```html
<!-- The value should resolve to the page's unique slug, e.g. "about", "blog/my-post", "index" -->
<main data-rosey-root="{{ slug }}">
```

### 3b. Add `data-rosey-ns` for component namespacing

Wrap reusable sections with `data-rosey-ns` to namespace their keys:

```html
<section data-rosey-ns="hero">
  <h1 data-rosey="title">Welcome</h1>
  <p data-rosey="description">Our product helps you...</p>
</section>
```

This produces keys like `index:hero:title` and `index:hero:description`.

### 3c. Add `data-rosey` to translatable elements

Tag every element containing user-visible text:

```html
<h1 data-rosey="title">Welcome to Our Site</h1>
<p data-rosey="description">We build great products.</p>
<a data-rosey="cta_text" href="/signup">Get Started</a>
```

**Important considerations:**
- `data-rosey` only captures the **text content** of the element
- For elements that already have CloudCannon `data-editable` / `data-prop` attributes, add `data-rosey` alongside them -- they serve different purposes
- Use `data-rcc-ignore` on elements that have `data-rosey` but should not appear in the locale switcher
- **Skip proper nouns**: Do not tag names, author names, designations, or other identity values that should remain the same across locales
- **Rich-text body content**: Place `data-rosey` on the innermost text-containing element (e.g., `<editable-text>`, `<span class="inner-text">`), not a parent wrapper, so Rosey captures only the inner HTML and not the wrapper tags

### 3d. Handle shared/global content

For content shared across pages (navigation, footer), decide on a namespace strategy:
- Option A: Use `data-rosey-root=""` to reset the namespace, giving global elements flat keys
- Option B: Use a dedicated root like `data-rosey-root="global"` on the wrapper

### 3e. SSG-specific slug derivation

The `data-rosey-root` value should be derived from the page's URL path at build time. Strip leading/trailing slashes and fall back to `"index"` for the home page.

**General pattern:** Use whatever build-time variable gives the page's URL path. Strip slashes to get a clean slug, and ensure the home page gets `"index"` (or another consistent value) rather than an empty string.

**Read the SSG-specific file** (`astro.md`, `eleventy.md`, or `hugo.md` in this directory) for the exact implementation pattern.

### 3f. Component system integration (auto-derive `data-rosey`)

> **This step is optional.** It applies only to sites that already have component-based inline editing (Bookshop, `data-prop`, etc.). Sites without editing infrastructure can skip this entirely — just add `data-rosey` directly to elements as shown in 3c.

For sites that use reusable building-block components with an existing editing attribute (e.g., CloudCannon's `data-prop`, Bookshop's prop bindings), you can **auto-derive** `data-rosey` from that attribute instead of tagging every component instance manually.

**Core rules (apply to any component system):**

1. **Derive from the editing attribute.** If a component already outputs `data-prop="title"` for CloudCannon inline editing, use that same value as the `data-rosey` key automatically.
2. **Destructure `data-rosey` from component props.** If the component uses a rest-spread pattern (e.g., `...htmlAttributes` or `...rest`) on an outer wrapper, `data-rosey` must be explicitly destructured out. Otherwise it leaks onto the outer element instead of reaching the inner text element where Rosey needs it.
3. **Support an opt-out mechanism.** Allow passing `data-rosey={false}` (or the template-language equivalent) to suppress auto-derivation on instances that should not be translated -- proper nouns, author names, identity values.
4. **Handle non-editable components explicitly.** When a component has editing disabled (no `data-prop`), auto-derive has no source attribute. Hardcoded strings in these components (e.g., "Read more", "No results found") need an explicit `data-rosey="key"` passed in.
5. **Place `data-rosey` on the innermost text element.** Rosey captures `innerHTML` of the tagged element. If `data-rosey` lands on an outer wrapper that contains custom elements (e.g., `<editable-text>`, Bookshop live-edit comments), those tags become part of the captured original. Always target the element that contains just the visible text.

See `astro.md` in this directory for an Astro implementation example. The same concept applies to any component system -- adapt the destructuring and conditional logic to your template language.

### 3g. Content block namespacing

For CMS page-builder pages that use `content_blocks` (or equivalent), each block wrapper needs a `data-rosey-ns` value that is **unique and stable** — it must not change when blocks are reordered, inserted, or deleted.

#### Recommended: UUIDs via `instance_value` (CloudCannon sites)

Use CloudCannon's `instance_value: UUID` to auto-assign a stable UUIDv4 when an array item is created. Add a hidden `_uuid` input and include `_uuid:` in every structure value:

```yaml
# cloudcannon.config.yml
_inputs:
  _uuid:
    type: text
    hidden: true
    instance_value: UUID

_structures:
  content_blocks:
    values:
      - label: Hero
        value:
          _name: Hero
          _uuid:
          heading:
```

Then use the UUID as the namespace segment in the block loop:

```html
<!-- Stable: UUID survives reordering and insertions -->
<div data-rosey-ns="{block._uuid}">
  <BlockComponent />
</div>
<!-- key: index:3f43d721-9c23-...:heading -->
```

Existing content files need UUIDs seeded manually (CloudCannon only auto-populates on creation). Generate real UUIDs and add them to each array item in the frontmatter.

For a working example, see the [Rosey Astro Starter](https://github.com/CloudCannon/rosey-astro-starter).

#### Fallback: type + index (non-CloudCannon sites)

For sites not using CloudCannon (or where `instance_value` isn't available), use the block type name combined with a zero-based index:

```html
<!-- Fragile: keys shift when items are reordered -->
<div data-rosey-ns="{block_type}-{index}">
```

This produces keys like `index:hero-0:heading`, `index:feature-list-1:title`. Be aware that inserting or reordering blocks will shift keys after the change point, causing translations to map to the wrong content.

#### Repeating items within blocks

For repeating items within a block (testimonials, team members, FAQ entries), the same principle applies. With CloudCannon, add `_uuid` to the nested structure. Without CloudCannon, use a nested index: `data-rosey-ns="{item_index}"`, producing keys like `index:testimonial-2:0:author`.

**Read the SSG-specific file** for code examples in your framework.

## Phase 4: Import RCC in the Root Layout

Add the RCC import to the site's root layout. It must be lazy-loaded and only run inside the CloudCannon editor:

```html
<script>
  if (window?.inEditorMode) {
    import("rosey-cloudcannon-connector");
  }
</script>
```

Place this in the `<body>` of the root layout, after the main content.

## Phase 5: Configure CloudCannon

> **If you ran `npx rosey-cloudcannon-connector init` in Phase 2**, the wizard has already handled 5a, 5b, and optionally 5c below. Skip to Phase 6.

### 5a. Add `data_config` for locale files

In `cloudcannon.config.yml`, add an entry for each locale. The key **must** follow the format `locales_{code}`:

```yaml
data_config:
  locales_fr:
    path: rosey/locales/fr.json
  locales_de:
    path: rosey/locales/de.json
```

### 5b. Update the postbuild script

Replace or update `.cloudcannon/postbuild` with the Rosey pipeline. Adjust `--source dist` to match the build output directory. On first run, add `--locales fr,de` to create the initial locale files; subsequent runs auto-detect:

```bash
#!/usr/bin/env bash

npx rosey generate --source dist
npx rosey-cloudcannon-connector write-locales --source rosey --dest dist
mv ./dist ./_untranslated_site
npx rosey build --source _untranslated_site --dest dist --default-language en --default-language-at-root --exclusions "\.(html?)$"
```

This script:
1. Generates `rosey/base.json` from the built HTML
2. Creates/updates locale JSON files (preserving existing translations, removing keys no longer in `base.json`) and writes the locale manifest to `dist/_rcc/locales.json`
3. Moves the original build aside
4. Rebuilds the site with Rosey translations injected; the `--exclusions` override lets JSON files (like `_rcc/locales.json` and `_cloudcannon/info.json`) flow through instead of being excluded by Rosey's default regex

`write-locales` also accepts `--keep-unused` to preserve locale keys that are no longer in `base.json`. This is useful during migration (e.g. remapping translations from old keys to new keys before cleanup) but is not needed for normal greenfield setup.

### 5c. (Optional) Expose locales as a browsable collection

If editors need to edit translations that don't appear visually on a page (HTML attributes, `<head>` values, etc.), expose the locale files as a CloudCannon collection:

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

This makes locale files browsable in the CloudCannon sidebar. The `_inputs` config shows `value` as an HTML editor, hides the internal `original` field, and displays `_base_original` as read-only context.

## Phase 6: Generate and Verify

1. **Build the site locally:**
   ```bash
   npm run build
   ```

2. **Generate the Rosey base file:**
   ```bash
   npx rosey generate --source dist
   ```

3. **Create locale files** (first time, specify locales explicitly; subsequent runs auto-detect):
   ```bash
   npx rosey-cloudcannon-connector write-locales --source rosey --dest dist --locales fr,de
   ```

4. **Verify `rosey/base.json`** -- confirm it contains all expected keys with correct namespacing.

5. **Verify locale files** (e.g., `rosey/locales/fr.json`) -- confirm keys match `base.json` and `original`/`value` fields are populated.

6. **Test the full pipeline:**
   ```bash
   mv ./dist ./_untranslated_site
   npx rosey build --source _untranslated_site --dest dist --default-language en --default-language-at-root --exclusions "\.(html?)$"
   ```
   Verify the translated site output in `dist/` and confirm `dist/_rcc/locales.json` exists.

## Phase 7: Split-by-Directory for Body Content (Optional)

For pages with large body content (blog posts, articles, documentation pages), Rosey's single-key approach is impractical -- the entire body becomes one massive translation key. A better approach is **split-by-directory**: create a separate content collection per locale and let the SSG build those pages natively to the correct locale URLs.

### When to use split-by-directory

- The page has long-form body content (blog posts, documentation, case studies)
- The body content uses rich components or formatting that doesn't map well to a single Rosey key
- Editors need a familiar content editing experience (CloudCannon's Content Editor) rather than the Visual Editor's inline translation

### How it works

1. **Create per-locale content directories** mirroring the default-language collection. For example, if the English blog lives in `blog/` (or `src/content/blog/`), create `blog_fr/`, `blog_de/`, etc. Seed with copies of the English files as starting points.

2. **Register the locale collections with the SSG.** Each locale directory should be treated as its own collection or data source, using the same schema/frontmatter shape as the English collection.

3. **Create locale routes** so the SSG builds pages at `/{locale}/blog/{slug}/`. The routing mechanism varies by SSG (see SSG-specific notes below), but the goal is the same: iterate locale codes, fetch from the matching collection, and output pages under the locale prefix.

4. **Extract shared rendering logic** to avoid duplicating template code across English and locale route files. Pass `locale` as a variable/prop for locale-aware links, date formatting, and collection selection.

5. **Align Rosey roots** so shared UI strings translate correctly. Locale pages must set `data-rosey-root` to the **English-equivalent** path (e.g., `blog/my-post`, not `fr/blog/my-post`). Pass a `roseyRoot` override to the page layout and compute it by stripping the locale prefix from the URL.

6. **Suppress `data-rosey` on body content and frontmatter-driven fields** (title, description, tags) since those are natively translated in the locale collection files. Keep `data-rosey` on shared UI strings (breadcrumbs, sidebar headings, share buttons) so Rosey still translates them.

7. **Add CloudCannon collections** for each locale (e.g., `blog_fr`, `blog_de`) in `cloudcannon.config.yml`, with `url: /{locale}/blog/[full_slug]/`.

8. **Create a locale config utility** -- a central file mapping locale codes to collection names, date locale strings, and display labels. Single source of truth for adding new locales.

### SSG-specific implementation notes

Any SSG that can build pages from a directory of content files supports this pattern. The key requirement is that locale pages output to `/{locale}/...` URLs and that the shared layout can accept a Rosey root override to align keys with the default-language version.

**Read the SSG-specific file** (`astro.md`, `eleventy.md`, or `hugo.md` in this directory) for framework-specific routing, collection setup, and `data-rosey` suppression details.

### Rosey coexistence

The postbuild script is unchanged. When Rosey encounters an existing page at a locale URL (e.g., `/fr/blog/my-post/`), it **respects the existing content** and only translates elements with `data-rosey` attributes. This means:
- Body content stays as-is (natively translated from the locale collection)
- Shared UI strings (breadcrumbs, "Share this article:", "Latest News") get translated from the Rosey locale files
- Non-blog pages continue using Rosey for full translation as before

## Phase 8: Visitor-Facing Locale Picker (Optional)

**Ask the user first:** "Would you like a visitor-facing locale picker (language switcher) added to the site, or do you already have one / prefer to bring your own?"

If the user declines or has their own, remind them that any links pointing to locale URLs must have `data-rosey-ignore` to prevent Rosey from rewriting them (see gotcha below).

If the user wants one:

1. **Create a locale picker component** in the site's navigation area. The component should:
   - Parse the current page URL to detect the active locale (check if the first path segment is a known locale code)
   - Strip the locale prefix to get the base path
   - Render links for each locale: `/{locale}{basePath}` for non-default, `{basePath}` for the default language
   - Add **`data-rosey-ignore`** on every `<a>` element (critical -- prevents Rosey from double-prefixing locale URLs)
   - Add `hreflang` attributes for SEO
   - Include a small client-side script to fix the active-state highlight on Rosey-generated pages (since build-time HTML always reflects the default-language page's active state)

2. **Place the component** in both the desktop nav and mobile nav.

The URL construction logic (parse path, detect locale prefix, strip/prepend) is the same in any SSG. **Read the SSG-specific file** for a code example in your framework.

## Checklist

- [ ] All user-visible text elements have `data-rosey` attributes
- [ ] Each page/route has a `data-rosey-root` set to a unique slug
- [ ] Reusable sections use `data-rosey-ns` for namespacing
- [ ] RCC is imported conditionally in the root layout (`window?.inEditorMode`)
- [ ] Root `<html>` tag has `lang="{defaultLanguage}"` set (e.g. `<html lang="en">`)
- [ ] `cloudcannon.config.yml` has `data_config` entries for each locale (`locales_{code}`)
- [ ] `.cloudcannon/postbuild` runs the full Rosey pipeline
- [ ] `write-locales --dest` generates the locale manifest at `{build_dir}/_rcc/locales.json`
- [ ] `rosey/base.json` generates with correct keys
- [ ] Locale files are created with correct structure

## Gotchas

### Universal (framework-agnostic)

These apply regardless of the SSG or component system in use.

- **Rosey operates on built HTML.** It does not see source files, markdown, or frontmatter directly. If text from frontmatter is rendered into the HTML, Rosey will pick it up from the rendered output.
- **`data-rosey` must go on the innermost text element.** Rosey captures `innerHTML` of the tagged element. If `data-rosey` is placed on an outer element that wraps inner components or custom elements, the captured original will include those wrapper tags. Always target the element containing just the visible text.
- **Don't translate names.** Props that represent proper nouns -- author names, person names, designations/titles -- should **not** get `data-rosey` attributes. These are identity values that stay the same across locales.
- **Key collisions.** If two pages have the same `data-rosey-root` value and the same element keys, their translations will collide. Always use unique root values (typically the page slug).
- **Empty `data-rosey-root`.** Setting `data-rosey-root=""` on an element resets the namespace -- child keys won't inherit anything above it. Useful for global components like navigation and footer.
- **Nav/footer use `data-rosey-ns`, not `data-rosey-root`.** Navigation and footer sit outside `<main>` and have no `data-rosey-root` ancestor. Use `data-rosey-ns="nav"` / `data-rosey-ns="footer"` for organization. Rosey deduplicates identical keys across pages automatically, so no root is needed.
- **Nav/footer links: use content-as-key.** For short link text, slugify the text itself as the `data-rosey` value (e.g., `data-rosey={link.text.toLowerCase().replace(/\s+/g, "-")}` producing keys like `nav:about`, `nav:blog`). This is simpler than UUIDs and stable across reordering. The trade-off: if an editor renames link text, the old key is orphaned and a new untranslated entry appears — forcing fresh translation rather than flagging stale. `write-locales` auto-cleans orphaned keys. For multi-level navs with dropdowns, use `data-rosey-ns` with the slugified parent text to prevent collisions between levels.
- **Duplicate desktop/mobile nav elements share the same Rosey key.** When a nav has both desktop and mobile versions of the same links (common in responsive designs), both can use the same `data-rosey` key (e.g., `about`). Rosey records them as multiple occurrences of the same key on the page. Both instances get the same translated value, which is the desired behavior.
- **Stale translation detection.** When `original` and `_base_original` differ in a locale file, the RCC shows an amber dashed border and warning badge in the Visual Editor. Editors can either update the translation or click "Mark as reviewed" to acknowledge the change.
- **`write-locales` preserves existing translations but removes stale keys.** Running it again adds new keys and removes keys that no longer exist in `base.json`. It never overwrites existing `value` fields on keys that still exist.
- **Snapshot boundary.** The RCC clones the boundary container (`<main>` by default, or `[data-rcc]`) when switching locales. Content outside the boundary is not affected by locale switching. Since navigation and footer text is commonly translated, most sites should add `data-rcc` to a wrapper element that encompasses nav, main, and footer — rather than relying on the `<main>` fallback. `<body>` cannot be used as the boundary because it hosts the RCC's own UI, CloudCannon's editing infrastructure, and `<script>` tags.
- **Rosey's default exclusions block JSON files.** Rosey's default `--exclusions` regex (`\.(html?|json)$`) prevents JSON files from being copied through the build as assets. The postbuild `rosey build` command should include `--exclusions "\.(html?)$"` to let JSON files like `_rcc/locales.json` and `_cloudcannon/info.json` flow through to the final output.
- **Rosey merges with pre-existing locale pages.** When Rosey encounters an already-built page at a locale URL during `rosey build`, it respects the existing content and only translates `data-rosey` elements. It does not create a duplicate or overwrite the page. This enables the hybrid approach where body content comes from locale collections and UI strings come from Rosey.
- **Rosey rewrites internal links on generated pages but not on pre-existing pages.** When Rosey copies a page to a locale URL (e.g., `/about/` to `/fr/about/`), it rewrites all `<a href>` values that match known site URLs to prepend the locale prefix. However, for split-by-directory pages that already exist at the locale URL, Rosey only touches `data-rosey` elements -- links are left as-is. This means nav links on split-by-directory pages still point to default-language paths (e.g., `/blog/` instead of `/fr/blog/`).
- **Locale picker links need `data-rosey-ignore`.** Any visitor-facing locale switcher must add `data-rosey-ignore` to its `<a>` elements. Without it, Rosey rewrites the default-language link (e.g., `/about/`) to the current locale (e.g., `/fr/about/`) on generated pages, breaking the "switch to default language" action. `data-rosey-ignore` tells Rosey to leave the link unchanged.
- **Locale picker active state needs client-side JS.** Build-time HTML always reflects the default-language page's perspective. On Rosey-generated locale pages, the default-language link would incorrectly appear active. A small client-side script that compares link hrefs against `window.location.pathname` fixes this at runtime.
- **Elements with mixed text and non-text children.** When `data-rosey` is placed on an element that contains both text and non-text children (SVGs, icons, embedded components), Rosey captures the full `innerHTML` including markup. The translation `value` must preserve all non-text markup. For cleaner translations, wrap the text portion in a `<span data-rosey="key">` and leave icons/images outside it.
- **Rosey root alignment for split-by-directory locale pages.** When the SSG builds a page at `/fr/blog/my-post/`, slug derivation from the URL produces `fr/blog/my-post` as the root. This creates keys like `fr/blog/my-post:breadcrumb-blog` which don't match the locale file entries (keyed as `blog/my-post:breadcrumb-blog`). Fix by passing a `roseyRoot` override to the page layout that strips the locale prefix, giving the default-language-equivalent root.
- **Suppress `data-rosey` on frontmatter-driven fields in shared templates.** When a shared template is used for both default-language and locale pages (split-by-directory), frontmatter-driven fields (title, description, tags) must suppress `data-rosey`. Otherwise Rosey would overwrite the already-translated content from the locale collection with whatever is in the Rosey locale file. The suppression mechanism depends on the template language (e.g., `data-rosey={false}` in JSX, conditionally omitting the attribute in Liquid/Nunjucks).
- **CloudCannon `source` key breaks locale file resolution.** When `cloudcannon.config.yml` has a `source` key (e.g., `source: src`), all `data_config` paths, `collections_config.*.path`, `paths.*`, and `file_config.*.glob` are resolved relative to that directory. Since locale files live at the project root (e.g., `rosey/locales/`), CC cannot find them. CC does not support `../` in config paths. The correct fix is to remove the `source` key entirely and prepend its value to all affected paths (e.g., `path: pages` becomes `path: src/pages`). Schema paths (`schemas.*.path`) are relative to the project root and must NOT be rewritten. The `init` CLI auto-detects `source` and performs this rewrite automatically.

### CloudCannon inline editing integration

> These gotchas apply only to sites that already use component-based inline editing (Bookshop, `data-prop`, editable regions). The RCC works without any of these — if your site doesn't have inline editing set up on the original text, skip this section.

These apply to sites using component-based inline editing systems (Bookshop, Astro editable regions with `data-prop`, or any similar system where reusable building blocks have editing attributes).

- **Shared components need explicit `data-rosey` passthrough.** Components that wrap content in an inner text element (e.g., `<editable-text>`, `<span class="inner-text">`) cannot rely on a rest-spread to forward `data-rosey` -- it would land on the outer tag, not the inner text element. Explicitly extract `data-rosey` from the component's incoming props/parameters and forward it to the inner element.
- **Destructure `data-rosey` to prevent DOM leaking.** When a component uses rest-spread (e.g., `...htmlAttributes`) on an outer wrapper, any undeclared prop ends up in the spread. If `data-rosey` isn't explicitly destructured, it leaks onto the outer element. Always destructure it alongside the editing attribute (e.g., `data-prop`, `data-bookshop-prop`).
- **Per-instance opt-out.** When auto-deriving `data-rosey` from an editing attribute, provide a way to suppress it per-instance for values that should not be translated (proper nouns, identity values). In JSX-based SSGs, `data-rosey={false}` works well. In template languages, use a conditional (e.g., `{% unless skip_rosey %}data-rosey="..."{% endunless %}`).
- **Non-editable components need explicit `data-rosey`.** When a component has editing disabled (no editing attribute to derive from), auto-derive produces nothing. Hardcoded strings in these components (e.g., "Read more", "All", "No results found") need an explicit `data-rosey="key"` passed in.
- **Rich-text body content: target the inner text element.** For rich-text body content rendered through a custom element (e.g., `<editable-text data-prop="@content">`), place `data-rosey` directly on that inner element. Putting it on a parent wrapper causes Rosey to capture the custom element tags as part of the original, which corrupts the translation.

### SSG-specific gotchas

Framework-specific gotchas live in the SSG files (`astro.md`, `eleventy.md`, `hugo.md`) in this directory. Read the one matching your project.
