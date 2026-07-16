import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { resolveRoseyConfig } from "../../dist/internals.mjs";

// resolveRoseyConfig is the 3-layer (file → env; env wins) config resolution the
// Eleventy fixture leans on, backed by a hand-rolled YAML scanner (src/rosey-config.ts)
// — exactly where a regression would hide. cwd + env are injectable, so each case
// runs against a scratch dir and an explicit env object.

/** Write `files` into a fresh tmp dir and return its path. */
function scratch(files) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rcc-cfg-"));
	for (const [name, content] of Object.entries(files)) {
		fs.writeFileSync(path.join(dir, name), content);
	}
	return dir;
}

test("flow list, scalar, quoting, and line-comment stripping", () => {
	const dir = scratch({
		"rosey.yml": [
			"source: dist # build output dir",
			'tag: "data-rosey"',
			"languages: [fr, ar]",
			"default_language: en",
		].join("\n"),
	});
	const c = resolveRoseyConfig(dir, {});
	assert.deepEqual(c.languages, ["fr", "ar"]);
	assert.equal(c.source, "dist"); // trailing `# comment` stripped
	assert.equal(c.tag, "data-rosey"); // quotes removed
	assert.equal(c.defaultLanguage, "en");
});

test("block list terminates at the next top-level key", () => {
	const dir = scratch({
		"rosey.yml": ["languages:", "  - fr", "  - ar", "source: dist"].join("\n"),
	});
	const c = resolveRoseyConfig(dir, {});
	assert.deepEqual(c.languages, ["fr", "ar"]);
	assert.equal(c.source, "dist");
});

test("a quoted scalar keeps a literal # (not treated as a comment)", () => {
	const dir = scratch({ "rosey.yml": 'separator: "a#b"' });
	const c = resolveRoseyConfig(dir, {});
	assert.equal(c.separator, "a#b");
});

test("env overrides file (Rosey precedence)", () => {
	const dir = scratch({ "rosey.yml": "source: dist\nlanguages: [fr]" });
	const c = resolveRoseyConfig(dir, {
		ROSEY_LANGUAGES: "[de, es]",
		ROSEY_SOURCE: "_site",
	});
	assert.deepEqual(c.languages, ["de", "es"]);
	assert.equal(c.source, "_site");
});

test("env accepts a bare comma list, not just [bracketed]", () => {
	const dir = scratch({});
	const c = resolveRoseyConfig(dir, { ROSEY_LANGUAGES: "de, es" });
	assert.deepEqual(c.languages, ["de", "es"]);
});

test("rosey.json is parsed and snake_case keys are camelCased", () => {
	const dir = scratch({
		"rosey.json": JSON.stringify({
			source: "dist",
			languages: ["fr"],
			default_language: "en",
		}),
	});
	const c = resolveRoseyConfig(dir, {});
	assert.equal(c.source, "dist");
	assert.deepEqual(c.languages, ["fr"]);
	assert.equal(c.defaultLanguage, "en");
});

test("no config and no env yields an empty object", () => {
	const dir = scratch({});
	assert.deepEqual(resolveRoseyConfig(dir, {}), {});
});
