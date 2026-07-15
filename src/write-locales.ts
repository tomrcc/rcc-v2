import fs from "node:fs";
import path from "node:path";
import { CC_CONFIG_FILES } from "./cc-config-files";
import type { LocaleEntry } from "./types";

export interface WriteLocalesOptions {
	roseyDir?: string;
	locales?: string[];
	/** Build output directory. Writes a locale manifest to {dest}/_rcc/locales.json for runtime locale discovery. */
	dest: string;
	/** When true, keys in the locale file that are not in base.json are preserved instead of deleted. Useful during migration to remap translations before cleanup. */
	keepUnused?: boolean;
}

interface BaseJsonKey {
	original: string;
	value: string | null;
	pages: Record<string, number>;
	total: number;
}

interface BaseJson {
	version: number;
	keys: Record<string, BaseJsonKey>;
}

/** Treat null/undefined and whitespace-only strings as empty. */
function isEmptyText(s: string | null | undefined): boolean {
	return s == null || s.trim() === "";
}

// Conservative normalization for the strings RCC bakes into locale files. Rosey
// copies source verbatim into base.json — leading/trailing whitespace (" X ",
// "…\n  ") and XHTML-style `<br/>` — which then renders with a stray gap in the
// Visual Editor and (for <br>) reads as perpetually stale against the DOM. We
// trim the ends and canonicalize <br> to match what the browser produces.
//
// Deliberately narrower than stale.ts's normalizeSource: that one is a throwaway
// compare key and collapses ALL internal whitespace; this mutates strings that
// get rendered verbatim, so collapsing interior whitespace would corrupt
// <pre>/<code>. Keep this to outer trim + <br> only.
function normalizeStored(s: string): string {
	return s.replace(/<br\b[^>]*>/gi, "<br>").trim();
}

function sortKeys(
	obj: Record<string, LocaleEntry>,
): Record<string, LocaleEntry> {
	return Object.fromEntries(
		Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)),
	);
}

export async function writeLocales(
	options: WriteLocalesOptions,
): Promise<void> {
	const roseyDir = options.roseyDir ?? "rosey";
	const dest = options.dest;
	if (!dest) {
		console.error("RCC: dest is required. Pass the build output directory.");
		process.exit(1);
	}
	let locales = options.locales;

	const baseJsonPath = path.join(roseyDir, "base.json");
	const baseJsonRaw = await fs.promises
		.readFile(baseJsonPath, "utf-8")
		.catch(() => {
			console.error(
				`RCC: Could not read ${baseJsonPath}. Run rosey generate first.`,
			);
			process.exit(1);
		});

	const baseJson: BaseJson = JSON.parse(baseJsonRaw);
	const keys = baseJson.keys;

	const localesDir = path.join(roseyDir, "locales");
	await fs.promises.mkdir(localesDir, { recursive: true });

	if (!locales || locales.length === 0) {
		const files = await fs.promises.readdir(localesDir);
		locales = files
			.filter((f) => f.endsWith(".json") && !f.endsWith(".urls.json"))
			.map((f) => f.replace(/\.json$/, ""));

		if (locales.length === 0) {
			console.warn(
				"RCC: No locales specified and no existing locale files found. " +
					"Use --locales to specify locale codes.",
			);
			return;
		}
	}

	for (const locale of locales) {
		const localePath = path.join(localesDir, `${locale}.json`);
		let existing: Record<string, LocaleEntry> = {};

		try {
			const raw = await fs.promises.readFile(localePath, "utf-8");
			existing = JSON.parse(raw);
		} catch {
			// File doesn't exist yet — start fresh
		}

		const unusedKeys = Object.keys(existing).filter((key) => !(key in keys));
		if (!options.keepUnused) {
			for (const key of unusedKeys) {
				delete existing[key];
			}
		}

		let addedCount = 0;
		let prunedEmpty = 0;
		for (const [key, entry] of Object.entries(keys)) {
			// Empty source ⇒ nothing to translate: don't write an entry. Prune an
			// existing entry only when its value is also empty (a placeholder), so a
			// real translation typed against an empty source is never discarded.
			if (isEmptyText(entry.original)) {
				if (existing[key] && isEmptyText(existing[key].value)) {
					delete existing[key];
					prunedEmpty++;
				}
				continue;
			}
			const normalizedOriginal = normalizeStored(entry.original);
			if (!existing[key]) {
				existing[key] = {
					original: normalizedOriginal,
					value: normalizedOriginal,
					_base_original: normalizedOriginal,
				};
				addedCount++;
			} else {
				// Refresh the RCC-managed source-of-last-build. `original` (the review
				// anchor) and `value` (the translation) are left untouched — stale
				// detection re-normalizes both sides at compare time, so an untrimmed
				// legacy `original` here never produces a false stale.
				existing[key]._base_original = normalizedOriginal;
			}
		}

		await fs.promises.writeFile(
			localePath,
			JSON.stringify(sortKeys(existing), null, 2),
		);
		const removedMsg = options.keepUnused
			? `${unusedKeys.length} unused kept`
			: `${unusedKeys.length} removed`;
		console.log(
			`RCC: Wrote ${localePath} — ${Object.keys(existing).length} keys (${addedCount} added, ${removedMsg}, ${prunedEmpty} empty pruned)`,
		);
	}

	const manifest = { locales };

	const rccDir = path.join(dest, "_rcc");
	await fs.promises.mkdir(rccDir, { recursive: true });
	const manifestPath = path.join(rccDir, "locales.json");
	await fs.promises.writeFile(manifestPath, JSON.stringify(manifest));
	console.log(`RCC: Wrote locale manifest → ${manifestPath}`);

	await validateDataConfig(locales, roseyDir);
}

// ---------------------------------------------------------------------------
// CloudCannon config reading
// ---------------------------------------------------------------------------

interface CCConfigResult {
	raw: string;
	path: string;
}

async function readCCConfig(): Promise<CCConfigResult | null> {
	for (const { file } of CC_CONFIG_FILES) {
		try {
			const raw = await fs.promises.readFile(file, "utf-8");
			return { raw, path: file };
		} catch {}
	}
	return null;
}

// ---------------------------------------------------------------------------
// Data config validation
// ---------------------------------------------------------------------------

async function validateDataConfig(
	locales: string[],
	roseyDir: string,
): Promise<void> {
	const config = await readCCConfig();
	if (!config) return;

	const missing: string[] = [];
	for (const locale of locales) {
		// Anchored `locales_<code>:` match so `en` doesn't match `locales_en_GB`
		// (and vice-versa), and a bare mention in a comment doesn't count.
		const present = new RegExp(`(^|\\s)locales_${locale}:`, "m").test(
			config.raw,
		);
		if (!present) missing.push(locale);
	}

	if (missing.length > 0) {
		console.warn(
			`RCC: Missing data_config entries in ${config.path}. Add:\n` +
				missing
					.map(
						(l) => `  locales_${l}:\n    path: ${roseyDir}/locales/${l}.json`,
					)
					.join("\n"),
		);
	}
}
