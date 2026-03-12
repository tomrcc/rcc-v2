# Editable Regions — Data Flow & File Map

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BUILD TIME                                  │
│                                                                     │
│  ┌─ Astro ──────────────────────┐  ┌─ Eleventy ──────────────────┐ │
│  │ Vite plugin:                 │  │ esbuild bundle:              │ │
│  │ • shims astro:* modules      │  │ • discovers .liquid files    │ │
│  │ • enables client-side SSR    │  │ • bundles as text strings    │ │
│  │ • patches astro:build plugin │  │ • imports filters/shortcodes │ │
│  └──────────────────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  PAGE LOAD (in Visual Editor iframe)                 │
│                                                                     │
│  ┌─ Integration layer (optional) ─────────────────────────────────┐ │
│  │ Registers component renderers in window.cc_components          │ │
│  │ (Only needed for EditableComponent regions)                    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─ Core (always runs) ──────────────────────────────────────────┐  │
│  │ 1. hydrateDataEditableRegions(document.body)                  │  │
│  │    → scans all [data-editable] elements                       │  │
│  │    → instantiates Editable subclasses                         │  │
│  │ 2. MutationObserver watches for future DOM changes            │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      CONNECTION PHASE                                │
│                                                                     │
│  Each Editable.connect() waits for apiLoadedPromise                 │
│  ┌──────────────────────────────────────────────────┐               │
│  │ Resolves when:                                    │               │
│  │  • window.CloudCannonAPI already exists, OR       │               │
│  │  • document "cloudcannon:load" event fires        │               │
│  │ Then: CloudCannonAPI.useVersion("v1", true)       │               │
│  └──────────────────────────────────────────────────┘               │
│                                                                     │
│  Then setupListeners():                                             │
│  ┌──────────────────────────────────────────────────────┐           │
│  │ • Walk DOM upward to find parent editable            │           │
│  │ • Parse data-prop* into data paths                   │           │
│  │ • Relative paths → register on parent                │           │
│  │ • Absolute paths → bind to CloudCannon API objects   │           │
│  │ • Listen for "cloudcannon-api" CustomEvent (bubbling)│           │
│  └──────────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     LIVE EDITING DATA FLOW                           │
│                                                                     │
│  DATA DOWN (CloudCannon → Page)                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ CloudCannon API fires "change" on file/collection/dataset    │   │
│  │       │                                                      │   │
│  │       ▼                                                      │   │
│  │ Root Editable.pushValue()                                    │   │
│  │       │  resolves path, stores value                         │   │
│  │       ▼                                                      │   │
│  │ Editable.update()                                            │   │
│  │       │  pushes to child listeners                           │   │
│  │       ▼                                                      │   │
│  │ ┌────────────┬──────────────┬───────────────┬──────────────┐ │   │
│  │ │ Text       │ Image        │ Component     │ Array        │ │   │
│  │ │            │              │               │              │ │   │
│  │ │ editor     │ updates      │ re-renders    │ creates/     │ │   │
│  │ │ .setContent│ img src/alt  │ template then │ reorders     │ │   │
│  │ │            │              │ diffs DOM     │ child items  │ │   │
│  │ └────────────┴──────────────┴───────────────┴──────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  DATA UP (Page → CloudCannon)                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ User types / clicks image / drags array item                 │   │
│  │       │                                                      │   │
│  │       ▼                                                      │   │
│  │ Leaf dispatches CustomEvent("cloudcannon-api", {             │   │
│  │     bubbles: true,                                           │   │
│  │     detail: { action: "set", source: "title", value }       │   │
│  │ })                                                           │   │
│  │       │  (bubbles up DOM)                                    │   │
│  │       ▼                                                      │   │
│  │ Each parent prepends its path → "hero.title"                 │   │
│  │       │                                                      │   │
│  │       ▼                                                      │   │
│  │ Root calls executeApiCall()                                  │   │
│  │   → file.data.set({ slug: "hero.title", value })            │   │
│  │       │                                                      │   │
│  │       ▼                                                      │   │
│  │ CloudCannon API → Visual Editor → saves to file              │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Supported API Actions

| Action | CloudCannon API Call | Typical Trigger |
|---|---|---|
| `set` | `file.data.set()` or `file.content.set()` | Typing in a text region, changing an image |
| `edit` | `file.data.edit()` | Clicking a component's edit button |
| `add-array-item` | `file.data.addArrayItem()` | Array "add" button, duplicate button |
| `remove-array-item` | `file.data.removeArrayItem()` | Array item delete button |
| `move-array-item` | `file.data.moveArrayItem()` | Drag-and-drop, reorder buttons |
| `get-input-config` | `file.getInputConfig()` | Mounting editors to get field configuration |

---

## File Map

```
integrations/
  astro/
    astro-integration.mjs     — Astro integration & Vite plugin (build-time)
    index.mjs                 — registerAstroComponent, client-side SSR wrapper
    react-renderer.mjs        — React component bridge for Astro islands
    modules/
      content.js              — Client-side shim for astro:content
      assets.js               — Client-side shim for astro:assets
      secrets.js              — Client-side shim for astro:env/server
  eleventy.mjs                — Eleventy plugin: discovers files, generates bundle, runs esbuild
  liquid/
    index.mjs                 — LiquidJS engine setup, component/filter/tag registration
    fs.mjs                    — In-memory filesystem (reads from window.cc_files)
    shortcodes.mjs            — Eleventy shortcode → LiquidJS tag adapters
    11ty-filters.mjs          — Browser-compatible Eleventy built-in filters (slugify, url, log)
    logger.mjs                — Verbose logging utilities
  react.mjs                   — React component registration

helpers/
  cloudcannon.mjs             — CloudCannon API connection, component/snippet registries
  cloudcannon.d.mts           — Type declarations for the above
  hydrate-editable-regions.ts — DOM scanner that instantiates Editable nodes
  checks.ts                   — Type guards and element checks

nodes/
  editable.ts                 — Base class: listener system, path parsing, API dispatch
  editable-text.ts            — Inline rich text editing (ProseMirror via CC API)
  editable-image.ts           — Image editing with custom data panel
  editable-component.ts       — Component re-rendering with DOM diffing
  editable-array.ts           — Array management (create/remove/reorder items)
  editable-array-item.ts      — Individual array items with drag-and-drop
  editable-source.ts          — Raw HTML source editing (extends EditableText)
  editable-snippet.ts         — Snippet/shortcode editing within rich text

components/
  editable-*-component.ts     — Web Component wrappers (Custom Elements)
  index.ts                    — Entry point: runs hydration, starts MutationObserver
  ui/
    editable-component-controls.ts  — Edit button overlay for components
    editable-array-item-controls.ts — Reorder/delete/add controls for array items
    editable-region-button.ts       — Shared button component
    editable-region-error-card.ts   — Error display for misconfigured regions

styles/
  *.css                       — Styling for each editable type and UI control
```
