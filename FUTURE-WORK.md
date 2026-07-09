# Future Work / Agent Backlog

Maintainer notes and follow-up ideas for the Rosey CloudCannon Connector (v2). Each item has enough context to be picked up cold. Authoritative CloudCannon Visual Editor / `@cloudcannon/editable-regions` API reference lives in the workspace at `../.claude/skills/cloudcannon-visual-editing/` (start with `editable-regions-internals.md`).

---

## Current status (2026-06-24)

Landed/uncommitted changes for in-editor translation of evolving content:

1. **Missing-entry editing** — committed (`f4f40e0`). Elements whose Rosey key has no locale entry are now editable instead of dimmed; the first edit writes a full `{ original, value, _base_original }` entry (`_base_original` seeded from the page source).
2. **Immediate (live-DOM) stale detection** — uncommitted. Stale is now `baseStale || liveStale`, both whitespace-normalized via `normalizeSource()` and gated on `_base_original` presence. `resolveStale()` writes both `original` and `_base_original` from the on-page source.
3. **Untranslated indicator** — uncommitted. Teal dotted border + teal FAB count for elements with no entry or `value === original`; takes precedence over amber stale (`src/injector.ts` Phase 1 + `markUntranslatedElement`/`refreshUntranslated`).
4. **Build banner** — uncommitted. `init()` logs `RCC: v<version> loaded (built <ts>)` always-visible; `__RCC_VERSION__`/`__RCC_BUILD__` injected via `tsup.config.ts` `define`.

**Build-pickup gotcha (verifying in CC):** the test sites depend on `"rosey-cloudcannon-connector": "github:tomrcc/rcc-v2"`, so a CC rebuild only serves **committed + pushed** code (dist is committed; no install-time build). After `npm run build`, **commit + push** (and bump the pinned commit if a lockfile pins it) before rebuilding in CC; the build banner's timestamp confirms CC loaded the new code. For fast local iteration, temporarily point a test site at `file:../rcc-v2`.

### RESOLVED (2026-06-24) — new array items got a stale DUPLICATE `data-rosey-ns` in-session

**Symptom:** adding/reordering an item in an array nested inside a registered component (e.g. `testimonials` inside the Testimonial block) gave the new item a *stale, duplicated* `data-rosey-ns` until the editor was reloaded — colliding keys and breaking new-content translation (#4) and go-stale (#3). The correct `_uuid` was in the data immediately; only the DOM attribute was stale, because CloudCannon adds items by **cloning a sibling's DOM** rather than re-rendering the parent.

**Fix (authoring — confirmed working in CC):** make each array item its own **registered component** so CloudCannon renders it directly. Put `data-component="<registered-name>"` on the `data-editable="array-item"` element, and put `data-rosey-ns={item._uuid}` on the item component's own root. That single `data-component` is the whole fix — **no** `data-component-key` / `data-id-key` / `<template>` / `data-prop-*` binding needed for a uniform sub-array. (Verified on `testing-rcc-v2`: extracted `testimonial-item.astro`, registered `global/testimonial-item`, `data-component` on the array-item; new/reordered items now carry their own UUID ns.) Documented in `skills/make-site-multilingual/astro.md` § "Content-Block Namespacing — put rosey attributes inside the item component" (and §3g of that skill's `SKILL.md`) and `docs/tagging-content.md`.

**Dead ends (for the record):** `data-prop-data-rosey-ns="_uuid"` binding does NOT work — CC doesn't honour `data-prop-*` for arbitrary attributes like `data-rosey-ns` on array-items. A connector-side "read `_uuid` from the API" fallback is unreliable because the cloned DOM and the data are order-desynced (no DOM→data-row handle on the fresh clone). The authoring fix sidesteps both.

---

## Backlog

### 1. Replace `_base_original` + `_rcc/locales.json` by reading the API directly
**Why:** Two pieces of denormalized build-time state exist only because the client historically couldn't read the source/build data itself.
- `_base_original` is a copy of `base.json[key].original`, written into every locale file by `write-locales`.
- `_rcc/locales.json` is a manifest the client fetches to discover configured locales (and is the reason the postbuild needs the `--exclusions "\.(html?)$"` override).

**Approach:**
- **Locale discovery:** once CloudCannon exposes a plural `datasets()` on the JS API (today only `dataset(key)` exists — see `CCApi` in `injector.ts` and the API reference), discover locales by listing datasets and filtering names matching `locales_*`, taking the `*` segment. Removes `discoverLocales()`/`fetch("/_rcc/locales.json")` and the exclusions override. Make the `locales_` prefix configurable (see item 5) rather than hardcoded.
- **`_base_original`:** the live-DOM stale signal (item in "Current status") already covers in-editor immediacy, so `_base_original` is now only the *persisted/cross-session* signal. It could be dropped if the client reads `base.json` via a `data_config` entry (`api.dataset("rosey_base")`) and compares `base[key].original` vs `original` instead. **Caveat:** base.json is a build artifact of the *same vintage* as `_base_original` — this is a simplification (less duplicated state), NOT a freshness gain. Keep `_base_original` for now; it's also what external translation tooling may rely on in the locale files.

### 2. Use `File.getInputConfig({ slug })` instead of the CustomEvent dance
**Where:** `prescanOriginals()` / `fetchInputConfig()` in `injector.ts`.
**Now:** input config is fetched by dispatching a `cloudcannon-api` CustomEvent with `action: "get-input-config"` and racing a 200ms timeout.
**Better:** the documented File interface exposes `getInputConfig({ slug })` directly (see `editable-regions-internals.md` → File Interface). Switching to it removes the event plumbing and the timeout guesswork. Verify the slug it expects maps to what we have (the original element's `data-prop`, not the Rosey key).

### 3. Recompute staleness on external `change` events
**Where:** `activeDatasetListener` in `switchLocaleInner()`.
**Gap:** the dataset `change` listener only re-runs `setContent` on editors; it does not re-evaluate `t.stale` when `original`/`value`/`_base_original` change from *outside* this editor (another tab, an AI/agency script writing locale files, the Data Editor). Local edits clear staleness correctly (via `resolveStale`), but externally-introduced staleness won't appear until the next locale switch. `change` events are coarse (don't say which key changed) and fire for our own writes, so any fix must re-read all keys and guard against echo loops. Recompute the `baseStale || liveStale` check per tracked element and call `markStaleElement`/`unmarkStaleElement` + `recountStale`.

### 4. Guard against Rosey keys containing a literal `.`
**Why:** CloudCannon data slugs use `.` as the path separator (`"a.b"` ⇒ `{a:{b}}`). The connector addresses entries as `${roseyKey}.value`, `${roseyKey}._base_original`, and writes whole entries at `slug: roseyKey`. Colon-namespaced keys (`hero:title`) are safe — the colon is a literal property-name char. But a key with a dot (`data-rosey="hero.title"`) would be split into a nested path and silently write to the wrong place. This is pre-existing, not introduced by recent work.
**Approach:** detect dots in resolved Rosey keys and `warn()` (or document the constraint prominently in `tagging-content.md`). Don't silently break.

### 5. Read connector config from `rosey.yml`
**Why (from `rcc-notes.md`):** the tag name (`data-rosey`) and the locale-dataset naming (`locales_*`) are hardcoded. Rosey's own config already configures things like the tag, source dir, and languages.
**Done (build-time):** `src/rosey-config.ts` is a zero-dep reader for `rosey.{yaml,yml,json}` (`.toml` skipped — no parser) plus `ROSEY_*` env vars, resolving with Rosey's precedence (CLI flag > env > file). Key mapping: Rosey `source`→build dir, `languages`→locale codes, `locales`→locale-files dir, `default_language`, `tag`, `separator`. Wired into `write-locales` (dest←`source`, locales←`languages`, roseyDir←dir of `locales`) and the `init` wizard (prompt defaults). `tag`/`separator` are read but not yet consumed.
**Remaining (client-side):** the injector still hardcodes the `data-rosey` tag and `:` separator, and locale-dataset naming (`locales_*`) — these can't read `rosey.yml` at runtime, so they'd need the resolved `tag`/`separator` surfaced via the build-time manifest (`_rcc/locales.json`) and read by `resolveRoseyKey()` / selectors. Feeds item 1's discovery.

### 6. Live-stale normalization is text-oriented
**Where:** `normalizeSource()` in `stale.ts`.
**Now:** collapses whitespace runs + trims, then compares as strings. Good for plain text and simple inline markup; intentionally errs toward false-negatives (the build signal is the backstop).
**Watch for:** if `data-rosey` is used on richer HTML blocks, attribute-order or markup-only differences between the live `innerHTML` and the stored/base.json `original` could cause false positives, or markup-only source changes could be missed. If rich-HTML tagging grows, consider comparing `textContent` or a structural normalization.

### 7. Elegance refactors deferred from pre-ship review (2026-07-09)
Catalogued during the pre-ship code review; deferred to avoid churn right before prod.
- **Decompose `injectSwitcher`** (`ui/switcher.ts`, ~490 lines) into `createFab` / `createPopover` / `createStalePanel` / `setupDrag`, and extract the shared viewport-clamp positioner used by both `positionPopover` and `positionStalePanel`.
- **Move `updateStaleList`'s DOM construction** (`stale.ts`) into `src/ui/`, leaving `stale.ts` as pure logic. Consider consolidating the switcher's inline `Object.assign(style, …)` into a stylesheet like `hide-controls.ts`.
- **Re-key correctness gap:** `createTextEditableRegion` has no `destroy()`, so a re-keyed element keeps its editor bound to the old key (`injector.ts` `reconcileElement`, currently only logged).
- **Partial-failure hardening:** early returns after `pauseBookshop()` / the post-clone-swap in `switchLocaleInner` can leave Bookshop paused or the page showing a hidden-controls clone with no editors; add recovery/teardown on those paths.
- **Simplify `forceBookshopRerender`** (`bookshop.ts`) — the rAF-vs-`setTimeout` branching is hard to follow.
- **`logger.isVerbose()` memoizes on first call** — if `data-rcc-verbose` is added after init, verbose never turns on. Re-check per call or document.

---

## Open questions carried from `rcc-notes.md`
- ~~Confirm the staging-vs-production editing story and correct the docs if the "incompatible with staging" claim is wrong.~~ **Done (2026-07-09):** `docs/incremental-translation.md` now states the connector needs the locale files + manifest (`write-locales`), not the full `rosey build`, on the editing branch.
- Verify `data-rosey-attr` / `data-rosey-attr-value` semantics (attr value links to a Rosey key, not a literal) before leaning on it in docs.
