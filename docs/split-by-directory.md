# Split-by-Directory Translation

For pages with large body content — blog posts, documentation articles, landing pages — translating every paragraph and heading individually via `data-rosey` keys can be impractical. Split-by-directory is an alternative approach where body content is translated via per-locale content collections managed natively by your SSG, while shared UI strings (navigation, footer, breadcrumbs, sidebar headings) continue using Rosey.

The two systems work together: the SSG builds locale pages from native content files, and Rosey runs in postbuild to translate the remaining `data-rosey` elements. The connector works identically on these hybrid pages — no changes to the RCC setup are needed.

## When to use it

Use split-by-directory when:

- Pages have substantial body content (multiple paragraphs, rich formatting) that editors want to manage as a full document rather than individual translation strings
- Content is already structured as a CMS collection (blog posts, docs, case studies) where per-locale copies are a natural fit
- You want editors to work with full pages in CloudCannon's Content Editor, not just inline string editing

Use Rosey alone (without split-by-directory) when:

- Pages are mostly composed of short UI strings (headings, buttons, labels, descriptions)
- The page content is template-driven (component arrays, data files) rather than long-form prose
- You want a single translation workflow for all content on the site

You can mix both approaches on the same site — some pages pure Rosey, others split-by-directory for body content with Rosey for UI strings.

## How it works

### The SSG builds locale pages natively

Each locale gets its own content directory. For a blog, this might look like:

```
src/content/
  blog/           # English (default locale)
    my-post.md
    another-post.md
  blog_fr/         # French translations
    my-post.md
    another-post.md
  blog_de/         # German translations
    my-post.md
    another-post.md
```

Each locale file is a full content file with translated frontmatter and body. Editors manage these like any normal CloudCannon collection — they can edit the French version of a blog post directly in the Content Editor or Visual Editor.

The SSG builds these into locale-prefixed URLs:

- `/blog/my-post/` (English)
- `/fr/blog/my-post/` (French)
- `/de/blog/my-post/` (German)

### Rosey merges with pre-existing locale pages

When Rosey runs in the postbuild, it encounters pages that already exist at locale URLs (the ones the SSG built natively). Rosey respects existing content — it doesn't overwrite the page. It only translates elements that have `data-rosey` attributes, such as shared navigation links, footer text, or breadcrumb labels that appear in the page layout.

This means:

- Body content comes from the locale's content file (managed by the editor in CloudCannon)
- Shared UI strings come from Rosey's locale JSON files (managed via the connector's inline editors in the Visual Editor)
- No conflict between the two — they handle different parts of the page

### The RCC works the same way

The connector doesn't know or care whether a page was built natively or by Rosey. It finds `data-rosey` elements, creates inline editors, and connects them to locale data files. On a split-by-directory blog post, the `data-rosey` elements are the shared UI strings — breadcrumbs, sidebar headings, "Share this article" labels — and those get the locale switcher and inline editing as normal. The body content (which has no `data-rosey`) is untouched by the connector.

## Setup (Astro example)

The specifics vary by SSG, but the pattern is the same. This example uses Astro with content collections.

### 1. Create per-locale content directories

Create a content directory for each locale, mirroring the structure of the default-language collection:

```
src/content/
  blog/
    my-post.md
  blog_fr/
    my-post.md
  blog_de/
    my-post.md
```

Each locale file has its own translated frontmatter and body content.

### 2. Add a locale config utility

Create a central mapping of locale codes to collection names and metadata:

```typescript
// src/lib/locales.ts
export const locales = {
  fr: { collection: "blog_fr", label: "Français", dateLocale: "fr-FR" },
  de: { collection: "blog_de", label: "Deutsch", dateLocale: "de-DE" },
} as const;

export const localeCodes = Object.keys(locales);
```

### 3. Create locale routes

Use a dynamic `[locale]` parameter to generate pages for each locale from the locale content collections:

```astro
---
// src/pages/[locale]/blog/[...slug].astro
import { getCollection } from "astro:content";
import { locales, localeCodes } from "@/lib/locales";
import BlogPostLayout from "@/layouts/BlogPostLayout.astro";

export async function getStaticPaths() {
  const paths = [];
  for (const locale of localeCodes) {
    const { collection } = locales[locale];
    const posts = await getCollection(collection);
    for (const post of posts) {
      paths.push({
        params: { locale, slug: post.slug },
        props: { post, locale },
      });
    }
  }
  return paths;
}

const { post, locale } = Astro.props;
const { Content } = await post.render();
---
<BlogPostLayout
  title={post.data.title}
  locale={locale}
  roseyRoot={`blog/${post.slug}`}
>
  <Content />
</BlogPostLayout>
```

### 4. Align `data-rosey-root` across locales

Locale pages must resolve to the **same Rosey keys** as the English page so that shared UI strings (breadcrumbs, sidebar headings) share translations. Set `data-rosey-root` to the English-equivalent path on all versions of the page:

```astro
---
// BlogPostLayout.astro
const { title, locale, roseyRoot = "" } = Astro.props;
---
<main data-rosey-root={roseyRoot}>
  <nav aria-label="Breadcrumb" data-rosey-ns="breadcrumb">
    <a href="/" data-rosey="home">Home</a>
    <a href="/blog/" data-rosey="blog">Blog</a>
    <!-- key: blog/my-post:breadcrumb:home — same on /blog/my-post/ and /fr/blog/my-post/ -->
  </nav>

  <h1>{title}</h1>
  <!-- No data-rosey on the title — it's translated natively from the locale content file -->

  <slot />
  <!-- Body content from the locale's markdown — no data-rosey needed -->

  <aside data-rosey-ns="sidebar">
    <h2 data-rosey="latest-posts">Latest Posts</h2>
    <!-- key: blog/my-post:sidebar:latest-posts — translated by Rosey -->
  </aside>
</main>
```

The `roseyRoot` prop is set to `blog/my-post` (the English path) on all locale versions. This ensures `data-rosey` keys like `blog/my-post:breadcrumb:home` are identical on `/blog/my-post/`, `/fr/blog/my-post/`, and `/de/blog/my-post/`.

### 5. Suppress `data-rosey` on frontmatter-driven fields

Fields that come from the locale content file (title, description, tags) are already natively translated — they don't need Rosey. If your template components auto-derive `data-rosey` from `data-prop`, opt out with `data-rosey={false}`:

```astro
<h1 data-rosey={false}>{title}</h1>
<p data-rosey={false}>{description}</p>
```

If your template doesn't auto-derive `data-rosey`, simply don't add the attribute to these elements.

### 6. Configure CloudCannon collections

Add `collections_config` entries for each locale collection so editors can manage them in CloudCannon's sidebar:

```yaml
# cloudcannon.config.yml
collections_config:
  blog:
    path: src/content/blog
    url: /blog/[slug]/
    _enabled_editors:
      - content
      - visual
  blog_fr:
    path: src/content/blog_fr
    name: Blog (French)
    icon: translate
    url: /fr/blog/[slug]/
    _enabled_editors:
      - content
      - visual
  blog_de:
    path: src/content/blog_de
    name: Blog (German)
    icon: translate
    url: /de/blog/[slug]/
    _enabled_editors:
      - content
      - visual
```

Editors see "Blog (French)" and "Blog (German)" as separate collections in the sidebar and can edit full translated documents directly.

## What the editor experience looks like

On a split-by-directory blog post:

- **Content Editor / Visual Editor (English):** Edit the English blog post normally — full inline editing of body content
- **Content Editor / Visual Editor (French collection):** Edit the French blog post as a standalone document — title, body, frontmatter all in French
- **Visual Editor locale switcher (RCC):** Switch to French and the shared UI strings (breadcrumbs, sidebar, footer) show their French translations with inline editors. The body content is whatever the SSG built from the French content file — it's not affected by the locale switcher since it has no `data-rosey` attributes

## Postbuild pipeline

The postbuild script doesn't change. The same pipeline works for both pure-Rosey pages and split-by-directory pages:

```bash
#!/usr/bin/env bash
npx rosey generate --source dist
npx rosey-cloudcannon-connector write-locales --source rosey --dest dist
mv ./dist ./_untranslated_site
npx rosey build --source _untranslated_site --dest dist --default-language en --default-language-at-root --exclusions "\.(html?)$"
```

Rosey's `generate` step scans all built pages (including the locale pages the SSG produced) for `data-rosey` elements. The `build` step then translates those elements on every page, whether the page was built by the SSG or by Rosey. Pages that already exist at a locale URL are updated in place — Rosey doesn't duplicate them.
