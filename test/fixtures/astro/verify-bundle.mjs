// Structural smoke test of the client bundle RCC serves: the local file: build is
// wired in, it still emits its switcher/stale/selector contract, and Vite pulled
// the client into the build output. No browser.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const FIXTURE_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_ROOT = path.resolve(FIXTURE_DIR, "../../..");
const OUT_DIR = "dist";

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
};

const MARKERS = [
  // Rosey selectors the injector scans for.
  "data-rosey",
  "data-rosey-ns",
  "data-rosey-root",
  // Editor UI contract.
  "rcc-locale-switcher",
  "rcc-stale-panel",
  "rcc-fab-badge",
  // CloudCannon runtime integration points.
  "createTextEditableRegion",
  "CloudCannonAPI",
  "inEditorMode",
  // Load banner — printed to the console as `RCC: loaded`.
  "RCC: loaded",
];

// The bare specifier must resolve through the package `exports` map at all —
// the same resolution Vite performs when it bundles the connector.
try {
  require.resolve("rosey-cloudcannon-connector");
} catch (err) {
  check(false, `bare specifier should resolve via exports map: ${err.code ?? err}`);
}

// Byte-identical to the repo's own build ⇒ we're testing local changes, not a
// published tarball. Holds whether npm symlinked or copied (install-links=true),
// and catches a repo rebuild that landed after this fixture's `npm i`.
const installedBundle = path.join(
  "node_modules/rosey-cloudcannon-connector",
  "dist/index.mjs",
);
const repoBundle = path.join(REPO_ROOT, "dist/index.mjs");
check(fs.existsSync(repoBundle), `repo bundle missing at ${repoBundle} — run \`npm run build\` in rcc-v2`);
check(fs.existsSync(installedBundle), `installed bundle missing at ${installedBundle} — run \`npm i\``);

if (fs.existsSync(installedBundle) && fs.existsSync(repoBundle)) {
  const installed = fs.readFileSync(installedBundle);
  const repo = fs.readFileSync(repoBundle);
  check(
    installed.equals(repo),
    "installed bundle should be byte-identical to the repo's dist/index.mjs — " +
      "reinstall the fixture after rebuilding rcc-v2",
  );
  const src = installed.toString("utf-8");
  for (const m of MARKERS) {
    check(src.includes(m), `bundle should contain marker: ${JSON.stringify(m)}`);
  }
}

// ── The client made it into the build output ───────────────────────────
//
// This fixture uses the bare specifier (the recommended form for Vite-based
// SSGs), so the proof is a bundled chunk under dist/ containing the client rather
// than a URL resolving. Without it, a silently dropped import still passes.
const jsAssets = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".js")) jsAssets.push(full);
  }
};
if (fs.existsSync(OUT_DIR)) walk(OUT_DIR);

const clientChunks = jsAssets.filter((f) => {
  const src = fs.readFileSync(f, "utf-8");
  return MARKERS.every((m) => src.includes(m));
});
check(
  clientChunks.length > 0,
  `no bundled chunk under ${OUT_DIR}/ contains the RCC client — Vite did not bundle ` +
    `the bare specifier (searched ${jsAssets.length} .js file(s))`,
);

// And the page has to load a module script at all, else the chunk is orphaned.
const indexHtml = path.join(OUT_DIR, "index.html");
if (fs.existsSync(indexHtml)) {
  const html = fs.readFileSync(indexHtml, "utf-8");
  check(
    /<script[^>]*type=["']module["']/.test(html),
    "index.html should load a module script (the bundled entry that imports the client)",
  );
} else {
  check(false, `expected built page at ${indexHtml}`);
}

if (failures.length) {
  console.error(`verify-bundle: ${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("verify-bundle: OK — local bundle wired in, emit contract intact, client bundled into the output");
