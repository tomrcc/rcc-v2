# Editable Regions — Region Types

## EditableText

The inline rich text editor. Creates a ProseMirror instance via `CloudCannon.createTextEditableRegion()`.

- Supports `data-type` of `"span"` (inline), `"text"` (plain text), or `"block"` (block-level rich text)
- Tracks focus state to avoid overwriting what the user is typing
- Supports deferred mounting (`data-defer-mount`) for performance — editor only initialises on click
- `onChange` dispatches a `set` action back up the tree

## EditableImage

Handles image editing with a CloudCannon data panel.

- Expects a child `<img>` element (or can be applied directly to an `<img>`)
- Manages `src`, `alt`, and `title` — each can be bound independently via `data-prop-src`, `data-prop-alt`, `data-prop-title`, or together via `data-prop`
- On click, opens `CloudCannon.createCustomDataPanel()` with image upload, alt text, and title fields
- Updates `img.src` via `CloudCannon.getPreviewUrl()` for DAM/asset preview URLs
- Also updates `<source>` elements within parent `<picture>` elements

## EditableComponent

Re-renders a component when its data changes. This is where the framework integrations plug in.

- Looks up a renderer function from `window.cc_components` by the `data-component` key
- Calls the renderer with the current props to get new HTML
- **Diffs the result into the live DOM** via `updateTree()` rather than wholesale replacing — preserves focused text editors, ProseMirror state, and other live editable instances
- Adds an edit button overlay (via `<editable-component-controls>`) that opens the sidebar editor
- If the component renderer isn't registered yet, retries with polling (up to 4 seconds) and listens for a registration event

## EditableArray & EditableArrayItem

Manages ordered lists of items with full CRUD and drag-and-drop.

**EditableArray**:
- Validates its value is an array (or a CloudCannon API collection/dataset/file)
- Creates/removes/reorders child `EditableArrayItem` elements to match the data
- Supports keyed arrays (`data-id-key` or `data-component-key`) for stable identity across reorders
- Uses `<template>` children as blueprints for new items
- Detects flex direction (`data-direction` or computed styles) to orient drag-and-drop indicators
- Shows an "Add Item" button when the array is empty

**EditableArrayItem** (extends `EditableComponent`):
- Adds array item controls (move up/down, add, duplicate, delete)
- Full drag-and-drop: `dragstart`, `dragover`, `drop` with position detection (before/after based on mouse position and array direction)
- Cross-array drag-and-drop support via structure matching
- Dispatches `move-array-item`, `remove-array-item`, `add-array-item` actions

## EditableSource

A specialisation of `EditableText` that edits raw HTML source files rather than front matter values.

- Uses `data-path` (the file path) and `data-key` (a unique identifier within the file) instead of `data-prop`
- Reads the full file source via `CloudCannon.file(path).get()`
- Finds the editable region within the source by locating the `data-key` attribute in the raw HTML
- On change, splices the edited content back into the full file source, preserving the original indentation
- Writes back via `file.set(content)` (sets the entire file, not a front matter key)

## EditableSnippet

Extends `EditableComponent` for editing snippets (shortcodes) within rich text content.

- Uses `data-cms-snippet-id` to identify which snippet in the content it represents
- Manages its own data locally (mutations like `set`, `move-array-item` are applied directly to the snippet's value object) rather than going through the file API
- Dispatches a `snippet-change` CustomEvent after mutations, which the rich text editor listens for to update the content
