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

## Workflow Overview

This skill ships with helper scripts that classify files and handle merging, leaving only the actual translation to the AI:

1. **Prepare** -- run a script to identify untranslated files and extract translatable fields
2. **Translate** -- AI fills in translations in the task manifest
3. **Merge** -- run a script to patch translations back into the MDX/MD files

If the scripts are not available (e.g. they weren't copied via `add-skills`), skip to the **Manual Fallback** section at the bottom.

## Phase 1: Prepare

First, identify the source and locale content directories. Look for `{collection}_{locale}/` directories in the content directory (typically `src/content/`). Check `cloudcannon.config.yml` for per-locale collection entries, or a locale config file (often `src/lib/locales.ts`) if present.

Then run the prepare script for each locale collection:

```bash
node .cursor/skills/translate-content-collections/scripts/prepare-content-translation.mjs \
  --source-dir src/content/blog \
  --locale-dir src/content/blog_fr \
  --locale fr
```

The script will:
- Compare each locale file against the source file with the same filename
- Identify which files are **untranslated** (frontmatter text fields and body match source) vs **already translated** (skip)
- Extract **translatable frontmatter fields** (title, headings, descriptions, alt text) using dot-notation paths
- Skip **structural fields** (dates, image paths, tags, booleans, CMS metadata, URLs)
- Write a task manifest to `src/content/.translation-task-{code}-content.json`

**Flags:**
- `--source-dir <dir>` (required) -- source content directory (e.g. `src/content/blog`)
- `--locale-dir <dir>` (required) -- locale content directory (e.g. `src/content/blog_fr`)
- `--locale <code>` (required) -- locale code
- `--output <path>` -- manifest output path

## Phase 2: Translate

Read the task manifest. For each file with `"status": "untranslated"`, translate the content:

### Frontmatter

The `translatable_frontmatter` object contains dot-notation field paths and their source values. Add a `translated_frontmatter` object with the same keys and translated values:

```json
{
  "translatable_frontmatter": {
    "title": "Visual Translation Editing with the RCC",
    "post_hero.heading": "Visual Translation Editing with the RCC",
    "seo.page_description": "How the Rosey CloudCannon Connector enables..."
  },
  "translated_frontmatter": {
    "title": "Édition visuelle des traductions avec le RCC",
    "post_hero.heading": "Édition visuelle des traductions avec le RCC",
    "seo.page_description": "Comment le Rosey CloudCannon Connector permet..."
  }
}
```

**What to translate:**
- `title` -- page title
- Headings (`*.heading`, `*.subheading`)
- Descriptions (`*.description`, `*.page_description`)
- Image alt text (`*_alt`, `*.image_alt`, `*.featured_image_alt`)
- Any other human-readable text fields in the manifest

**What the script already excluded** (you won't see these):
- CMS metadata (`_schema`, `_name`, `_uuid`)
- Dates, image paths, tags, author names
- URLs, booleans, technical identifiers

### Body content

If the manifest includes a `body` field, add a `translated_body` field with the translated markdown:

```json
{
  "body": "The Rosey CloudCannon Connector (RCC) is a client-side script...",
  "translated_body": "Le Rosey CloudCannon Connector (RCC) est un script côté client..."
}
```

Translation rules for body content:
- **Preserve markdown formatting** -- bold, italic, links, lists, blockquotes
- **Keep link URLs unchanged** -- only translate link text, not `href` values
- **Keep code blocks in the source language** -- code examples, CLI commands, HTML snippets
- **Preserve MDX components** -- keep component syntax unchanged, translate only text content within
- **Keep technical terms** -- product names (Rosey, CloudCannon, Bookshop), technical terms, proper nouns

### Match tone and register

If the project has existing translations (in Rosey locale JSON files or other already-translated content files), match their style:
- Formal vs informal address (vous vs tu, Sie vs du, usted vs tú)
- Terminology consistency -- use the same word choices as existing translations

### Write the manifest back

After translating all entries, write the task manifest back to the same path with the `translated_frontmatter` and `translated_body` fields added.

## Phase 3: Merge

Run the merge script to patch translations into the locale files:

```bash
node .cursor/skills/translate-content-collections/scripts/merge-content-translation.mjs \
  --input src/content/.translation-task-fr-content.json
```

The script will:
- For each untranslated file, patch translated frontmatter fields into the YAML (preserving structural fields and formatting)
- Replace the body content with the translated body
- Validate that frontmatter structure is intact
- Delete the task manifest after successful merge

**Flags:**
- `--input <path>` (required) -- task manifest path
- `--dry-run` -- print patched files without writing

If the script reports warnings about fields it couldn't patch, review those files manually.

## Checklist

- [ ] Identify source and locale content directories
- [ ] Run `prepare-content-translation.mjs` for each locale collection
- [ ] Review the counts (untranslated vs already translated)
- [ ] Translate all `translatable_frontmatter` fields (add `translated_frontmatter`)
- [ ] Translate body content (add `translated_body`)
- [ ] Preserve markdown formatting, code blocks, link URLs, MDX components
- [ ] Match tone/register of existing translations
- [ ] Write the manifest back
- [ ] Run `merge-content-translation.mjs` and check for warnings
- [ ] Review the git diff of the locale files

---

## Manual Fallback

If the helper scripts are not available, follow this manual workflow.

### Step 1: Detect Content Collections

Identify which collections have locale variants:

1. Look for `{collection}_{locale}/` directories in the content directory (typically `src/content/`)
2. Check for a locale config file -- often `src/lib/locales.ts` or similar
3. Check `cloudcannon.config.yml` for per-locale collection entries
4. Identify the source collection -- the one without a locale suffix

### Step 2: Classify Files

For each locale collection, compare every file against the source-language file with the same slug:

**Untranslated:** The file's frontmatter text fields and body content are identical to the English source.

**Already translated:** The file's content differs from the English source. Do not modify.

Report counts before translating.

### Step 3: Translate

For each untranslated file:

**Frontmatter -- translate:**
- `title`, headings, descriptions, image alt text, any human-readable text fields

**Frontmatter -- leave as-is:**
- `_schema`, `_name`, `_uuid` (CMS metadata)
- Dates, image paths, tags, categories, author names
- URLs, boolean flags, technical identifiers

**Body content:**
- Translate all markdown prose, headings, list items
- Preserve markdown formatting, code blocks, link URLs, MDX components
- Keep technical terms in the source language

### Step 4: Write Back

Overwrite each locale file in place:
- Preserve the exact YAML frontmatter structure (field order, nesting, indentation)
- Preserve the file extension (`.mdx`, `.md`)
- Preserve any MDX imports or component usage
- End the file with a trailing newline

## Edge Cases

### Tags and categories as slugs

Tags are typically lowercase slugs used for URL generation and filtering (e.g. `rosey`, `visual-editing`). These should NOT be translated.

### Code blocks in body content

Code blocks (fenced with triple backticks) should remain in the source language.

### Brand names in alt text

Image alt text should be translated, but brand names within alt text should remain in the source language.

### Files with no source equivalent

If a locale collection has a file that doesn't exist in the source collection, skip it.

### Partially translated files

If some frontmatter fields are translated but the body is not (or vice versa), translate only the untranslated parts.

## Learnings and Gotchas

> This section is a living document. When you discover new patterns, issues, or improvements while translating content collections, **ask the user** before appending them here. See the living-docs-protocol rule.
