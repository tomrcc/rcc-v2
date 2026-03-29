# AI-Powered Translation

Rosey locale files are designed to be AI-friendly. Their flat JSON structure, predictable three-field entries, and namespace-rich keys make them an ideal target for automated translation — whether through an AI coding agent, a custom script, or a manual LLM workflow.

## Why Locale Files Work Well with AI

Traditional translation workflows have a cold-start problem: every build cycle, a translator (human or machine) faces the entire site's text and must figure out what's new, what's changed, and what's already done. Rosey locale files solve this structurally:

### Incremental by design

When `write-locales` creates a new entry, it sets `value` to the English original. Untranslated entries are instantly detectable by comparing `value` to `original` — no diffing, no external state, no tracking database. An AI agent translates only what's new and leaves everything else untouched.

### Stale detection built in

Each entry carries three fields:

```json
{
  "hero:title": {
    "original": "Welcome to Sendit",
    "value": "Bienvenue chez Sendit",
    "_base_original": "Welcome to Sendit"
  }
}
```

| Field | Updated by | Purpose |
|-------|-----------|---------|
| `original` | Editor or AI (on translate/review) | Source text when the translation was last acknowledged |
| `value` | Editor or AI | The translation |
| `_base_original` | `write-locales` (each build) | Current source text from `base.json` |

When the source text changes, `_base_original` updates but `original` stays the same. The mismatch (`original !== _base_original`) flags the entry as stale. An AI agent can target only stale entries for re-translation, using the old `original` and `value` as context for what changed.

### Context-rich keys

Rosey keys encode page and section information: `nav:about`, `index:hero:title`, `blog:recent-posts`. This namespace context helps AI disambiguate short strings ("More", "Back", "Home") without requiring a screenshot or page visit.

## Workflows

### 1. AI coding agent (recommended)

The package ships agent skills that guide an AI coding assistant through the translation process. Add them to your project:

```bash
npx rosey-cloudcannon-connector add-skills
```

This copies skill files into your project (default: `.cursor/skills/`). The `translate-locale-files` skill walks the agent through reading the locale file, classifying entries, translating in context-aware batches, and writing back valid JSON.

With the skill installed, tell your AI assistant:

> "Translate `rosey/locales/fr.json` into French"

The agent reads the skill, follows the procedure, and translates only what's needed.

### 2. Custom script

Use the `write-locales` programmatic API as a baseline and add your own translation step. For example, calling an external translation API to fill in untranslated entries:

```typescript
import { writeLocales } from "rosey-cloudcannon-connector/write-locales";
import { readFileSync, writeFileSync } from "fs";

// 1. Sync locale files with base.json
await writeLocales({ roseyDir: "rosey", locales: ["fr"], dest: "dist" });

// 2. Load the locale file
const localePath = "rosey/locales/fr.json";
const locale = JSON.parse(readFileSync(localePath, "utf-8"));

// 3. Find untranslated entries
const untranslated = Object.entries(locale).filter(
  ([, entry]) => entry.value === entry.original
);

// 4. Translate via your preferred API/LLM
for (const [key, entry] of untranslated) {
  const translated = await yourTranslationAPI(entry.original, "en", "fr");
  entry.value = translated;
}

// 5. Write back
const sorted = Object.fromEntries(
  Object.entries(locale).sort(([a], [b]) => a.localeCompare(b))
);
writeFileSync(localePath, JSON.stringify(sorted, null, 2) + "\n");
```

This can run in a postbuild hook, a CI step, or a standalone script. For non-AI external services (machine translation APIs, TMS platforms) and CI automation patterns, see [External Integrations](integrations.md).

### 3. Manual LLM workflow

For quick one-off translations, paste the locale file contents into any LLM with instructions like:

> "Translate all entries where `value` equals `original` into French. Preserve HTML tags. Keep keys sorted. Return valid JSON."

Then paste the result back into the file. This is less repeatable than the agent or script approaches but works in a pinch.

## The Efficiency Argument

Without this structure, AI translation of a website involves:

1. Crawling every page to find translatable text
2. Diffing against previous translations to find what's new
3. Managing state across runs to avoid re-translating
4. Figuring out where to write translations back

With Rosey locale files, all of that collapses to: read a JSON file, find entries where `value === original`, translate them, write the file. The data format *is* the state management.

This means:
- **No wasted tokens** re-translating already-translated content
- **Reviewable diffs** — `git diff` shows exactly what changed
- **Idempotent runs** — translating twice produces the same output
- **No external state** — the locale file is the single source of truth

## Agent Skills

The package includes several agent skills for AI coding assistants. These are structured markdown files that guide agents through common workflows:

| Skill | Purpose |
|-------|---------|
| `translate-locale-files` | Translate untranslated and stale entries in locale files |
| `make-site-multilingual` | Set up Rosey/RCC/CloudCannon from scratch on a single-language site |
| `migrate-i18n-to-rosey` | Replace an existing i18n system with Rosey |
| `migrate-rcc-v1-to-v2` | Upgrade from RCC v1 to v2 |

Install them with:

```bash
npx rosey-cloudcannon-connector add-skills [--dest .cursor/skills]
```

The default destination is `.cursor/skills/` (Cursor's auto-discovery path). Use `--dest` to place them anywhere — the files are plain markdown and work with any AI tool that reads instructions from files.
