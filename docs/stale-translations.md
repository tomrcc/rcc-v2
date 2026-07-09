# Stale Translation Detection

When source text changes after a translation was last reviewed, the connector highlights out-of-date translations in the Visual Editor. This helps editors keep translations in sync with evolving content without losing track of what needs attention.

## How it works

Each locale entry stores three fields:

| Field | Role |
| --- | --- |
| `original` | The source text when the translation was last acknowledged or edited |
| `value` | The translated text |
| `_base_original` | The current source text from `base.json`, updated by `write-locales` on every build |

A translation is **stale** when the current source text differs from `original` — the source content has changed since the translation was last reviewed. The connector checks this two ways, and flags the translation if **either** fires:

- **Build signal** — `_base_original` (the source as of the last build) differs from `original`. This is persisted in the locale file, so it surfaces whenever the page is opened.
- **Live signal** — the source text on the page *right now* differs from `original`. This catches an in-session source edit **immediately**, before any save or rebuild has refreshed `_base_original`. (Reading `base.json` instead wouldn't help here — it's a build artifact of the same vintage as `_base_original`. The only pre-rebuild source of truth is the rendered page itself.)

Both comparisons normalize the HTML before comparing, to avoid spurious flags from insignificant serialization differences: Rosey's `base.json` extract and CloudCannon's editor serialize the same content differently (whitespace between tags, and tight vs loose markdown lists — `<li>x</li>` vs `<li><p>x</p></li>`). Normalization collapses that whitespace and unwraps single-paragraph list items so the two forms compare equal. Both comparisons are also skipped for entries with no `_base_original` (see [Opting out](#opting-out)).

### Example

A translator reviewed the title when it said "Welcome to Sendit" and entered a French translation:

```json
{
  "hero:title": {
    "original": "Welcome to Sendit",
    "value": "Bienvenue chez Sendit",
    "_base_original": "Welcome to Sendit"
  }
}
```

Later, an editor changes the English title to "Welcome to Sendit — Email Made Easy". The next build updates `_base_original` but leaves `original` untouched:

```json
{
  "hero:title": {
    "original": "Welcome to Sendit",
    "value": "Bienvenue chez Sendit",
    "_base_original": "Welcome to Sendit — Email Made Easy"
  }
}
```

Now `original !== _base_original`, so the connector flags this translation as stale.

## Visual indicators

When viewing a locale in the Visual Editor, stale translations show:

- **Amber dashed border** around the translatable element
- **Warning badge** in the corner of the element with a tooltip showing the old and new source text
- **Amber count badge** on the locale FAB showing the total number of stale translations for the current locale
- **Stale items panel** — each locale button in the popover has a toggle that opens a list of all stale translations, with per-item "Mark as reviewed" buttons and a "Resolve all" button

## Resolving stale translations

There are three ways to clear the stale indicator:

### 1. Edit the translation

Making any edit to the translation automatically updates `original` to match `_base_original`. The stale indicator disappears and the translator can adjust the text to reflect the new source content.

### 2. Mark as reviewed

Click the checkmark button next to a specific item in the stale panel. This updates `original` to match `_base_original` without changing the translation text — useful when the source change doesn't affect the translation (e.g. a typo fix in the English text that doesn't change the meaning).

### 3. Resolve all

Click "Resolve all" in the stale panel to mark every stale translation in the current locale as reviewed at once.

After any of these actions, the stale indicator is removed and won't appear again until the source text changes once more.

## Lifecycle

1. **Build time:** `write-locales` runs and sets `_base_original` to the current `base.json` original for every entry. It never modifies `original` or `value` on existing entries.
2. **Source changes (in session):** An editor changes the source text in the Visual Editor. The next time they view a locale, the **live signal** flags the affected translations as stale right away — no save or rebuild needed.
3. **Source changes (across builds):** When a source change is built, `write-locales` updates `_base_original`, creating a mismatch with `original`. The **build signal** then surfaces the staleness whenever the page is opened.
4. **Editor time:** Editing a translation, or marking it reviewed, sets both `original` and `_base_original` to the source text currently on the page, clearing staleness. (Writing both keeps the entry self-consistent even when resolving before a build; the next build's `_base_original` refresh reconciles harmlessly.)
5. **Review:** The editor sees the stale indicator and either edits the translation, marks it as reviewed, or resolves all.

## Opting out

Stale detection requires the `_base_original` field. If you're using your own script instead of `write-locales` and don't include `_base_original` on an entry, stale detection is skipped for that entry — no indicators will appear.

See [write-locales: Using your own script](write-locales.md#using-your-own-script-instead-of-write-locales) for details on the expected locale file format.
