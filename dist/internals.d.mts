interface ProjectContext {
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
    bookshopDetected: boolean;
    /** Framework that bundles layout `<script>` tags, so a bare specifier resolves. */
    bundledFramework: string | null;
}
declare function detectProject(cwd?: string): ProjectContext;

declare const CLIENT_FILENAME = "client.mjs";
interface InstallClientOptions {
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
declare function installClient(options: InstallClientOptions): Promise<string>;

/**
 * Rosey config values, camelCased from Rosey's snake_case keys. Note the
 * terminology mismatch with RCC: Rosey `source` = RCC build dir, Rosey
 * `languages` = RCC locales, Rosey `locales` = the locale-files directory.
 */
interface RoseyConfig {
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
/**
 * Resolve config from file then env (env wins), matching Rosey's precedence.
 * CLI flags sit above this, applied by each caller (`flag ?? resolved.value`).
 */
declare function resolveRoseyConfig(cwd?: string, env?: NodeJS.ProcessEnv): RoseyConfig;

declare function normalizeSource(s: string): string;

export { CLIENT_FILENAME, detectProject, installClient, normalizeSource, resolveRoseyConfig };
