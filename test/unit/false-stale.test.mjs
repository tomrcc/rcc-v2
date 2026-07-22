import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { normalizeSource } from "../../dist/internals.mjs";
import { writeLocales } from "../../dist/write-locales.mjs";

// The false-stale guarantee spans two modules that meet nowhere else: on build,
// write-locales refreshes _base_original with normalizeStored(source) but leaves
// an existing `original` untouched (possibly legacy / un-normalized); at read
// time, stale detection compares normalizeSource(_base_original) against
// normalizeSource(original). This exercises that seam end to end — a source that
// differs from a legacy `original` only by <br> style or whitespace must NOT
// read as stale, while a real word change still must.

function seed({ base, locales = {} }) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "rcc-fs-"));
	const roseyDir = path.join(root, "rosey");
	fs.mkdirSync(path.join(roseyDir, "locales"), { recursive: true });
	fs.writeFileSync(
		path.join(roseyDir, "base.json"),
		JSON.stringify({ version: 2, keys: base }),
	);
	for (const [code, entries] of Object.entries(locales)) {
		fs.writeFileSync(
			path.join(roseyDir, "locales", `${code}.json`),
			JSON.stringify(entries),
		);
	}
	return { roseyDir, dest: path.join(root, "dist") };
}

const baseKey = (original) => ({ original, value: null, pages: {}, total: 1 });
const readFr = (roseyDir) =>
	JSON.parse(
		fs.readFileSync(path.join(roseyDir, "locales", "fr.json"), "utf-8"),
	);

// The base signal computeStale (src/stale.ts) uses: both sides re-normalized.
const baseStale = (e) =>
	normalizeSource(e._base_original) !== normalizeSource(e.original);

test("legacy original differing only by <br>/whitespace is not stale after a build", async () => {
	const { roseyDir, dest } = seed({
		base: { greeting: baseKey("Hello<br>world") },
		locales: {
			fr: {
				greeting: {
					original: "  Hello<br/>world  ",
					value: "Bonjour tout le monde",
					_base_original: "  Hello<br/>world  ",
				},
			},
		},
	});

	await writeLocales({ roseyDir, dest, locales: ["fr"] });
	const e = readFr(roseyDir).greeting;

	// _base_original refreshed to the canonical source; the legacy `original`
	// (XHTML <br/> + outer spaces) is left as the review anchor…
	assert.equal(e._base_original, "Hello<br>world");
	assert.equal(e.original, "  Hello<br/>world  ");
	// …and the re-normalizing compare sees through both differences: no false stale.
	assert.equal(baseStale(e), false);
});

test("a genuine word change in the source still reads as stale", async () => {
	const { roseyDir, dest } = seed({
		base: { greeting: baseKey("Goodbye world") },
		locales: {
			fr: {
				greeting: {
					original: "Hello world",
					value: "Bonjour tout le monde",
					_base_original: "Hello world",
				},
			},
		},
	});

	await writeLocales({ roseyDir, dest, locales: ["fr"] });
	const e = readFr(roseyDir).greeting;

	assert.equal(e._base_original, "Goodbye world"); // refreshed to the new source
	assert.equal(e.original, "Hello world"); // review anchor preserved
	assert.equal(baseStale(e), true);
});
