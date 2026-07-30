// Structural smoke test of the client bundle RCC serves: the local file: build is
// wired in, it still emits its switcher/stale/selector contract, and the URL the
// layout imports resolves to a real file in the build output. No browser.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const FIXTURE_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_ROOT = path.resolve(FIXTURE_DIR, "../../..");
const OUT_DIR = "_site";

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

// Resolves through the package `exports` map. Node-only — the browser has no
// node_modules lookup, which is why this fixture's layout imports a copied URL
// rather than the bare specifier the Astro (Vite-bundled) fixture can use.
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

// ── The client is reachable at the URL the layout imports ──────────────
//
// Everything above passes even when the built pages point at a URL that 404s,
// which in the editor is indistinguishable from a broken editor. The URL is read
// out of the emitted HTML rather than hardcoded, so this tracks base.liquid.
const pages = ["index.html", "regions/index.html"];
for (const page of pages) {
  const pagePath = path.join(OUT_DIR, page);
  if (!fs.existsSync(pagePath)) {
    check(false, `expected built page at ${pagePath}`);
    continue;
  }
  const html = fs.readFileSync(pagePath, "utf-8");
  const urls = [...html.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);

  check(urls.length > 0, `${page} should import the RCC client (no import() found)`);

  for (const url of urls) {
    check(
      url.startsWith("/"),
      `${page} imports ${JSON.stringify(url)} — a non-bundled SSG needs a root-absolute URL, not a bare specifier`,
    );
    if (!url.startsWith("/")) continue;

    const served = path.join(OUT_DIR, url);
    if (!fs.existsSync(served)) {
      check(
        false,
        `${page} imports ${url} but ${served} does not exist — did install-client run in .cloudcannon/postbuild?`,
      );
      continue;
    }
    const client = fs.readFileSync(served, "utf-8");
    check(client.length > 0, `${served} is empty`);
    const missing = MARKERS.filter((m) => !client.includes(m));
    check(
      missing.length === 0,
      `${served} is not the RCC client (missing ${JSON.stringify(missing)})`,
    );
  }
}

if (failures.length) {
  console.error(`verify-bundle: ${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("verify-bundle: OK — local bundle wired in, emit contract intact, client served at the imported URL");
