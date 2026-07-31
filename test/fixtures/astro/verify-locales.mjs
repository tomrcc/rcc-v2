// Highest-value automated coverage: asserts on the locale JSON produced from a
// REAL Rosey base.json (via `rosey generate` + write-locales in the build), not
// a hand-mocked one. Plain node, run after `npm run build`.
import fs from "node:fs";

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
};
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf-8"));

const fr = readJson("rosey/locales/fr.json");
const ar = readJson("rosey/locales/ar.json");
const base = readJson("rosey/base.json");
const manifest = readJson("dist/_rcc/locales.json");

// --- Manifest lists both locales ------------------------------------------
check(
  Array.isArray(manifest.locales) &&
    manifest.locales.includes("fr") &&
    manifest.locales.includes("ar"),
  `manifest should list fr + ar, got ${JSON.stringify(manifest.locales)}`,
);

// --- Every entry is a well-formed three-field record ----------------------
for (const [locale, data] of [["fr", fr], ["ar", ar]]) {
  for (const [key, e] of Object.entries(data)) {
    check(
      typeof e.original === "string" &&
        typeof e.value === "string" &&
        typeof e._base_original === "string",
      `${locale}:${key} should have string original/value/_base_original`,
    );
    // Normalization invariant: XHTML-style <br/> must never survive into a
    // stored string (write-locales canonicalizes to <br>).
    for (const field of ["original", "value", "_base_original"]) {
      check(!/<br\s*\/>/i.test(e[field]), `${locale}:${key}.${field} contains <br/>`);
    }
  }
}

// --- Stale scenario: _base_original refreshed to the drifted source -------
// The committed entry has _base_original === original. The build refreshes
// _base_original to the live page source, so it must equal that source and
// differ from the preserved `original` → base-stale. Checking the refreshed
// value (not just "the two differ") is what proves the refresh happened.
check(
  fr["stale:changed"]?._base_original ===
    "This sentence changed since it was last translated." &&
    fr["stale:changed"]._base_original !== fr["stale:changed"].original,
  `fr stale:changed _base_original should refresh to the live source, got ${JSON.stringify(fr["stale:changed"])}`,
);
// Up-to-date entry: source matches, so the refreshed _base_original equals original.
check(
  fr["stale:uptodate"] &&
    fr["stale:uptodate"]._base_original === fr["stale:uptodate"].original,
  "fr stale:uptodate should have _base_original === original",
);
// Untranslated: write-locales seeds value from the source and never overwrites it.
check(
  fr["stale:untranslated"]?.value === fr["stale:untranslated"]?.original &&
    fr["stale:untranslated"]?.value === fr["stale:untranslated"]?._base_original,
  `fr stale:untranslated should keep value === original === _base_original, got ${JSON.stringify(fr["stale:untranslated"])}`,
);

// --- Unused key pruned ----------------------------------------------------
check(!("stale:removed_me" in fr), "fr stale:removed_me (unused) should be pruned");
check(!("stale:removed_me" in ar), "ar stale:removed_me (unused) should be pruned");

// --- Create path: keys not pre-crafted were added from base ---------------
// :body is deliberately absent pre-build; its :title sibling stays translated so
// the manual walk still sees French/Arabic there.
check(
  fr["nested:section:card:body"]?.value === fr["nested:section:card:body"]?.original,
  "auto-created nested key should default value to its source",
);

// --- Missing-entry scenario: stripped back out after write-locales ---------
// It's on the page (so base.json has it) but must reach the editor with no locale
// entry — the only state that exercises the create-a-full-entry path.
check("stale:fresh" in base.keys, "base.json should contain stale:fresh");
for (const [locale, data] of [["fr", fr], ["ar", ar]]) {
  check(
    !("stale:fresh" in data),
    `${locale} stale:fresh should be stripped by strip-fresh-key.mjs (postbuild)`,
  );
}

// --- Duplicate-key collapse happened at generate time ---------------------
check(
  base.keys["duplicates:shared"] && base.keys["duplicates:shared"].total >= 2,
  "base.json duplicates:shared should collapse both occurrences (total >= 2)",
);
// --- Deep key resolution produced the fully-namespaced key ----------------
check(
  "nested:section:card:body" in base.keys,
  "base.json should contain the deep key nested:section:card:body",
);

if (failures.length) {
  console.error(`verify-locales: ${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("verify-locales: OK — locale files + manifest match expectations");
