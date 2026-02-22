import { run as writeLocales } from "./write-locales";

const COMMANDS: Record<string, (argv: string[]) => void> = {
	"write-locales": writeLocales,
};

function printUsage(): void {
	console.log(
		"Usage: rcc-v2 <command> [options]\n\n" +
			"Commands:\n" +
			"  write-locales   Write/update locale files from Rosey base.json\n\n" +
			"Run rcc-v2 <command> --help for command-specific options.\n",
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

handler(args.slice(1));
