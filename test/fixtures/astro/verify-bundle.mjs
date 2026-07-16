// Structural smoke test of the client bundle RCC actually serves — the
// editable-regions verify-bundle.mjs pattern. Proves the LOCAL file: build is
// wired in (a symlink into the repo, not a github tarball) and that the bundle
// still emits its switcher/stale/selector contract. No browser: greps the file.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
};

// The bare specifier must resolve through the package `exports` map at all —
// the same resolution the browser uses to load the connector.
try {
  require.resolve("rosey-cloudcannon-connector");
} catch (err) {
  check(false, `bare specifier should resolve via exports map: ${err.code ?? err}`);
}

// file: dep ⇒ npm symlinks node_modules/<pkg> into the repo root. A real symlink
// is the proof we're testing local uncommitted changes, not github:tomrcc/rcc-v2.
const linkPath = "node_modules/rosey-cloudcannon-connector";
let isSymlink = false;
try {
  isSymlink = fs.lstatSync(linkPath).isSymbolicLink();
} catch {}
check(isSymlink, `${linkPath} should be a symlink (file: dep), so rebuilds are live`);

// The browser loads the ESM `import` condition → dist/index.mjs. Read it through
// the symlink so we assert on the exact file CloudCannon serves.
const bundlePath = path.join(linkPath, "dist/index.mjs");
check(fs.existsSync(bundlePath), `bundle missing at ${bundlePath} — run \`npm run build\` in rcc-v2`);

if (fs.existsSync(bundlePath)) {
  const src = fs.readFileSync(bundlePath, "utf-8");
  const markers = [
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
    // Version stamp — printed to the console as `RCC: v<version> loaded`.
    "RCC: v",
    "loaded",
  ];
  for (const m of markers) {
    check(src.includes(m), `bundle should contain marker: ${JSON.stringify(m)}`);
  }
  // The tsup `define` must have inlined the version; the raw token surviving
  // means the local build didn't run.
  check(!src.includes("__RCC_VERSION__"), "__RCC_VERSION__ should be substituted at build time");
}

if (failures.length) {
  console.error(`verify-bundle: ${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("verify-bundle: OK — local bundle wired in and emit contract intact");
