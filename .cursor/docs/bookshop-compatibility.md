# Bookshop Compatibility — Handoff Doc

> **Scope:** This document is only relevant for sites that use Bookshop. Check for `bookshop.config.cjs`, a `_bookshop/` or `component-library/bookshop/` directory, `{% bookshop %}` template tags, or `window.bookshopLive` in the project. **Most CloudCannon sites use editable regions, not Bookshop.** If the current site does not use Bookshop, this document can be ignored entirely.

## What is this?

The RCC (Rosey CloudCannon Connector) v2 enables inline translation editing in CloudCannon's Visual Editor. When a user picks a locale (e.g. FR), the RCC:

1. Clones the snapshot boundary (`<main>` or `[data-rcc]`)
2. Strips CloudCannon editing infrastructure from the clone (custom elements, `data-editable`, `data-prop`, etc.)
3. Swaps the original out of the DOM and the clean clone in
4. Creates inline editors on `[data-rosey]` elements via `api.createTextEditableRegion()`
5. On "Original", swaps the original back in — CC auto-restores editing

This works perfectly with CC's native **editable regions**. It does NOT yet work with **Bookshop** live editing.

## What is Bookshop?

[Bookshop](https://github.com/CloudCannon/bookshop) is CloudCannon's component development framework. Its live editing works very differently from editable regions:

- **Comment-driven**: SSG plugins wrap each component in `<!--bookshop-live name(hero) params(bind:content) -->` ... `<!--bookshop-live end-->` HTML comments
- **Global singleton**: `window.bookshopLive` is created on page load
- **Continuous re-rendering**: A `cloudcannon:update` event listener on `document` triggers Bookshop to XPath-scan the entire document for `<!--bookshop-live-->` comments, re-render each component via an SSG engine (running in the browser), and graft the output into the DOM
- **Data bindings**: Bookshop adds `data-cms-bind` attributes to elements for "click to open sidebar panel" bindings
- **No teardown API**: `BookshopLive` has no `destroy()` or `disconnect()` method

Key source files (read-only reference repo at `/Users/tomrichardson/Dev/work/multilingual/bookshop/`):
- `javascript-modules/live/lib/app/live.js` — `BookshopLive` class, `update()`, `render()`
- `javascript-modules/live/lib/app/core.js` — XPath comment scanning, `renderComponentUpdates`, `graftTrees`, `hydrateDataBindings`
- `javascript-modules/generate/lib/live-connector.js` — The inline `<script>` injected into pages; sets up `cloudcannon:update` listener

## Why it breaks

When RCC clones `<main>` for locale view:

1. **Bookshop comments survive** — RCC's `cleanClone()` only stripped CC custom elements and `data-editable`/`data-prop` attributes; it did not touch HTML comments
2. **`data-cms-bind` survives** — Bookshop's click-to-edit panel bindings remained on clone elements
3. **Bookshop keeps re-rendering** — `window.bookshopLive.update()` is called on every `cloudcannon:update`, finds the comments in the clone via XPath, re-renders component HTML, and overwrites RCC's translation editors

## What we've done so far

All changes are in `src/injector.ts`:

### 1. Strip Bookshop comments from clone (`stripBookshopComments`)
A `TreeWalker` with `NodeFilter.SHOW_COMMENT` removes all comments containing `"bookshop-live"` from the detached clone. This makes Bookshop's XPath scan find nothing in the document when the clone is active.

### 2. Strip `data-cms-bind` from clone (`stripCCAttributes`)
Added `el.removeAttribute("data-cms-bind")` alongside the existing `data-editable`/`data-prop` removal.

### 3. Pause/resume Bookshop's update cycle (`pauseBookshop`/`resumeBookshop`)
- On locale switch: monkey-patches `window.bookshopLive.update` to a no-op returning `false`
- On teardown: restores the original `update` method
- The no-op returns `false` so the Bookshop connector doesn't call `CloudCannon.refreshInterface()`

### 4. `switchInProgress` re-entrancy guard
A boolean guard that blocks button click handlers from calling `switchLocale()` while an async locale switch is in progress.

### 5. Moved `pauseBookshop()` before DOM swap
Bookshop is now paused BEFORE `container.replaceWith(clone)` to prevent Bookshop from reacting to the DOM mutation.

### 6. Strip `data-cms-bind` + force Bookshop re-render on restore (`stripCmsBindForRerender`)
After swapping the original container back in, `data-cms-bind` attributes are stripped from all elements and a Bookshop re-render is forced. This is necessary because Bookshop's `graftTrees` preserves existing DOM element nodes when only text content changed (fine-grained diffing), and CC's overlay system tracks elements by reference — re-inserting the same element objects doesn't trigger overlay recreation even with `refreshInterface()`. Stripping `data-cms-bind` causes `graftTrees` to see a shallow-clone mismatch on the next render (virtual DOM has the attribute, real DOM doesn't), replacing the element with a fresh virtual DOM node that CC recognizes as new.

## Current status

The original → locale → original flow works. The `switchInProgress` guard resolved the phantom click issue. The `data-cms-bind` stripping + forced re-render approach restores Bookshop component overlay buttons after locale view teardown.

### graftTrees element preservation (resolved)

Bookshop's `graftTrees` in `core.js` diffs the real DOM against the virtual DOM from the latest render. It uses `cloneNode(false).isEqualNode()` to compare elements without children. When only text content changes, the parent elements are preserved and only text nodes are replaced.

`data-cms-bind` attributes sit on component wrapper elements (e.g., `<section data-cms-bind="#content_blocks.0">`). These are the elements `graftTrees` preserves. After swapping the original container back in, these are the same JS objects CC tracked before — but CC destroyed their overlay nodes on removal. CC won't recreate overlays for elements it already "knows." Even `refreshInterface()` doesn't help because CC thinks the binding is already handled.

The fix: `stripCmsBindForRerender()` removes `data-cms-bind` from the original after swap, then `forceBookshopRerender()` triggers a full Bookshop render cycle. `graftTrees` now sees a shallow mismatch (`<section>` vs `<section data-cms-bind="...">`), replaces the element with a fresh virtual DOM node, and `refreshInterface()` creates overlays on the new node.

## Key files

| File | Purpose |
|------|---------|
| `src/injector.ts` | All RCC runtime logic — clone/clean, locale switch, editors, UI, Bookshop compat |
| `src/logger.ts` | `log()` (verbose, gated on `[data-rcc-verbose]`) and `warn()` (always visible) |
| `dist/index.mjs` | Built output — line numbers in console traces map to this file |

## How to test

1. `npm run build` in `/Users/tomrichardson/Dev/work/multilingual/rcc-v2/`
2. The test site at `/Users/tomrichardson/Dev/work/multilingual/venture-rcc-v2-test/` depends on RCC via npm link or git reference
3. Push the test site to CloudCannon and open a page in the Visual Editor
4. Add `data-rcc-verbose` to `<main>` (or run `document.querySelector("main").setAttribute("data-rcc-verbose","")` in the console)
5. Open the browser console, click the FR locale button in the RCC FAB
6. Check the console output for the full switchLocale flow

## Architecture context

See these cursor rules for full system context:
- `.cursor/rules/rcc-v2-mission.mdc` — How the RCC works, API surface, constraints
- `.cursor/rules/rcc-v2-codebase.mdc` — File map
- `.cursor/rules/editable-regions-context.mdc` — How CC's editable regions work (the system RCC integrates with)
