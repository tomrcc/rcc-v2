# RCC-v2 test sites & lightweight test harness

> Design doc — **implemented**. See `test/README.md` for how to run everything. This file is
> kept as the rationale/decision record. All items in "Implementation order" (bottom) are done:
> `src/internals.ts` + tsup/exports wiring, the three unit tests, the Astro fixture, the
> `verify-*.mjs` + `run-integration.sh` pipeline, the lean Eleventy+Bookshop fixture, and CI
> (`.github/workflows/test.yml` + `.nvmrc`).

## Context

`rosey-cloudcannon-connector` (rcc-v2) is a client-side library + CLI that powers
multilingual Rosey sites in CloudCannon's Visual Editor. It currently has **no tests and no
test fixtures of any kind** — quality tooling is just Biome + `tsc`. Manual testing happens
against loose example sites in the workspace (`testing-rcc-v2`, `venture-rcc-v2-test`,
`multilingual-skills-tests/*`), and critically **all of those pull the package from
`github:tomrcc/rcc-v2`** — so they only ever exercise *pushed* commits, never local
uncommitted changes. The tsup config comment says this outright (`tsup.config.ts:6-8`).

Goal: inside the rcc-v2 repo, a small set of **test sites a developer can open in
CloudCannon's Visual Editor as a quick visual check after a code change**, plus a thin layer
of high-value automated tests. Modelled on the sibling `@cloudcannon/editable-regions` repo
(`test/integrations/<ssg>/` fixtures on `file:` deps, a `run-integration-tests.sh` loop, a
`verify-bundle.mjs` structural smoke test, CI = lint + typecheck + build; no Playwright).

Outcome: rebuild rcc-v2 → open a fixture in the editor → eyeball that translation switching,
stale detection, duplicate-key collapse, RTL, markdown toolbars, and non-editable elements
all still work — against the **local** build, with a node-level regression net around the
pure logic behind the known false-stale bug.

Decisions locked:
- **SSGs:** Astro (primary) **+** Eleventy/Bookshop (proves SSG-agnostic + `src/bookshop.ts`).
- **Layout:** a few focused pages per site, one scenario each (not one kitchen-sink page).
- **Automation:** node-only unit tests (`node:test`, zero deps) **+** an integration pipeline
  assert. No happy-dom, no Playwright.
- **Linking:** `file:` dependency (npm symlinks it) — npm install is now unblocked.

## Directory layout (all new, under `rcc-v2/`)

```
test/
  unit/                          # node:test, zero new deps
    write-locales.test.mjs
    rosey-config.test.mjs
    normalize-source.test.mjs
  fixtures/
    astro/                       # PRIMARY visual-check site (build dir: dist)
      package.json               # "rosey-cloudcannon-connector": "file:../../.."
      astro.config.mjs
      cloudcannon.config.yml
      .cloudcannon/postbuild
      .cloudcannon/schemas/
      src/layouts/Layout.astro   # dir=rtl for ar; conditional editor import
      src/pages/{index,nested,duplicates,markdown,stale}.astro (+ prose collection)
      src/data/*.json
      rosey/locales/{ar,fr}.json # hand-crafted stale / untranslated / up-to-date mix
      verify-locales.mjs
      verify-bundle.mjs
      CHECKLIST.md
    eleventy-bookshop/           # SSG-agnostic proof (build dir: _site) — deliberately lean
      package.json               # file: dep; @bookshop/*
      eleventy.config.mjs
      rosey.yml                  # + ROSEY_LANGUAGES env + CLI flag = 3-layer resolution
      cloudcannon.config.yml
      .cloudcannon/postbuild
      component-library/         # 1–2 Bookshop components with data-rosey
      src/…
      verify-locales.mjs
      CHECKLIST.md
  run-integration.sh
  README.md
```

## Scenario → location map

| Scenario | Where it lives |
|---|---|
| Rosey ids at depth (`root:ns:ns:key`) | `astro/src/pages/nested.astro` — nested `data-rosey-root` + `data-rosey-ns` wrappers (exercises `src/rosey-key.ts`) |
| Duplicate ids on one page (key collapse — edit one, both update) | `astro/src/pages/duplicates.astro` — same `data-rosey="…"` twice |
| Disabled / non-editable elements | same page — sibling text with **no** `data-rosey` (must stay uneditable) |
| Intricate markdown (nested lists, table, blockquote, code fence, inline code, link, image) | a `prose` collection entry rendered on `astro/`; body via `data-editable="source"`/markdown input |
| Markdown toolbar gets all its options | `astro/cloudcannon.config.yml` `_inputs`/`_editables` for that field with the full toolbar option set enabled — visually confirm every button appears |
| RTL locale | `ar` locale on **both** sites; `Layout.astro` sets `dir="rtl"` from active locale |
| Stale vs new vs up-to-date translations | hand-crafted `astro/rosey/locales/{ar,fr}.json` with 3 deterministic entries — (a) stale: `_base_original` ≠ `original`; (b) untranslated: `value` empty / `value === original`; (c) up-to-date — surfaced on `stale.astro` with labelled elements |
| SSG-agnostic + Bookshop + config layering | `eleventy-bookshop/` (build dir `_site`, `ROSEY_LANGUAGES` env + `rosey.yml` + `--source` flag; Bookshop pause/resume path in `src/bookshop.ts`) |

The Eleventy fixture stays minimal — it does **not** duplicate the markdown/toolbar
scenarios; its only job is the alternate build dir, the Bookshop code path, and 3-layer Rosey
config resolution.

## Local linking (the primary gap this closes)

Each fixture declares `"rosey-cloudcannon-connector": "file:../../.."` in its `package.json`
(fixture is 3 levels below the repo root). `npm install` in the fixture **symlinks**
`node_modules/rosey-cloudcannon-connector` → the repo root, so:
- the browser resolves the bare specifier `rosey-cloudcannon-connector` → `exports["."].import` → `dist/index.mjs` (already ESM, DOM target);
- `npx rosey-cloudcannon-connector write-locales` in `.cloudcannon/postbuild` → `bin` → `dist/cli/index.js`.

Because it's a **symlink**, rebuilding rcc-v2 (`npm run build` → fresh `dist/`) is immediately
reflected in the fixture — no copy/sync step, and install is only needed once (survives the
release-age block returning). `dist/` is gitignored, so fixtures' symlinks resolve after any
clone once `dist` is built. This is exactly editable-regions' `file:../../..` pattern. Confirm
the local bundle is live via the console `RCC: v<version> loaded` stamp (`__RCC_VERSION__`,
`tsup.config.ts:9-11`).

Rejected: committing `node_modules` (unneeded now install works); a copy-in script (extra
moving part); `npm link` / checked-in symlink (fragile across clones/OS); importing `dist`
directly (bypasses the `exports`/`bin` resolution the real editor uses).

**Known risk:** Astro/Vite's dep optimizer occasionally needs a symlinked dep listed in
`optimizeDeps.include` (or `ssr.noExternal`). editable-regions runs this pattern fine; if the
dynamic import misbehaves, add `rosey-cloudcannon-connector` to `optimizeDeps.include` in
`astro.config.mjs`. Verify during implementation.

## Automated tests (node built-ins only, no new deps)

### One small source change to make the pure logic reachable
Add a node-target tsup entry `src/internals.ts` that re-exports the pure functions we test:
`resolveRoseyConfig` (from `src/rosey-config.ts`) and `normalizeSource` (from `src/stale.ts`).
Add it as a 4th entry in `tsup.config.ts` (`platform: "node"`, esm) and an `"./internals"` key
in `package.json` `exports`. Rationale: `resolveRoseyConfig` is currently bundled only into the
CLI, and `normalizeSource` only into the DOM client bundle (importing that bundle in node risks
evaluating `document`); a tiny node entry makes both importable without a DOM shim.
`writeLocales` is **already** a public node export (`./write-locales` → `dist/write-locales.mjs`)
— no change needed there.

### Unit tests (`node --test test/unit/`) — three surfaces, each maps to a real bug
1. **`write-locales.test.mjs`** — import `writeLocales` from `../../dist/write-locales.mjs`, run
   it against a scratch tmp dir seeded with a `rosey/base.json` + existing locale files. Assert
   on generated `rosey/locales/*.json` + `dist/_rcc/locales.json`. Cover the exact logic behind
   the false-stale investigation (`src/write-locales.ts`): three-field entry creation;
   `_base_original` refresh on an existing entry; `normalizeStored` `<br/>`→`<br>` + outer-trim
   (`write-locales.ts:42`); unused-key pruning vs `keepUnused`; empty-source pruning only when
   `value` is also empty (`write-locales.ts:120-126`); key sorting; manifest contents. (Tests
   `normalizeStored` via the public `writeLocales` — no need to export the private helper.)
2. **`rosey-config.test.mjs`** — `resolveRoseyConfig` from `../../dist/internals.mjs`: flow vs
   block YAML lists, line-comment stripping, quoting, and env-over-file precedence
   (`src/rosey-config.ts`). This is the 3-layer resolution the Eleventy fixture leans on; the
   hand-rolled parser is where regressions hide.
3. **`normalize-source.test.mjs`** — `normalizeSource` from `../../dist/internals.mjs`, only the
   **DOM-free** inputs (no `<li>`, so `unwrapLooseListItems` early-returns): `<br>`→space fold,
   `>\s+<` inter-tag collapse, trim (`src/stale.ts:78-83`). Core of the false-stale fix.

**Deliberately not unit-tested:** `computeStale`, `stripToText`, `unwrapLooseListItems`,
`resolveRoseyKey` — their real behaviour is HTML round-tripping against CloudCannon's ProseMirror
serializer; a jsdom shim wouldn't reproduce it, so it'd be false confidence. Covered by the
integration fixture + manual checklist instead. Keeps us off jsdom entirely.

### Integration (`test/run-integration.sh`, mirrors editable-regions)
Loop the fixtures; per fixture run `npm i && npm run build` (build script chains the real
`.cloudcannon/postbuild`: SSG build → `rosey generate` → `npx … write-locales`), then run its
assert scripts (plain node, the `verify-bundle.mjs` pattern):
- **`verify-locales.mjs`** — highest-value automated coverage: asserts on the locale JSON
  produced from **real** Rosey `base.json` (three fields; stale entry's `_base_original`
  refreshed; unused/empty pruned; `<br>` normalized) and the `_rcc/locales.json` manifest.
- **`verify-bundle.mjs`** — greps the symlinked `dist/index.mjs` for a short emit-contract list
  (switcher/FAB markers, `data-rosey`/`-ns`/`-root` selectors, `__RCC_VERSION__` stamp) to prove
  the **local** bundle is wired in, not the github one.

**Out of scope:** Playwright / headless browser / screenshots. The live editor UI (FAB, switch,
inline editors, amber stale outline) is gated on `window.inEditorMode && window.CloudCannonAPI`
(`src/injector.ts`), CloudCannon's proprietary runtime — not reproducible headlessly. Validated
manually (below), same as editable-regions.

## Manual Visual-Editor check workflow

Each fixture ships `CHECKLIST.md`; `test/README.md` documents the loop:
1. `npm run build` in rcc-v2 (fresh `dist/`; symlink reflects it instantly).
2. Open the fixture as its own CloudCannon site, enter the Visual Editor.
3. Console shows `RCC: v<version> loaded` (proves local bundle).
4. Walk the checklist: FAB switcher appears → switch to `ar` (layout flips RTL) → `fr`; the
   crafted **stale** entry shows amber outline + appears in the stale panel while the up-to-date
   and untranslated ones don't; edit one **duplicate**-key element → the other updates; the
   **non-`data-rosey`** element is not editable; open the **markdown** field → all toolbar
   buttons present, edit a nested list/table → rebuild → **no false stale**; resolve a stale item
   → amber clears.

## package.json script additions (rcc-v2)

```jsonc
"typecheck": "tsc --noEmit",
"test:unit": "node --test test/unit/",
"test:integration": "bash test/run-integration.sh",
"test": "npm run test:unit && npm run test:integration"
// build unchanged: "rm -rf dist && tsup" (now also emits dist/internals.*)
```

## CI (`.github/workflows/test.yml`, new — mirrors editable-regions)

`on: push/pull_request → main`. Steps: checkout → setup-node (add `.nvmrc`) → `npm ci` →
`npm run biome` → `npm run typecheck` → `npm run build` → `npm run test:unit` →
`npm run test:integration`. CI's `npm i` inside `run-integration.sh` also proves the real
`file:` install path end-to-end.

## Seeding (build fresh, don't adopt wholesale)

The loose workspace sites are heavy templates that pull the github dep — adopting them imports
the exact gap we're closing. Instead, **seed** minimal fixtures from them and repoint to the
local dep:
- `test/fixtures/astro/` seeded from `multilingual-skills-tests/multilingual-skills-test-1`
  (already Astro with `es`/`ar` RTL wired) — trim to the scenario pages, swap dep to
  `file:../../..`, add the nested/duplicates/disabled/markdown/stale pages + full toolbar config
  + crafted `ar.json`/`fr.json`.
- `test/fixtures/eleventy-bookshop/` seeded from `venture-rcc-v2-test` (or
  `multilingual-skills-test-3`) — keep its 3-layer `rosey.yml` + `.cloudcannon/postbuild`, strip
  content to 1–2 Bookshop components.

## Critical files

- `src/write-locales.ts` — unit-test target (normalization/pruning/manifest)
- `src/rosey-config.ts` — unit-test target (`resolveRoseyConfig`)
- `src/stale.ts` — unit-test target (`normalizeSource`, DOM-free paths)
- `tsup.config.ts` + `package.json` — add `src/internals.ts` entry + `./internals` export + test scripts
- `src/injector.ts` — reference for the editor-mode gate + version stamp
- reference patterns (sibling repo): `editable-regions/run-integration-tests.sh`,
  `editable-regions/test/integrations/eleventy/verify-bundle.mjs`

## Verification

- `npm run test:unit` → the three node:test files pass.
- `npm run test:integration` → each fixture builds offline and its `verify-locales.mjs` /
  `verify-bundle.mjs` assertions pass.
- Manual: `npm run build`, open `test/fixtures/astro` in CloudCannon's Visual Editor, walk
  `CHECKLIST.md` (confirm `RCC: v… loaded`, RTL flip, stale-only amber, duplicate-key
  propagation, non-editable element, full markdown toolbar, no false stale after edit).
- Repeat the open-in-editor check for `test/fixtures/eleventy-bookshop` (Bookshop pause/resume +
  `_site` build dir + 3-layer config).

## Implementation order (start here next session)

1. **`src/internals.ts` + tsup/package.json wiring** — smallest change; unblocks the unit tests.
2. **Unit tests** (`test/unit/*.test.mjs`) + `test:unit` script — fast feedback, no fixtures needed.
3. **Astro fixture** seeded from `multilingual-skills-test-1`, repointed to `file:../../..`; build
   it, confirm `RCC: v… loaded` in the editor, then add the scenario pages one at a time.
4. **`verify-locales.mjs` / `verify-bundle.mjs` + `run-integration.sh`** for the Astro fixture.
5. **Eleventy+Bookshop fixture** seeded from `venture-rcc-v2-test`, trimmed.
6. **CI workflow** + `.nvmrc` last, once everything passes locally.
