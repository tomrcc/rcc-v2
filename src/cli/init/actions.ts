import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ProjectContext } from "./detect";
import type { WizardAnswers } from "./index";

// ── Install dependencies ────────────────────────────────────────────

export function installDependencies(ctx: ProjectContext): void {
	if (!ctx.hasPackageJson) {
		console.log(
			"\n⚠  No package.json found — skipping dependency installation.",
		);
		console.log(
			"   Install manually: npm install rosey rosey-cloudcannon-connector",
		);
		return;
	}

	const pkgs: string[] = [];
	if (!ctx.roseyInstalled) pkgs.push("rosey");
	if (!ctx.rccInstalled) pkgs.push("rosey-cloudcannon-connector");

	if (pkgs.length === 0) {
		console.log(
			"\n✓  rosey and rosey-cloudcannon-connector already installed.",
		);
		return;
	}

	const installCmd = {
		npm: `npm install ${pkgs.join(" ")}`,
		yarn: `yarn add ${pkgs.join(" ")}`,
		pnpm: `pnpm add ${pkgs.join(" ")}`,
		bun: `bun add ${pkgs.join(" ")}`,
	}[ctx.packageManager];

	console.log(`\nInstalling ${pkgs.join(", ")}...`);
	try {
		execSync(installCmd, { stdio: "inherit" });
		console.log("✓  Dependencies installed.");
	} catch {
		console.error(`\n⚠  Install failed. Run manually: ${installCmd}`);
	}
}

// ── Postbuild script ────────────────────────────────────────────────

function buildPostbuildBlock(answers: WizardAnswers): string {
	const { buildDir, roseyDir, locales, useBuiltinWriteLocales, contentAtRoot } =
		answers;
	const rootFlag = contentAtRoot ? "--default-language-at-root" : "";

	const lines: string[] = [];

	if (useBuiltinWriteLocales) {
		lines.push(`npx rosey generate --source ${buildDir}`);
		lines.push(
			`npx rosey-cloudcannon-connector write-locales --source ${roseyDir} --dest ${buildDir} --locales ${locales.join(",")}`,
		);
	} else {
		lines.push(`npx rosey generate --source ${buildDir}`);
		lines.push("");
		lines.push("# TODO: Replace with your custom locale generation script.");
		lines.push("# Your script should:");
		lines.push(`#   1. Read ${roseyDir}/base.json for translation keys`);
		lines.push(
			`#   2. Create/update locale files at ${roseyDir}/locales/{code}.json`,
		);
		lines.push(
			`#   3. Write a locale manifest array to ${buildDir}/_rcc/locales.json`,
		);
		lines.push(
			`# npx rosey-cloudcannon-connector write-locales --source ${roseyDir} --dest ${buildDir}`,
		);
	}

	lines.push("");
	lines.push(`mv ./${buildDir} ./_untranslated_site`);
	lines.push(
		`npx rosey build --source _untranslated_site --dest ${buildDir}${rootFlag ? ` ${rootFlag}` : ""} --exclusions "\\.(html?)$"`,
	);

	return lines.join("\n");
}

export function writePostbuild(
	ctx: ProjectContext,
	answers: WizardAnswers,
): void {
	const dir = path.join(process.cwd(), ".cloudcannon");
	const filePath = path.join(dir, "postbuild");

	const block = buildPostbuildBlock(answers);

	if (ctx.postbuildExists && ctx.postbuildContent != null) {
		const appended = `${ctx.postbuildContent.trimEnd()}\n\n# Rosey\n${block}\n`;
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(filePath, appended);
		console.log("✓  Appended Rosey commands to .cloudcannon/postbuild");
	} else {
		const content = `#!/usr/bin/env bash\n\n# Rosey\n${block}\n`;
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(filePath, content, { mode: 0o755 });
		console.log("✓  Created .cloudcannon/postbuild");
	}
}

// ── Rosey config ────────────────────────────────────────────────────

export function writeRoseyConfig(
	ctx: ProjectContext,
	answers: WizardAnswers,
): void {
	if (ctx.roseyConfigExists) {
		console.log("✓  Rosey config already exists — skipping.");
		return;
	}

	const content = [
		`source: ${answers.buildDir}`,
		`default_language: ${answers.defaultLanguage}`,
		"",
	].join("\n");

	fs.writeFileSync(path.join(process.cwd(), "rosey.yml"), content);
	console.log("✓  Created rosey.yml");
}

// ── Remove `source` key ─────────────────────────────────────────────

function rewriteYamlSourcePaths(content: string, source: string): string {
	const lines = content.split("\n");
	const result: string[] = [];

	let currentTopBlock: string | null = null;
	let inSchemas = false;
	let schemasBaseIndent = -1;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trimStart();
		const indent = line.length - trimmed.length;

		if (/^source:\s/.test(line)) {
			if (i + 1 < lines.length && lines[i + 1].trim() === "") {
				i++;
			}
			continue;
		}

		if (indent === 0 && trimmed.includes(":")) {
			currentTopBlock = trimmed.split(":")[0];
			inSchemas = false;
			schemasBaseIndent = -1;
			result.push(line);
			continue;
		}

		if (currentTopBlock === "paths" && indent > 0) {
			const m = trimmed.match(/^(\S+):\s*(.*)$/);
			if (m) {
				const key = m[1];
				const rawValue = m[2].replace(/^['"]|['"]$/g, "").trim();
				const newValue =
					rawValue === "" ? source : `${source}/${rawValue}`;
				result.push(`${line.substring(0, indent)}${key}: ${newValue}`);
				continue;
			}
		}

		if (currentTopBlock === "collections_config" && indent > 0) {
			if (/^schemas:\s*$/.test(trimmed)) {
				inSchemas = true;
				schemasBaseIndent = indent;
				result.push(line);
				continue;
			}

			if (inSchemas && indent <= schemasBaseIndent) {
				inSchemas = false;
				schemasBaseIndent = -1;
			}

			if (!inSchemas) {
				const m = trimmed.match(/^path:\s*(.+)$/);
				if (m) {
					result.push(
						`${line.substring(0, indent)}path: ${source}/${m[1]}`,
					);
					continue;
				}
			}
		}

		if (currentTopBlock === "data_config" && indent > 0) {
			const m = trimmed.match(/^path:\s*(.+)$/);
			if (m) {
				result.push(
					`${line.substring(0, indent)}path: ${source}/${m[1]}`,
				);
				continue;
			}
		}

		if (currentTopBlock === "file_config" && indent > 0) {
			const globMatch = trimmed.match(/^(-\s+)?glob:\s*(.+)$/);
			if (globMatch) {
				const prefix = line.substring(0, indent);
				const arrayMarker = globMatch[1] ?? "";
				result.push(
					`${prefix}${arrayMarker}glob: ${source}/${globMatch[2]}`,
				);
				continue;
			}
		}

		result.push(line);
	}

	return result.join("\n");
}

function removeSourceFromJson(content: string, source: string): string {
	const config = JSON.parse(content);
	delete config.source;

	if (config.paths) {
		for (const key of Object.keys(config.paths)) {
			const val = config.paths[key];
			if (typeof val === "string") {
				config.paths[key] =
					val === "" ? source : `${source}/${val}`;
			}
		}
	}

	if (config.collections_config) {
		for (const coll of Object.values(
			config.collections_config as Record<string, Record<string, unknown>>,
		)) {
			if (coll && typeof coll.path === "string") {
				coll.path = `${source}/${coll.path}`;
			}
		}
	}

	if (config.data_config) {
		for (const entry of Object.values(
			config.data_config as Record<string, Record<string, unknown>>,
		)) {
			if (entry && typeof entry.path === "string") {
				entry.path = `${source}/${entry.path}`;
			}
		}
	}

	if (Array.isArray(config.file_config)) {
		for (const entry of config.file_config) {
			if (entry && typeof entry === "object" && typeof entry.glob === "string") {
				entry.glob = `${source}/${entry.glob}`;
			}
		}
	}

	return `${JSON.stringify(config, null, 2)}\n`;
}

export function removeSourceKey(
	ctx: ProjectContext,
	_answers: WizardAnswers,
): void {
	if (!ctx.ccSource || ctx.ccSource === "." || ctx.ccSource === "/") return;
	if (!ctx.ccConfigPath) return;

	const source = ctx.ccSource.replace(/\/+$/, "");
	const raw = fs.readFileSync(ctx.ccConfigPath, "utf-8");
	let updated: string;

	if (ctx.ccConfigFormat === "json") {
		updated = removeSourceFromJson(raw, source);
	} else if (ctx.ccConfigFormat === "yml" || ctx.ccConfigFormat === "yaml") {
		updated = rewriteYamlSourcePaths(raw, source);
	} else {
		console.log(
			`\n⚠  Cannot automatically remove \`source\` from ${path.basename(ctx.ccConfigPath)}.`,
		);
		console.log(
			`   Remove \`source: ${ctx.ccSource}\` manually and prepend "${source}/" to all collection, data, and file_config paths.`,
		);
		return;
	}

	fs.writeFileSync(ctx.ccConfigPath, updated);
	console.log(
		`✓  Removed \`source: ${ctx.ccSource}\` and updated paths in ${path.basename(ctx.ccConfigPath)}`,
	);
}

// ── CloudCannon config ──────────────────────────────────────────────

function buildDataConfigYaml(answers: WizardAnswers, indent: string): string {
	return answers.locales
		.map(
			(locale) =>
				`${indent}locales_${locale}:\n${indent}  path: ${answers.roseyDir}/locales/${locale}.json`,
		)
		.join("\n");
}

function buildCollectionsConfigYaml(
	answers: WizardAnswers,
	indent: string,
): string {
	const lines = [
		`${indent}locales:`,
		`${indent}  path: ${answers.roseyDir}/locales`,
		`${indent}  name: Locales`,
		`${indent}  icon: translate`,
		`${indent}  disable_add: true`,
		`${indent}  disable_add_folder: true`,
		`${indent}  disable_file_actions: true`,
		`${indent}  _inputs:`,
		`${indent}    value:`,
		`${indent}      type: html`,
		`${indent}      label: Translation`,
		`${indent}      cascade: true`,
		`${indent}    original:`,
		`${indent}      hidden: true`,
		`${indent}      cascade: true`,
		`${indent}    _base_original:`,
		`${indent}      disabled: true`,
		`${indent}      hidden: false`,
		`${indent}      label: Original Text`,
		`${indent}      cascade: true`,
	];
	return lines.join("\n");
}

function buildDataConfigJson(answers: WizardAnswers): Record<string, unknown> {
	const obj: Record<string, unknown> = {};
	for (const locale of answers.locales) {
		obj[`locales_${locale}`] = {
			path: `${answers.roseyDir}/locales/${locale}.json`,
		};
	}
	return obj;
}

function buildCollectionsConfigJson(
	answers: WizardAnswers,
): Record<string, unknown> {
	return {
		locales: {
			path: `${answers.roseyDir}/locales`,
			name: "Locales",
			icon: "translate",
			disable_add: true,
			disable_add_folder: true,
			disable_file_actions: true,
			_inputs: {
				value: { type: "html", label: "Translation", cascade: true },
				original: { hidden: true, cascade: true },
				_base_original: { disabled: true, cascade: true },
			},
		},
	};
}

/**
 * Find the end of a top-level YAML block (e.g. `data_config:`) and return
 * the index of the last character belonging to that block. Returns -1 if
 * the key is not found.
 */
function findYamlBlockEnd(content: string, key: string): number {
	const regex = new RegExp(`^${key}:\\s*$`, "m");
	const match = regex.exec(content);
	if (!match) return -1;

	const startIdx = match.index + match[0].length;
	const lines = content.slice(startIdx).split("\n");

	let endIdx = startIdx;
	for (const line of lines) {
		if (line.trim() === "" || /^\s/.test(line)) {
			endIdx += line.length + 1; // +1 for the newline
		} else {
			break;
		}
	}

	return endIdx;
}

/**
 * Detect the indentation used under a top-level YAML key. Falls back to
 * two spaces.
 */
function detectIndent(content: string, key: string): string {
	const regex = new RegExp(`^${key}:\\s*\\n([ \\t]+)`, "m");
	const match = regex.exec(content);
	return match ? match[1] : "  ";
}

/** Check whether a YAML file already has a `locales_XX:` entry for a given locale. */
function hasLocaleEntry(content: string, locale: string): boolean {
	return new RegExp(`^\\s+locales_${locale}:`, "m").test(content);
}

function updateYamlConfig(content: string, answers: WizardAnswers): string {
	let result = content;

	// ── data_config ──
	const missingDataLocales = answers.locales.filter(
		(l) => !hasLocaleEntry(result, l),
	);

	if (missingDataLocales.length > 0) {
		const blockEnd = findYamlBlockEnd(result, "data_config");
		const indent = detectIndent(result, "data_config") || "  ";

		const newEntries = missingDataLocales
			.map(
				(l) =>
					`${indent}locales_${l}:\n${indent}  path: ${answers.roseyDir}/locales/${l}.json`,
			)
			.join("\n");

		if (blockEnd === -1) {
			result = `${result.trimEnd()}\ndata_config:\n${newEntries}\n`;
		} else {
			result = `${result.slice(0, blockEnd)}${newEntries}\n${result.slice(blockEnd)}`;
		}
	}

	// ── collections_config (optional) ──
	if (answers.exposeAsCollection) {
		const hasCollection =
			/^\s+locales:/m.test(result) && result.includes("collections_config");
		if (!hasCollection) {
			const collectionsEnd = findYamlBlockEnd(result, "collections_config");
			const indent = detectIndent(result, "collections_config") || "  ";
			const entry = buildCollectionsConfigYaml(answers, indent);

			if (collectionsEnd === -1) {
				result = `${result.trimEnd()}\ncollections_config:\n${entry}\n`;
			} else {
				result = `${result.slice(0, collectionsEnd)}${entry}\n${result.slice(collectionsEnd)}`;
			}
		}
	}

	return result;
}

function updateJsonConfig(content: string, answers: WizardAnswers): string {
	const config = JSON.parse(content);

	if (!config.data_config) config.data_config = {};
	const newDataEntries = buildDataConfigJson(answers);
	for (const [key, value] of Object.entries(newDataEntries)) {
		if (!(key in config.data_config)) {
			config.data_config[key] = value;
		}
	}

	if (answers.exposeAsCollection) {
		if (!config.collections_config) config.collections_config = {};
		if (!config.collections_config.locales) {
			Object.assign(
				config.collections_config,
				buildCollectionsConfigJson(answers),
			);
		}
	}

	return `${JSON.stringify(config, null, 2)}\n`;
}

function buildFreshYamlConfig(answers: WizardAnswers): string {
	const lines: string[] = [];

	lines.push("data_config:");
	lines.push(buildDataConfigYaml(answers, "  "));

	if (answers.exposeAsCollection) {
		lines.push("collections_config:");
		lines.push(buildCollectionsConfigYaml(answers, "  "));
	}

	return `${lines.join("\n")}\n`;
}

export function updateCloudCannonConfig(
	ctx: ProjectContext,
	answers: WizardAnswers,
): void {
	if (ctx.ccConfigFormat === "cjs") {
		console.log("\n⚠  Cannot automatically modify cloudcannon.config.cjs.");
		console.log("   Add the following to your config manually:\n");
		console.log("   data_config:");
		for (const locale of answers.locales) {
			console.log(`     locales_${locale}:`);
			console.log(`       path: ${answers.roseyDir}/locales/${locale}.json`);
		}
		if (answers.exposeAsCollection) {
			console.log("\n   collections_config:");
			console.log(buildCollectionsConfigYaml(answers, "     "));
		}
		return;
	}

	if (!ctx.ccConfigPath) {
		const newPath = path.join(process.cwd(), "cloudcannon.config.yml");
		fs.writeFileSync(newPath, buildFreshYamlConfig(answers));
		console.log("✓  Created cloudcannon.config.yml");
		return;
	}

	const raw = fs.readFileSync(ctx.ccConfigPath, "utf-8");
	let updated: string;

	if (ctx.ccConfigFormat === "json") {
		updated = updateJsonConfig(raw, answers);
	} else {
		updated = updateYamlConfig(raw, answers);
	}

	if (updated !== raw) {
		fs.writeFileSync(ctx.ccConfigPath, updated);
		console.log(`✓  Updated ${path.basename(ctx.ccConfigPath)}`);
	} else {
		console.log(
			`✓  ${path.basename(ctx.ccConfigPath)} already has the required entries.`,
		);
	}
}

// ── Follow-up instructions ──────────────────────────────────────────

export function printInstructions(answers: WizardAnswers): void {
	const { buildDir, defaultLanguage, roseyDir } = answers;

	console.log("\n────────────────────────────────────────────");
	console.log("  Next steps");
	console.log("────────────────────────────────────────────\n");

	console.log("1. Sync paths");
	console.log("   Set the CLOUDCANNON_SYNC_PATHS environment variable in your");
	console.log("   CloudCannon site settings so that files generated during the");
	console.log("   build (base.json + locale files) are synced back to your repo:");
	console.log(`     CLOUDCANNON_SYNC_PATHS=/${roseyDir}/\n`);

	console.log("2. HTML lang attribute");
	console.log(
		`   Ensure your root <html> tag has lang="${defaultLanguage}" set.`,
	);
	console.log("   This tells Rosey the source language of your content.\n");

	console.log("3. Tag translatable content");
	console.log("   Add data-rosey attributes to translatable elements in");
	console.log("   your templates. See: https://rosey.app/docs/\n");

	console.log("4. Import the RCC");
	console.log("   Add this to your root layout to enable visual");
	console.log("   locale editing in CloudCannon:\n");
	console.log("     <script>");
	console.log("       if (window?.inEditorMode) {");
	console.log('         import("rosey-cloudcannon-connector");');
	console.log("       }");
	console.log("     </script>\n");

	console.log("5. First run");
	console.log("   Build your site, then run:");
	console.log(`     npx rosey generate --source ${buildDir}`);
	console.log("   to create the initial base.json. After that, the");
	console.log("   postbuild script handles everything automatically.\n");
}
