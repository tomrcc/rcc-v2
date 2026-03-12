# Editable Regions — Overview & Lifecycle

## High-Level Summary

Editable regions is a client-side system that makes elements on a page interactive within CloudCannon's Visual Editor. It:

1. **Scans the DOM** for specially-annotated elements (`data-editable` attributes or `<editable-*>` web components)
2. **Builds a tree of `Editable` nodes** that mirror the data hierarchy
3. **Connects to the CloudCannon JavaScript API** to receive data changes and dispatch user mutations back

The framework integrations (Astro, Eleventy) are **only needed for component re-rendering** — they provide a way to re-run a template/component in the browser when its data changes. Simpler editable region types like text and image work purely with the shared core, no integration required.

## Architecture Layers

| Layer | Key Files | Role |
|---|---|---|
| **Hydration Engine** | `helpers/hydrate-editable-regions.ts`, `components/index.ts` | Scans the DOM, instantiates `Editable` nodes, watches for DOM mutations |
| **CloudCannon API Bridge** | `helpers/cloudcannon.mjs` | Connects to the CloudCannon API, manages component/snippet registries |
| **Editable Nodes** | `nodes/editable-*.ts` | Behaviour classes — one per region type (text, image, component, array, source, snippet) |
| **Web Components** | `components/editable-*-component.ts` | Thin Custom Element wrappers that self-hydrate via `connectedCallback` |
| **UI Controls** | `components/ui/` | Overlay controls for editing, array reordering, error display |
| **Astro Integration** | `integrations/astro/` | Vite plugin + client-side SSR wrapper for Astro component re-rendering |
| **11ty Integration** | `integrations/eleventy.mjs`, `integrations/liquid/` | esbuild bundler + LiquidJS engine for Liquid template re-rendering |

---

## The Simplest Case: A Text Editable Region

The best way to understand the system is to trace a single text editable region from HTML to live editing. No framework integration or component registration is needed — it's all shared core.

### 1. The HTML

A text editable region is just an HTML element with two data attributes:

```html
<p data-editable="text" data-prop="title">Welcome to my site</p>
```

- `data-editable="text"` — tells the hydration engine what type of editable this is
- `data-prop="title"` — the data path, pointing to the `title` key in the current file's front matter

Alternatively, you can use the Web Component form:

```html
<editable-text data-prop="title">Welcome to my site</editable-text>
```

Both forms produce identical behaviour.

### 2. Hydration

When the page loads, `components/index.ts` runs:

```javascript
hydrateDataEditableRegions(document.body);
observer.observe(document, { childList: true, subtree: true });
```

The hydration function walks the DOM looking for `[data-editable]` elements. It finds our `<p>`, sees `data-editable="text"`, and:

1. Instantiates `new EditableText(element)` — attaches as `element.editable`
2. Calls `editable.connect()`

A `MutationObserver` catches future DOM changes (view transitions, dynamic content, component re-renders), automatically hydrating new elements and disconnecting removed ones.

For Web Components (`<editable-text>`), hydration happens via the Custom Element lifecycle — `connectedCallback()` calls `this.editable.connect()`, `disconnectedCallback()` calls `this.editable.disconnect()`.

### 3. Waiting for the CloudCannon API

`connect()` doesn't do anything immediately. It waits for the CloudCannon API:

```javascript
this.connectPromise = apiLoadedPromise.then(() => {
    this.setupListeners();
    this.connected = true;
    if (!this.mounted && this.shouldMount()) {
        this.mounted = true;
        this.mount();
        this.update();
    }
});
```

`apiLoadedPromise` resolves when `window.CloudCannonAPI` becomes available (CloudCannon injects this into the Visual Editor iframe). It grabs the v1 API:

```javascript
_cloudcannon = window.CloudCannonAPI.useVersion("v1", true);
```

If the API is already loaded, the promise resolves immediately. Otherwise it listens for the `cloudcannon:load` CustomEvent on `document`.

### 4. Setting Up Listeners

Once the API is ready, `setupListeners()` runs. For our text editable:

1. **Walks up the DOM** looking for a parent editable element (none in this simple case)
2. **Parses `data-prop="title"`** — no `@collections[...]` or `@file[...]` prefix, so it resolves to `CloudCannon.currentFile()`
3. **Binds to the API file object**:
   ```javascript
   const file = CloudCannon.currentFile();
   file.addEventListener("change", handleAPIChange);
   file.addEventListener("delete", handleAPIChange);
   handleAPIChange(); // initial data fetch
   ```
4. **Listens for the `cloudcannon-api` CustomEvent** on the element itself (for upward data flow)

### 5. Mounting the Editor

When the initial data arrives, `pushValue()` resolves the path `"title"` against the file's front matter, stores the result, and calls `mount()`.

`EditableText.mount()` sets up interaction listeners (click prevention, focus/blur tracking), then calls `mountEditor()`:

```javascript
this.editor = await CloudCannon.createTextEditableRegion(
    this.element,
    this.onChange,
    {
        elementType: this.element.dataset.type,
        inputConfig,
    },
);
```

This hands the element to CloudCannon's ProseMirror-based editor, making it `contenteditable` with inline rich text editing.

### 6. Data Flows Down

When data changes in CloudCannon (e.g. user edits `title` in the sidebar):

```
CloudCannon API file fires "change"
    → handleAPIChange() calls pushValue()
    → pushValue() resolves path "title" against file data
    → Calls EditableText.update()
    → update() calls editor.setContent(newValue)
    → Text on the page updates live
```

`shouldUpdate()` checks that the editor isn't currently focused (to avoid clobbering what the user is typing) and that the value actually changed.

### 7. Data Flows Up

When the user types directly into the text element, the ProseMirror editor fires `onChange`:

```javascript
onChange(value) {
    this.value = value;
    this.dispatchSet("title", value);
}
```

`dispatchSet()` dispatches a bubbling CustomEvent:

```javascript
this.element.dispatchEvent(
    new CustomEvent("cloudcannon-api", {
        bubbles: true,
        detail: { action: "set", source: "title", value },
    }),
);
```

Since there's no parent editable, the event is caught by its own `handleApiEvent()` listener, which calls `executeApiCall()`:

```javascript
file.data.set({ slug: "title", value: "New Title" });
```

This sends the change to the CloudCannon API, which saves it to the file. That's the complete round trip.
