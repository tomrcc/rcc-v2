interface WriteLocalesOptions {
    roseyDir?: string;
    locales?: string[];
    /** Build output directory. Writes a locale manifest to {dest}/_rcc/locales.json for runtime locale discovery. */
    dest: string;
}
declare function writeLocales(options: WriteLocalesOptions): Promise<void>;

export { type WriteLocalesOptions, writeLocales };
