# Known Issues and Troubleshooting

## Known issues

### Locale values must be HTML

Rosey originals are always HTML (the SSG converts Markdown to HTML at build time). Locale `.value` fields must also be HTML because Rosey substitutes them directly into the built HTML output. The connector forces all inline editors to `type: "html"`, even if your `_inputs` config specifies `type: markdown`. This ensures ProseMirror serializes content as HTML rather than raw Markdown.

If you need Markdown translations, you'd need to handle the Markdown-to-HTML conversion yourself before Rosey consumes the locale files.

### JavaScript hydration

If your site uses JavaScript to hydrate or re-render text content after the initial page load, the translated text may be overwritten by the JS framework's original values. This happens because Rosey translates the static HTML, but the JS framework doesn't know about the translations and re-renders with its own data.

Workarounds:

- **Import locale data into your JS components.** Read the locale JSON files and detect the current locale from the page URL to display the correct translation. See [this React + Astro example](https://github.com/tomrcc/rosey-and-react-demo) for a reference implementation.
- **Keep translated text outside hydrated components.** Structure your templates so that translatable text lives in static HTML (outside React/Vue/Svelte islands) where Rosey can safely replace it.

### Content outside the snapshot boundary

Navigation, footers, and other content outside the [snapshot boundary](configuration.md#snapshot-boundary) are not affected by locale switching in the Visual Editor. Rosey still translates them at build time, but editors won't see translated versions of that content when switching locales in the editor.

If you need to translate content outside `<main>` (like navigation links), those translations will only be visible on the built site, not in the Visual Editor's locale preview.

### JSON files excluded by default in Rosey build

Rosey's default `--exclusions` regex (`\.(html?|json)$`) prevents JSON files from being copied through the build as assets. This blocks essential files like `_rcc/locales.json` (the RCC locale manifest) and `_cloudcannon/info.json` (Bookshop component data). The postbuild `rosey build` command should include `--exclusions "\.(html?)$"` to let JSON files pass through. See [Getting Started: Step 4](getting-started.md#step-4-set-up-the-postbuild-script) for the full postbuild example.

If the locale manifest is missing from the final output, the connector won't find any locales and the switcher won't appear.

### Key collisions in repeating structures

When repeating components (e.g. card lists, feature grids) use positional indexes in their Rosey keys, inserting or reordering items shifts all subsequent keys. This causes mismatched translations, false stale flags, and edits creating fresh entries under shifted keys instead of reusing existing translations. Use stable, content-derived identifiers instead of array indexes for namespace segments. See [Tagging Content: Key uniqueness and stability](tagging-content.md#key-uniqueness-and-stability) for a full explanation and examples.

### Translating content added since the last build

A `data-rosey` element added to the source but not yet present in the locale files (because no build has run for it) is fully editable in the Visual Editor: it shows the source text as a fallback, and your first edit creates a new entry for that key. You don't need to trigger a build first. Because the new key is created silently on edit, double-check that [keys are stable](tagging-content.md#key-uniqueness-and-stability) so edits land on the intended entry. See [Tagging Content: Elements with no locale entry yet](tagging-content.md#elements-with-no-locale-entry-yet) for details.

## Troubleshooting

### The locale switcher doesn't appear

- Confirm you're in the CloudCannon Visual Editor (not the Content Editor or a local dev server)
- Check that the script is being imported — look for `RCC:` messages in the browser console
- Ensure `write-locales --dest` ran successfully in your postbuild and `/_rcc/locales.json` is being served
- Ensure at least one `data-rosey` element exists inside the snapshot boundary
- Check that a `<main>` element or `[data-rcc]` element exists on the page

### Translations aren't loading

- Check that `data_config` entries exist in `cloudcannon.config.yml` with the correct `locales_{code}` naming
- Verify the locale JSON files exist at the paths specified in `data_config`
- Look for `RCC:` warnings in the browser console
- Enable verbose logging with `data-rcc-verbose` for detailed output

### Edits aren't saving

- CloudCannon's data API handles persistence — ensure you see the "Unsaved changes" indicator in the CloudCannon toolbar after editing
- Check that the `data_config` path matches the actual file location in your repo

### Stale badges show unexpected counts

- Run `write-locales` to update `_base_original` fields — this happens automatically in the postbuild
- If you've edited source content locally, push and trigger a CloudCannon build to regenerate `base.json` and update `_base_original` values

### Inline editors don't match expected toolbar options

- The connector pre-scans `_inputs` config from the original container at init time. If your `_inputs` rules don't apply to elements inside the snapshot boundary, the connector won't pick them up.
- Remember that `type` is always forced to `"html"` — only toolbar options (bold, italic, link, styles, snippets, etc.) are inherited from your config. Because they ride on `options`, forcing the `type` doesn't drop any controls.
- The connector passes the original element's raw `data-type` as the editor's `elementType`, mirroring CloudCannon's native editor. This matters for the toolbar: an inline `styles` dropdown (accented-text styles) only renders on a `text`/`block` editor, not a bare `span`. If a heading shows its styles menu in the Original view but an empty toolbar in a locale view, check the element carries `data-type` (Astro helpers like `Heading.astro` emit `data-type="text"`); an element with no `data-type` falls back to inferred span/block, which can differ from what CC chose.
