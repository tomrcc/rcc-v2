---
name: translate-content-collections
description: >-
  Translate split-by-directory content collection files (MDX/MD with frontmatter)
  into target locales. Use when the project has per-locale content directories
  (e.g. blog_fr/, blog_de/) whose files are still in the source language.
---

# Translate Content Collections

Step-by-step workflow for translating split-by-directory content collection files. This skill covers MDX/MD files with YAML frontmatter that live in per-locale content directories (e.g. `blog_fr/`, `blog_de/`).

## How Split-by-Directory Works with Rosey

Split-by-directory pages use **two translation systems simultaneously** on the same rendered page, with a clean separation:

- **Content collection files** (this skill): body content and post-specific frontmatter (title, heading, description, image alt text). The SSG renders these natively from the locale collection file. They do NOT have `data-rosey` attributes -- adding `data-rosey` to content that's already translated via a locale collection would create two systems fighting over the same element.
- **Rosey locale JSON files** (`translate-locale-files` skill): shared UI elements that live in layout/component templates, not in any page's frontmatter -- header, footer, nav links, breadcrumbs, sidebar headings like "Recent Posts". These use `data-rosey` because they're shared across all pages and aren't part of any content collection.

The boundary is straightforward: if the text comes from a page's frontmatter or body, it's translated in the content collection file. If it's shared layout/component UI, it's translated via Rosey.

**Both skills are needed to fully translate a split-by-directory page.** If this project also uses Rosey locale JSON files (`rosey/locales/*.json`), read the `translate-locale-files` skill as well.

## Prerequisites

- Per-locale content directories exist (e.g. `src/content/blog_fr/`, `src/content/blog_de/`)
- A source-language (usually English) content directory exists with the same slugs (e.g. `src/content/blog/`)
- The user has specified which locale(s) to translate

## Phase 1: Detect Content Collections

Identify which collections have locale variants:

1. **Look for `{collection}_{locale}/` directories** in the content directory (typically `src/content/`). Common patterns: `blog_fr`, `blog_de`, `posts_es`, `articles_ja`.
2. **Check for a locale config file** -- often `src/lib/locales.ts` or similar -- that maps locale codes to collection names and provides metadata (labels, date locale strings).
3. **Check `cloudcannon.config.yml`** for per-locale collection entries (e.g. `blog_fr`, `blog_de` in `collections_config`).
4. **Identify the source collection** -- the one without a locale suffix (e.g. `blog/` is the English source for `blog_fr/` and `blog_de/`).

## Phase 2: Classify Files

For each locale collection, compare every file against the source-language file with the same slug:

### Untranslated (needs translation)

The file's frontmatter text fields and body content are identical to the English source. This is the initial state when locale collections are created by copying the source files.

**Detection:** Read the locale file and the source file with the same filename. If the text-bearing frontmatter fields (`title`, headings, descriptions, alt text) and the body are identical, the file needs translation.

### Already translated (skip)

The file's content differs from the English source in ways consistent with translation (different language text, same structure).

**Detection:** Frontmatter text fields or body content differ from the source. **Do not modify these files.**

### Report counts

Before translating, report to the user: "3 untranslated, 0 already translated in blog_fr/ -- translating 3 files to French."

## Phase 3: Translate

For each untranslated file, translate the frontmatter and body content.

### Frontmatter: what to translate

Translate **text-bearing fields** that appear as visible content on the page:

- `title`
- Headings (e.g. `post_hero.heading`, `hero.heading`)
- Descriptions (e.g. `seo.page_description`, `description`)
- Image alt text (e.g. `image_alt`, `post_hero.image_alt`, `seo.featured_image_alt`, `thumb_image_alt`)
- Any other human-readable text fields

### Frontmatter: what to leave as-is

Do NOT translate structural or machine-readable fields:

- `_schema`, `_name`, `_uuid` -- CMS metadata
- Dates (`date`, `publish_date`)
- Image paths (`image`, `thumb_image_path`, `featured_image`)
- Tags and categories (typically used as slugs/identifiers)
- Author names
- URLs (`canonical_url`, `href`)
- Boolean flags (`no_index`, `draft`)
- Technical identifiers (`open_graph_type`, `author_twitter_handle`)

### Body content

Translate all markdown prose, headings, and list items. Rules:

- **Preserve markdown formatting** -- bold, italic, links, lists, blockquotes
- **Keep link URLs unchanged** -- only translate link text, not `href` values
- **Keep code blocks in the source language** -- code examples, CLI commands, HTML snippets, and technical attribute names (like `data-rosey`) should remain in English
- **Preserve MDX components** -- if the file uses MDX components (`<Component />`), keep the component syntax unchanged and translate only the text content within
- **Keep technical terms** -- product names (Rosey, CloudCannon, Bookshop), technical terms (`postbuild`, `SSG`), and proper nouns should remain in English

### Match tone and register

If the project has existing translations (in Rosey locale JSON files or other already-translated content files), match their style:

- Formal vs informal address (vous vs tu, Sie vs du, usted vs tú)
- Terminology consistency -- use the same word choices as existing translations for shared concepts

## Phase 4: Write Back

Overwrite each locale file in place with the translated content:

- Preserve the exact YAML frontmatter structure (field order, nesting, indentation)
- Preserve the file extension (`.mdx`, `.md`)
- Preserve any MDX imports or component usage
- End the file with a trailing newline

## Edge Cases

### Tags and categories as slugs

Tags are typically lowercase slugs used for URL generation and filtering (e.g. `rosey`, `visual-editing`). These should NOT be translated -- they serve as identifiers, not display text. If the site displays translated tag labels, that's handled separately in the SSG's tag rendering logic, not in the content file.

### Code blocks in body content

Code blocks (fenced with triple backticks) should remain in the source language. This includes HTML examples, CLI commands, configuration snippets, and any other technical content. Only translate surrounding prose.

### Brand names in alt text

Image alt text should be translated, but brand names and product names within alt text should remain in the source language. For example: "A screenshot of the CloudCannon Visual Editor" -- translate "A screenshot of the" but keep "CloudCannon Visual Editor."

### Files with no source equivalent

If a locale collection has a file that doesn't exist in the source collection (e.g. a locale-exclusive post), skip it -- there's nothing to translate from.

### Partially translated files

If some frontmatter fields are translated but the body is not (or vice versa), translate only the untranslated parts. Use the source file as reference to identify which fields still match the English original.

## Checklist

- [ ] Identify all locale content collections and their source collection
- [ ] Read locale config file if present (for locale codes, labels, metadata)
- [ ] For each locale collection, classify files as untranslated or already translated
- [ ] Report counts to the user before translating
- [ ] Translate text-bearing frontmatter fields (title, heading, description, alt text)
- [ ] Translate body markdown content
- [ ] Preserve structural frontmatter (dates, image paths, tags, schema)
- [ ] Preserve markdown formatting, code blocks, link URLs, MDX components
- [ ] Match tone/register of existing translations
- [ ] Write files preserving YAML structure and file format
- [ ] Verify files are valid MDX/MD after writing

## Learnings and Gotchas

> This section is a living document. When you discover new patterns, issues, or improvements while translating content collections, **ask the user** before appending them here. See the living-docs-protocol rule.
