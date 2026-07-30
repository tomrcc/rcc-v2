# Eleventy fixture — Visual-Editor checklist

Automated `verify-*.mjs` cover the `_site` build dir, both pages' keys, 3-layer
config, and client reachability. This list covers live-editor-only behaviour.

Two pages, one per 11ty editing style: `index.md` (Bookshop) and `regions.md`
(editable regions bound to frontmatter). Both load the client from
`/_rcc/client.mjs`.

## Setup
1. In `rcc-v2/`, run `npm run build`.
2. Open `test/fixtures/eleventy` as a CloudCannon site; enter the Visual Editor.
3. Console prints `RCC: loaded`, then — `data-rcc-verbose` is set on the boundary —
   `Discovered locales from manifest: ['fr','ar']` and `Ready — 2 locales, N elements`.
   If you only see `RCC: loaded`, one of `init()`'s early returns hit; the verbose
   log says which.

## Walk — `index.md` (Bookshop)
- [ ] **The original is editable**, not just the locales: click the hero heading
      with no locale selected and type — it saves to `content_blocks[0].heading`
      in frontmatter. This is what `bind: block` buys; with literal params in the
      tag there'd be nothing to write to and only the locale views would edit.
- [ ] The component panel opens and reordering/adding a block works (the array is
      real frontmatter, and new blocks get a `_uuid` from the blueprint's
      `instance_value: UUID` — without it keys fall back to the array index and
      shift on reorder).
- [ ] Keys are `index:hero-1:heading` / `:body`, from the block's own `_uuid`.
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
- [ ] The `body` region opens the multi-paragraph editor with a toolbar
      (`data-type="block"`), and `heading` opens a plain field with none.
- [ ] RCC's clone inherits that toolbar from the original via `prescanOriginals`,
      so the locale editors match the source editors.
- [ ] The sibling `<p>` with no `data-rosey` stays uneditable after a switch.
- [ ] Switching back to Original restores the frontmatter-bound values with no
      leftover `data-prop` attributes in the DOM.
