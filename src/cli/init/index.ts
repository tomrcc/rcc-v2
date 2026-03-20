import {
	installDependencies,
	printInstructions,
	updateCloudCannonConfig,
	writePostbuild,
	writeRoseyConfig,
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
}

export async function run(argv: string[]): Promise<void> {
	if (argv.includes("--help") || argv.includes("-h")) {
		console.log(
			"Usage: rosey-cloudcannon-connector init\n\n" +
				"Interactive setup wizard that configures Rosey and the\n" +
				"CloudCannon connector for your project. No flags required —\n" +
				"the wizard will prompt for all options.\n",
		);
		process.exit(0);
	}

	console.log("\nRosey + CloudCannon setup wizard\n");

	const ctx = detectProject();

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
	console.log("");

	// ── Questions ────────────────────────────────────────────────────

	const localesRaw = await askText(
		"What locales do you want to support? (comma-separated, e.g. fr,de,es)",
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
		"en",
	);

	const useBuiltinWriteLocales =
		(await askSelect(
			"How do you want to generate locale files from Rosey's base.json?",
			[
				{
					label: "Use the built-in write-locales command",
					value: "builtin",
				},
				{
					label: "Write my own script (e.g. for external translation services)",
					value: "custom",
				},
			],
		)) === "builtin";

	const contentAtRoot =
		(await askSelect(
			"How should the original (default language) content be served?",
			[
				{
					label: `At the root — original URLs stay as-is (e.g. /about/)`,
					value: "root",
				},
				{
					label: `Under a locale prefix with a redirect at the root (e.g. /${defaultLanguage}/about/)`,
					value: "redirect",
				},
			],
		)) === "root";

	const exposeAsCollection = await askConfirm(
		"Expose locale files as a browsable data collection in CloudCannon?",
		true,
	);

	const buildDir = await askText(
		"Build output directory?",
		ctx.buildDir || "dist",
	);

	const roseyDir = await askText("Rosey source directory?", "rosey");

	const answers: WizardAnswers = {
		locales,
		defaultLanguage,
		useBuiltinWriteLocales,
		contentAtRoot,
		exposeAsCollection,
		buildDir,
		roseyDir,
	};

	// ── Postbuild confirmation (before closing prompts) ──────────────

	let writePostbuildFile = true;
	if (ctx.postbuildExists) {
		console.log("\n  Existing .cloudcannon/postbuild found.");
		console.log("  The following Rosey commands will be appended:\n");
		const preview = buildPostbuildPreview(answers);
		for (const line of preview.split("\n")) {
			console.log(`    ${line}`);
		}
		console.log("");
		writePostbuildFile = await askConfirm("Append these commands?", true);
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

	writeRoseyConfig(ctx, answers);

	updateCloudCannonConfig(ctx, answers);

	printInstructions(answers);
}

function buildPostbuildPreview(answers: WizardAnswers): string {
	const { buildDir, roseyDir, locales, useBuiltinWriteLocales, contentAtRoot } =
		answers;
	const rootFlag = contentAtRoot ? " --default-language-at-root" : "";

	const lines: string[] = ["# Rosey"];

	if (useBuiltinWriteLocales) {
		lines.push(`npx rosey generate --source ${buildDir}`);
		lines.push(
			`npx rosey-cloudcannon-connector write-locales --source ${roseyDir} --dest ${buildDir} --locales ${locales.join(",")}`,
		);
	} else {
		lines.push(`npx rosey generate --source ${buildDir}`);
		lines.push("# TODO: Add your custom locale generation script here");
	}

	lines.push(`mv ./${buildDir} ./_untranslated_site`);
	lines.push(
		`npx rosey build --source _untranslated_site --dest ${buildDir}${rootFlag}`,
	);
	lines.push(`cp -r _untranslated_site/_rcc ${buildDir}/_rcc`);

	return lines.join("\n");
}
