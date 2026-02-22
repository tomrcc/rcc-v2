interface WriteLocalesOptions {
    roseyDir?: string;
    locales?: string[];
}
declare function writeLocales(options?: WriteLocalesOptions): Promise<void>;

export { type WriteLocalesOptions, writeLocales };
