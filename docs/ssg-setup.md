# SSG Setup

How to load the RCC client in each static site generator.

The build side is the same everywhere. `install-client` runs in
`.cloudcannon/postbuild`, after your site build, and copies the client into your
build output:

```bash
npx rosey-cloudcannon-connector install-client
```

The destination resolves from `--dest`, else `ROSEY_SOURCE`, else `source:` in
your Rosey config — the same value `rosey generate` and `rosey build` use, so
there's usually nothing to pass. The client lands at
`<buildDir>/_rcc/client.mjs`, next to the locale manifest.

Because this runs *after* the generator, no generator needs build configuration
for it: no Eleventy passthrough, no Hugo asset entry, no Jekyll include. Only the
layout differs, and only in template syntax. Each section below shows two things:

1. **The script tag** — always `import("/_rcc/client.mjs")` inside an
   `inEditorMode` guard, as a module.
2. **`data-rosey-root`** — the per-page namespace prefix for your Rosey keys, and
   the only genuinely generator-specific decision, since each exposes the page
   slug or URL differently. See [Tagging Content](tagging-content.md).

Your visual-editing style is independent of all this — see
[Editing styles](#editing-styles).

## Eleventy

Eleventy doesn't bundle browser JS, so the bare specifier can't work. Nothing
goes in `eleventy.config.js`.

**Liquid** (`src/_includes/base.liquid`):

```liquid
<body>
  <div data-rcc>
    <main data-rosey-root="{{ page.fileSlug | default: 'index' }}">
      {{ content }}
    </main>
  </div>
  <script>
    if (window?.inEditorMode) {
      import("/_rcc/client.mjs").catch(console.error);
    }
  </script>
</body>
```

**Nunjucks** (`src/_includes/base.njk`) — same thing, different filter syntax:

```njk
<main data-rosey-root="{{ page.fileSlug or 'index' }}">
  {{ content | safe }}
</main>
<script>
  if (window?.inEditorMode) {
    import("/_rcc/client.mjs").catch(console.error);
  }
</script>
```

`page.fileSlug` is `""` for `index.md`, hence the fallback. If your routing is
permalink-driven rather than slug-driven, derive the root from `page.url`
instead — and give the matching CloudCannon collection an explicit `url:`, since
a collection with no `url:` can't resolve to a page and will open in the Data
Editor instead of the Visual Editor.

A working example lives in `test/fixtures/eleventy`.

## Hugo

Hugo can only serve files it knows about, from `static/` or `assets/` — it has no
way to reach into `node_modules`. Since `install-client` writes straight into
`public/`, that doesn't matter.

`layouts/_default/baseof.html`:

```go-html-template
<body>
  <div data-rcc>
    <main data-rosey-root="{{ if .IsHome }}index{{ else }}{{ .File.ContentBaseName }}{{ end }}">
      {{ block "main" . }}{{ end }}
    </main>
  </div>
  <script>
    if (window?.inEditorMode) {
      import("/_rcc/client.mjs").catch(console.error);
    }
  </script>
</body>
```

Set `source: public` in your Rosey config (Hugo's default output directory) so
`install-client` and `write-locales` both land there without a flag.

`.File.ContentBaseName` is unavailable on generated pages such as taxonomy
terms; if you tag content on those, use `.RelPermalink` trimmed of slashes.

## Jekyll

As with Hugo, nothing needs to reach `node_modules` — `install-client` writes
into `_site/` directly. Set `source: _site` in your Rosey config.

`_layouts/default.html`:

```liquid
<body>
  <div data-rcc>
    <main data-rosey-root="{{ page.url | replace: '/', '' | default: 'index' }}">
      {{ content }}
    </main>
  </div>
  <script>
    if (window?.inEditorMode) {
      import("/_rcc/client.mjs").catch(console.error);
    }
  </script>
</body>
```

Jekyll needs `rosey` and `rosey-cloudcannon-connector` available to `npx` at
build time, so the site still needs a `package.json` even though it's a Ruby
build. Add one with just those two dependencies.

## Astro (and other bundled frameworks)

Astro bundles browser JS through Vite, so it resolves the bare specifier and you
can skip `install-client` entirely — the bundler handles hashing and versioning.
`init` detects Astro, Next, Nuxt, SvelteKit, Gatsby and Remix from your
`package.json` and omits the postbuild step for them.

```astro
---
const roseyRoot = Astro.url.pathname.replace(/^\/|\/$/g, "") || "index";
---
<div data-rcc>
  <main data-rosey-root={roseyRoot}>
    <slot />
  </main>
</div>
<script>
  if (window?.inEditorMode) {
    import("rosey-cloudcannon-connector");
  }
</script>
```

The URL form works here too, if you'd rather run one setup across a mixed estate
of sites — add the `install-client` line back to your postbuild. Pick one; don't
do both, or the client loads twice.

If you're unsure whether your framework bundles, use the URL form. It works
either way, and it's the safe default: a bare specifier on a generator that
doesn't bundle fails with nothing in the console but a resolution error.

## Editing styles

The client only looks for `data-rosey`. How the surrounding element becomes
editable in CloudCannon is independent of it, so all three of these work on any
generator above:

- **Plain `data-rosey`** — the client creates its own inline editors. Nothing
  else needed.
- **CloudCannon editable regions** — put `data-rosey` on the same element as
  `data-editable="text"`/`data-prop`, and the client inherits that region's
  toolbar config for its locale editors. A field holding HTML needs
  `data-type="block"` (or `"text"`) on the region *and* a `type: html` input in
  `cloudcannon.config.yml` — the on-canvas region and the sidebar input are
  independent channels, so configuring one doesn't configure the other. Without a
  `data-type`, a rich field defaults to `span` and reads as perpetually stale.
  Note `data-editable="source"` is a different thing: it edits whole HTML files
  via `data-path`, not frontmatter, and isn't what you want here.
- **Bookshop components** — components emit `data-rosey` from their own
  templates; keys namespace under the component's `_uuid`. The client pauses and
  resumes Bookshop live editing around a locale switch. Bookshop sites also need
  `npx @bookshop/generate` in the postbuild.

`test/fixtures/eleventy` covers the editable-regions and Bookshop styles on the
same Eleventy site, one page each.

## Troubleshooting

**Console shows `RCC: loaded` and nothing else.** The client loaded but bailed
early. Add `data-rcc-verbose` to your `[data-rcc]` element (or `<main>`) and
reload — the verbose log names the reason: no boundary found, no locales in the
manifest, or no `data-rosey` elements inside the boundary.

**`Failed to resolve module specifier "rosey-cloudcannon-connector"`.** The
layout is using the bare specifier on a generator that doesn't bundle. Switch to
`/_rcc/client.mjs`.

**404 on `/_rcc/client.mjs`.** `install-client` didn't run, or ran against a
different directory than the one being served. Check it's in
`.cloudcannon/postbuild` before the `mv` step, and that its resolved destination
matches your build output.

**404 on `/_rcc/locales.json`.** That's `write-locales`, not `install-client`.
Both write into the same `_rcc` directory but they're separate commands — see
[write-locales](write-locales.md).

**Both files exist locally but 404 on CloudCannon.** Rosey's default
`--exclusions` regex strips JSON when building the translated site. Use
`--exclusions "\.(html?)$"` on `rosey build`, as in
[Getting Started: Step 4](getting-started.md#step-4-set-up-the-postbuild-script).
