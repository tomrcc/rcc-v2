#!/usr/bin/env node
// Remap v1 translations onto v2 keys after a key-scheme migration.
//
// When you change Rosey keys (v1 → v2), the old translated entries no longer
// match the new keys. Run `write-locales --keep-unused` first so the locale
// files hold BOTH: freshly-added new keys (seeded `value = original`, so still
// untranslated) alongside the old, already-translated keys. This script copies
// each old translation onto the matching new key by comparing source text, then
// a plain `write-locales` (no flag) prunes the leftover old keys.
//
// The distinguishing signal: only keys present in the current base.json get a
// `_base_original` field. So an entry WITH `_base_original` is a v2 key; an
// entry WITHOUT one is a leftover v1 key carrying a translation to salvage.
//
// Usage:
//   node scripts/remap-locale-keys.mjs [--dir rosey/locales] [--dry-run] [file...]
//
// This is a sample — adapt the matching rule if your migration is fuzzier
// (e.g. match on visible text only, ignoring markup).

import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const dirFlag = argv.indexOf("--dir");
const dir = dirFlag !== -1 ? argv[dirFlag + 1] : "rosey/locales";
const explicitFiles = argv.filter(
	(a, i) => !a.startsWith("--") && !(dirFlag !== -1 && i === dirFlag + 1),
);

// Collapse insignificant whitespace so v1/v2 serializers compare equal. Mirrors
// the connector's normalizeSource closely enough for matching source strings.
function normalize(s) {
	return (s ?? "").replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
}

const isV2 = (entry) => entry?._base_original != null;

// An entry counts as translated once its value diverges from its source. A
// string identical in both languages (proper nouns, codes) stays as-is — it has
// no distinct translation to carry over, which is correct.
function isTranslated(entry) {
	const value = normalize(entry?.value);
	return value !== "" && value !== normalize(entry?.original);
}

function resolveFiles() {
	if (explicitFiles.length) return explicitFiles;
	if (!fs.existsSync(dir)) {
		console.error(`RCC remap: locales dir not found: ${dir}`);
		process.exit(1);
	}
	return fs
		.readdirSync(dir)
		.filter((f) => f.endsWith(".json") && !f.endsWith(".urls.json"))
		.map((f) => path.join(dir, f));
}

let totalRemapped = 0;
for (const file of resolveFiles()) {
	const entries = JSON.parse(fs.readFileSync(file, "utf-8"));

	// Source text → a translation salvaged from the leftover v1 keys. Last write
	// wins; any old key translating that text will do.
	const translations = new Map();
	for (const entry of Object.values(entries)) {
		if (!isV2(entry) && isTranslated(entry))
			translations.set(normalize(entry.original), entry.value);
	}

	let remapped = 0;
	for (const entry of Object.values(entries)) {
		if (!isV2(entry) || isTranslated(entry)) continue; // skip old keys & already-done
		const match = translations.get(normalize(entry.original));
		if (match != null) {
			entry.value = match;
			remapped++;
		}
	}

	totalRemapped += remapped;
	if (dryRun) {
		console.log(`RCC remap: ${file} — ${remapped} would be remapped (dry run)`);
	} else {
		fs.writeFileSync(file, `${JSON.stringify(entries, null, 2)}\n`);
		console.log(`RCC remap: ${file} — ${remapped} remapped`);
	}
}

console.log(
	`RCC remap: ${totalRemapped} total${dryRun ? " (dry run — no files written)" : ""}`,
);
