import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { detectProject } from "../../dist/internals.mjs";

// bundledFramework decides whether `init` writes an install-client step and which
// import snippet it prints. A false positive drops install-client from a site that
// needs it, which fails silently in the editor — so anything short of a known
// framework must come back null.

function projectWith(deps) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rcc-detect-"));
	fs.writeFileSync(
		path.join(dir, "package.json"),
		JSON.stringify({ dependencies: deps }),
	);
	return dir;
}

const detect = (deps) => detectProject(projectWith(deps)).bundledFramework;

test("names the framework when one bundles layout scripts", () => {
	assert.equal(detect({ astro: "^6.0.0" }), "astro");
	assert.equal(detect({ next: "^15.0.0" }), "next");
	assert.equal(detect({ "@sveltejs/kit": "^2.0.0" }), "@sveltejs/kit");
});

test("finds it in devDependencies too", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rcc-detect-"));
	fs.writeFileSync(
		path.join(dir, "package.json"),
		JSON.stringify({ devDependencies: { astro: "^6.0.0" } }),
	);
	assert.equal(detectProject(dir).bundledFramework, "astro");
});

test("a bare bundler is not a bundled framework", () => {
	// 11ty + esbuild builds a separate asset entry while its templates stay
	// unbundled, so the layout still needs the URL form.
	assert.equal(detect({ "@11ty/eleventy": "^3.0.0", esbuild: "^0.24.0" }), null);
	assert.equal(detect({ vite: "^6.0.0" }), null);
	assert.equal(detect({ webpack: "^5.0.0" }), null);
	assert.equal(detect({ rollup: "^4.0.0" }), null);
});

test("plain and non-JS sites come back null", () => {
	assert.equal(detect({ "@11ty/eleventy": "^3.0.0" }), null);
	assert.equal(detect({}), null);
});

test("no package.json at all comes back null", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rcc-detect-"));
	const ctx = detectProject(dir);
	assert.equal(ctx.hasPackageJson, false);
	assert.equal(ctx.bundledFramework, null);
});

test("malformed package.json comes back null, not a throw", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rcc-detect-"));
	fs.writeFileSync(path.join(dir, "package.json"), "{ not json");
	assert.equal(detectProject(dir).bundledFramework, null);
});
