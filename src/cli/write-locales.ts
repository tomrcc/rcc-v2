import { writeLocales } from "../write-locales";

export function run(argv: string[]): void {
	let source = "rosey";
	let locales: string[] | undefined;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if ((arg === "--source" || arg === "-s") && argv[i + 1]) {
			source = argv[++i];
		} else if ((arg === "--locales" || arg === "-l") && argv[i + 1]) {
			locales = argv[++i]
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
		} else if (arg === "--help" || arg === "-h") {
			console.log(
				"Usage: rcc-v2 write-locales [options]\n\n" +
					"Options:\n" +
					"  -s, --source <dir>     Rosey directory (default: rosey)\n" +
					"  -l, --locales <codes>  Comma-separated locale codes (auto-detects if omitted)\n" +
					"  -h, --help             Show this help message\n",
			);
			process.exit(0);
		}
	}

	writeLocales({ roseyDir: source, locales });
}
