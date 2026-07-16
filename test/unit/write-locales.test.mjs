import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { writeLocales } from "../../dist/write-locales.mjs";

// writeLocales is the exact logic behind the false-stale investigation
// (src/write-locales.ts): three-field entry creation, _base_original refresh,
// <br>/trim normalization, unused-key and empty-source pruning, key sorting, and
// the _rcc/locales.json manifest. Driven end-to-end against scratch dirs — this
// also exercises normalizeStored via its only public caller.

/** Fresh tmp fixture: writes rosey/base.json + optional rosey/locales/<code>.json. */
function seed({ base, locales = {} }) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "rcc-wl-"));
	const roseyDir = path.join(root, "rosey");
	const localesDir = path.join(roseyDir, "locales");
	fs.mkdirSync(localesDir, { recursive: true });
	fs.writeFileSync(
		path.join(roseyDir, "base.json"),
		JSON.stringify({ version: 2, keys: base }),
	);
	for (const [code, entries] of Object.entries(locales)) {
		fs.writeFileSync(
			path.join(localesDir, `${code}.json`),
			JSON.stringify(entries),
		);
	}
	return { root, roseyDir, dest: path.join(root, "dist") };
}

/** key → {original, value?} shorthand for base.json. */
function baseKey(original, value = null) {
	return { original, value, pages: {}, total: 1 };
}

function readLocale(roseyDir, code) {
	return JSON.parse(
		fs.readFileSync(path.join(roseyDir, "locales", `${code}.json`), "utf-8"),
	);
}

test("creates three-field entries, refreshes _base_original, prunes, sorts", async () => {
	const { roseyDir, dest } = seed({
		base: {
			zebra: baseKey("Z"),
			apple: baseKey("A"),
			greeting: baseKey("Hello"),
			stale_key: baseKey("New Source"),
			br_key: baseKey("  Line<br/>break  "),
			empty_untranslated: baseKey(""),
			empty_translated: baseKey(""),
		},
		locales: {
			fr: {
				stale_key: {
					original: "Old Source",
					value: "Traduction",
					_base_original: "Old Source",
				},
				empty_untranslated: { original: "", value: "", _base_original: "" },
				empty_translated: {
					original: "",
					value: "Traduit",
					_base_original: "",
				},
				obsolete: { original: "Gone", value: "Parti", _base_original: "Gone" },
			},
		},
	});

	await writeLocales({ roseyDir, dest, locales: ["fr"] });
	const fr = readLocale(roseyDir, "fr");

	// New entry: all three fields seeded from the (normalized) source.
	assert.deepEqual(fr.greeting, {
		original: "Hello",
		value: "Hello",
		_base_original: "Hello",
	});

	// Existing entry: `original` (review anchor) and `value` (translation) are
	// left untouched; only the RCC-managed _base_original tracks the new source.
	assert.deepEqual(fr.stale_key, {
		original: "Old Source",
		value: "Traduction",
		_base_original: "New Source",
	});

	// <br/> canonicalized to <br> and the outer whitespace trimmed, on all fields.
	assert.deepEqual(fr.br_key, {
		original: "Line<br>break",
		value: "Line<br>break",
		_base_original: "Line<br>break",
	});

	// Empty source: prune only when the existing value is also empty…
	assert.ok(!("empty_untranslated" in fr), "empty placeholder pruned");
	// …but keep a real translation typed against a now-empty source.
	assert.equal(fr.empty_translated.value, "Traduit");

	// Unused key (absent from base) removed by default.
	assert.ok(!("obsolete" in fr), "unused key pruned");

	// Keys emitted in sorted order.
	assert.deepEqual(
		Object.keys(fr),
		[...Object.keys(fr)].sort((a, b) => a.localeCompare(b)),
	);

	// Manifest lists the locales that were written.
	const manifest = JSON.parse(
		fs.readFileSync(path.join(dest, "_rcc", "locales.json"), "utf-8"),
	);
	assert.deepEqual(manifest, { locales: ["fr"] });
});

test("keepUnused preserves keys absent from base", async () => {
	const { roseyDir, dest } = seed({
		base: { greeting: baseKey("Hello") },
		locales: {
			fr: {
				obsolete: { original: "Gone", value: "Parti", _base_original: "Gone" },
			},
		},
	});

	await writeLocales({ roseyDir, dest, locales: ["fr"], keepUnused: true });
	const fr = readLocale(roseyDir, "fr");

	assert.equal(fr.obsolete.value, "Parti", "unused key kept under keepUnused");
	assert.ok("greeting" in fr, "new key still added");
});

test("auto-discovers locale codes from existing files when none passed", async () => {
	const { roseyDir, dest } = seed({
		base: { greeting: baseKey("Hello") },
		locales: { fr: {}, ar: {} },
	});

	await writeLocales({ roseyDir, dest });
	const manifest = JSON.parse(
		fs.readFileSync(path.join(dest, "_rcc", "locales.json"), "utf-8"),
	);
	assert.deepEqual([...manifest.locales].sort(), ["ar", "fr"]);
	assert.equal(readLocale(roseyDir, "fr").greeting.value, "Hello");
	assert.equal(readLocale(roseyDir, "ar").greeting.value, "Hello");
});
