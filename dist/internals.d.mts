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

export { normalizeSource, resolveRoseyConfig };
