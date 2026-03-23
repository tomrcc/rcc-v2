import fs from "node:fs";
import path from "node:path";

export interface ProjectContext {
	ccConfigPath: string | null;
	ccConfigFormat: "yml" | "yaml" | "json" | "cjs" | null;
	ccSource: string | null;
	buildDir: string | null;
	packageManager: "npm" | "yarn" | "pnpm" | "bun";
	hasPackageJson: boolean;
	roseyInstalled: boolean;
	rccInstalled: boolean;
	postbuildExists: boolean;
	postbuildContent: string | null;
	roseyConfigExists: boolean;
}

const CC_CONFIG_CANDIDATES: {
	file: string;
	format: ProjectContext["ccConfigFormat"];
}[] = [
	{ file: "cloudcannon.config.yml", format: "yml" },
	{ file: "cloudcannon.config.yaml", format: "yaml" },
	{ file: "cloudcannon.config.json", format: "json" },
	{ file: "cloudcannon.config.cjs", format: "cjs" },
];

const BUILD_DIR_CANDIDATES = ["dist", "_site", "build", "out"];

const LOCK_FILES: { file: string; pm: ProjectContext["packageManager"] }[] = [
	{ file: "pnpm-lock.yaml", pm: "pnpm" },
	{ file: "yarn.lock", pm: "yarn" },
	{ file: "bun.lock", pm: "bun" },
	{ file: "bun.lockb", pm: "bun" },
	{ file: "package-lock.json", pm: "npm" },
];

const ROSEY_CONFIG_FILES = ["rosey.toml", "rosey.yml", "rosey.json"];

function fileExists(filePath: string): boolean {
	try {
		return fs.statSync(filePath).isFile();
	} catch {
		return false;
	}
}

function dirExists(dirPath: string): boolean {
	try {
		return fs.statSync(dirPath).isDirectory();
	} catch {
		return false;
	}
}

export function detectProject(cwd: string = process.cwd()): ProjectContext {
	let ccConfigPath: string | null = null;
	let ccConfigFormat: ProjectContext["ccConfigFormat"] = null;
	let ccSource: string | null = null;
	for (const candidate of CC_CONFIG_CANDIDATES) {
		const full = path.join(cwd, candidate.file);
		if (fileExists(full)) {
			ccConfigPath = full;
			ccConfigFormat = candidate.format;
			break;
		}
	}

	if (ccConfigPath) {
		try {
			const raw = fs.readFileSync(ccConfigPath, "utf-8");
			if (ccConfigFormat === "json") {
				const parsed = JSON.parse(raw);
				if (typeof parsed.source === "string") ccSource = parsed.source;
			} else if (ccConfigFormat === "yml" || ccConfigFormat === "yaml") {
				const match = /^source:\s*['"]?([^'"#\n]+)['"]?\s*$/m.exec(raw);
				if (match) ccSource = match[1].trim();
			}
		} catch {
			// unreadable config — leave ccSource as null
		}
	}

	let buildDir: string | null = null;
	for (const dir of BUILD_DIR_CANDIDATES) {
		if (dirExists(path.join(cwd, dir))) {
			buildDir = dir;
			break;
		}
	}

	let packageManager: ProjectContext["packageManager"] = "npm";
	for (const lock of LOCK_FILES) {
		if (fileExists(path.join(cwd, lock.file))) {
			packageManager = lock.pm;
			break;
		}
	}

	const pkgPath = path.join(cwd, "package.json");
	const hasPackageJson = fileExists(pkgPath);
	let roseyInstalled = false;
	let rccInstalled = false;

	if (hasPackageJson) {
		try {
			const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
			const allDeps = {
				...pkg.dependencies,
				...pkg.devDependencies,
			};
			roseyInstalled = "rosey" in allDeps;
			rccInstalled = "rosey-cloudcannon-connector" in allDeps;
		} catch {
			// malformed package.json — treat as no deps
		}
	}

	const postbuildPath = path.join(cwd, ".cloudcannon", "postbuild");
	const postbuildExists = fileExists(postbuildPath);
	let postbuildContent: string | null = null;
	if (postbuildExists) {
		try {
			postbuildContent = fs.readFileSync(postbuildPath, "utf-8");
		} catch {
			// unreadable
		}
	}

	let roseyConfigExists = false;
	for (const f of ROSEY_CONFIG_FILES) {
		if (fileExists(path.join(cwd, f))) {
			roseyConfigExists = true;
			break;
		}
	}

	return {
		ccConfigPath,
		ccConfigFormat,
		ccSource,
		buildDir,
		packageManager,
		hasPackageJson,
		roseyInstalled,
		rccInstalled,
		postbuildExists,
		postbuildContent,
		roseyConfigExists,
	};
}
