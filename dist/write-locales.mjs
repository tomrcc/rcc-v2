// src/write-locales.ts
import fs from "fs";
import path from "path";
async function writeLocales(options = {}) {
  const roseyDir = options.roseyDir ?? "rosey";
  let locales = options.locales;
  const baseJsonPath = path.join(roseyDir, "base.json");
  const baseJsonRaw = await fs.promises.readFile(baseJsonPath, "utf-8").catch(() => {
    console.error(
      `RCC: Could not read ${baseJsonPath}. Run rosey generate first.`
    );
    process.exit(1);
  });
  const baseJson = JSON.parse(baseJsonRaw);
  const keys = baseJson.keys;
  const localesDir = path.join(roseyDir, "locales");
  await fs.promises.mkdir(localesDir, { recursive: true });
  if (!locales || locales.length === 0) {
    const files = await fs.promises.readdir(localesDir);
    locales = files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
    if (locales.length === 0) {
      console.warn(
        "RCC: No locales specified and no existing locale files found. Use --locales to specify locale codes."
      );
      return;
    }
  }
  for (const locale of locales) {
    const localePath = path.join(localesDir, `${locale}.json`);
    let existing = {};
    try {
      const raw = await fs.promises.readFile(localePath, "utf-8");
      existing = JSON.parse(raw);
    } catch {
    }
    for (const [key, entry] of Object.entries(keys)) {
      if (!existing[key]) {
        existing[key] = {
          original: entry.original,
          value: entry.original
        };
      }
    }
    await fs.promises.writeFile(
      localePath,
      JSON.stringify(existing, null, 2)
    );
    console.log(`RCC: Wrote ${Object.keys(existing).length} keys to ${localePath}`);
  }
}
export {
  writeLocales
};
