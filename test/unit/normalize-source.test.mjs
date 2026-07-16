import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSource } from "../../dist/internals.mjs";

// normalizeSource is the compare-key canonicalizer behind stale detection
// (src/stale.ts). Only the DOM-free paths are exercised here: with no <li> in
// the input, unwrapLooseListItems early-returns, so no `document` is touched.
// The <li> unwrap path is validated by the integration fixture instead.

test("folds <br> variants to a space", () => {
	assert.equal(normalizeSource("a<br>b"), "a b");
	assert.equal(normalizeSource("a<br/>b"), "a b");
	assert.equal(normalizeSource("a<br />b"), "a b");
	// ProseMirror's trailing-break marker must fold too.
	assert.equal(
		normalizeSource('a<br class="ProseMirror-trailingBreak">b'),
		"a b",
	);
});

test("collapses inter-tag whitespace", () => {
	assert.equal(normalizeSource("<p>a</p>   <p>b</p>"), "<p>a</p><p>b</p>");
	assert.equal(normalizeSource("<p>a</p>\n  <p>b</p>"), "<p>a</p><p>b</p>");
});

test("collapses interior whitespace runs and trims ends", () => {
	assert.equal(normalizeSource("  hello   world  "), "hello world");
	assert.equal(normalizeSource("hello\n\tworld"), "hello world");
});

test("preserves significant whitespace inside a single tag", () => {
	// Only inter-tag (`>\s+<`) whitespace collapses; a space inside an element's
	// text is real content and stays (later folded to a single space).
	assert.equal(normalizeSource("<span> c </span>"), "<span> c </span>");
});

test("a break-only difference normalizes equal (documented trade-off)", () => {
	assert.equal(
		normalizeSource("Line one<br>Line two"),
		normalizeSource("Line one Line two"),
	);
});

test("empty and whitespace-only inputs normalize to empty string", () => {
	assert.equal(normalizeSource(""), "");
	assert.equal(normalizeSource("   \n\t "), "");
});
