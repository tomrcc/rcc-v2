import fs from "node:fs";
import path from "node:path";

export const CLIENT_FILENAME = "client.mjs";

export interface InstallClientOptions {
	/** The package's dist/index.mjs. Resolved by the caller, not here. */
	clientPath: string;
	/** Build output dir. The bundle lands at {dest}/_rcc/client.mjs. */
	dest: string;
}

/**
 * Copy the browser client into the finished build output, so non-bundled SSGs
 * can load it from a URL — a browser can't resolve a bare specifier, and Hugo
 * and Jekyll can't reach node_modules from their own build config.
 */
export async function installClient(
	options: InstallClientOptions,
): Promise<string> {
	const { clientPath, dest } = options;

	if (!dest) {
		throw new Error("dest is required. Pass the build output directory.");
	}

	// A missing dest nearly always means this ran before the site build.
	let destStat: fs.Stats;
	try {
		destStat = await fs.promises.stat(dest);
	} catch {
		throw new Error(
			`Build output directory "${dest}" does not exist. Run install-client ` +
				"after your site build, not before.",
		);
	}
	if (!destStat.isDirectory()) {
		throw new Error(`Build output directory "${dest}" is not a directory.`);
	}

	try {
		await fs.promises.access(clientPath, fs.constants.R_OK);
	} catch {
		throw new Error(
			`Could not read the client bundle at "${clientPath}". ` +
				"Reinstall rosey-cloudcannon-connector.",
		);
	}

	const rccDir = path.join(dest, "_rcc");
	await fs.promises.mkdir(rccDir, { recursive: true });
	const outPath = path.join(rccDir, CLIENT_FILENAME);
	await fs.promises.copyFile(clientPath, outPath);

	console.log(`RCC: Wrote client → ${outPath}`);
	return outPath;
}
