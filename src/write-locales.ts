import fs from "node:fs";
import path from "node:path";

export interface WriteLocalesOptions {
	roseyDir?: string;
	locales?: string[];
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
}

function sortKeys(
	obj: Record<string, LocaleEntry>,
): Record<string, LocaleEntry> {
	return Object.fromEntries(
		Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)),
	);
}

export async function writeLocales(
	options: WriteLocalesOptions = {},
): Promise<void> {
	const roseyDir = options.roseyDir ?? "rosey";
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
			.filter((f) => f.endsWith(".json"))
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

		for (const [key, entry] of Object.entries(keys)) {
			if (!existing[key]) {
				existing[key] = {
					original: entry.original,
					value: entry.original,
				};
			}
		}

		await fs.promises.writeFile(
			localePath,
			JSON.stringify(sortKeys(existing), null, 2),
		);
		console.log(`RCC: Wrote ${Object.keys(existing).length} keys to ${localePath}`);
	}
}
