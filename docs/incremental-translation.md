# Incremental Translation

You don't have to translate your entire site before going live with a new locale. This guide covers strategies for rolling out translations progressively — starting with key pages and expanding over time.

> **Note:** This is more of a Rosey + CloudCannon workflow guide than a connector-specific feature. Since the connector bridges the two, it's useful context for planning your translation approach.

## Strategy 1: Translate with fallback content

The simplest approach. Start translating and let Rosey handle the rest.

### How it works

Rosey generates a locale version of **every page** on the site as long as a locale file exists — even if the file only has translations for a handful of keys. For any `data-rosey` element without a translation, Rosey falls back to the original language HTML. The translated page is complete and functional; untranslated elements just show the default-language text.

The `write-locales` CLI reinforces this: when it adds a new key to a locale file, it seeds `value` with the original text automatically. This means translated pages display the original content for every element right out of the box — nothing looks empty or broken. Editors then replace these values with actual translations at their own pace.

Even if you're managing locale files manually, setting `value` equal to `original` in any entry achieves the same result:

```json
{
  "hero:title": {
    "original": "Welcome to my site",
    "value": "Welcome to my site",
    "_base_original": "Welcome to my site"
  }
}
```

Until an editor changes `value` to the translated text, this element displays the English original on the French page.

### SEO considerations

Rosey automatically adds `<html lang>`, `<meta http-equiv="content-language">`, and `<link rel="alternate" hreflang>` tags to every translated page. These `hreflang` tags tell search engines that the locale pages are language variants of the same content, not duplicates. Your SEO scores are safe even when locale pages contain mostly default-language text.

### Connector features that help

- **`data-rcc-exclude`** — Add this to the [snapshot boundary](configuration.md#snapshot-boundary) to hide locales from the Visual Editor switcher on pages you haven't started translating. For example, `data-rcc-exclude="fr"` on a page's `<main>` hides the French locale button on that page only. See [Per-page locale exclusion](configuration.md#per-page-locale-exclusion).

- **Disabled elements** — Elements that exist in the DOM but have no corresponding entry in the locale file (e.g. content added after the last `write-locales` run) appear at 45% opacity with no inline editor, signaling that a build is needed before they become translatable.

- **Stale detection** — When source text changes after a translation was made, the connector flags it with an amber border and a count badge on the locale switcher. This helps editors prioritize which translations need attention. See [Stale Translation Detection](stale-translations.md).

### When to use this

- You're OK with some locale pages showing default-language text temporarily
- You want the simplest possible workflow — no branching, no extra build configuration
- You're translating a site progressively and want editors to work through pages at their own pace

## Strategy 2: CloudCannon branching workflow

For teams that don't want any partially-translated content visible on the live site.

### How it works

CloudCannon supports [staging workflows](https://cloudcannon.com/documentation/guides/staging-workflow-guide) where editors work on a branch and merge to production when ready. Applied to translation:

1. **Create a staging branch** (e.g. `translate-fr`) from your production branch
2. **Set up a branch site** in CloudCannon pointing at the staging branch
3. Editors translate on the staging site — the postbuild runs Rosey as usual, so the Visual Editor locale switcher works and editors can preview translations in context
4. When a batch of translations is complete, **merge to production** — CloudCannon supports direct merge or pull-request-based merge with optional review/approval
5. The production build runs, Rosey generates the translated pages, and the fully-translated content goes live

This keeps the live site clean while giving editors a full preview environment for translation work.

> **Tip:** CloudCannon's staging workflow guide shows how to [gate the postbuild behind an environment variable](https://cloudcannon.com/documentation/guides/staging-workflow-guide) so expensive steps only run on production. However, the connector needs the Rosey postbuild to run for locale switching to work in the Visual Editor — so most teams will want the postbuild running on both branches.

### Connector behaviour

The connector works identically on staging and production branches. No configuration changes are needed — it reads the same `data_config`, fetches the same `/_rcc/locales.json` manifest, and creates the same inline editors.

### When to use this

- You don't want partially-translated pages on the live site
- You have a review/approval process for translation quality
- You're doing a large initial translation push (e.g. launching a new locale) and want to batch the work before going live

## Strategy 3: Subdirectory builds

A question that comes up: "Can I run Rosey on just `/blog/` or `/products/` and translate one section at a time?"

### Why it doesn't work well

Rosey's `--source` flag technically accepts any directory path, but it treats that directory as the **entire site root**. Pointing it at a subdirectory like `dist/blog/` means:

- Relative paths and asset references break (Rosey assumes `/` is `dist/blog/`)
- `hreflang` alternate links point to wrong URLs
- Link rewriting prefixes locale codes relative to the subdirectory root, not the actual site root
- You'd need to reassemble the full site from original + translated subdirectory output

There is no built-in Rosey flag for "only translate pages under this path." Rosey processes the entire source directory or nothing.

### Alternatives

- **Micro-sites** — Split your site into independent builds that deploy to different path prefixes (e.g. `/blog/` is its own Rosey pipeline). This is an architecture decision and works for large organizations with separate teams, but adds significant build complexity.
- **Strategy 1 or 2** — For most teams, accepting fallback content or using a branching workflow is simpler and achieves the same goal of translating incrementally.

## Combining strategies

These approaches aren't mutually exclusive:

- **Branch for initial rollout, then fallback for ongoing work** — Use a staging branch to prepare the first batch of translations for a new locale. After merging, switch to the fallback approach for ongoing translation of new pages and content updates.

- **Pair with split-by-directory** — For pages with large body content (blog posts, documentation), use [split-by-directory translation](split-by-directory.md) for the body content alongside Rosey for shared UI strings. This pairs naturally with incremental rollout — you can add locale content collections for high-priority pages first and expand later.

- **Use `data-rcc-exclude` during rollout** — While translating incrementally, hide locales from the Visual Editor on pages that haven't been started yet. Remove the exclusion as each page's translations are complete.
