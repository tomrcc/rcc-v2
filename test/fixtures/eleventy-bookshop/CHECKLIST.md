# Eleventy + Bookshop fixture — Visual-Editor checklist

Automated `verify-*.mjs` cover the `_site` build dir, Bookshop keys, 3-layer
config, and client reachability. This list covers live-editor-only behaviour.

Two pages, one per 11ty editing style: `index.md` (Bookshop) and `regions.md`
(editable regions bound to frontmatter). Both load the client from
`/_rcc/client.mjs`.

## Setup
1. In `rcc-v2/`, run `npm run build`.
2. Open `test/fixtures/eleventy-bookshop` as a CloudCannon site; enter the Visual Editor.
3. Console prints `RCC: loaded`, then — `data-rcc-verbose` is set on the boundary —
   `Discovered locales from manifest: ['fr','ar']` and `Ready — 2 locales, N elements`.
   If you only see `RCC: loaded`, one of `init()`'s early returns hit; the verbose
   log says which.

## Walk — `index.md` (Bookshop)
- [ ] The Bookshop `hero` component renders; its heading/body are editable
      (keys `index:hero-1:heading` / `:body`).
- [ ] The locale-switcher FAB appears; switching to `ar` (added via the
      `ROSEY_LANGUAGES` env override, not `rosey.yml`) works.
- [ ] **Bookshop pause/resume** (src/bookshop.ts): switching locale does not
      leave Bookshop live-editing fighting the swap — component panels restore
      after the switch (no duplicated/orphaned overlays), and editing a field
      after switching still updates the component.
- [ ] The crafted **stale** heading shows the amber outline; the body does not.

## Walk — `regions.md` (editable regions, no Bookshop)
- [ ] Both regions are editable as CloudCannon regions *and* switch locale with
      RCC (keys `regions:heading` / `regions:body`).
- [ ] The `data-editable="source"` body opens with the content toolbar, not a
      plain text field (`originalIsSource` + `data-type="block"`).
- [ ] The sibling `<p>` with no `data-rosey` stays uneditable after a switch.
- [ ] Switching back to Original restores the frontmatter-bound values with no
      leftover `data-prop` attributes in the DOM.
