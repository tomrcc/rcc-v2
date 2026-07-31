import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CLIENT_FILENAME, installClient } from "../../dist/internals.mjs";

// installClient copies the browser client into the build output so non-bundled
// SSGs can import it by URL. Locating the bundle inside the installed package is
// the CLI's job (src/cli/install-client.ts), so clientPath is passed directly.

function tmpdir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "rcc-install-client-"));
}

/** Stands in for dist/index.mjs; contents are opaque to installClient. */
function fakeClient(dir, body = "export const marker = 'rcc';") {
	const p = path.join(dir, "index.mjs");
	fs.writeFileSync(p, body);
	return p;
}

test("copies the client into <dest>/_rcc/, creating the dir", async () => {
	const root = tmpdir();
	const clientPath = fakeClient(root);
	const dest = path.join(root, "_site");
	fs.mkdirSync(dest);

	const out = await installClient({ clientPath, dest });

	assert.equal(out, path.join(dest, "_rcc", CLIENT_FILENAME));
	assert.equal(fs.readFileSync(out, "utf-8"), "export const marker = 'rcc';");
});

test("writes alongside an existing _rcc/locales.json rather than replacing it", async () => {
	// write-locales owns the same directory and runs in either order relative to
	// this, so neither may clobber the other's output.
	const root = tmpdir();
	const clientPath = fakeClient(root);
	const dest = path.join(root, "_site");
	fs.mkdirSync(path.join(dest, "_rcc"), { recursive: true });
	const manifest = path.join(dest, "_rcc", "locales.json");
	fs.writeFileSync(manifest, '{"locales":["fr"]}');

	await installClient({ clientPath, dest });

	assert.equal(fs.readFileSync(manifest, "utf-8"), '{"locales":["fr"]}');
	assert.ok(fs.existsSync(path.join(dest, "_rcc", CLIENT_FILENAME)));
});

test("overwrites on a repeat run, so rebuilds pick up a new bundle", async () => {
	const root = tmpdir();
	const dest = path.join(root, "_site");
	fs.mkdirSync(dest);

	await installClient({ clientPath: fakeClient(root, "v1"), dest });
	await installClient({ clientPath: fakeClient(root, "v2"), dest });

	assert.equal(
		fs.readFileSync(path.join(dest, "_rcc", CLIENT_FILENAME), "utf-8"),
		"v2",
	);
});

test("rejects a missing dest, naming the likely cause", async () => {
	const root = tmpdir();
	const clientPath = fakeClient(root);

	// Nearly always means it ran before the site build, so say so rather than
	// surfacing a bare ENOENT.
	await assert.rejects(
		() => installClient({ clientPath, dest: path.join(root, "nope") }),
		/does not exist.*after your site build/s,
	);
});

test("rejects a dest that is a file, not a directory", async () => {
	const root = tmpdir();
	const clientPath = fakeClient(root);
	const notADir = path.join(root, "_site");
	fs.writeFileSync(notADir, "");

	await assert.rejects(
		() => installClient({ clientPath, dest: notADir }),
		/not a directory/,
	);
});

test("rejects an empty dest", async () => {
	const root = tmpdir();
	await assert.rejects(
		() => installClient({ clientPath: fakeClient(root), dest: "" }),
		/dest is required/,
	);
});

test("rejects an unreadable client bundle", async () => {
	const root = tmpdir();
	const dest = path.join(root, "_site");
	fs.mkdirSync(dest);

	await assert.rejects(
		() => installClient({ clientPath: path.join(root, "absent.mjs"), dest }),
		/Could not read the client bundle/,
	);
});
