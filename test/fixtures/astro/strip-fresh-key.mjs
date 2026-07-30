// Fixture-only: deletes `stale:fresh` from the locale files after write-locales
// seeded it. write-locales seeds every base.json key, so an element with no locale
// entry is otherwise unreachable from a static page — and it's the only state that
// exercises the connector's create-a-full-entry path. Running every build also
// stops a CLOUDCANNON_SYNC_PATHS write-back from quietly filling it back in.
import fs from "node:fs";
import path from "node:path";

const KEY = "stale:fresh";
const localesDir = "rosey/locales";

for (const file of fs.readdirSync(localesDir)) {
	if (!file.endsWith(".json") || file.endsWith(".urls.json")) continue;

	const filePath = path.join(localesDir, file);
	const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
	if (!(KEY in data)) continue;

	delete data[KEY];
	// No trailing newline — byte-for-byte what write-locales itself writes.
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
	console.log(`fixture: stripped ${KEY} from ${filePath}`);
}
