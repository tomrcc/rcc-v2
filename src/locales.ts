import { log, warn } from "./logger";

// ---------------------------------------------------------------------------
// RTL locale detection
// ---------------------------------------------------------------------------

const RTL_LOCALES = new Set([
	"ar",
	"he",
	"fa",
	"ur",
	"ps",
	"sd",
	"yi",
	"ku",
	"ckb",
	"dv",
	"ug",
]);

export function isRtlLocale(locale: string): boolean {
	return RTL_LOCALES.has(locale.split("-")[0].toLowerCase());
}

// ---------------------------------------------------------------------------
// Locale discovery
// ---------------------------------------------------------------------------

/**
 * Read the runtime locale manifest written by `write-locales` to
 * `{dest}/_rcc/locales.json`. Returns null (and warns) if it's missing or
 * malformed — the switcher can't be built without it.
 */
export async function discoverLocales(): Promise<string[] | null> {
	try {
		const res = await fetch("/_rcc/locales.json");
		if (!res.ok) throw new Error(`HTTP ${res.status}`);

		const data = await res.json();
		const locales: string[] | undefined = data?.locales;
		if (!Array.isArray(locales) || locales.length === 0) {
			throw new Error("manifest missing locales array");
		}

		log("Discovered locales from manifest:", locales);
		return locales;
	} catch {
		// Manifest unavailable or malformed
	}

	warn(
		"Could not load /_rcc/locales.json. Ensure write-locales ran with --dest pointing to your build output directory.",
	);
	return null;
}
