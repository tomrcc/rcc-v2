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

### OPEN — new array items get a stale DUPLICATE `data-rosey-ns` in-session (diagnosed 2026-06-24)
**Root cause (confirmed by live VE diagnostics):** when adding an array item, CC **clones the last rendered item's DOM** — which has the build-time `data-rosey-ns={t._uuid}` baked in — instead of the `<template>` blueprint. So the new item inherits the *previous* item's UUID ns (a duplicate), its key collides with that sibling's entry, and writes (#4) + go-stale (#3) misbehave. The new item's **correct `_uuid` IS in the data immediately** (`currentFile().data.get()` shows a real UUID for it); only the DOM attribute is stale. Navigate-out-and-back fixes it because the editor re-renders from data (client-side SSR, NOT a rebuild), re-running the map expression with the real `_uuid`.

Evidence: 4 testimonials, DOM ns = `[t-pete, t-dolly, t-simon, t-simon]` (last is the new clone) while data `_uuid` = `[t-pete, ee90e752-…(new), t-dolly, t-simon]`. `data-prop-data-rosey-ns` was `null` on all rendered items (binding only in `<template>`, which CC didn't use).

**Candidate A (authoring):** add `data-prop-data-rosey-ns="_uuid"` to the **rendered** mapped array items (keep build-time `data-rosey-ns={t._uuid}` for the static build / base.json / production), mirroring how rendered `<img>` carry `src` + `data-prop-src`. Then a cloned item carries the binding and CC re-stamps ns from the new `_uuid`. **Residual unknown:** whether CC honours `data-prop-<attr>` for an arbitrary attr (`data-rosey-ns`) on an array-item, or only known image attrs — verify in CC (does a new item's image come through live?).
**Candidate B (connector-side fallback):** since `_uuid` is in the data immediately, the connector reads it via the API (map array-item element → data path via the `data-prop` chain on the original DOM, before the clone strips `data-prop`) and resolves the key from `_uuid` rather than the possibly-stale DOM ns. More robust, more complex. Use if A fails.

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
**Why (from `rcc-notes.md`):** the tag name (`data-rosey`) and the locale-dataset naming (`locales_*`) are hardcoded. Rosey's own `rosey.yml` already configures things like the tag and source dir.
**Approach:** read `rosey.yml` (it's a source file, reachable at build time by the CLI; the client may need it surfaced via a manifest or data_config) for:
- the configured tag/key attribute → drive what `resolveRoseyKey()` / selectors look for instead of assuming `data-rosey`.
- an (unofficial) locales list and/or the `data_config` prefix → feeds item 1's discovery.

### 6. Live-stale normalization is text-oriented
**Where:** `normalizeSource()` in `injector.ts`.
**Now:** collapses whitespace runs + trims, then compares as strings. Good for plain text and simple inline markup; intentionally errs toward false-negatives (the build signal is the backstop).
**Watch for:** if `data-rosey` is used on richer HTML blocks, attribute-order or markup-only differences between the live `innerHTML` and the stored/base.json `original` could cause false positives, or markup-only source changes could be missed. If rich-HTML tagging grows, consider comparing `textContent` or a structural normalization.

---

## Open questions carried from `rcc-notes.md` / `docs-notes.md`
- Confirm the staging-vs-production editing story for the Connector (collection URL prefixing, no env vars in CC config) and correct the docs if the "incompatible with staging" claim is wrong.
- Verify `data-rosey-attr` / `data-rosey-attr-value` semantics (attr value links to a Rosey key, not a literal) before leaning on it in docs.
