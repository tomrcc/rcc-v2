import { run as addSkills } from "./add-skills";
import { run as init } from "./init";
import { run as writeLocales } from "./write-locales";

const COMMANDS: Record<string, (argv: string[]) => void | Promise<void>> = {
	"add-skills": addSkills,
	"write-locales": writeLocales,
	init: init,
};

function printUsage(): void {
	console.log(
		"Usage: rosey-cloudcannon-connector <command> [options]\n\n" +
			"Commands:\n" +
			"  init            Setup wizard for Rosey + CloudCannon (interactive or headless)\n" +
			"  write-locales   Write/update locale files from Rosey base.json\n" +
			"  add-skills      Copy agent skill files into your project\n\n" +
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

handler(args.slice(1));
