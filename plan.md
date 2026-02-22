# Update rcc-v2 to Resolve Rosey Namespaces

## Problem

rcc-v2 reads `data-rosey` directly from each element (e.g., `hero:title`) and uses it as-is to build the `data-prop` path: `@data[locales_{locale}].hero:title.value`. But Rosey's namespace attributes on ancestor elements prefix child keys. A `data-rosey-root="index"` ancestor turns `hero:title` into the locale-file key `index:hero:title`. The generated `data-prop` won't match the locale file.

## How Rosey resolves namespaces

From the Rosey docs:

- `data-rosey-ns="x"` on an ancestor prepends `x:` to all child `data-rosey` keys (stacks with other ns ancestors).
- `data-rosey-root="x"` on an ancestor starts a fresh namespace root (ignores any further ancestors above it).
- Either attribute can appear on any element, not just `<main>`.

Example: `<main data-rosey-root="index">` containing `<section data-rosey-ns="hero">` containing `<h1 data-rosey="title">` produces the key `index:hero:title`.

## Design constraints

- Multiple elements on the same page can share the same local `data-rosey` value (e.g., two `data-rosey="title"` elements in different `data-rosey-ns` sections). The implementation must not rely on `querySelector` by local key.
- `data-rosey-root` / `data-rosey-ns` ancestors are never cloned/replaced — only leaf `[data-rcc]` elements are. This means `resolveRoseyKey` works correctly on clones after locale switching.

## Changes needed in `src/injector.ts`

### 1. Add `resolveRoseyKey` function

Mirrors Rosey's namespace resolution — walks up the DOM from the element, collecting `data-rosey-ns` values, stopping at `data-rosey-root`:

```ts
function resolveRoseyKey(el: Element): string | null {
  const localKey = el.getAttribute("data-rosey");
  if (!localKey) return null;

  const nsParts: string[] = [];
  let current = el.parentElement;

  while (current) {
    const root = current.getAttribute("data-rosey-root");
    if (root !== null) {
      if (root) nsParts.push(root);
      break;
    }
    const ns = current.getAttribute("data-rosey-ns");
    if (ns) nsParts.push(ns);
    current = current.parentElement;
  }

  nsParts.reverse();
  return [...nsParts, localKey].join(":");
}
```

### 2. Update `snapshotElements` to use resolved keys

Currently the snapshot Map is keyed by the raw `data-rosey` attribute. Change it to key by the fully resolved namespace key:

```ts
function snapshotElements(): void {
  snapshots.clear();
  const elements = document.querySelectorAll("[data-rcc]");
  elements.forEach((el) => {
    const resolvedKey = resolveRoseyKey(el);
    if (!resolvedKey) return;

    const parent = el.parentElement;
    if (!parent) return;
    const children = Array.from(parent.children);
    const index = children.indexOf(el);

    snapshots.set(resolvedKey, {
      outerHTML: el.outerHTML,
      parentSelector: buildParentSelector(el),
      index,
    });
  });
  log(`Snapshotted ${snapshots.size} translatable elements`);
}
```

No changes to the `ElementSnapshot` interface — `localRoseyKey` is not stored because we don't need it.

### 3. Update `switchLocale` to iterate DOM elements (not snapshots)

The old approach iterated the snapshot map and used `querySelector` to find each element by its `data-rosey` value. This breaks when multiple elements share the same local key in different namespaces.

New approach: iterate all `[data-rcc][data-rosey]` elements in the DOM, resolve each one's key, look up its snapshot, and clone-replace:

```ts
function switchLocale(locale: string | null): void {
  currentLocale = locale;

  const elements = document.querySelectorAll("[data-rcc][data-rosey]");
  elements.forEach((el) => {
    const resolvedKey = resolveRoseyKey(el);
    if (!resolvedKey) return;

    const snap = snapshots.get(resolvedKey);
    if (!snap) {
      warn(`No snapshot for resolved key "${resolvedKey}"`);
      return;
    }

    const clone = cloneFromHTML(snap.outerHTML);

    if (locale) {
      clone.setAttribute(
        "data-prop",
        `@data[locales_${locale}].${resolvedKey}.value`,
      );
    }

    el.parentNode?.replaceChild(clone, el);
  });

  log(`Switched to ${locale ?? "Original"}`);
  updateButtonStates();
}
```

**Why this works after repeated switches:** `querySelectorAll` returns a static NodeList (safe to mutate during iteration). After replacing an element with its clone, the clone retains `data-rosey` and `data-rcc` from the snapshot HTML. The namespace ancestor elements (`data-rosey-root`, `data-rosey-ns`) are never touched, so `resolveRoseyKey` resolves the same key on the clone as it did on the original.

## What does NOT change

- `ElementSnapshot` interface — no new fields needed.
- `init()` — still reads `data-locales` from `<main>`, unrelated to namespace resolution.
- `injectSwitcher()` — unchanged.
- `buildParentSelector()` — unchanged.
- Consumer projects — no changes needed. `data-rosey-root` / `data-rosey-ns` on ancestors and `data-rosey` on components work together seamlessly.

## Result

With these changes, `data-prop` will correctly resolve to the full namespaced key. For example, `<main data-rosey-root="index">` containing `<h1 data-rosey="hero:title" data-rcc>` will produce `@data[locales_fr].index:hero:title.value`.
