import { run as init } from "./init";
import { run as installClient } from "./install-client";
import { run as writeLocales } from "./write-locales";

const COMMANDS: Record<string, (argv: string[]) => void | Promise<void>> = {
	"write-locales": writeLocales,
	"install-client": installClient,
	init,
};

function printUsage(): void {
	console.log(
		"Usage: rosey-cloudcannon-connector <command> [options]\n\n" +
			"Commands:\n" +
			"  init            Setup wizard for Rosey + CloudCannon (interactive or headless)\n" +
			"  write-locales   Write/update locale files from Rosey base.json\n" +
			"  install-client  Copy the browser client into your build output (non-bundled SSGs)\n\n" +
			"Run rosey-cloudcannon-connector <command> --help for command-specific options.\n",
	);
}

const args = process.argv.slice(2);
const subcommand = args[0];

if (!subcommand || subcommand === "--help" || subcommand === "-h") {
	printUsage();
	process.exit(0);
}

const handler = COMMANDS[subcommand];
if (!handler) {
	console.error(`Unknown command: ${subcommand}\n`);
	printUsage();
	process.exit(1);
}

Promise.resolve(handler(args.slice(1))).catch((err) => {
	console.error("RCC:", err instanceof Error ? err.message : err);
	process.exit(1);
});
