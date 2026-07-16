# rcc-v2 tests

Two layers, both offline and dependency-light (node built-ins only for the unit
tests; SSG CLIs for the fixtures). No Playwright / headless browser — the live
editor UI is gated on CloudCannon's proprietary runtime and is validated by hand
against each fixture's `CHECKLIST.md`.

## Unit tests — `npm run test:unit`

`node --test` over `test/unit/`. Pure logic behind the known false-stale bug:

- `write-locales.test.mjs` — entry creation, `_base_original` refresh, `<br>`/trim
  normalization, unused/empty pruning, key sorting, manifest (imports the public
  `./write-locales` node export).
- `rosey-config.test.mjs` — `resolveRoseyConfig`: flow/block YAML lists, comment
  stripping, quoting, env-over-file precedence (imports `./internals`).
- `normalize-source.test.mjs` — `normalizeSource` DOM-free paths: `<br>`→space,
  inter-tag collapse, trim (imports `./internals`).

`./internals` is a test-only node entry (`src/internals.ts`) that re-exports the
otherwise CLI-/DOM-bundled pure functions so node can import them without a DOM
shim.

## Integration — `npm run test:integration`

`test/run-integration.sh` loops `test/fixtures/*`. Per fixture: `npm i` (symlinks
the local `file:` build), `npm run build` (SSG build → `rosey generate` →
`write-locales` via `.cloudcannon/postbuild`), then `npm run verify`:

- `verify-bundle.mjs` — the local bundle is symlinked in (not `github:tomrcc/rcc-v2`)
  and still emits its switcher/stale/selector contract + version stamp.
- `verify-locales.mjs` — the locale JSON produced from a **real** Rosey `base.json`
  has the expected shape (three fields, refreshed stale entry, pruned unused,
  normalized `<br>`, manifest).

Fixtures:
- `fixtures/astro` — primary. Scenario pages (nested keys, duplicate keys,
  non-editable elements, intricate markdown + full toolbar, stale states), `ar`
  RTL + `fr`.
- `fixtures/eleventy-bookshop` — SSG-agnostic proof: `_site` build dir, the
  Bookshop pause/resume path, and 3-layer Rosey config resolution (rosey.yml +
  `ROSEY_LANGUAGES` env + `--source` flag).

> The build rewrites each fixture's checked-in `rosey/locales/*.json` in place —
> that is write-locales' real behavior (refresh `_base_original`, add/prune keys).
> A dirty working tree after a local run is expected; `git restore` the fixture's
> locale files to reset. CI runs on a fresh checkout, so it is unaffected.

## Manual Visual-Editor check

1. `npm run build` in `rcc-v2/` (fresh `dist/`; fixture symlinks reflect it).
2. Open a fixture as a CloudCannon site, enter the Visual Editor.
3. Console shows `RCC: v<version> loaded` (proves the local build).
4. Walk the fixture's `CHECKLIST.md`.
