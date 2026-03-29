# Astro-Specific Patterns

Framework-specific implementation details for making an Astro site multilingual with Rosey/RCC/CloudCannon. Read alongside the main `SKILL.md` workflow.

## Slug Derivation

Use `Astro.url.pathname` directly in the component that renders `<main>`:

```astro
<main data-rosey-root={Astro.url.pathname.replace(/^\/|\/$/g, '') || 'index'}>
```

Works for any page type and avoids threading a slug prop through the layout chain.

## Content Block Namespacing

For CMS page-builder pages using `content_blocks`, add `data-rosey-ns` using the block name and index:

```astro
{blocks.map((block, i) => (
  <div data-rosey-ns={`${block._bookshop_name ?? block._name}-${i}`}>
    <BlockComponent {...block} />
  </div>
))}
```

## Auto-Derive `data-rosey` from `data-prop`

For component-heavy Astro sites where building blocks already use `data-prop` for CloudCannon inline editing, auto-derive `data-rosey` from that attribute:

```astro
---
const { "data-prop": customDataProp, "data-rosey": roseyProp, ...htmlAttributes } = Astro.props;
const effectiveDataProp = customDataProp ?? (editable ? "text" : null);
const effectiveDataRosey = roseyProp === false ? null : (roseyProp ?? effectiveDataProp ?? null);
const roseyAttributes = effectiveDataRosey ? { "data-rosey": effectiveDataRosey } : {};
---
<span class="inner-text" {...textDataAttributes} {...roseyAttributes}>...</span>
```

Key points:
- **Destructure `data-rosey` from props** -- prevents it leaking into `...htmlAttributes` and landing on the wrong element
- **`data-rosey={false}` opts out** -- use on instances that should not be translated (proper nouns, names)
- **`editable={false}` components** need explicit `data-rosey="key"` since auto-derive depends on `data-prop`

## Split-by-Directory for Body Content

When implementing the split-by-directory pattern (Phase 7 of the main skill) in Astro:

- Define content collections for each locale in `content.config.ts` with the same schema as the English collection.
- Use a dynamic `[locale]` route parameter: `src/pages/[locale]/blog/[...slug].astro`.
- `getStaticPaths` iterates locale codes and fetches from the matching collection.
- Suppress auto-derived `data-rosey` on frontmatter fields with `data-rosey={false}`.

### Rosey root alignment for locale pages

When Astro builds split-by-directory locale pages, `Page.astro` derives `data-rosey-root` from the URL, which includes the locale prefix (e.g., `fr/blog/my-post`). Fix by adding a `roseyRoot` prop to the page layout:

```astro
<main data-rosey-root={roseyRoot ?? derivedSlug}>
```

Locale route files pass the English-equivalent path (e.g., `blog/my-post`).

## Visitor-Facing Locale Picker

When implementing the locale picker (Phase 8 of the main skill) in Astro:

```astro
---
const localeConfig = { fr: "FR", de: "DE" };
const localeCodes = Object.keys(localeConfig);
const defaultLocale = "en";
const pathname = Astro.url.pathname;

const segments = pathname.split("/").filter(Boolean);
const isLocalePath = localeCodes.includes(segments[0]);
const basePath = isLocalePath
  ? "/" + segments.slice(1).join("/") + (segments.slice(1).length ? "/" : "")
  : pathname;

function buildPath(base, locale) {
  if (locale === defaultLocale) return base || "/";
  return `/${locale}${base.startsWith("/") ? base : `/${base}`}`;
}
---
<nav aria-label="Language">
  <a href={buildPath(basePath, "en")} data-rosey-ignore hreflang="en">EN</a>
  {localeCodes.map((code) => (
    <a href={buildPath(basePath, code)} data-rosey-ignore hreflang={code}>
      {localeConfig[code]}
    </a>
  ))}
</nav>
<script>
  document.querySelectorAll("nav[aria-label='Language'] a").forEach((link) => {
    const match = link.pathname === window.location.pathname;
    link.classList.toggle("active", match);
  });
</script>
```

## Gotchas

- **Slug derivation via `Astro.url.pathname`.** Use `Astro.url.pathname.replace(/^\/|\/$/g, '') || 'index'` directly in the component that renders `<main>`. Works for any page type and avoids threading a slug prop through the layout chain.
- **Rosey root alignment for locale pages.** When Astro builds split-by-directory locale pages, `Page.astro` derives `data-rosey-root` from the URL, which includes the locale prefix. Fix by adding a `roseyRoot` prop to the page layout: `<main data-rosey-root={roseyRoot ?? derivedSlug}>`. Locale route files pass the English-equivalent path.
- **Use snake_case for collection names.** Astro and CloudCannon both handle kebab-case, but snake_case (`blog_fr`, `blog_de`) is more consistent with CloudCannon conventions like `data_config` keys (`locales_fr`, `locales_de`).
- **Split-by-directory with Astro content collections.** Define per-locale collections in `content.config.ts` using the same schema as the English collection. Create locale routes with a `[locale]` parameter and `getStaticPaths` that iterates locale codes. Use `data-rosey={false}` on frontmatter-driven fields in the shared template.
