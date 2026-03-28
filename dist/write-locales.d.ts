interface WriteLocalesOptions {
    roseyDir?: string;
    locales?: string[];
    /** Build output directory. Writes a locale manifest to {dest}/_rcc/locales.json for runtime locale discovery. */
    dest: string;
    /** When true, keys in the locale file that are not in base.json are preserved instead of deleted. Useful during migration to remap translations before cleanup. */
    keepUnused?: boolean;
}
declare function writeLocales(options: WriteLocalesOptions): Promise<void>;

export { type WriteLocalesOptions, writeLocales };
