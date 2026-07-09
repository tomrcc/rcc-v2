import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync("./package.json", "utf8"));

// Stamped into the client bundle so the editor can confirm the connector
// version CC actually loaded (test sites install from github:tomrcc/rcc-v2, so
// only pushed commits are served).
const buildDefine = {
	__RCC_VERSION__: JSON.stringify(pkg.version),
};

export default defineConfig([
	{
		entry: ["src/index.ts"],
		format: ["cjs", "esm"],
		dts: true,
		target: "es2020",
		splitting: false,
		define: buildDefine,
	},
	{
		entry: ["src/write-locales.ts"],
		format: ["cjs", "esm"],
		dts: true,
		target: "node18",
		platform: "node",
		splitting: false,
	},
	{
		entry: ["src/cli/index.ts"],
		outDir: "dist/cli",
		format: ["cjs"],
		dts: false,
		target: "node18",
		platform: "node",
		splitting: false,
		banner: {
			js: "#!/usr/bin/env node",
		},
	},
]);
