// Node-target entry that re-exports the pure, DOM-free logic we unit-test.
// `resolveRoseyConfig` is otherwise bundled only into the CLI, and
// `normalizeSource` only into the DOM client bundle (importing that in node
// risks evaluating `document`). This tiny entry makes both importable from
// node without a DOM shim. Not part of the public API — test-only.
export { resolveRoseyConfig } from "./rosey-config";
export { normalizeSource } from "./stale";
