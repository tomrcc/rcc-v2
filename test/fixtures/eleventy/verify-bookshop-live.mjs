// Bookshop live editing — the path that makes sidebar prop changes re-render the
// component. Three things have to line up; miss any one and the page renders fine
// but never updates, with nothing in the console.
import fs from "node:fs";

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
};

const index = fs.readFileSync("_site/index.html", "utf-8");

// 1. Params resolve to frontmatter (`bind: block`), not literals in the tag.
check(
  /context\(block: content_blocks\[\d+\]\)/.test(index),
  "hero should be bound to content_blocks (bind: block), so the original is editable",
);

// 2. The live script built. @bookshop/builder only reads the config at
// <library>/bookshop/bookshop.config.{js,cjs}, so a config one level up passes
// discovery and then fails here.
const liveJs = "_site/_cloudcannon/bookshop-live.js";
check(fs.existsSync(liveJs), `${liveJs} should be built`);
if (fs.existsSync(liveJs)) {
  check(
    fs.statSync(liveJs).size > 10_000,
    `${liveJs} is suspiciously small — the engine probably didn't bundle`,
  );
}
check(
  index.includes("bookshop-live-connector") &&
    index.includes("/_cloudcannon/bookshop-live.js"),
  "the live-editing connector should be injected and load the built script",
);
check(
  !fs.readFileSync("_site/regions/index.html", "utf-8").includes("bookshop-live-connector"),
  "the connector should only reach pages containing components",
);

// 3. The component registered as an addable structure, from `spec.structures`.
const info = JSON.parse(fs.readFileSync("_site/_cloudcannon/info.json", "utf-8"));
const hero = (info?._structures?.content_blocks?.values ?? []).find(
  (v) => v?.value?._bookshop_name === "hero",
);
check(
  hero,
  "hero should be added to the content_blocks structure — check `spec.structures` in hero.bookshop.yml",
);
// Added blocks need a real UUID; the array-index fallback shifts every Rosey key
// on reorder.
check(
  hero?._inputs?._uuid?.instance_value === "UUID",
  "hero's _uuid should carry instance_value: UUID so added blocks get a stable key",
);

if (failures.length) {
  console.error(`verify-bookshop-live: ${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("verify-bookshop-live: OK — bound to data, live script built, connector injected, component registered");
