# CloudCannon Live Editing API

Reference documentation for CloudCannon's client-side live editing system, covering the JavaScript API (`@cloudcannon/javascript-api`), the editable regions DOM layer (`@cloudcannon/editable-regions`), HTML attributes, data flow, framework integrations, and known quirks.

> **Source**: This document was compiled from the `@cloudcannon/editable-regions` source code, the `@cloudcannon/javascript-api` type definitions, and real-world usage in the [rcc-v2](https://github.com/tomrcc/rcc-v2) project.

---

## Table of Contents

1. [Overview and Architecture](#1-overview-and-architecture)
2. [Getting Started](#2-getting-started)
3. [JavaScript API Reference](#3-javascript-api-reference)
4. [Files, Collections, and Datasets](#4-files-collections-and-datasets)
5. [createTextEditableRegion](#5-createtexteditableregion)
6. [createCustomDataPanel](#6-createcustomdatapanel)
7. [HTML Attributes Reference](#7-html-attributes-reference)
8. [Data Flow](#8-data-flow)
9. [Hydration and the MutationObserver](#9-hydration-and-the-mutationobserver)
10. [Framework Integrations](#10-framework-integrations)
11. [Configuration (cloudcannon.config.yml)](#11-configuration)
12. [Known Quirks and Constraints](#12-known-quirks-and-constraints)

---

## 1. Overview and Architecture

CloudCannon's live editing system makes elements on a page interactive within the Visual Editor. It consists of two layers:

| Layer | Package | Role |
|---|---|---|
| **JavaScript API** | `@cloudcannon/javascript-api` | Core client API: files, collections, datasets, data read/write, editor creation, file uploads |
| **Editable Regions** | `@cloudcannon/editable-regions` | DOM integration layer: scans for `data-editable` attributes, creates editor instances, manages data flow via a parent-child listener tree |

The Visual Editor loads your site in an iframe and injects the CloudCannon API into the page. Editable regions (or custom code like rcc-v2) then use this API to create inline editors and synchronise data.

```
┌──────────────────────────────────────────────────────────┐
│                  CloudCannon Visual Editor                │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Your Site (iframe)                                │  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  @cloudcannon/javascript-api                 │  │  │
│  │  │  window.CloudCannonAPI                       │  │  │
│  │  │                                              │  │  │
│  │  │  • Files, Collections, Datasets              │  │  │
│  │  │  • data.get() / data.set()                   │  │  │
│  │  │  • createTextEditableRegion()                │  │  │
│  │  │  • createCustomDataPanel()                   │  │  │
│  │  │  • change / delete events                    │  │  │
│  │  └──────────────┬───────────────────────────────┘  │  │
│  │                 │                                  │  │
│  │  ┌──────────────▼───────────────────────────────┐  │  │
│  │  │  @cloudcannon/editable-regions               │  │  │
│  │  │                                              │  │  │
│  │  │  • Hydration engine (DOM scanning)           │  │  │
│  │  │  • MutationObserver (auto hydrate/dehydrate) │  │  │
│  │  │  • Editable node tree (text, image, array…)  │  │  │
│  │  │  • Bubbling event bus (data-up path)         │  │  │
│  │  │  • Framework integrations (Astro, 11ty)      │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

The framework integrations (Astro, Eleventy) are **only needed for component re-rendering**. Text, image, and source editable regions work with just the core.

---

## 2. Getting Started

### Detecting the Visual Editor

CloudCannon sets `window.inEditorMode = true` when the page is loaded inside the Visual Editor iframe. Use this to gate editor-only code:

```javascript
if (window.inEditorMode) {
  // Load editing scripts
}
```

### Waiting for the API

The API is injected asynchronously. Two approaches:

**Option A: Event listener**

```javascript
document.addEventListener("cloudcannon:load", () => {
  const api = window.CloudCannonAPI.useVersion("v1", true);
  // API is ready
});
```

**Option B: Check-then-listen**

```javascript
if (window.inEditorMode && window.CloudCannonAPI) {
  init();
} else {
  document.addEventListener("cloudcannon:load", init);
}

function init() {
  const api = window.CloudCannonAPI.useVersion("v1", true);
  // ...
}
```

### `useVersion()`

```typescript
window.CloudCannonAPI.useVersion(
  key: "v0" | "v1",
  preventGlobalInstall?: boolean
): CloudCannonJavaScriptV1API;
```

- `"v1"` is the current version. `"v0"` is a legacy fallback.
- `preventGlobalInstall: true` prevents the API from installing itself as a global. The editable-regions library and rcc-v2 both use `true`.

---

## 3. JavaScript API Reference

All methods are on the object returned by `useVersion("v1", true)`.

### Core Access

| Method | Returns | Description |
|---|---|---|
| `currentFile()` | `File` | Handle for the page currently being edited |
| `file(path: string)` | `File` | Handle for a specific file by path |
| `collection(key: string)` | `Collection` | Handle for a collection (e.g. `"posts"`) |
| `dataset(key: string)` | `Dataset` | Handle for a dataset defined in `data_config` |
| `files()` | `Promise<File[]>` | All files |
| `collections()` | `Promise<Collection[]>` | All collections |

### Editor Creation

| Method | Returns | Description |
|---|---|---|
| `createTextEditableRegion(el, onChange, opts?)` | `Promise<{ setContent }>` | Create an inline ProseMirror text editor (see [section 5](#5-createtexteditableregion)) |
| `createCustomDataPanel(opts)` | `void` | Open a floating data panel (see [section 6](#6-createcustomdatapanel)) |

### Utilities

| Method | Returns | Description |
|---|---|---|
| `getPreviewUrl(url: string, inputConfig?)` | `string` | Resolve a preview URL for DAM/asset files |
| `uploadFile(file: File, inputConfig?)` | `Promise<string>` | Upload a file, returns the URL |
| `setLoading(data?)` | `void` | Update the editor's loading state |
| `prefetchedFiles()` | `Promise<Blob[]>` | Retrieve prefetched file blobs |
| `findStructure(structure, value)` | `any` | Look up a structure value |
| `getInputType(key, value?, inputConfig?)` | `string` | Determine the input type for a given key |

### Type Guards

| Method | Description |
|---|---|
| `isAPIFile(obj)` | `obj is CloudCannonJavaScriptV1APIFile` |
| `isAPICollection(obj)` | `obj is CloudCannonJavaScriptV1APICollection` |
| `isAPIDataset(obj)` | `obj is CloudCannonJavaScriptV1APIDataset` |

---

## 4. Files, Collections, and Datasets

### File Data Operations

```typescript
interface File {
  data: {
    get(opts?: { slug?: string; rewriteUrls?: boolean }): Promise<any>;
    set(opts: { slug: string; value: any }): Promise<any>;
    edit(opts: { slug: string }): void;
    addArrayItem(opts: { slug: string; item?: any }): Promise<any>;
    removeArrayItem(opts: { slug: string; index: number }): Promise<any>;
    moveArrayItem(opts: { slug: string; from: number; to: number }): Promise<any>;
  };
  content: {
    get(): Promise<string>;
    set(value: string): Promise<void>;
  };
  getInputConfig(opts: { slug: string }): any;
  addEventListener(event: "change" | "delete", listener: () => void): void;
  removeEventListener(event: "change" | "delete", listener: () => void): void;
}
```

**Reading data:**

```javascript
// Full file data (front matter)
const allData = await file.data.get();

// Single key
const title = await file.data.get({ slug: "title" });

// Nested key (dot-separated)
const heroTitle = await file.data.get({ slug: "hero.title" });

// Body content (markdown/HTML)
const body = await file.content.get();
```

**Writing data:**

```javascript
// Set a single key
await file.data.set({ slug: "title", value: "New Title" });

// Set a nested key
await file.data.set({ slug: "hero.title", value: "New Hero Title" });

// Set body content
await file.content.set("# New Content\n\nHello world.");
```

**Array operations:**

```javascript
await file.data.addArrayItem({ slug: "items" });
await file.data.addArrayItem({ slug: "items", item: { name: "New" } });
await file.data.removeArrayItem({ slug: "items", index: 2 });
await file.data.moveArrayItem({ slug: "items", from: 0, to: 3 });
```

### Slug Path Separator

CloudCannon uses `.` (dot) as the path separator for slugs. This applies to nested data access:

```javascript
// For data structure: { hero: { title: "Hello" } }
file.data.get({ slug: "hero.title" });

// For data structure: { "my:key": { value: "Hello" } }
// Colons are literal characters, not separators:
file.data.get({ slug: "my:key.value" });
```

### Datasets

Datasets expose data files (JSON, YAML, etc.) configured in `data_config`:

```typescript
interface Dataset {
  datasetKey: string;
  items(): Promise<File | File[]>;
  addEventListener(event: "change" | "delete", listener: () => void): void;
  removeEventListener(event: "change" | "delete", listener: () => void): void;
}
```

```javascript
const dataset = api.dataset("locales_fr");
const result = await dataset.items();

// items() returns a single File or an array of Files
const file = Array.isArray(result) ? result[0] : result;

// Read/write through the file handle
const value = await file.data.get({ slug: "hero:title.value" });
await file.data.set({ slug: "hero:title.value", value: "Bonjour" });
```

### Collections

```typescript
interface Collection {
  collectionKey: string;
  items(): Promise<File[]>;
  addEventListener(event: "change" | "delete", listener: () => void): void;
  removeEventListener(event: "change" | "delete", listener: () => void): void;
}
```

### Events

Files, collections, and datasets all support `change` and `delete` events:

```javascript
file.addEventListener("change", async () => {
  const data = await file.data.get();
  // Update UI with new data
});

dataset.addEventListener("change", async () => {
  const file = await resolveFile(dataset);
  // Re-read and update all tracked values
});
```

The `change` event does **not** indicate which specific key changed — you must re-read any keys you care about.

---

## 5. createTextEditableRegion

Creates an inline ProseMirror rich text editor on an existing DOM element.

### Signature

```typescript
api.createTextEditableRegion(
  element: HTMLElement,
  onChange: (content?: string | null) => void,
  options?: {
    elementType?: "span" | "text" | "block";
    editableType?: "content";
    inputConfig?: RichTextInput;
  }
): Promise<{ setContent(content?: string | null): void }>;
```

### Parameters

| Parameter | Type | Description |
|---|---|---|
| `element` | `HTMLElement` | The DOM element to make editable |
| `onChange` | `(content?) => void` | Called when the user edits content. Also fires on initialization. |
| `options.elementType` | `string` | `"span"` for inline, `"text"` for plain text, `"block"` for block-level rich text |
| `options.editableType` | `string` | Set to `"content"` when editing HTML/markdown source content |
| `options.inputConfig` | `object` | Rich text input configuration (toolbar options, allowed elements, etc.) |

### Return Value

```typescript
{ setContent(content?: string | null): void }
```

There is **no** `destroy()` method. Once created, a ProseMirror editor instance cannot be removed.

### Usage

```javascript
const editor = await api.createTextEditableRegion(
  element,
  (content) => {
    if (content == null) return;
    file.data.set({ slug: "title", value: content });
  },
  { elementType: "block" }
);

// The editor starts empty — populate it after creation
editor.setContent("<p>Hello world</p>");
```

### Critical Behaviours

1. **Editor starts empty**: The editor does not read the element's existing `innerHTML`. You must call `editor.setContent(value)` after creation.

2. **`onChange` fires on initialization**: ProseMirror normalizes the content on mount and triggers `onChange`. Guard against unwanted writes with a setup flag:

   ```javascript
   let setupComplete = false;
   const editor = await api.createTextEditableRegion(el, (content) => {
     if (!setupComplete) return;
     file.data.set({ slug, value: content });
   });
   editor.setContent(value);
   setupComplete = true;
   ```

3. **No `destroy()`**: Old editors stay alive after DOM removal and fire `onChange` when the DOM changes. Use a generation counter to make stale closures no-ops:

   ```javascript
   let generation = 0;

   function setup() {
     generation++;
     const myGeneration = generation;

     const editor = await api.createTextEditableRegion(el, (content) => {
       if (myGeneration !== generation) return; // stale — ignore
       file.data.set({ slug, value: content });
     });
   }
   ```

4. **Skip `setContent` on focused editors**: Calling `setContent` while the user is typing resets the cursor position. Track focus state and skip updates:

   ```javascript
   let focused = false;
   element.addEventListener("focus", () => { focused = true; });
   element.addEventListener("blur", () => { focused = false; });

   // In your change handler:
   if (!focused) {
     editor.setContent(newValue);
   }
   ```

---

## 6. createCustomDataPanel

Opens a floating data panel with custom input fields. Used by `EditableImage` for image editing (src, alt, title).

### Signature

```typescript
api.createCustomDataPanel({
  title: string;
  data: Record<string, any>;
  position: DOMRect;
  config: {
    _inputs: Record<string, InputConfig>;
  };
  onChange: (value: Record<string, any>) => void;
});
```

### Parameters

| Parameter | Type | Description |
|---|---|---|
| `title` | `string` | Panel title (e.g. `"Edit Image"`) |
| `data` | `object` | Current values for the panel's fields |
| `position` | `DOMRect` | Position hint for the floating panel (typically `element.getBoundingClientRect()`) |
| `config._inputs` | `object` | Input configuration for each field |
| `onChange` | `function` | Called with updated values when the user changes any field |

### Example: Image Editing

```javascript
api.createCustomDataPanel({
  title: "Edit Image",
  data: { src: currentSrc, alt: currentAlt, title: currentTitle },
  position: imgElement.getBoundingClientRect(),
  config: {
    _inputs: {
      src: { type: "image" },
      alt: { type: "text" },
      title: { type: "text" },
    },
  },
  onChange: (value) => {
    imgElement.src = value.src;
    imgElement.alt = value.alt;
    imgElement.title = value.title;
    file.data.set({ slug: "hero_image", value });
  },
});
```

### Related: `getPreviewUrl`

When displaying uploaded images, use `getPreviewUrl` to resolve DAM/asset URLs:

```javascript
const previewSrc = api.getPreviewUrl(originalUrl, inputConfig);
imgElement.src = previewSrc;
```

---

## 7. HTML Attributes Reference

### Core Editing Attributes

| Attribute | Values | Description |
|---|---|---|
| `data-editable` | `text`, `image`, `array`, `array-item`, `component`, `source` | Declares an editable region type |
| `data-prop` | Path string | Data path for the editable value |
| `data-prop-src` | Path string | Image `src` data path |
| `data-prop-alt` | Path string | Image `alt` data path |
| `data-prop-title` | Path string | Image `title` data path |
| `data-type` | `span`, `text`, `block` | Text editor mode (inline, plain, block-level rich text) |
| `data-component` | Component key | Component identifier for re-rendering lookup |
| `data-path` | File path | Source file path (for `EditableSource`) |
| `data-key` | Unique key | Identifier within a source file |
| `data-cloudcannon-ignore` | *(presence)* | Exclude element from editable region scanning |
| `data-hide-controls` | *(presence)* | Hide CloudCannon overlay controls |
| `data-defer-mount` | *(presence)* | Lazy initialization — editor mounts on first click |
| `data-id-key` | Key name | Array item identity key for stable reordering |
| `data-component-key` | Key name | Component identity key |
| `data-direction` | `horizontal`, `vertical` | Array drag-and-drop orientation |
| `data-cms-snippet-id` | Snippet ID | Identifies a snippet within rich text content |

### `data-prop` Path Forms

The `data-prop` value determines where the editable's data comes from:

| Form | Example | Resolves To |
|---|---|---|
| Relative | `data-prop="title"` | Key on the current file or parent editable |
| File reference | `data-prop="@file[/content/page.md].hero.title"` | Specific file, specific path |
| Collection | `data-prop="@collections[posts].0.title"` | Collection item by index |
| Dataset | `data-prop="@data[footer].copyright"` | Dataset data path |
| Content body | `data-prop="@content"` | File body (markdown/HTML), not front matter |
| Computed | `data-prop="@length"`, `data-prop="@index"` | Array metadata (item count, current index) |

Relative paths register on the nearest parent editable and inherit its data context. Absolute paths (prefixed with `@`) bind directly to a CloudCannon API object.

### Custom Elements

CloudCannon provides web component equivalents for common editable types:

| Custom Element | Equivalent | Purpose |
|---|---|---|
| `<editable-text>` | `<span data-editable="text">` | Inline text editor |
| `<editable-source>` | `<div data-editable="source">` | Raw HTML source editor |
| `<editable-image>` | `<div data-editable="image">` | Image editor |
| `<editable-component>` | `<div data-editable="component">` | Component editor |
| `<editable-array-item>` | `<div data-editable="array-item">` | Array item wrapper |

Both forms produce identical behaviour. Custom elements self-hydrate via `connectedCallback` / `disconnectedCallback`.

### Usage Examples

**Text editing:**

```html
<!-- Data attribute form -->
<h1 data-editable="text" data-prop="title">Welcome</h1>

<!-- Web component form -->
<editable-text data-prop="title">Welcome</editable-text>

<!-- Block-level rich text -->
<div data-editable="text" data-type="block" data-prop="description">
  <p>Rich text content here.</p>
</div>
```

**Image editing:**

```html
<!-- Single data-prop (object with src/alt/title) -->
<div data-editable="image" data-prop="hero_image">
  <img src="/images/hero.jpg" alt="Hero" />
</div>

<!-- Per-attribute paths -->
<div data-editable="image" data-prop-src="featured_image.image" data-prop-alt="featured_image.image_alt">
  <img src="/images/featured.jpg" alt="Featured" />
</div>

<!-- From a data file -->
<div data-editable="image" data-prop-src="@data[footer].logo" data-prop-alt="@data[footer].logo_alt">
  <img src="/images/logo.svg" alt="Logo" />
</div>
```

**Array editing:**

```html
<div data-editable="array" data-prop="content_blocks" data-id-key="_name" data-component-key="_name">
  <div data-editable="array-item" data-id="hero" data-component="hero">
    <!-- Component content -->
  </div>
  <div data-editable="array-item" data-id="counter" data-component="counter">
    <!-- Component content -->
  </div>
</div>
```

**Component editing:**

```html
<editable-component data-component="layouts/Navigation" data-prop="@data[navigation]">
  <nav><!-- Server-rendered navigation --></nav>
</editable-component>
```

**Source editing:**

```html
<div data-editable="source" data-path="/content/page.html" data-key="main-content">
  <p>Raw HTML that can be edited inline.</p>
</div>
```

---

## 8. Data Flow

### Data Down (CloudCannon to Page)

When data changes in CloudCannon (sidebar edit, external save, etc.):

```
CloudCannon API fires "change" on file/collection/dataset
    │
    ▼
Root Editable.pushValue()
    │  Resolves path against file data, stores value
    ▼
Editable.update()
    │  Pushes data to child listeners
    ▼
┌────────────┬──────────────┬───────────────┬──────────────┐
│ Text       │ Image        │ Component     │ Array        │
│            │              │               │              │
│ editor     │ updates      │ re-renders    │ creates/     │
│ .setContent│ img src/alt  │ template then │ reorders     │
│            │              │ diffs DOM     │ child items  │
└────────────┴──────────────┴───────────────┴──────────────┘
```

The `shouldUpdate()` check on `EditableText` prevents overwriting content while the user is focused on the editor.

### Data Up (Page to CloudCannon)

When the user types, clicks an image, or drags an array item:

```
User interaction (typing, clicking, dragging)
    │
    ▼
Leaf editable dispatches CustomEvent("cloudcannon-api", {
    bubbles: true,
    detail: { action: "set", source: "title", value: "New Title" }
})
    │  Event bubbles up the DOM
    ▼
Each parent editable intercepts, prepends its path segment
    │  "title" → "hero.title" → "content_blocks.0.hero.title"
    ▼
Root editable calls executeApiCall()
    │
    ▼
file.data.set({ slug: "content_blocks.0.hero.title", value: "New Title" })
    │
    ▼
CloudCannon API → Visual Editor → saves to file
```

Deeply nested editables never need to know their full data path. They dispatch relative paths, and each parent prepends its own segment as the event bubbles up.

### Supported API Actions

| Action | API Call | Typical Trigger |
|---|---|---|
| `set` | `file.data.set()` or `file.content.set()` | Typing in a text region, changing an image |
| `edit` | `file.data.edit()` | Clicking a component's edit button (opens sidebar) |
| `add-array-item` | `file.data.addArrayItem()` | Array "add" button, duplicate button |
| `remove-array-item` | `file.data.removeArrayItem()` | Array item delete button |
| `move-array-item` | `file.data.moveArrayItem()` | Drag-and-drop, reorder buttons |
| `get-input-config` | `file.getInputConfig()` | Mounting editors to get field configuration |

---

## 9. Hydration and the MutationObserver

### Initial Hydration

On page load, the editable regions entry point runs:

```javascript
hydrateDataEditableRegions(document.body);
observer.observe(document, { childList: true, subtree: true });
```

The hydration function:

1. Queries `[data-editable]` elements
2. Maps the type string to an `Editable` subclass (`"text"` → `EditableText`, `"image"` → `EditableImage`, etc.)
3. Creates an instance and attaches it to the element as `element.editable`
4. Calls `editable.connect()`, which waits for the API then sets up listeners

### MutationObserver

A document-level `MutationObserver` watches `{ childList: true, subtree: true }`:

```javascript
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.removedNodes.forEach((el) => {
      if (el instanceof HTMLElement) dehydrateDataEditableRegions(el);
    });
    mutation.addedNodes.forEach((el) => {
      if (el instanceof HTMLElement) hydrateDataEditableRegions(el);
    });
  });
});
observer.observe(document, { childList: true, subtree: true });
```

- **Nodes added to the DOM**: Automatically hydrated (editable instances created, listeners connected)
- **Nodes removed from the DOM**: Automatically dehydrated (listeners removed, editables disconnected)

This is how the DOM swap mechanism in rcc-v2 works: replacing a container in the DOM triggers automatic dehydration of removed editables and hydration of new ones.

### Parent-Child Listener Tree

Editables form a tree mirroring the DOM hierarchy:

1. On `setupListeners()`, each editable walks up the DOM to find its nearest parent editable
2. If the parent is hydrated, the child registers as a listener immediately
3. If the parent hasn't hydrated yet, the listener is queued in `__pendingEditableListeners` on the parent element and replayed when the parent connects

Parents push data to children via `registerListener()` → `pushValue()`.

### Custom Editable Region Types

Register custom editable types at runtime:

```javascript
addCustomEditableRegion("my-type", MyEditableClass);
```

This adds to the type map and re-runs hydration on `document.body`.

---

## 10. Framework Integrations

Framework integrations are **only needed for `EditableComponent` regions**. They provide a way to re-render components in the browser when data changes. Text, image, and source regions work without any integration.

Both integrations produce the same output: a function in `window.cc_components[key]` that takes props and returns an `HTMLElement`.

### Astro

Two parts: build-time Vite plugin and runtime client-side SSR.

**Build-time** (`@cloudcannon/editable-regions/astro-integration`):

- Registers a Vite plugin that enables client-side SSR for Astro components
- Shims `astro:content`, `astro:assets`, and `astro:env/server` for browser use
- Patches Astro's build plugin to support `renderToString()` in the browser

**Runtime** (`@cloudcannon/editable-regions/astro`):

```typescript
import { registerAstroComponent } from "@cloudcannon/editable-regions/astro";
import Hero from "./components/Hero.astro";

registerAstroComponent("hero", Hero);
```

`registerAstroComponent` creates a wrapper that calls Astro's `renderToString()` in the browser with a fake `SSRResult`, strips Astro scaffolding, and returns clean HTML.

**React islands** are supported via `@cloudcannon/editable-regions/astro-react-renderer`, which handles `<astro-island>` re-rendering on the client.

### Eleventy / Liquid

Bundles a standalone LiquidJS engine with all templates pre-loaded.

**Build-time** (`@cloudcannon/editable-regions/eleventy`):

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

The plugin discovers Liquid templates, bundles them with esbuild into `live-editing.js`, and stores them as text strings in `window.cc_files`.

**Runtime**: LiquidJS `parseAndRender()` with an in-memory filesystem reads from `window.cc_files`. Each registered component calls `liquidEngine.parseAndRender(templateString, props)` and returns an element.

### Integration Comparison

| Aspect | Astro | Eleventy/Liquid |
|---|---|---|
| Template engine | Astro (JSX-like) | LiquidJS |
| Build tool | Vite plugin | esbuild bundle |
| How templates reach the browser | Vite bundles as JS modules | esbuild imports as text strings |
| How templates render | `renderToString()` with fake SSRResult | `parseAndRender()` with in-memory filesystem |
| Registration API | `registerAstroComponent(key, Component)` | `registerLiquidComponent(key, template)` (auto-generated) |
| Renderer location | `window.cc_components[key]` | `window.cc_components[key]` |

### How EditableComponent Uses Renderers

1. Looks up `window.cc_components[dataComponent]` by the `data-component` attribute
2. Calls the renderer with current props to get new HTML
3. **Diffs the result** into the live DOM (preserves focused editors, ProseMirror state)
4. If the renderer isn't registered yet, retries with polling (up to 4 seconds) and listens for a registration event

---

## 11. Configuration

### `cloudcannon.config.yml`

#### `data_config`

Exposes data files to the JavaScript API as datasets:

```yaml
data_config:
  locales_fr:
    path: rosey/locales/fr.json
  locales_de:
    path: rosey/locales/de.json
  footer:
    path: data/footer.json
  navigation:
    path: data/navigation.json
```

The key (e.g. `locales_fr`) maps directly to `api.dataset("locales_fr")` in JavaScript. The dataset then provides access to the file at the configured path.

#### `collections_config`

Defines collections that can be accessed via `api.collection(key)`:

```yaml
collections_config:
  pages:
    path: src/content/pages
    _enabled_editors:
      - visual
  posts:
    path: src/content/blog
    _enabled_editors:
      - visual
      - content
  data:
    path: data
```

#### Input Configuration

Input types and options are configured in `_inputs` at various levels (global, collection, structure):

```yaml
_inputs:
  title:
    type: text
    options:
      empty_type: string
      required: true
  description:
    type: markdown
    options:
      bold: true
      italic: true
      link: true
  hero_image:
    type: image
    options:
      resize_style: crop
```

These configurations are accessible via `file.getInputConfig({ slug: "title" })` and can be passed to `createTextEditableRegion` as `inputConfig` or to `createCustomDataPanel` as `config._inputs`.

#### Structures

Structures define the shape of array items and components:

```yaml
_structures:
  features:
    style: select
    values:
      - value:
          item:
          active_feature:
```

---

## 12. Known Quirks and Constraints

### `createTextEditableRegion`

| Quirk | Impact | Mitigation |
|---|---|---|
| **No `destroy()` method** | Old ProseMirror instances stay alive after DOM removal and fire `onChange` on any DOM change | Use a `switchGeneration` counter; stale closures check generation and no-op |
| **`onChange` fires on init** | ProseMirror normalizes content on mount, triggering `onChange` before the user has typed | Guard with a `setupComplete` flag that's set after all editors are created |
| **Editor starts empty** | Does not read existing `innerHTML` | Call `editor.setContent(value)` immediately after creation |
| **`setContent` resets cursor** | Calling `setContent` while focused steals focus and resets cursor position | Track focus state; skip `setContent` on focused editors |

### Data API

| Quirk | Detail |
|---|---|
| **Slug separator is `.`** | Not `/`. For nested data `{ hero: { title: "X" } }`, use slug `"hero.title"`. Colons and other characters in key names are literal. |
| **`dataset.items()` return type varies** | Can return a single `File` or `File[]`. Always handle both: `Array.isArray(result) ? result[0] : result` |
| **`change` events are coarse** | The event doesn't indicate which key changed. Re-read all keys you care about on every `change` event. |
| **`change` fires for own writes** | Setting a value via `file.data.set()` can trigger a `change` event on the same dataset. Guard against echo loops. |
| **`dataset.items()` hangs for missing files** | If `data_config` points to a file CC cannot resolve, `items()` returns a promise that never settles — no rejection, no empty result. Always race with a timeout. The most common cause: a `source` key in `cloudcannon.config.yml` makes `data_config` paths resolve relative to the source directory. CC does not support `../` in paths, so the fix is to remove the `source` key and prepend its value to all affected paths. |

### DOM and Content

| Quirk | Detail |
|---|---|
| **HTML in values** | Many CMS values contain HTML (from Markdown rendering, rich text, etc.). Always use `innerHTML`, never `textContent`, when setting element content. |
| **`<editable-text>` replacement tag** | When stripping CC custom elements from a clone, `<editable-text>` should be replaced with `<span>` (inline) but upgraded to `<div>` if `data-type="block"\|"text"` or the element contains block-level children. Prevents invalid HTML nesting. |
| **MutationObserver timing** | Processing cloned DOM trees while detached avoids MutationObserver callbacks, `connectedCallback` firings, and race conditions. Attach to the document only after cleanup is complete. |

### Events

| Event | Fired On | When |
|---|---|---|
| `cloudcannon:load` | `document` | CloudCannon API is ready; `window.CloudCannonAPI` is available |
| `change` | File, Collection, Dataset | Data has changed (including external changes and own writes) |
| `delete` | File, Collection, Dataset | Data has been deleted |
| `cloudcannon-api` | DOM elements (bubbles) | Internal action event for the editable regions event bus |
| `editable:focus` | DOM elements (bubbles) | An editable region gained focus |
| `editable:blur` | DOM elements (bubbles) | An editable region lost focus |

### Global State

| Global | Type | Set By | Purpose |
|---|---|---|---|
| `window.inEditorMode` | `boolean` | CloudCannon Visual Editor | `true` when the page is inside the editor iframe |
| `window.CloudCannonAPI` | `object` | CloudCannon Visual Editor | API router; call `.useVersion("v1", true)` to get the API |
| `window.cc_components` | `Record<string, Function>` | Framework integrations | Component renderer registry |
| `window.cc_snippets` | `Record<string, Function>` | Framework integrations | Snippet renderer registry |
| `window.cc_files` | `Record<string, string>` | Eleventy integration | In-memory filesystem for Liquid templates |
| `window.editableRegionMap` | `Record<string, class>` | Editable regions core | Type map for custom editable region classes |
