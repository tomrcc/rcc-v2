import { writeLocales } from "../write-locales";

export function run(argv: string[]): void {
	let source = "rosey";
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
					"Options:\n" +
					"  -s, --source <dir>     Rosey directory (default: rosey)\n" +
					"  -l, --locales <codes>  Comma-separated locale codes (auto-detects if omitted)\n" +
					"  -d, --dest <dir>       (required) Build output dir; writes locale manifest to {dest}/_rcc/locales.json\n" +
					"  --keep-unused          Preserve locale keys not in base.json (useful during migration)\n" +
					"  -h, --help             Show this help message\n",
			);
			process.exit(0);
		}
	}

	if (!dest) {
		console.error(
			"Error: --dest <dir> is required. This is the build output directory where the locale manifest (_rcc/locales.json) is written.",
		);
		process.exit(1);
	}

	writeLocales({ roseyDir: source, locales, dest, keepUnused });
}
