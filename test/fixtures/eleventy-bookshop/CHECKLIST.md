# Eleventy + Bookshop fixture — Visual-Editor checklist

Automated `verify-*.mjs` cover the `_site` build dir, Bookshop keys, and 3-layer
config. This list covers the live-editor-only Bookshop behavior.

## Setup
1. In `rcc-v2/`, run `npm run build`.
2. Open `test/fixtures/eleventy-bookshop` as a CloudCannon site; enter the Visual Editor.
3. Console prints `RCC: v<version> loaded` (proves the local `file:` build).

## Walk
- [ ] The Bookshop `hero` component renders; its heading/body are editable
      (keys `index:hero-1:heading` / `:body`).
- [ ] The locale-switcher FAB appears; switching to `ar` (added via the
      `ROSEY_LANGUAGES` env override, not `rosey.yml`) works.
- [ ] **Bookshop pause/resume** (src/bookshop.ts): switching locale does not
      leave Bookshop live-editing fighting the swap — component panels restore
      after the switch (no duplicated/oprhaned overlays), and editing a field
      after switching still updates the component.
- [ ] The crafted **stale** heading shows the amber outline; the body does not.
