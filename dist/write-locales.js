"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/write-locales.ts
var write_locales_exports = {};
__export(write_locales_exports, {
  writeLocales: () => writeLocales
});
module.exports = __toCommonJS(write_locales_exports);
var import_node_fs = __toESM(require("fs"));
var import_node_path = __toESM(require("path"));
async function writeLocales(options = {}) {
  const roseyDir = options.roseyDir ?? "rosey";
  let locales = options.locales;
  const baseJsonPath = import_node_path.default.join(roseyDir, "base.json");
  const baseJsonRaw = await import_node_fs.default.promises.readFile(baseJsonPath, "utf-8").catch(() => {
    console.error(
      `RCC: Could not read ${baseJsonPath}. Run rosey generate first.`
    );
    process.exit(1);
  });
  const baseJson = JSON.parse(baseJsonRaw);
  const keys = baseJson.keys;
  const localesDir = import_node_path.default.join(roseyDir, "locales");
  await import_node_fs.default.promises.mkdir(localesDir, { recursive: true });
  if (!locales || locales.length === 0) {
    const files = await import_node_fs.default.promises.readdir(localesDir);
    locales = files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
    if (locales.length === 0) {
      console.warn(
        "RCC: No locales specified and no existing locale files found. Use --locales to specify locale codes."
      );
      return;
    }
  }
  for (const locale of locales) {
    const localePath = import_node_path.default.join(localesDir, `${locale}.json`);
    let existing = {};
    try {
      const raw = await import_node_fs.default.promises.readFile(localePath, "utf-8");
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
    await import_node_fs.default.promises.writeFile(
      localePath,
      JSON.stringify(existing, null, 2)
    );
    console.log(`RCC: Wrote ${Object.keys(existing).length} keys to ${localePath}`);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  writeLocales
});
