// Stands in for CloudCannon during a local build. CloudCannon writes
// _cloudcannon/info.json into the output before running .cloudcannon/postbuild;
// @bookshop/generate augments that file and errors without it. Writing the stub
// here rather than guarding the postbuild keeps postbuild identical to a real
// site's, and means generate runs for real locally and in CI.
//
// The structure key has to be present: generate only attaches components to keys
// that already exist, so an empty object would let the build pass vacuously.
// CloudCannon derives this key from `_structures` in cloudcannon.config.yml.
import fs from "node:fs";

const infoJson = "_site/_cloudcannon/info.json";

if (!fs.existsSync(infoJson)) {
	fs.mkdirSync("_site/_cloudcannon", { recursive: true });
	fs.writeFileSync(
		infoJson,
		JSON.stringify({ _structures: { content_blocks: { style: "modal" } } }),
	);
	console.log(`Wrote stub ${infoJson} (CloudCannon writes the real one)`);
}
