# RTL (Right-to-Left) Language Support

Rosey and the connector handle RTL languages like Arabic, Hebrew, and Farsi with minimal setup. This page covers what each layer does automatically and what you need to add.

## What Rosey does

Rosey sets `<html lang="ar">` (or whichever locale code) on each translated page and adds the appropriate `<meta http-equiv="content-language">` tag. It does **not** set `dir="rtl"` — directionality is the site's responsibility.

## What the connector does (Visual Editor)

When you switch to an RTL locale in the Visual Editor, the connector automatically sets `dir="rtl"` on the clone container. This means:

- ProseMirror editors type right-to-left with correct cursor behaviour
- Text alignment flips within the snapshot boundary
- Inline flow reverses (flexbox row, grid auto-flow)

Content outside the snapshot boundary (e.g. elements not inside `[data-rcc]` or `<main>`) is unaffected. The connector's RTL preview is a directional editing aid, not a full production-layout simulation — the site's own CSS handles the complete RTL layout at build time.

The connector recognises these locale codes as RTL: `ar`, `he`, `fa`, `ur`, `ps`, `sd`, `yi`, `ku`, `ckb`, `dv`, `ug`. Matching is done on the base code (the part before any `-` separator), so `ar-SA`, `he-IL`, etc. all work.

## Production setup

Since Rosey sets `<html lang>` but not `dir`, you need to bridge the gap. The recommended approach is a small inline script at the top of `<head>`:

```html
<script>
  const rtl = new Set(['ar','he','fa','ur','ps','sd','yi','ku','ckb','dv','ug']);
  const lang = document.documentElement.lang?.split('-')[0];
  if (rtl.has(lang)) document.documentElement.dir = 'rtl';
</script>
```

### Astro: use `is:inline`

In Astro, `<script>` tags are bundled and deferred by default. Add `is:inline` to keep this as a synchronous inline script:

```astro
<script is:inline>
  const rtl = new Set(['ar','he','fa','ur','ps','sd','yi','ku','ckb','dv','ug']);
  const lang = document.documentElement.lang?.split('-')[0];
  if (rtl.has(lang)) document.documentElement.dir = 'rtl';
</script>
```

### Why an inline script?

This script must run before the first paint so there is no flash of LTR content. A synchronous `<script>` in `<head>` blocks rendering until it finishes — but this script is ~3 lines with a single `Set` lookup and one attribute assignment, executing in microseconds. This is the same well-established pattern used for dark mode detection, cookie consent banners, and theme initialisation. It has no measurable impact on page load performance.

The `dir` HTML attribute (as opposed to the CSS `direction` property) is preferred because it enables `[dir="rtl"]` CSS selectors and Tailwind's `rtl:` variant, and is read by browser accessibility tools.

### CSS-only alternative

If you prefer zero JavaScript, you can use CSS alone:

```css
html[lang="ar"], html[lang="he"], html[lang="fa"],
html[lang="ur"], html[lang="ps"], html[lang="sd"] {
  direction: rtl;
}
```

This handles text flow and flexbox/grid flipping but does **not** set the `dir` attribute — meaning `[dir="rtl"]` selectors and Tailwind's `rtl:` variant won't work.

## CSS recommendations

The browser does a lot of work when `dir="rtl"` is set, but your CSS needs to cooperate. The key principle: **use CSS logical properties instead of physical ones**.

### Logical property cheat sheet

| Physical (LTR-only) | Logical (direction-aware) |
|---|---|
| `margin-left` / `margin-right` | `margin-inline-start` / `margin-inline-end` |
| `padding-left` / `padding-right` | `padding-inline-start` / `padding-inline-end` |
| `border-left` / `border-right` | `border-inline-start` / `border-inline-end` |
| `text-align: left` / `right` | `text-align: start` / `end` |
| `float: left` / `right` | `float: inline-start` / `inline-end` |
| `left` / `right` (positioning) | `inset-inline-start` / `inset-inline-end` |
| `border-top-left-radius` | `border-start-start-radius` |

### Tailwind CSS

Tailwind v4 supports logical utilities out of the box:

- `ms-4` / `me-4` instead of `ml-4` / `mr-4`
- `ps-4` / `pe-4` instead of `pl-4` / `pr-4`
- `text-start` / `text-end` instead of `text-left` / `text-right`
- `rtl:` variant for RTL-specific overrides: `rtl:flex-row-reverse`

### Things that typically need manual RTL overrides

- **Directional icons** — arrows, back/forward chevrons, reply icons. Use `[dir="rtl"] .icon-arrow { transform: scaleX(-1); }`.
- **Absolutely positioned decorative elements** — background shapes, floating badges with `left: 20px`. Use `inset-inline-start` instead.
- **Border-radius on specific corners** — `border-top-left-radius` should be `border-start-start-radius`.
- **Embedded LTR content** — code snippets, URLs, brand names. Wrap in `<span dir="ltr">` or `<bdo dir="ltr">`.

## When to use split-by-directory instead

For most sites, Rosey + `dir="rtl"` handles RTL languages well — the same page structure is used, just mirrored. Split-by-directory is only necessary when the RTL version has **structurally different content**:

- Different components, sections, or page layouts (not just mirrored)
- Culturally different imagery (not just flipped)
- Natively-authored long-form content (e.g. a blog post written in Arabic, not translated from English)

For shared UI strings (nav, footer, breadcrumbs), Rosey works identically for RTL and LTR locales. See [Split by Directory](split-by-directory.md) for the full pattern.
