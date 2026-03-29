# External Integrations

The connector's locale files are flat JSON with a stable, predictable structure. This makes them a natural integration point for external translation services, custom middleware, and CI automation. This guide covers patterns for plugging into the pipeline.

## The integration model

Every tool in the stack — `write-locales`, Rosey, your custom scripts, external APIs — reads and writes the same set of locale JSON files in `rosey/locales/`. There's one file per locale, one format, and one place to look:

```json
{
  "hero:title": {
    "original": "Welcome to Sendit",
    "value": "Bienvenue chez Sendit",
    "_base_original": "Welcome to Sendit"
  }
}
```

The three fields give any tool enough context to act:

- **`value === original`** → untranslated (needs translation)
- **`original !== _base_original`** → stale (source text changed since last translation)
- **`value !== original` and `original === _base_original`** → translated and up to date (leave it alone)

This is the entire interface. Any script that can read JSON, make decisions based on these three fields, and write JSON back is a valid integration.

### Pipeline overview

The standard CloudCannon postbuild runs three steps:

```
rosey generate  →  write-locales  →  rosey build
     ↓                  ↓                 ↓
  base.json      locale JSON files    translated site
```

Your middleware slots in around `write-locales` — before it, after it, or in place of it. Everything downstream (Rosey's build step, the connector's Visual Editor runtime) just reads the locale JSON files and doesn't care how they got there.

## Pipeline insertion points

### After `write-locales` (most common)

Let `write-locales` handle key syncing (adding new entries, removing stale ones, updating `_base_original`), then run your script on the resulting locale files. This is the simplest pattern — you get clean, up-to-date files and only need to fill in translations.

```bash
#!/usr/bin/env bash
npx rosey generate --source dist
npx rosey-cloudcannon-connector write-locales --source rosey --dest dist

# Your middleware runs here — locale files are synced and ready
node scripts/translate-empty-values.mjs

mv ./dist ./_untranslated_site
npx rosey build --source _untranslated_site --dest dist --default-language en --default-language-at-root --exclusions "\.(html?)$"
```

### Before `write-locales`

Pull translations from an external source into the locale files first, then let `write-locales` run. `write-locales` preserves existing `original` and `value` fields on entries it finds — it only adds new keys and updates `_base_original`. So externally-provided translations survive the sync.

```bash
#!/usr/bin/env bash
npx rosey generate --source dist

# Pull translations from your TMS before write-locales runs
node scripts/pull-from-tms.mjs

npx rosey-cloudcannon-connector write-locales --source rosey --dest dist
mv ./dist ./_untranslated_site
npx rosey build --source _untranslated_site --dest dist --default-language en --default-language-at-root --exclusions "\.(html?)$"
```

### Replace `write-locales` entirely

If your workflow doesn't need `write-locales` at all, replace it with your own script. See [write-locales: Using your own script](write-locales.md#using-your-own-script-instead-of-write-locales) for the five requirements the connector expects (flat JSON structure, `original`/`value`/`_base_original` fields, locale manifest, and `data_config` entries).

## Machine translation example

A generic pattern for filling untranslated entries via an external API. This works with any translation service — swap `translateBatch()` for your provider's SDK.

```javascript
// scripts/translate-empty-values.mjs
import { readFileSync, writeFileSync, readdirSync } from "fs";

const LOCALES_DIR = "rosey/locales";
const TARGET_LANG = { "fr.json": "fr", "de.json": "de" };

for (const file of readdirSync(LOCALES_DIR)) {
  if (file.endsWith(".urls.json") || !file.endsWith(".json")) continue;

  const lang = TARGET_LANG[file];
  if (!lang) continue;

  const path = `${LOCALES_DIR}/${file}`;
  const locale = JSON.parse(readFileSync(path, "utf-8"));

  // Collect untranslated and stale entries
  const toTranslate = Object.entries(locale).filter(([, entry]) => {
    const untranslated = entry.value === entry.original;
    const stale = entry.original !== entry._base_original;
    return untranslated || stale;
  });

  if (toTranslate.length === 0) continue;

  // Batch translate — replace this with your provider's API
  const sources = toTranslate.map(([, entry]) => entry._base_original);
  const translated = await translateBatch(sources, "en", lang);

  for (let i = 0; i < toTranslate.length; i++) {
    const [key] = toTranslate[i];
    locale[key].value = translated[i];
    locale[key].original = locale[key]._base_original;
  }

  const sorted = Object.fromEntries(
    Object.entries(locale).sort(([a], [b]) => a.localeCompare(b))
  );
  writeFileSync(path, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`Translated ${toTranslate.length} entries in ${file}`);
}
```

Run this after `write-locales` in your postbuild. Note that it also handles stale entries — when the source text has changed, it re-translates using `_base_original` (the current source) and updates `original` to mark it as reviewed.

The early `continue` when `toTranslate.length === 0` is important — it means the script makes zero API calls when there's nothing to translate. This makes it safe to include in every postbuild without adding latency to routine content edits.

## External TMS integration (Crowdin, Phrase, Smartling, etc.)

Translation Management Systems work with the locale files through a two-way sync:

### Push new keys to the TMS

After `write-locales` runs, push new or changed keys to your TMS for professional translators to work on:

```bash
# In postbuild, after write-locales
node scripts/push-to-tms.mjs
```

Your push script reads the locale files, identifies entries that need translation (`value === original` or stale), and sends them to the TMS API. Most TMS platforms accept JSON key-value imports natively — the flat structure of locale files maps directly.

### Pull translations from the TMS

Before or after `write-locales`, pull completed translations back:

```bash
# In postbuild, before write-locales (so write-locales preserves them)
node scripts/pull-from-tms.mjs
npx rosey-cloudcannon-connector write-locales --source rosey --dest dist
```

Your pull script fetches completed translations from the TMS API and writes them into the locale JSON files. Running `write-locales` afterwards adds any new keys and updates `_base_original` without overwriting the translations you just pulled.

### Two-way flow

The typical TMS workflow:

1. Editor updates source content in CloudCannon → commits to git
2. Postbuild runs `write-locales` → new keys appear in locale JSON
3. Push script (in the same postbuild) sends new keys to the TMS
4. Professional translators work in the TMS
5. On next build, pull script fetches completed translations back into locale JSON
6. Rosey builds the translated site

The locale files in git are the single source of truth. The TMS is a tool that fills in values — it doesn't own the file structure or key inventory.

## Validation and QA middleware

Run a validation step after translation to catch issues before they reach the live site:

```javascript
// scripts/validate-translations.mjs
import { readFileSync, readdirSync } from "fs";

const LOCALES_DIR = "rosey/locales";
let errors = 0;

for (const file of readdirSync(LOCALES_DIR)) {
  if (!file.endsWith(".json") || file.endsWith(".urls.json")) continue;

  const locale = JSON.parse(readFileSync(`${LOCALES_DIR}/${file}`, "utf-8"));

  for (const [key, entry] of Object.entries(locale)) {
    if (entry.value === entry.original) continue; // skip untranslated

    // Check that HTML tags in the original are preserved in the translation
    const originalTags = (entry._base_original.match(/<[^>]+>/g) || []).sort();
    const valueTags = (entry.value.match(/<[^>]+>/g) || []).sort();
    if (JSON.stringify(originalTags) !== JSON.stringify(valueTags)) {
      console.error(`[${file}] ${key}: HTML tag mismatch`);
      errors++;
    }
  }
}

if (errors > 0) {
  console.error(`\n${errors} validation error(s) found`);
  process.exit(1);
}
```

Add this after your translation step in the postbuild. A non-zero exit code fails the CloudCannon build, preventing broken translations from going live. Extend with your own checks — placeholder preservation, max length for UI strings, forbidden characters, etc.

## Scheduling translation with CI

Translation scripts belong in the postbuild — they have access to the freshly built site, the locale files, and the full Node environment, all in a single predictable pipeline. But the postbuild runs on *every* CloudCannon build, including routine content edits. If your translation script is smart about skipping (see [Machine translation example](#machine-translation-example) — exit early when there's nothing to translate), this is fine. But you may still want explicit control over *when* translation runs — nightly batches, weekly syncs, or on-demand triggers rather than on every save.

This is where CI shines. Not for running the translation itself, but for **controlling when a build happens** — and therefore when the postbuild (with your translation step) runs.

### How CloudCannon and git work together

Every edit in CloudCannon is a git commit. Every git commit triggers a CloudCannon rebuild. The postbuild runs as part of that rebuild. This means:

- A CI job that commits to the repo triggers a CloudCannon rebuild automatically
- A CI job that triggers a CloudCannon build via API runs the postbuild (including translation) on CloudCannon's infrastructure
- Translation results committed by the postbuild flow back into git and are available to the next build

The git repo is the single source of truth at every step. CloudCannon, your translation scripts, and CI all work with the same files.

### GitHub Actions example: scheduled rebuilds

Use a cron job to trigger a CloudCannon rebuild on a schedule. The rebuild runs the full postbuild — including your translation step:

```yaml
# .github/workflows/translate.yml
name: Scheduled translation build

on:
  schedule:
    - cron: "0 3 * * *" # Nightly at 3am UTC
  workflow_dispatch: # Manual trigger

jobs:
  trigger-build:
    runs-on: ubuntu-latest
    steps:
      # Option A: trigger via CloudCannon API
      - name: Trigger CloudCannon build
        run: |
          curl -X POST "https://api.cloudcannon.com/api/v1/sites/${{ secrets.CC_SITE_ID }}/builds" \
            -H "Authorization: Bearer ${{ secrets.CC_API_KEY }}"

      # Option B: push a no-op commit to trigger a rebuild via git
      # - uses: actions/checkout@v4
      # - name: Trigger rebuild
      #   run: |
      #     git config user.name "github-actions[bot]"
      #     git config user.email "github-actions[bot]@users.noreply.github.com"
      #     git commit --allow-empty -m "Trigger scheduled translation build"
      #     git push
```

The round-trip:

1. Editors update content in CloudCannon throughout the day → commits to git
2. Each build runs `write-locales`, adding new keys to locale JSON. Translation script skips (nothing new to translate, or you choose not to run it on every build).
3. Nightly CI triggers a rebuild → postbuild runs `write-locales` + translation script → new translations are committed
4. CloudCannon rebuilds with the translated site live

### Event-driven triggers

Instead of (or alongside) a schedule, trigger a rebuild when locale files change:

```yaml
on:
  push:
    paths:
      - "rosey/locales/**"
    branches:
      - main
```

### Gating translation with environment variables

If you want the translation script in your postbuild but only want it to run on scheduled builds (not every content edit), gate it with an environment variable:

```bash
#!/usr/bin/env bash
npx rosey generate --source dist
npx rosey-cloudcannon-connector write-locales --source rosey --dest dist

# Only run translation when explicitly triggered
if [ "$RUN_TRANSLATION" = "true" ]; then
  node scripts/translate-empty-values.mjs
fi

mv ./dist ./_untranslated_site
npx rosey build --source _untranslated_site --dest dist --default-language en --default-language-at-root --exclusions "\.(html?)$"
```

Set `RUN_TRANSLATION=true` as a build environment variable on your scheduled CI trigger, or configure it in CloudCannon's site settings for specific build contexts.

That said, the simplest approach is usually to skip the env var entirely and let the translation script run on every build with smart skipping — if there's nothing to translate, it exits instantly and adds no meaningful latency.

## Further reading

- [write-locales CLI](write-locales.md) — full reference for `write-locales`, including the [contract for custom scripts](write-locales.md#using-your-own-script-instead-of-write-locales)
- [AI-Powered Translation](ai-translation.md) — using AI coding agents and LLMs for translation
- [Incremental Translation](incremental-translation.md) — strategies for rolling out translations progressively
- [Stale Translation Detection](stale-translations.md) — how the `_base_original` field powers stale detection
