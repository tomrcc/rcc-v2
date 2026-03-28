# Tagging Content for Translation

The connector works with [Rosey's](https://rosey.app/) `data-rosey` attribute system. Any HTML element tagged with `data-rosey` becomes translatable — both in Rosey's build-time translation pipeline and in the connector's Visual Editor integration.

## Manual tagging

Add `data-rosey` to any element that contains translatable text. The attribute value is the translation key:

```html
<h1 data-rosey="hero-title">Welcome to my site</h1>
<p data-rosey="hero-subtitle">The best site on the internet</p>
```

### Choosing good keys

The key you put in `data-rosey` determines how translations are tracked across builds. There are three common strategies — pick the one that fits your workflow.

#### Static descriptive keys (recommended)

Use **static, descriptive keys** that don't change when the content changes. When the source text changes, the key stays stable and the connector flags the translation as [stale](stale-translations.md) rather than creating a new entry. This gives translators a clear signal that a specific translation needs updating, along with a diff of what changed.

```html
<h1 data-rosey="homepage:hero-title">Welcome to Sendit</h1>
<p data-rosey="homepage:hero-subtitle">Email marketing made easy</p>
```

This is the recommended default for most sites. Keys are readable in the locale file, stale detection works fully, and keys survive content edits.

#### Content as the key

You can use the element's text content (or a slugified version) as the key. This was v1's default approach via `generateRoseyId()` and remains valid in v2.

```astro
<h1 data-rosey={heading.text.toLowerCase().replace(/\s+/g, "-")}>
  {heading.text}
</h1>
<!-- If heading.text is "Welcome to Sendit", key is "welcome-to-sendit" -->
```

The trade-off is that **stale translation detection won't trigger**. When the source text changes, the key changes too — the old key is orphaned (and cleaned up by the next `write-locales` run) and a brand-new entry appears with no translation. Since the new entry's `original` and `_base_original` are always identical, the connector never sees a mismatch to flag as stale.

However, this gives you a different kind of protection: changed content always shows up as untranslated, forcing a fresh translation. Nothing is silently outdated — it's just a clean-slate approach rather than a diff-based one.

You can safely leave stale detection enabled while using content-derived keys. Nothing breaks — `_base_original` is still written, it just never diverges from `original` for any living key. No false positives, no errors, no wasted work.

#### UUIDs as keys

UUIDs provide maximum key stability — content changes, reordering, and insertions never affect the key. Stale detection works perfectly and there's zero collision risk, which neatly solves the [array/index problem](#key-uniqueness-and-stability).

The critical requirement is that **UUIDs must come from stored data, not build-time generation**. If you generate a UUID in your template (e.g. `crypto.randomUUID()`), every build produces new UUIDs and all translations are orphaned.

CloudCannon's [`instance_value`](https://cloudcannon.com/documentation/developer-reference/configuration-file/types/_inputs/*/instance_value/) feature is designed for exactly this. Configure a hidden text input with `instance_value: UUID` on your structure, and CloudCannon auto-populates a UUIDv4 when an array item is created. The UUID persists in the content file across rebuilds:

```yaml
# cloudcannon.config.yml
_inputs:
  _uuid:
    type: text
    hidden: true
    instance_value: UUID
```

The best pattern is to use the UUID as a **namespace segment** (via `data-rosey-ns`) while keeping the leaf key descriptive. This way the key is stable AND the leaf tells you what the field is:

```astro
<div data-rosey-ns="features">
  {features.map((feature) => (
    <div data-rosey-ns={feature._uuid}>
      <h3 data-rosey="title">{feature.title}</h3>
      <p data-rosey="description">{feature.description}</p>
    </div>
  ))}
</div>
<!-- key: features:6ec0bd7f-11c0-43da-...:title -->
```

The trade-off is readability — locale files contain opaque UUIDs, so debugging requires cross-referencing with the source content. Using UUID-as-namespace with descriptive leaf keys mitigates this (you can see the field name, just not which array item).

If an item is deleted and re-added in CloudCannon, it gets a new UUID and the old translation is orphaned — a fresh translation is needed for the new item.

UUIDs shine for dynamic, CMS-managed arrays. For hand-authored templates without CMS-managed data, static descriptive keys are simpler and equally stable.

#### Summary

| Strategy | Stale detection | Readability | Best for |
| --- | --- | --- | --- |
| Static descriptive | Full | High | Most sites, hand-authored templates |
| Content as key | None (forces re-translation instead) | High | Simple sites, short stable text |
| UUID (via `instance_value`) | Full | Low (mitigated with descriptive leaves) | CMS-managed arrays and structures |

All three are valid — the connector and Rosey use whatever keys the HTML provides. Choose based on your content management workflow.

### Key uniqueness and stability

Each Rosey key maps to exactly one entry in the locale file. The connector relies on this 1:1 mapping for two things:

- **[Stale detection](stale-translations.md)** — compares `original` vs `_base_original` per key. If two elements share a key, a source-text change on either one flags both as stale.
- **Disabled elements** — elements whose resolved key has no entry in the locale file appear grayed out and non-editable. This signals that `write-locales` needs to run before the element can be translated.

Both behaviours break when keys collide or shift unexpectedly.

**The array/index problem.** A common pitfall is using positional indexes as namespace segments for repeating structures (e.g. a list of feature cards):

```html
<!-- Fragile: index-based keys shift when items are inserted or reordered -->
<div data-rosey-ns="features">
  <div data-rosey-ns="0"><h3 data-rosey="title">Fast</h3></div>
  <div data-rosey-ns="1"><h3 data-rosey="title">Secure</h3></div>
</div>
<!-- keys: features:0:title, features:1:title -->
```

If a new card is inserted between the two, every key after the insertion point shifts by one. The locale file still has entries for the old indexes, so:

- Elements after the insertion map to the wrong locale entry — showing the wrong translation and potentially false stale flags
- The newly inserted element has no matching locale entry and appears disabled
- The last element in the original list loses its match and also appears disabled

**Recommended: use stable identifiers.** Instead of indexes, derive namespace segments from something that won't change when items are reordered — a slug, a short descriptive name, or a UUID from your CMS data:

```html
<!-- Stable: content-derived keys survive insertions and reordering -->
<div data-rosey-ns="features">
  <div data-rosey-ns="fast"><h3 data-rosey="title">Fast</h3></div>
  <div data-rosey-ns="secure"><h3 data-rosey="title">Secure</h3></div>
</div>
<!-- keys: features:fast:title, features:secure:title -->
```

Now inserting a card between them doesn't affect existing keys — the new card simply gets a new key, and existing translations stay matched to the correct elements.

> **Note:** Key design is ultimately a decision for the site author. The connector and Rosey use whatever keys the HTML provides — they don't enforce a naming strategy. Choose an approach that keeps keys unique and stable across content changes.

### Disabled elements (no locale entry)

When switching to a locale in the Visual Editor, any `[data-rosey]` element whose resolved key has no matching entry in the locale file is rendered at reduced opacity and is non-interactive — no inline editor is created, and you can't click or type in it. The element is still visible so the page layout stays intact, but it is effectively read-only.

**Why it happens.** The most common cause is adding a new translatable element to your source and opening the Visual Editor before a build has run. The locale files are generated at build time by `write-locales`, which reads Rosey's `base.json`. Until a build runs, the new key doesn't exist in the locale files and the connector has nothing to connect it to.

This also occurs when [index-based keys shift](#key-uniqueness-and-stability) — displaced elements lose their match and appear disabled even though they had translations before the reorder.

**How to fix it.** Trigger a build (or run `write-locales` locally) so the new key is added to every locale file. After that, the element becomes editable in the next Visual Editor session.

### Works with CloudCannon editable regions

If you're using CloudCannon's editable region custom elements, `data-rosey` can go right on them:

```html
<editable-text data-editable="text" data-prop="title" data-rosey="hero:title">
  Welcome to my site
</editable-text>
```

## Key namespacing

Rosey keys can be namespaced using parent element attributes. The connector walks up the DOM from each `data-rosey` element, collecting namespace segments to build a fully qualified key.

### `data-rosey-ns`

Adds a namespace segment to all child keys:

```html
<section data-rosey-ns="hero">
  <h1 data-rosey="title">Welcome</h1>
  <!-- Resolved key: hero:title -->
</section>
```

### `data-rosey-root`

Sets the root prefix and stops further upward traversal:

```html
<main data-rosey-root="index">
  <section data-rosey-ns="hero">
    <h1 data-rosey="title">Welcome</h1>
    <!-- Resolved key: index:hero:title -->
  </section>
</main>
```

### Combined example

```html
<body>
  <main data-rosey-root="index">
    <section data-rosey-ns="hero">
      <h1 data-rosey="title">Welcome</h1>
      <!-- key: index:hero:title -->
      <p data-rosey="subtitle">The best site</p>
      <!-- key: index:hero:subtitle -->
    </section>
    <section data-rosey-ns="features">
      <h2 data-rosey="heading">Features</h2>
      <!-- key: index:features:heading -->
    </section>
  </main>
</body>
```

The resulting locale file entries:

```json
{
  "index:hero:title": { "original": "Welcome", "value": "..." },
  "index:hero:subtitle": { "original": "The best site", "value": "..." },
  "index:features:heading": { "original": "Features", "value": "..." }
}
```

### Resetting the namespace

Setting `data-rosey-root=""` (empty string) resets the namespace. Child keys won't inherit anything from above:

```html
<main data-rosey-root="index">
  <div data-rosey-root="">
    <p data-rosey="standalone">This key is just "standalone"</p>
  </div>
</main>
```

## Shared content across pages

If the same text appears on multiple pages (e.g. navigation, footer), use consistent namespacing so the translations are shared. For example, give your header a namespace that resolves to the same key regardless of which page it's on:

```html
<header data-rosey-root="common">
  <nav data-rosey-ns="nav">
    <a data-rosey="home" href="/">Home</a>
    <!-- key: common:nav:home — same on every page -->
  </nav>
</header>
```

Since the header lives outside the [snapshot boundary](configuration.md#snapshot-boundary), it won't be affected by locale switching in the Visual Editor. Rosey still translates it at build time.

## Automatic tagging

v2 does not include an auto-tagger (the `data-rosey-tagger` attribute from v1 is not supported). If you previously relied on auto-tagging for markdown content rendered to HTML at build time, you'll need to add `data-rosey` attributes manually to your templates.

For content coming from markdown that you can't tag at the source level, consider:

- Adding `data-rosey` to the wrapper element in your layout that receives the rendered markdown
- Writing a build-step script that walks the built HTML and tags elements (similar to what v1's tagger did)
- Translating large sections of text (like the body content of a page) via a [split-by-directory](split-by-directory.md) approach instead of using Rosey

See [Migrating from v1](migration-from-v1.md) if you're upgrading from RCC v1 and used the auto-tagger.