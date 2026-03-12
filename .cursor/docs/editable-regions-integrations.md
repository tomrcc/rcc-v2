# Editable Regions — Framework Integrations

## What the Integrations Do (and Don't Do)

The integrations **only** provide a way to re-render components in the browser during live editing. They register renderer functions in `window.cc_components` that `EditableComponent` calls when data changes.

The integrations **do not** affect: text editable regions, image editable regions, source editable regions, the hydration engine, the CloudCannon API connection, or the event bus/listener system.

If you only use text, image, and source editable regions, you don't need any integration — just the core.

---

## Astro Integration

Two parts:

### Build-time (`integrations/astro/astro-integration.mjs`)

An Astro integration that registers a Vite plugin for the **client** build:

1. Sets `ENV_CLIENT = true` (for tree-shaking server-only code)
2. Patches Astro's `astro:build` Vite plugin to force SSR transforms on client code — makes `renderToString()` work in the browser
3. Adds `vite-plugin-editable-regions` which intercepts `astro:*` virtual module imports and resolves them to local shims:
   - `astro:content` → `modules/content.js`
   - `astro:assets` → `modules/assets.js`
   - `astro:env/server` → `modules/secrets.js`

Without this, Astro components importing from `astro:content` or `astro:assets` would fail to bundle for the client.

### Runtime (`integrations/astro/index.mjs`)

`registerAstroComponent(key, AstroComponent)` creates a wrapper function that:

1. Constructs a fake Astro `SSRResult` (with renderers, metadata, crypto key, slot handling, etc.)
2. Calls Astro's `renderToString()` **in the browser** with the new props
3. Parses the resulting HTML into a document fragment
4. Triggers queued client-side renders (React islands use `data-editable-region-csr-id`)
5. Strips Astro scaffolding (`<astro-island>`, `<link>`, server island metadata)
6. Returns clean HTML element

The wrapper is stored in `window.cc_components[key]` where `EditableComponent` can find it.

**Usage** — in the Astro page, a `<script>` tag imports a module that registers components:

```typescript
import { registerAstroComponent } from "@cloudcannon/editable-regions/astro";
import MyComponent from "./components/my-component.astro";

registerAstroComponent("my-component", MyComponent);
```

---

## Eleventy / Liquid Integration

Takes a fundamentally different approach: bundles a standalone LiquidJS engine with all templates pre-loaded.

### Build-time (`integrations/eleventy.mjs`)

An Eleventy plugin that hooks into `eleventy.before`:

1. **Discovers all Liquid template files** across configured directories
2. **Generates a JavaScript source string** that:
   - Creates a shared LiquidJS engine with the same root directories
   - Imports every template file as a text string (via esbuild's `text` loader)
   - Stores them in `window.cc_files` for the in-memory filesystem
   - Registers custom filters, shortcodes, paired shortcodes, and tags
   - Registers each component template as a renderer
3. **Bundles it with esbuild** into `live-editing.js` in the output directory

### Runtime (`integrations/liquid/`)

The bundled `live-editing.js` sets up:

- **`createSharedLiquidEngine()`** — a LiquidJS `Liquid` instance with:
  - An in-memory filesystem (`integrations/liquid/fs.mjs`) reading from `window.cc_files`
  - Browser-compatible Eleventy built-in filters (`slugify`, `url`, `log`)
  - `ENV_CLIENT = true` as a global
  - A `bind_include` tag for spreading object props into includes

- **`registerLiquidComponent(key, templateString)`** — stores a wrapper in `window.cc_components[key]` that:
  1. Calls `liquidEngine.parseAndRender(templateString, props)`
  2. Creates a `<div>` and sets `innerHTML` to the result
  3. Returns the element for `EditableComponent` to diff into the DOM

- **Custom extension support**: Filters, shortcodes, paired shortcodes, and custom tags. Shortcodes are converted from Eleventy's function API to LiquidJS's `{ parse(), render() }` tag API via wrapper utilities in `shortcodes.mjs`.

- **The in-memory filesystem** (`integrations/liquid/fs.mjs`): LiquidJS-compatible adapter implementing `readFile`, `exists`, `resolve` by looking up paths in `window.cc_files`. Lets `{% include %}` and `{% render %}` work in the browser without network requests.

**Usage** — in `eleventy.config.js`:

```javascript
import editableRegions from "@cloudcannon/editable-regions/eleventy";

export default function(eleventyConfig) {
    eleventyConfig.addPlugin(editableRegions, {
        liquid: {
            components: [
                { name: "hero", file: "_includes/hero.liquid" },
            ],
            filters: [
                { name: "formatDate", file: "_filters/format-date.js" },
            ],
        },
    });
}
```

---

## Integration Comparison

| Aspect | Astro | Eleventy/Liquid |
|---|---|---|
| Template engine | Astro's own (JSX-like) | LiquidJS |
| Build-time tool | Vite plugin | esbuild bundle |
| How templates reach the browser | Vite bundles Astro components as JS modules | esbuild imports template files as text strings into `window.cc_files` |
| How templates render in the browser | Astro's `renderToString()` with a fake SSRResult | LiquidJS `parseAndRender()` with an in-memory filesystem |
| Component registration API | `registerAstroComponent(key, AstroComponent)` | `registerLiquidComponent(key, templateString)` (auto-generated) |
| Custom extension support | React islands via `addFrameworkRenderer()` | Filters, shortcodes, paired shortcodes, tags |
| Where the renderer is stored | `window.cc_components[key]` | `window.cc_components[key]` |

Despite different approaches, both produce the same output: a function in `window.cc_components` that takes props and returns an `HTMLElement`. The `EditableComponent` node doesn't know or care which integration produced it.
