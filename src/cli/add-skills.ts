import { cpSync, existsSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

const SKILLS_SOURCE = resolve(__dirname, "../../skills");

function collectFiles(dir: string, base: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const rel = join(base, entry);
		if (statSync(full).isDirectory()) {
			files.push(...collectFiles(full, rel));
		} else {
			files.push(rel);
		}
	}
	return files;
}

export function run(argv: string[]): void {
	let dest = join(".cursor", "skills");
	let force = false;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if ((arg === "--dest" || arg === "-d") && argv[i + 1]) {
			dest = argv[++i];
		} else if (arg === "--force" || arg === "-f") {
			force = true;
		} else if (arg === "--help" || arg === "-h") {
			console.log(
				"Usage: rosey-cloudcannon-connector add-skills [options]\n\n" +
					"Copy agent skill files into your project.\n\n" +
					"Options:\n" +
					"  -d, --dest <dir>  Destination directory (default: .cursor/skills)\n" +
					"  -f, --force       Overwrite existing files\n" +
					"  -h, --help        Show this help message\n",
			);
			process.exit(0);
		}
	}

	if (!existsSync(SKILLS_SOURCE)) {
		console.error(
			"Error: Skills directory not found in the installed package. " +
				"This may indicate a broken installation — try reinstalling rosey-cloudcannon-connector.",
		);
		process.exit(1);
	}

	const files = collectFiles(SKILLS_SOURCE, "");
	let copied = 0;
	let skipped = 0;

	for (const relPath of files) {
		const src = join(SKILLS_SOURCE, relPath);
		const target = join(dest, relPath);

		if (existsSync(target) && !force) {
			console.log(`  skip  ${relPath} (already exists, use --force to overwrite)`);
			skipped++;
			continue;
		}

		cpSync(src, target, { recursive: true });
		console.log(`  copy  ${relPath}`);
		copied++;
	}

	console.log(
		`\nCopied ${copied} file${copied !== 1 ? "s" : ""} to ${dest}/${skipped > 0 ? ` (${skipped} skipped)` : ""}`,
	);

	if (copied > 0) {
		console.log(
			"\nSkills available:\n" +
				"  translate-locale-files          — Translate untranslated/stale entries in locale files\n" +
				"  translate-content-collections   — Translate split-by-directory content collection files\n" +
				"  make-site-multilingual          — Set up Rosey/RCC/CloudCannon from scratch\n" +
				"  migrate-i18n-to-rosey           — Replace an existing i18n system with Rosey\n" +
				"  migrate-rcc-v1-to-v2            — Upgrade from RCC v1 to v2\n",
		);
	}
}
