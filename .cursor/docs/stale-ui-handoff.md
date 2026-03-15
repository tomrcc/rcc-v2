# Stale Translation Navigator — UI Handoff

## What exists

rcc-v2 detects when a source text has changed but its translation hasn't been reviewed. The detection and data layer are complete. The UI needs refinement.

## Current UI components

### 1. Amber border on stale elements (in-page)

Stale elements get `outline: 2px dashed #f59e0b` + a faint amber background. Applied via `markStaleElement()` at line ~345 of `src/injector.ts`. Removed via `unmarkStaleElement()`. Uses CSS `outline` so it never affects layout.

### 2. Stale badge on the FAB (bottom-right of the 48px translate icon)

`#rcc-stale-badge` — amber pill showing the count of stale translations. Updated by `updateStaleBadge()`. Sits at bottom-right of the FAB (the locale badge sits top-right).

### 3. Per-locale stale submenu in the popover

Each locale button in the popover is wrapped in a container `<div>` that also holds a stale translations submenu (`[data-rcc-stale-submenu="locale"]`). The submenu only appears under the **active** locale when it has stale items. Structure:

- Amber left border (visual nesting under the locale button)
- Toggle header: clickable row with a chevron SVG (`[data-rcc-stale-chevron]`) + count label (`[data-rcc-stale-count]`)
- Collapsible body (`[data-rcc-stale-body]`):
  - Scrollable item list (`[data-rcc-stale-items]`, max-height 180px)
  - "Resolve all" button (`[data-rcc-resolve-all]`)

Each stale item is a flex row with two zones:
- **Left** (click to scroll): text preview + Rosey key — scrolls the element into view
- **Right** (click to resolve): checkmark button that calls `resolveStale(t, activeFile)` for that single item

The toggle header expands/collapses the body. Expanded state is stored in `dataset.rccExpanded` on the submenu element and persists across popover open/close and `updateStaleList` rebuilds. Defaults to expanded on first show.

The list is rebuilt from scratch by `updateStaleList()` (~line 274) which reads from `tracked.filter(t => t.stale)`. When called, it hides all submenus except the active locale's, then rebuilds items for the active locale.

### 4. Auto-resolve on edit

When a user edits a stale translation, `resolveStale(t, file)` is called in the `onChange` callback. This sets `locale.original = _base_original` via the CC API and calls `unmarkStaleElement()`.

## Key data on each tracked element

```ts
interface TrackedElement {
  element: HTMLElement;     // the DOM element in the cloned container
  roseyKey: string;         // e.g. "index:hero:title"
  originalContent: string;  // innerHTML from the built page
  focused: boolean;
  editor?: { setContent };
  stale: boolean;           // true when locale.original !== locale._base_original
  baseOriginal: string | null;   // current source text (_base_original from locale file)
  localeOriginal: string | null; // acknowledged source text (original from locale file)
}
```

## How resolution works

`resolveStale(t, file)` at ~line 359:
- Writes `file.data.set({ slug: "key.original", value: t.baseOriginal })` — syncs the locale's acknowledged original to the current base
- Calls `unmarkStaleElement(t)` which clears `t.stale`, removes the amber border, and calls `recountStale()` → `updateStaleBadge()` + `updateStaleList()`

The active CC file handle is stored in `activeFile` (module state) for use by the "Resolve all" button.

## Timing

Data loading is parallelized (`Promise.all` over all `file.data.get()` calls). Stale detection, badge, and list all populate immediately after the batch resolves — before editors are created. Editor creation is still sequential (ProseMirror needs it) and takes a few seconds for large pages.

## Style constants

```ts
const STALE_AMBER = "#f59e0b";
const STALE_AMBER_BG = "rgba(245, 158, 11, 0.08)";
const CC_BLUE = "#034ad8";
```

All UI is built imperatively with `document.createElement` + `Object.assign(el.style, {...})`. No CSS classes or stylesheets — everything is inline styles. This matches the rest of the rcc-v2 UI (FAB, popover, locale buttons).

## What could be improved

- No prev/next navigation to cycle through stale elements on the page.
- No visual feedback when an item is resolved from the list (it just disappears on next `updateStaleList` call).
- Could show old vs new original text diff in a tooltip or expanded detail.
- The "Resolve all" button has no confirmation.
