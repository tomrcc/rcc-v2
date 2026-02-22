# rosey-cloudcannon-connector

Client-side locale switching for [Rosey](https://rosey.app/) translations in [CloudCannon's](https://cloudcannon.com/) Visual Editor.

Developers add data attributes to their editable elements. The script handles locale switching via clone+replace in the editor — no server-side conditionals or component refactoring required.

## Install

```bash
npm install rosey-cloudcannon-connector
```

## Usage

Import the package as a side effect in your layout or page template. The script auto-initializes when the CloudCannon Visual Editor loads.

**Astro:**

```astro
<script>
  import "rosey-cloudcannon-connector";
</script>
```

**Plain HTML:**

```html
<script type="module">
  import "rosey-cloudcannon-connector";
</script>
```

## Setup

### 1. Mark translatable elements

Add `data-rcc` and `data-rosey="{key}"` to any `editable-text` element:

```html
<editable-text data-editable="text" data-prop="title" data-rosey="index_title" data-rcc>
  Welcome to my site
</editable-text>
```

- `data-rcc` marks the element as translatable (the script looks for this)
- `data-rosey` provides the Rosey translation key, following the `{pageSlug}_{fieldName}` convention

### 2. Declare available locales

Add `data-locales` to a parent element (typically `<main>`):

```html
<main data-locales="fr,de">
  <!-- translatable content here -->
</main>
```

### 3. Done

When the page loads in CloudCannon's Visual Editor, a floating locale switcher appears. Clicking a locale swaps each translatable element's `data-prop` to point at the corresponding locale data file, enabling in-place visual editing of translations.

## Data Attributes

| Attribute | Where | Purpose |
|---|---|---|
| `data-rcc` | On `editable-text` elements | Marks the element as translatable |
| `data-rosey="{key}"` | On `editable-text` elements | The Rosey translation key (also used by Rosey at build time) |
| `data-locales="fr,de"` | On a parent element (e.g. `<main>`) | Declares available locales (comma-separated) |
| `data-rcc-verbose` | On a parent element (e.g. `<main>`) | Enables verbose logging |

## How It Works

1. On init, the script snapshots all `[data-rcc]` elements (storing their `outerHTML` and position)
2. A floating locale switcher UI is injected into the page
3. When a locale is selected, each snapshotted element is replaced with a fresh clone that has its `data-prop` rewritten to `@data[locales_{locale}].{roseyKey}.value`
4. When "Original" is selected, each element is replaced from its stored snapshot

CloudCannon does **not** re-bind editable regions when attributes are mutated on existing elements. Only removing a node and inserting a new one (clone+replace) triggers re-binding. This is why the script uses `replaceChild` rather than `setAttribute`.

## Logging

- `warn(...)` always outputs to the console for real issues (missing elements, config problems)
- `log(...)` only outputs when `data-rcc-verbose` is present on `<main>`
- All messages are prefixed with `RCC:`

## Development

```bash
npm run build    # Build CJS + ESM output
npm run dev      # Watch mode
```

## License

MIT
