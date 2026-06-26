import fs from "node:fs";
import path from "node:path";

/**
 * Values read from a Rosey config file / environment, mapped to camelCase.
 * Mirrors Rosey's own keys (snake_case in the file): `source`, `dest`, `tag`,
 * `separator`, `default_language`, `languages`, `locales`.
 *
 * Note the terminology vs RCC: Rosey's `source` is the SSG build output dir
 * (RCC's "build dir"), Rosey's `languages` is the list of locale codes (RCC's
 * "locales"), and Rosey's `locales` is the locale-files *directory*.
 */
export interface RoseyConfig {
	/** SSG build output directory (RCC build dir). */
	source?: string;
	/** Translated-site output directory. */
	dest?: string;
	tag?: string;
	separator?: string;
	defaultLanguage?: string;
	/** Locale codes (RCC "locales"). */
	languages?: string[];
	/** Locale-files directory (Rosey `locales`). */
	localesDir?: string;
}

// Rosey searches rosey.{toml,yaml,yml,json}. We skip .toml deliberately to stay
// dependency-free (no TOML parser); .json is built-in and .yaml/.yml are read
// with a minimal top-level scanner — see the note in readConfigFile.
const CONFIG_FILES = ["rosey.yaml", "rosey.yml", "rosey.json"] as const;

function unquote(s: string): string {
	return s.replace(/^(['"])([\s\S]*)\1$/, "$2");
}

function splitList(inner: string): string[] {
	return inner
		.split(",")
		.map((s) => unquote(s.trim()))
		.filter(Boolean);
}

/**
 * Read a single top-level `key: value` scalar. Deliberately minimal — it only
 * understands flat top-level scalars (which is all the keys we need are), the
 * same approach the rest of the CLI already uses for cloudcannon.config.
 */
function yamlScalar(raw: string, key: string): string | undefined {
	const m = new RegExp(`^${key}:[ \\t]+(.+?)[ \\t]*$`, "m").exec(raw);
	if (!m) return undefined;
	let v = m[1].trim();
	if (!/^['"]/.test(v)) v = v.replace(/\s+#.*$/, "").trim(); // strip line comment
	v = unquote(v);
	return v || undefined;
}

/** Read a top-level list, supporting flow (`key: [a, b]`) and block (`- a`). */
function yamlList(raw: string, key: string): string[] | undefined {
	const flow = new RegExp(`^${key}:[ \\t]*\\[([^\\]]*)\\]`, "m").exec(raw);
	if (flow) {
		const items = splitList(flow[1]);
		return items.length ? items : undefined;
	}

	const block = new RegExp(`^${key}:[ \\t]*(?:#.*)?$`, "m").exec(raw);
	if (!block) return undefined;

	const rest = raw.slice(block.index + block[0].length).replace(/^\n/, "");
	const items: string[] = [];
	for (const line of rest.split("\n")) {
		if (/^[ \t]*$/.test(line)) continue; // blank
		const item = /^[ \t]+-[ \t]*(.+?)[ \t]*$/.exec(line);
		if (item) {
			items.push(unquote(item[1]));
			continue;
		}
		if (/^[ \t]/.test(line)) continue; // some other nested line — ignore
		break; // dedent to the next top-level key — list is done
	}
	return items.length ? items : undefined;
}

function fromYaml(raw: string): RoseyConfig {
	return clean({
		source: yamlScalar(raw, "source"),
		dest: yamlScalar(raw, "dest"),
		tag: yamlScalar(raw, "tag"),
		separator: yamlScalar(raw, "separator"),
		defaultLanguage: yamlScalar(raw, "default_language"),
		languages: yamlList(raw, "languages"),
		localesDir: yamlScalar(raw, "locales"),
	});
}

function fromJson(raw: string): RoseyConfig {
	const c = JSON.parse(raw);
	return clean({
		source: c.source,
		dest: c.dest,
		tag: c.tag,
		separator: c.separator,
		defaultLanguage: c.default_language,
		languages: Array.isArray(c.languages) ? c.languages : undefined,
		localesDir: c.locales,
	});
}

/** Drop undefined keys so spreads only overlay values that were actually set. */
function clean(c: RoseyConfig): RoseyConfig {
	return Object.fromEntries(
		Object.entries(c).filter(([, v]) => v != null),
	) as RoseyConfig;
}

function readConfigFile(cwd: string): RoseyConfig {
	for (const file of CONFIG_FILES) {
		const full = path.join(cwd, file);
		let raw: string;
		try {
			raw = fs.readFileSync(full, "utf-8");
		} catch {
			continue;
		}
		try {
			return file.endsWith(".json") ? fromJson(raw) : fromYaml(raw);
		} catch {
			return {}; // malformed config — fall back to env/CLI/defaults
		}
	}

	// rosey.toml is intentionally unsupported (would need a TOML parser).
	if (fs.existsSync(path.join(cwd, "rosey.toml"))) {
		console.warn(
			"RCC: found rosey.toml, which this tool doesn't read. Use rosey.yml/.yaml/.json, or pass values via flags.",
		);
	}
	return {};
}

/** Env vars, matching Rosey's `ROSEY_<UPPER_SNAKE(key)>` convention. */
function readEnv(env: NodeJS.ProcessEnv): RoseyConfig {
	const langs = env.ROSEY_LANGUAGES?.trim();
	return clean({
		source: env.ROSEY_SOURCE,
		dest: env.ROSEY_DEST,
		tag: env.ROSEY_TAG,
		separator: env.ROSEY_SEPARATOR,
		defaultLanguage: env.ROSEY_DEFAULT_LANGUAGE,
		// Rosey wants `[a, b]`; we also accept a bare comma list for convenience.
		languages: langs ? splitList(langs.replace(/^\[|\]$/g, "")) : undefined,
		localesDir: env.ROSEY_LOCALES,
	});
}

/**
 * Resolve Rosey config from file then environment, with env overriding the
 * file — matching Rosey's own precedence. CLI flags sit above this and are
 * applied by each caller (`flag ?? resolved.value`).
 */
export function resolveRoseyConfig(
	cwd: string = process.cwd(),
	env: NodeJS.ProcessEnv = process.env,
): RoseyConfig {
	return { ...readConfigFile(cwd), ...readEnv(env) };
}
