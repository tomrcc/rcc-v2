# rcc-v2 tests

Two automated layers, plus a separate manual pass:

- **Unit** (`npm run test:unit`) — the pure locale/stale logic. Node built-ins, no deps.
- **Integration** (`npm run test:integration`) — real per-fixture builds that assert on
  the generated files. Headless; it never opens the editor.
- **Manual** — walking each fixture's `CHECKLIST.md` in CloudCannon's Visual Editor. The
  editor UI needs CC's runtime, so this pass is by hand (no Playwright) and is **not** part
  of the automated suite.

## Unit — `npm run test:unit`

`node --test` over `test/unit/` (rebuilds `dist` first):

- `write-locales.test.mjs` — entry creation, `_base_original` refresh, `<br>`/trim
  normalization, unused/empty pruning, sorting, manifest.
- `rosey-config.test.mjs` — `resolveRoseyConfig`: YAML flow/block lists, comments,
  quoting, env-over-file precedence.
- `normalize-source.test.mjs` — `normalizeSource` DOM-free paths.
- `false-stale.test.mjs` — the write→compare seam: a `<br>`/whitespace-only
  difference from a legacy `original` isn't stale; a real word change is.

Pure fns import from `./write-locales` (public) and `./internals` — a node entry
(`src/internals.ts`) that re-exports them without the DOM bundle. The DOM-bound
stale logic (`computeStale`, `unwrapLooseListItems`, …) is deliberately not
unit-tested: it hinges on real ProseMirror↔Rosey HTML round-tripping a shim can't
fake, so it's left to the fixtures + manual checklist rather than given false
coverage.

## Integration — `npm run test:integration`

`test/run-integration.sh` per fixture: `npm i` (symlinks the local `file:` build)
→ `npm run build` (SSG build → `rosey generate` → `write-locales`) →
`npm run verify`:

- `verify-bundle.mjs` — the symlinked local bundle (not `github:tomrcc/rcc-v2`)
  still emits its switcher/stale/selector contract + version stamp.
- `verify-locales.mjs` — locale JSON from a real `base.json`: three fields, the
  stale entry's `_base_original` refreshed to the live source, unused pruned,
  `<br>` normalized, manifest.

Fixtures (pages = markdown piped through a layout → a real CC collection):

- `astro` — primary: nested/duplicate keys, a non-editable element, markdown +
  full toolbar, stale states; `fr` + RTL `ar`.
- `eleventy-bookshop` — SSG-agnostic: `_site` dir, Bookshop render path, 3-layer
  config (rosey.yml + `ROSEY_LANGUAGES` env + `--source`).

> **Commit the fixture locale files only in their pre-build state** — stale entries
> with `_base_original === original`, `stale:removed_me` present, no build-added
> keys. That's what lets a fresh checkout *observe* the refresh/prune/create the
> build performs; committing post-build files makes the checks pass without
> exercising anything. The build rewrites them in place, so `git restore` after a
> local run (CI checkouts are clean, so unaffected).

## Build a fixture on CloudCannon

Each fixture runs as its **own** CloudCannon site — all pointed at this repo,
differing only by the build settings below. Create a site from the repo, then set
**Site Settings → Build**:

| Setting              | `astro`                                             | `eleventy-bookshop`                                             |
| -------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| Install command      | `cd test/fixtures/astro && npm i`                   | `cd test/fixtures/eleventy-bookshop && npm i`                  |
| Build command        | `cd test/fixtures/astro && npm run build`           | `cd test/fixtures/eleventy-bookshop && npm run build`         |
| Output path          | `test/fixtures/astro/dist`                          | `test/fixtures/eleventy-bookshop/_site`                       |
| Environment variable | `CLOUDCANNON_SYNC_PATHS=test/fixtures/astro/rosey/` | `CLOUDCANNON_SYNC_PATHS=test/fixtures/eleventy-bookshop/rosey/` |
| Config file path     | `test/fixtures/astro/cloudcannon.config.yml`        | `test/fixtures/eleventy-bookshop/cloudcannon.config.yml`      |

Then confirm that config file's `source:` scopes CloudCannon to the fixture dir —
`test/fixtures/astro` / `test/fixtures/eleventy-bookshop` respectively (already set,
so relative `path:`/`data_config` entries resolve). `CLOUDCANNON_SYNC_PATHS` syncs
the generated `rosey/` locale files back to git so translations persist across
builds.

## Manual check

Once the fixture site is building (above), open it in the Visual Editor, confirm
`RCC: v<version> loaded` in the console — proof the local build loaded — then walk
its `CHECKLIST.md`.
