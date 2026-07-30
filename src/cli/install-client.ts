import path from "node:path";
import { installClient } from "../install-client";
import { resolveRoseyConfig } from "../rosey-config";

// Bundled to dist/cli/index.js (CJS), so __dirname is dist/cli. Resolving off
// the running file rather than require.resolve works under both npm's symlinked
// `file:` installs and install-links=true directory copies.
const DEFAULT_CLIENT_PATH = path.join(__dirname, "..", "index.mjs");

export async function run(argv: string[]): Promise<void> {
	// Left undefined when not passed so it can fall back to env / rosey config.
	let dest: string | undefined;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if ((arg === "--dest" || arg === "-d") && argv[i + 1]) {
			dest = argv[++i];
		} else if (arg === "--help" || arg === "-h") {
			console.log(
				"Usage: rosey-cloudcannon-connector install-client [options]\n\n" +
					"Copies the browser client into your build output at\n" +
					"<dest>/_rcc/client.mjs, so non-bundled SSGs (11ty, Hugo, Jekyll)\n" +
					"can load it from a real URL. Run this after your site build.\n\n" +
					"Then import it from your layout:\n" +
					"  <script>\n" +
					"    if (window?.inEditorMode) import('/_rcc/client.mjs');\n" +
					"  </script>\n\n" +
					"Options:\n" +
					"  -d, --dest <dir>  Build output dir (default: ROSEY_SOURCE, else config `source`)\n" +
					"  -h, --help        Show this help message\n",
			);
			process.exit(0);
		}
	}

	// Same precedence as write-locales: flag > env (ROSEY_SOURCE) > config file.
	const resolvedDest = dest ?? resolveRoseyConfig().source;

	if (!resolvedDest) {
		console.error(
			"Error: no build output directory. Pass --dest <dir>, set ROSEY_SOURCE, " +
				"or add `source:` to your rosey config. This is where the client " +
				"(_rcc/client.mjs) is written.",
		);
		process.exit(1);
	}

	await installClient({
		clientPath: DEFAULT_CLIENT_PATH,
		dest: resolvedDest,
	});
}
