import path from "node:path";
import { resolveRoseyConfig } from "../rosey-config";
import { writeLocales } from "../write-locales";

export function run(argv: string[]): void {
	// CLI flags are the top precedence layer; left undefined when not passed so
	// they can fall back to env vars / the Rosey config file below.
	let source: string | undefined;
	let locales: string[] | undefined;
	let dest: string | undefined;
	let keepUnused = false;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if ((arg === "--source" || arg === "-s") && argv[i + 1]) {
			source = argv[++i];
		} else if ((arg === "--locales" || arg === "-l") && argv[i + 1]) {
			locales = argv[++i]
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
		} else if ((arg === "--dest" || arg === "-d") && argv[i + 1]) {
			dest = argv[++i];
		} else if (arg === "--keep-unused") {
			keepUnused = true;
		} else if (arg === "--help" || arg === "-h") {
			console.log(
				"Usage: rcc-v2 write-locales [options]\n\n" +
					"Values fall back to ROSEY_* env vars, then a rosey.{yml,yaml,json} config\n" +
					"file (CLI flags > env > config file), matching Rosey.\n\n" +
					"Options:\n" +
					"  -s, --source <dir>     Rosey directory (default: dir of the config's `locales`, else rosey)\n" +
					"  -l, --locales <codes>  Comma-separated locale codes (default: config `languages`, else auto-detect)\n" +
					"  -d, --dest <dir>       Build output dir for the manifest (default: config `source`)\n" +
					"  --keep-unused          Preserve locale keys not in base.json (useful during migration)\n" +
					"  -h, --help             Show this help message\n",
			);
			process.exit(0);
		}
	}

	// env (ROSEY_*) overlaid on the rosey config file; CLI flags win over both.
	const rosey = resolveRoseyConfig();

	const roseyDir =
		source ??
		(rosey.localesDir ? path.dirname(rosey.localesDir) : undefined) ??
		"rosey";
	const resolvedLocales = locales ?? rosey.languages;
	const resolvedDest = dest ?? rosey.source;

	if (!resolvedDest) {
		console.error(
			"Error: no build output directory. Pass --dest <dir>, set ROSEY_SOURCE, " +
				"or add `source:` to your rosey config. This is where the locale manifest " +
				"(_rcc/locales.json) is written.",
		);
		process.exit(1);
	}

	writeLocales({
		roseyDir,
		locales: resolvedLocales,
		dest: resolvedDest,
		keepUnused,
	});
}
