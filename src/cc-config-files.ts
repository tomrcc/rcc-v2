/** CloudCannon config file names, in resolution order, with their format. */
export const CC_CONFIG_FILES = [
	{ file: "cloudcannon.config.yml", format: "yml" },
	{ file: "cloudcannon.config.yaml", format: "yaml" },
	{ file: "cloudcannon.config.json", format: "json" },
	{ file: "cloudcannon.config.cjs", format: "cjs" },
] as const;

export type CCConfigFormat = (typeof CC_CONFIG_FILES)[number]["format"];
