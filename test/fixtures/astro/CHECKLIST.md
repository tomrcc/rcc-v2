# Astro fixture — Visual-Editor checklist

The automated `verify-*.mjs` scripts cover the build output. This list covers
what only the live editor can show (gated on `window.inEditorMode` +
`window.CloudCannonAPI`, CloudCannon's proprietary runtime — not reproducible
headlessly).

## Setup
1. In `rcc-v2/`, run `npm run build` (fresh `dist/`; the fixture symlink reflects
   it instantly — no reinstall needed).
2. Open `test/fixtures/astro` as its own CloudCannon site; enter the Visual Editor.
3. Open the browser console — it must print **`RCC: loaded`**.

## Walk
- [ ] The locale-switcher FAB appears (bottom corner).
- [ ] **Switch to `ar`** → the content flips to RTL (`dir="rtl"` on the swapped
      container); switch to `fr` → back to LTR.
- [ ] **Stale** (`/stale/`): only `stale:changed` shows the amber dashed outline
      and appears in the stale panel. `stale:uptodate` and `stale:untranslated`
      do **not**. `stale:untranslated` renders its source text in a normal editor
      (its `value` equals `original`) — no empty box.
- [ ] Resolve the stale item (✓ in the panel) → the amber clears and the panel
      count drops.
- [ ] **First translation** (`stale:untranslated`): type over the source text →
      `fr.json` takes it as `value`; `original`/`_base_original` stay English. The
      entry already existed, so this is the ordinary `set("<key>.value")` write.
- [ ] **Fresh translation** (`stale:fresh`): no locale entry at all — the postbuild
      strips it (`strip-fresh-key.mjs`), so this is the only place the
      create-a-new-entry path is reachable. It shows its source text (not an empty
      box), is editable, and is **not** stale. Type a translation → verbose logs
      show `creating new locale entry` and `fr.json` gains all three fields (source
      as `original` + `_base_original`). The next build strips the key again, so
      losing that entry is the scenario resetting, not a bug.
- [ ] **Duplicates** (`/duplicates/`): edit one `shared` paragraph → the other
      updates to match. The sibling with no `data-rosey` is **not** editable.
- [ ] **Nested** (`/nested/`): the deep element is editable and its key resolves
      to `nested:section:card:*` (verbose logs show it with `?data-rcc-verbose`).
- [ ] **Index** (`/`): the no-`data-rosey` paragraph is **not** editable.
- [ ] **Markdown** (`/markdown/`): open the `article` editable → the toolbar shows
      **every** configured button (bold/italic/underline/strike/sub/sup/code,
      formats, blockquote, lists, indent/outdent, link, image, table, hr,
      remove/copy format, undo/redo). Edit a nested list / table cell → rebuild
      → the entry is **not** falsely stale.
