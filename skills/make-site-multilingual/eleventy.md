# Eleventy-Specific Patterns

Framework-specific implementation details for making an Eleventy (11ty) site multilingual with Rosey/RCC/CloudCannon. Includes Bookshop-specific patterns. Read alongside the main `SKILL.md` workflow.

## Slug Derivation

In Eleventy, `page.url` gives the URL path (e.g., `/booking/`). For flat URL structures:

```liquid
{% assign rosey_slug = page.url | replace: '/', '' %}
{% if rosey_slug == '' %}{% assign rosey_slug = 'index' %}{% endif %}
<main data-rosey-root="{{ rosey_slug }}">
```

> The `replace: '/'` approach works for flat URL structures (e.g., `/about/` becomes `about`). For nested paths like `/blog/my-post/`, use a split/join approach: `{% assign rosey_slug = page.url | split: '/' | join: '-' | remove_first: '-' %}` or similar, depending on how you want nested keys to read.

## Content Block Namespacing

### Eleventy/Liquid (Bookshop)

For Bookshop sites, the shared `page.eleventy.liquid` template (which loops `content_blocks`) is the single best place to add `data-rosey-ns` wrappers:

```liquid
{% for block in content_blocks %}
  {% assign block_ns = block._bookshop_name | split: "/" | last | append: "-" | append: forloop.index0 %}
  <div data-rosey-ns="{{ block_ns }}">
    {% bookshop "{{ block._bookshop_name }}" bind: block %}
  </div>
{% endfor %}
```

This derives names like `left-right-simple-0`, `price-list-1`. One change covers all content blocks across all pages.

## Split-by-Directory for Body Content

When implementing the split-by-directory pattern (Phase 7 of the main skill) in Eleventy:

- Create per-locale directories (e.g., `blog_fr/`, `blog_de/`) alongside the English blog directory.
- Use computed data or directory data files (`blog_fr/blog_fr.json`) to set a `locale` variable and output URL prefix.
- Shared layouts receive the `locale` variable and conditionally adjust links and date formatting.
- Suppress `data-rosey` on frontmatter-driven fields by conditionally omitting the attribute in the template when `locale` is set.

## Visitor-Facing Locale Picker

When implementing the locale picker (Phase 8 of the main skill) in Eleventy, use `page.url | split: "/"` to parse the path and detect the current locale. The first meaningful segment is at index 1 (`path_segments[1]`) since index 0 is empty from the leading `/`.

The URL construction logic (parse path, detect locale prefix, strip/prepend) is the same as described in the main skill -- adapt using Liquid filters.

## Gotchas

### Eleventy

- **Slug derivation via `page.url`.** In Eleventy, `page.url` gives the URL path (e.g., `/booking/`). For flat URL structures, derive a Rosey root slug with `{% assign rosey_slug = page.url | replace: '/', '' %}` and fall back for the index page: `{% if rosey_slug == '' %}{% assign rosey_slug = 'index' %}{% endif %}`. For nested paths (e.g., `/blog/my-post/`), use a split/join approach instead of a blanket replace.
- **Locale picker path parsing.** In Eleventy, use `page.url | split: "/"` to parse the path and detect the current locale. The first meaningful segment is at index 1 (`path_segments[1]`) since index 0 is empty from the leading `/`.

### Bookshop

- **`page.eleventy.liquid` is the ideal block namespacing point.** For Bookshop sites, the shared `page.eleventy.liquid` template (which loops `content_blocks`) is the single best place to add `data-rosey-ns` wrappers. Use `{% assign block_ns = block._bookshop_name | split: "/" | last | append: "-" | append: forloop.index0 %}` to derive names like `left-right-simple-0`, `price-list-1`. One change covers all content blocks across all pages.
- **Button `data-rosey` captures SVG icon markup.** When `data-rosey` is placed on an `<a>` or `<button>` that contains both text and a Bookshop icon component (e.g., arrow icons), Rosey captures the full `innerHTML` including the rendered SVG and Bookshop live-edit comments. The translation `value` must preserve the icon markup; only the text portion should change. For cleaner translations, wrap the button text in a `<span data-rosey="button_text">` and leave the icon outside, but this requires restructuring the button component. For Bookshop sites, the trade-off is acceptable since editors use the RCC Visual Editor rather than editing raw JSON.
