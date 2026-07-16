// Eleventy + Bookshop assertions. Focus (deliberately narrow — the Astro fixture
// covers markdown/toolbar/duplicates): the alternate `_site` build dir, the
// Bookshop render path producing data-rosey keys, and 3-layer Rosey config
// resolution (rosey.yml + ROSEY_LANGUAGES env + --source CLI flag).
import fs from "node:fs";

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
};
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf-8"));

// dest resolves from rosey.yml `source: _site` (no --dest flag) → the manifest
// lands under the alternate build dir, proving SSG-agnostic dir handling.
check(fs.existsSync("_site/_rcc/locales.json"), "manifest should be written under _site/ (rosey.yml source)");
const manifest = readJson("_site/_rcc/locales.json");

// rosey.yml lists only [fr]; ROSEY_LANGUAGES=[fr, ar] in postbuild must override
// it. Both signals: the manifest lists ar, and ar.json (uncommitted) was created.
check(
  Array.isArray(manifest.locales) &&
    manifest.locales.includes("fr") &&
    manifest.locales.includes("ar"),
  `env ROSEY_LANGUAGES should override rosey.yml → manifest lists fr + ar, got ${JSON.stringify(manifest.locales)}`,
);
check(fs.existsSync("rosey/locales/ar.json"), "ar.json should be created from the env override (not in the repo)");

const fr = readJson("rosey/locales/fr.json");
const base = readJson("rosey/base.json");

// Bookshop render path: the component emitted data-rosey under its _uuid ns, so
// Rosey generated the UUID-namespaced key.
check(
  "index:hero-1:heading" in base.keys && "index:hero-1:body" in base.keys,
  "base.json should contain the Bookshop component's UUID-namespaced keys",
);

// Every entry well-formed + no XHTML <br/> leaked into a stored string.
for (const [key, e] of Object.entries(fr)) {
  check(
    typeof e.original === "string" &&
      typeof e.value === "string" &&
      typeof e._base_original === "string",
    `fr ${key} should have string original/value/_base_original`,
  );
  for (const field of ["original", "value", "_base_original"]) {
    check(!/<br\s*\/>/i.test(e[field]), `fr ${key}.${field} contains <br/>`);
  }
}

// Stale scenario carried over: the heading's source drifted from the crafted
// `original`, so _base_original refreshes away from it; the body matches.
check(
  fr["index:hero-1:heading"]._base_original !== fr["index:hero-1:heading"].original,
  "fr heading should be base-stale (refreshed _base_original differs from original)",
);
check(
  fr["index:hero-1:body"]._base_original === fr["index:hero-1:body"].original,
  "fr body should be up to date (_base_original === original)",
);

if (failures.length) {
  console.error(`verify-locales: ${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("verify-locales: OK — _site dir, Bookshop keys, and 3-layer config all resolve");
