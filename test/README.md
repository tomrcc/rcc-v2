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

- `verify-bundle.mjs` — three things. The installed bundle is byte-identical to the
  repo's `dist/index.mjs` (⇒ local changes under test, not `github:tomrcc/rcc-v2`;
  holds whether npm symlinked or copied, and catches a rebuild landing after the
  fixture's `npm i`). It still emits its switcher/stale/selector contract. And the
  client is reachable from the built pages — `eleventy-bookshop` reads the
  `import()` URL out of the emitted HTML and resolves it against `_site`, `astro`
  requires a bundled chunk under `dist/` containing the client. Without that last
  one, both fixtures pass with a `<script>` that 404s, which in the editor is
  indistinguishable from a broken editor.
- `verify-locales.mjs` — locale JSON from a real `base.json`: three fields, the
  stale entry's `_base_original` refreshed to the live source, unused pruned,
  untranslated preserved, `<br>` normalized, manifest, and `stale:fresh` absent
  from every locale file (the missing-entry scenario the postbuild re-opens).

Fixtures (pages = markdown piped through a layout → a real CC collection):

- `astro` — primary: nested/duplicate keys, a non-editable element, markdown +
  full toolbar, stale states, a key with no locale entry; `fr` + RTL `ar`.
- `eleventy-bookshop` — SSG-agnostic: `_site` dir, 3-layer config (rosey.yml +
  `ROSEY_LANGUAGES` env + `--source`), and the non-bundled client delivery path
  (`install-client` → `/_rcc/client.mjs`, no Eleventy config for it). Two pages,
  one per 11ty editing style: `index.md` (Bookshop components) and `regions.md`
  (CloudCannon editable regions bound to frontmatter, no Bookshop).

`npx @bookshop/generate` in the eleventy fixture's postbuild exits 1 locally — it
augments `_cloudcannon/info.json`, which CloudCannon writes during its own build,
so on a dev machine it has nothing to attach to. The postbuild tolerates that so
the Rosey steps still run; on CloudCannon it succeeds and is what makes the
Bookshop component editable.

> **Commit the fixture locale files only in their pre-build state.** That's what
> lets a fresh checkout *observe* the refresh/prune/create the build performs;
> committing post-build files makes the checks pass without exercising anything.
> The build rewrites them in place, so `git restore` after a local run (CI
> checkouts are clean, so unaffected). `CLOUDCANNON_SYNC_PATHS` commits post-build
> locale files back too, so an `Updated N files via CloudCannon` commit will retire
> these invariants unless you restore them. For `astro` they are:
>
> | Pre-build state | Build behaviour it exposes |
> | --- | --- |
> | `stale:changed._base_original === original` | refreshed away from `original` → base-stale |
> | `markdown:article._base_original === original` (space-collapsed form) | same, over HTML |
> | `stale:removed_me` present | pruned (not in `base.json`) |
> | `nested:section:card:body` absent | created with `value` = source |
>
> `stale:fresh` is the inverse and needs no upkeep — `strip-fresh-key.mjs` deletes
> it after write-locales on every build, so it stays absent whatever gets synced back.
>
> For `eleventy-bookshop`:
>
> | Pre-build state | Build behaviour it exposes |
> | --- | --- |
> | `index:hero-1:heading._base_original === original` (`"Old bookshop heading."`) | refreshed to the live source → base-stale |
> | `index:hero-1:body._base_original === original` | stays equal → not stale (the control) |
> | `regions:heading` present with its French `value` | committed translation survives the merge |
> | `regions:body` absent | created with `value` = source, over an HTML string |
>
> The failure mode to watch for: a `_base_original` committed in its *post*-build
> state makes the stale-refresh assertion pass on a fresh checkout without the
> build doing anything.

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
`RCC: loaded` in the console, then walk its `CHECKLIST.md`.
