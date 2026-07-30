// Eleventy assertions. Focus (deliberately narrow — the Astro fixture covers
// markdown/toolbar/duplicates): the alternate `_site` build dir, both the Bookshop
// and editable-regions render paths producing data-rosey keys, and 3-layer Rosey
// config resolution (rosey.yml + ROSEY_LANGUAGES env + --source CLI flag).
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

// The hero's params must resolve to frontmatter, not be literals in the tag —
// that's what makes the ORIGINAL editable in the editor and not just the locale
// views RCC owns. Bookshop records which in its live comment.
const indexHtml = fs.readFileSync("_site/index.html", "utf-8");
check(
  /context\(block: content_blocks\[\d+\]\)/.test(indexHtml),
  "hero should be bound to content_blocks (bind: block), so the original is editable",
);

// The other 11ty editing style: regions.md renders frontmatter props into
// CloudCannon editable regions, no Bookshop. Same data-rosey contract, so the
// keys must come through identically.
check(
  "regions:heading" in base.keys && "regions:body" in base.keys,
  "base.json should contain the editable-regions page's keys",
);
// Seeded pre-build with a translation, so it must survive the merge untouched.
check(
  fr["regions:heading"]?.value === "Régions modifiables sur un SSG sans bundler",
  `fr regions:heading should keep its committed translation, got ${JSON.stringify(fr["regions:heading"])}`,
);
// Absent pre-build ⇒ created here with `value` = source, over an HTML string.
check(
  fr["regions:body"]?.value === fr["regions:body"]?.original &&
    /^<p>No Bookshop here/.test(fr["regions:body"]?.original ?? ""),
  `fr regions:body should be created with value = source, got ${JSON.stringify(fr["regions:body"])}`,
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

// Stale scenario: committed with _base_original === original, so the build must
// refresh it to the live source and away from `original` → base-stale. Asserting
// the exact refreshed value (not just "they differ") is what observes the refresh
// rather than a static diff.
check(
  fr["index:hero-1:heading"]?._base_original === "Welcome to the Bookshop fixture" &&
    fr["index:hero-1:heading"]._base_original !== fr["index:hero-1:heading"].original,
  `fr heading _base_original should refresh to the live source, got ${JSON.stringify(fr["index:hero-1:heading"])}`,
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
