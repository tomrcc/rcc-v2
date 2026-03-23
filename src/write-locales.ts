import fs from "node:fs";
import path from "node:path";

export interface WriteLocalesOptions {
	roseyDir?: string;
	locales?: string[];
	/** Build output directory. Writes a locale manifest to {dest}/_rcc/locales.json for runtime locale discovery. */
	dest: string;
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

interface LocaleEntry {
	original: string;
	value: string;
	_base_original?: string;
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
		for (const key of unusedKeys) {
			delete existing[key];
		}

		let addedCount = 0;
		for (const [key, entry] of Object.entries(keys)) {
			if (!existing[key]) {
				existing[key] = {
					original: entry.original,
					value: entry.original,
					_base_original: entry.original,
				};
				addedCount++;
			} else {
				existing[key]._base_original = entry.original;
			}
		}

		await fs.promises.writeFile(
			localePath,
			JSON.stringify(sortKeys(existing), null, 2),
		);
		console.log(
			`RCC: Wrote ${localePath} — ${Object.keys(existing).length} keys (${addedCount} added, ${unusedKeys.length} removed)`,
		);
	}

	const rccDir = path.join(dest, "_rcc");
	await fs.promises.mkdir(rccDir, { recursive: true });
	const manifestPath = path.join(rccDir, "locales.json");
	await fs.promises.writeFile(manifestPath, JSON.stringify(locales));
	console.log(`RCC: Wrote locale manifest → ${manifestPath}`);

	await validateDataConfig(locales);
}

async function validateDataConfig(locales: string[]): Promise<void> {
	const configPaths = [
		"cloudcannon.config.yml",
		"cloudcannon.config.yaml",
		"cloudcannon.config.json",
		"cloudcannon.config.cjs",
	];

	let configRaw: string | null = null;
	let configPath: string | null = null;
	for (const p of configPaths) {
		try {
			configRaw = await fs.promises.readFile(p, "utf-8");
			configPath = p;
			break;
		} catch {
			// try next
		}
	}

	if (!configRaw || !configPath) return;

	const missing: string[] = [];
	for (const locale of locales) {
		const key = `locales_${locale}`;
		if (!configRaw.includes(key)) {
			missing.push(locale);
		}
	}

	if (missing.length > 0) {
		console.warn(
			`RCC: Missing data_config entries in ${configPath}. Add:\n` +
				missing
					.map(
						(l) =>
							`  locales_${l}:\n    path: rosey/locales/${l}.json`,
					)
					.join("\n"),
		);
	}
}
