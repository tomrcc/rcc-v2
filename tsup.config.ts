import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: ["src/index.ts"],
		format: ["cjs", "esm"],
		dts: true,
		target: "es2020",
		splitting: false,
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
