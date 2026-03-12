# Editable Regions — Core Internals

## Hydration Engine

Two mechanisms ensure every editable element gets an `Editable` instance:

**Data attribute scanning** (`helpers/hydrate-editable-regions.ts`): Finds `[data-editable]` elements, maps the type string to a class (`"text"` → `EditableText`, `"image"` → `EditableImage`, etc.), and calls `.connect()`.

**Web Components** (`components/editable-*-component.ts`): Custom Elements like `<editable-text>` that create their `Editable` instance in the constructor and call `.connect()` / `.disconnect()` in lifecycle callbacks.

Both share the same `MutationObserver` in `components/index.ts` which watches the entire document, hydrating new nodes and dehydrating removed ones.

Custom editable region types can be registered at runtime via `addCustomEditableRegion()`, which adds to the type map and re-runs hydration.

## The Editable Base Class

`nodes/editable.ts` is the base class for all editable region types. Key responsibilities:

- **Lifecycle management**: `connect()`, `disconnect()`, `mount()`, `update()`
- **Data path parsing**: `parseSource()` resolves `@collections[x]`, `@file[y]`, `@data[z]` prefixes into CloudCannon API objects
- **Value resolution**: `lookupPathAndContext()` traverses nested data structures (collections → files → data → nested keys), tracking context (which file, which collection) along the way
- **Listener management**: Parent-child registration, API event binding, DOM event binding
- **API dispatch**: `executeApiCall()` routes actions (`set`, `edit`, `add-array-item`, etc.) to the correct CloudCannon API method
- **Event handling**: `handleApiEvent()` catches bubbling `cloudcannon-api` events and adds path context

## Path Resolution & Data Sources

The `data-prop` attribute (and variants like `data-prop-src`, `data-prop-alt`) describes where the editable's data lives. Paths can be:

| Path Form | Example | Resolves To |
|---|---|---|
| Relative | `data-prop="title"` | Key on the current file's data, or on the parent editable's value |
| Absolute file | `data-prop="@file[/content/page.md].hero.title"` | Specific file, specific path |
| Absolute collection | `data-prop="@collections[posts].0.title"` | Collection → item → path |
| Absolute dataset | `data-prop="@data[authors].name"` | Dataset → path |
| Content | `data-prop="@content"` | The file's content body (markdown/HTML), not front matter |
| Special | `data-prop="@length"`, `data-prop="@index"` | Computed values from parent arrays |

When a path is relative, the editable registers as a listener on its parent editable. When absolute, it binds directly to the CloudCannon API object.

## The Bubbling Event Bus

Mutations (set, edit, add, remove, move) flow upward through the DOM via a custom `cloudcannon-api` event:

1. A leaf editable dispatches the event with `bubbles: true` and a relative source path
2. Each parent editable's `handleApiEvent()` intercepts it and prepends its own path segment
3. When the event reaches an editable with an absolute data source (or no parent), `executeApiCall()` fires the actual API call

Deeply nested editables never need to know their full data path — they just say "set `title`" and the path builds itself as the event bubbles up.

## Parent-Child Listener Tree

Editables form a tree that mirrors the DOM hierarchy:

- On `setupListeners()`, each editable walks up the DOM to find its nearest parent editable
- If the parent is already hydrated, the child registers as a listener immediately
- If the parent hasn't hydrated yet, the listener is queued in `__pendingEditableListeners` on the parent element and replayed when the parent connects

Parents push data to children via `registerListener()` → `pushValue()`. Children can also have multiple `data-prop*` attributes that pull different slices of the parent's data.
