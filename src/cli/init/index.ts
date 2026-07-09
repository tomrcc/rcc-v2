import path from "node:path";
import { resolveRoseyConfig } from "../../rosey-config";
import {
	buildPostbuildBlock,
	hasRealSource,
	installDependencies,
	printInstructions,
	removeSourceKey,
	updateCloudCannonConfig,
	writePostbuild,
} from "./actions";
import { detectProject } from "./detect";
import { askConfirm, askSelect, askText, closePrompts } from "./prompts";

export interface WizardAnswers {
	locales: string[];
	defaultLanguage: string;
	useBuiltinWriteLocales: boolean;
	contentAtRoot: boolean;
	exposeAsCollection: boolean;
	buildDir: string;
	roseyDir: string;
	ccSource: string | null;
}

interface InitFlags {
	yes: boolean;
	locales: string[] | undefined;
	defaultLanguage: string | undefined;
	buildDir: string | undefined;
	roseyDir: string | undefined;
	useBuiltinWriteLocales: boolean | undefined;
	contentAtRoot: boolean | undefined;
	exposeAsCollection: boolean | undefined;
}

function parseFlags(argv: string[]): InitFlags {
	const flags: InitFlags = {
		yes: false,
		locales: undefined,
		defaultLanguage: undefined,
		buildDir: undefined,
		roseyDir: undefined,
		useBuiltinWriteLocales: undefined,
		contentAtRoot: undefined,
		exposeAsCollection: undefined,
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--yes" || arg === "-y") {
			flags.yes = true;
		} else if ((arg === "--locales" || arg === "-l") && argv[i + 1]) {
			flags.locales = argv[++i]
				.split(",")
				.map((s) => s.trim().toLowerCase())
				.filter(Boolean);
		} else if (arg === "--default-language" && argv[i + 1]) {
			flags.defaultLanguage = argv[++i];
		} else if ((arg === "--build-dir" || arg === "-b") && argv[i + 1]) {
			flags.buildDir = argv[++i];
		} else if (arg === "--rosey-dir" && argv[i + 1]) {
			flags.roseyDir = argv[++i];
		} else if (arg === "--write-locales") {
			flags.useBuiltinWriteLocales = true;
		} else if (arg === "--no-write-locales") {
			flags.useBuiltinWriteLocales = false;
		} else if (arg === "--content-at-root") {
			flags.contentAtRoot = true;
		} else if (arg === "--no-content-at-root") {
			flags.contentAtRoot = false;
		} else if (arg === "--collection") {
			flags.exposeAsCollection = true;
		} else if (arg === "--no-collection") {
			flags.exposeAsCollection = false;
		}
	}

	return flags;
}

const HELP_TEXT =
	"Usage: rosey-cloudcannon-connector init [options]\n\n" +
	"Setup wizard for Rosey + CloudCannon. Runs interactively by default;\n" +
	"pass --yes to run headless (useful for CI and agent automation).\n\n" +
	"Options:\n" +
	"  -y, --yes                  Skip all prompts, use flags/defaults\n" +
	"  -l, --locales <codes>      Comma-separated locale codes (e.g. fr,de,es)\n" +
	"                             Required in --yes mode\n" +
	"      --default-language <c> Default/source language (default: en)\n" +
	"  -b, --build-dir <dir>      Build output directory (default: auto-detect or dist)\n" +
	"      --rosey-dir <dir>      Rosey source directory (default: rosey)\n" +
	"      --write-locales        Use built-in write-locales (default)\n" +
	"      --no-write-locales     Use a custom locale generation script\n" +
	"      --content-at-root      Serve default language at root URLs (default)\n" +
	"      --no-content-at-root   Serve default language under a locale prefix\n" +
	"      --collection           Expose locales as a CloudCannon collection (default)\n" +
	"      --no-collection        Don't create a locales collection\n" +
	"  -h, --help                 Show this help message\n";

export async function run(argv: string[]): Promise<void> {
	if (argv.includes("--help") || argv.includes("-h")) {
		console.log(HELP_TEXT);
		process.exit(0);
	}

	const flags = parseFlags(argv);

	console.log("\nRosey + CloudCannon setup wizard\n");

	const ctx = detectProject();

	// Rosey config (env over file) supplies prompt defaults below; CLI flags
	// still win. roseyDir is derived from the config's `locales` directory.
	const rosey = resolveRoseyConfig();
	const roseyDirDefault = rosey.localesDir
		? path.dirname(rosey.localesDir)
		: "rosey";

	if (rosey.source || rosey.languages || rosey.defaultLanguage) {
		const bits = [
			rosey.source && `source=${rosey.source}`,
			rosey.languages && `languages=${rosey.languages.join(",")}`,
			rosey.defaultLanguage && `default_language=${rosey.defaultLanguage}`,
		].filter(Boolean);
		console.log(`  Detected Rosey config: ${bits.join(", ")}`);
	}

	if (ctx.buildDir) {
		console.log(`  Detected build directory: ${ctx.buildDir}`);
	}
	if (ctx.ccConfigPath) {
		console.log(`  Detected CloudCannon config: ${ctx.ccConfigPath}`);
	}
	if (ctx.roseyInstalled || ctx.rccInstalled) {
		const installed = [
			ctx.roseyInstalled && "rosey",
			ctx.rccInstalled && "rosey-cloudcannon-connector",
		]
			.filter(Boolean)
			.join(", ");
		console.log(`  Already installed: ${installed}`);
	}
	if (ctx.bookshopDetected) {
		console.log("  Bookshop detected: yes");
	}
	console.log("");

	// ── Headless mode (--yes) ───────────────────────────────────────

	if (flags.yes) {
		// flags.locales is already normalized; config `languages` may not be.
		const locales = (flags.locales ?? rosey.languages)
			?.map((l) => l.trim().toLowerCase())
			.filter(Boolean);
		if (!locales || locales.length === 0) {
			console.error(
				"Error: locales are required in non-interactive mode (--yes). " +
					"Pass --locales, or set `languages` in your rosey config.",
			);
			process.exit(1);
		}

		const answers: WizardAnswers = {
			locales,
			defaultLanguage: flags.defaultLanguage ?? rosey.defaultLanguage ?? "en",
			useBuiltinWriteLocales: flags.useBuiltinWriteLocales ?? true,
			contentAtRoot: flags.contentAtRoot ?? true,
			exposeAsCollection: flags.exposeAsCollection ?? true,
			buildDir: flags.buildDir ?? rosey.source ?? ctx.buildDir ?? "dist",
			roseyDir: flags.roseyDir ?? roseyDirDefault,
			ccSource: ctx.ccSource,
		};

		console.log(`  Locales: ${answers.locales.join(", ")}`);
		console.log(`  Default language: ${answers.defaultLanguage}`);
		console.log(`  Build dir: ${answers.buildDir}`);
		console.log(`  Rosey dir: ${answers.roseyDir}`);
		if (ctx.ccSource) console.log(`  CC source: ${ctx.ccSource}`);
		console.log(
			`  Write-locales: ${answers.useBuiltinWriteLocales ? "built-in" : "custom"}`,
		);
		console.log(`  Content at root: ${answers.contentAtRoot}`);
		console.log(`  Expose as collection: ${answers.exposeAsCollection}`);
		console.log("");

		installDependencies(ctx);
		writePostbuild(ctx, answers);
		removeSourceKey(ctx);
		updateCloudCannonConfig(ctx, answers);
		printInstructions(answers, { bookshopDetected: ctx.bookshopDetected });
		return;
	}

	// ── Interactive mode ────────────────────────────────────────────

	const localesRaw = await askText(
		"What locales do you want to support? (comma-separated, e.g. fr,de,es)",
		flags.locales?.join(",") ?? rosey.languages?.join(","),
	);
	if (!localesRaw) {
		console.error("At least one locale is required.");
		closePrompts();
		process.exit(1);
	}
	const locales = localesRaw
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);

	const defaultLanguage = await askText(
		"What is the default/source language?",
		flags.defaultLanguage ?? rosey.defaultLanguage ?? "en",
	);

	let useBuiltinWriteLocales: boolean;
	if (flags.useBuiltinWriteLocales !== undefined) {
		useBuiltinWriteLocales = flags.useBuiltinWriteLocales;
	} else {
		useBuiltinWriteLocales =
			(await askSelect(
				"How do you want to generate locale files from Rosey's base.json?",
				[
					{
						label: "Use the built-in write-locales command",
						value: "builtin",
					},
					{
						label:
							"Write my own script (e.g. for external translation services)",
						value: "custom",
					},
				],
			)) === "builtin";
	}

	let contentAtRoot: boolean;
	if (flags.contentAtRoot !== undefined) {
		contentAtRoot = flags.contentAtRoot;
	} else {
		contentAtRoot =
			(await askSelect(
				"How should the original (default language) content be served?",
				[
					{
						label: "At the root — original URLs stay as-is (e.g. /about/)",
						value: "root",
					},
					{
						label: `Under a locale prefix with a redirect at the root (e.g. /${defaultLanguage}/about/)`,
						value: "redirect",
					},
				],
			)) === "root";
	}

	let exposeAsCollection: boolean;
	if (flags.exposeAsCollection !== undefined) {
		exposeAsCollection = flags.exposeAsCollection;
	} else {
		exposeAsCollection = await askConfirm(
			"Expose locale files as a browsable data collection in CloudCannon?",
			true,
		);
	}

	const buildDir = await askText(
		"Build output directory?",
		flags.buildDir ?? rosey.source ?? ctx.buildDir ?? "dist",
	);

	const roseyDir = await askText(
		"Rosey source directory?",
		flags.roseyDir ?? roseyDirDefault,
	);

	const answers: WizardAnswers = {
		locales,
		defaultLanguage,
		useBuiltinWriteLocales,
		contentAtRoot,
		exposeAsCollection,
		buildDir,
		roseyDir,
		ccSource: ctx.ccSource,
	};

	// ── Postbuild confirmation (before closing prompts) ──────────────

	let writePostbuildFile = true;
	if (ctx.postbuildExists) {
		console.log("\n  Existing .cloudcannon/postbuild found.");
		console.log("  The following Rosey commands will be appended:\n");
		// Render exactly what writePostbuild appends (the "# Rosey"-headed block).
		const preview = `# Rosey\n${buildPostbuildBlock(answers)}`;
		for (const line of preview.split("\n")) {
			console.log(`    ${line}`);
		}
		console.log("");
		writePostbuildFile = await askConfirm("Append these commands?", true);
	}

	let shouldRemoveSource = false;
	if (hasRealSource(ctx)) {
		shouldRemoveSource = await askConfirm(
			`Your config has \`source: ${ctx.ccSource}\`. This must be removed for locale files to work. Remove it and update all affected paths?`,
			true,
		);
	}

	closePrompts();

	// ── Actions ──────────────────────────────────────────────────────

	console.log("");

	installDependencies(ctx);

	if (writePostbuildFile) {
		writePostbuild(ctx, answers);
	} else {
		console.log("  Skipped .cloudcannon/postbuild (user declined).");
	}

	if (shouldRemoveSource) {
		removeSourceKey(ctx);
	} else if (hasRealSource(ctx)) {
		console.log(
			"\n⚠  `source` key was not removed. Locale editing may not work until it is removed manually.",
		);
	}

	updateCloudCannonConfig(ctx, answers);

	printInstructions(answers, { bookshopDetected: ctx.bookshopDetected });
}
