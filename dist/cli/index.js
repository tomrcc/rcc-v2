#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// src/cli/add-skills.ts
var import_fs = require("fs");
var import_path = require("path");
var SKILLS_SOURCE = (0, import_path.resolve)(__dirname, "../../skills");
function collectFiles(dir, base) {
  const files = [];
  for (const entry of (0, import_fs.readdirSync)(dir)) {
    const full = (0, import_path.join)(dir, entry);
    const rel = (0, import_path.join)(base, entry);
    if ((0, import_fs.statSync)(full).isDirectory()) {
      files.push(...collectFiles(full, rel));
    } else {
      files.push(rel);
    }
  }
  return files;
}
function run(argv) {
  let dest = (0, import_path.join)(".cursor", "skills");
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === "--dest" || arg === "-d") && argv[i + 1]) {
      dest = argv[++i];
    } else if (arg === "--force" || arg === "-f") {
      force = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: rosey-cloudcannon-connector add-skills [options]\n\nCopy agent skill files into your project.\n\nOptions:\n  -d, --dest <dir>  Destination directory (default: .cursor/skills)\n  -f, --force       Overwrite existing files\n  -h, --help        Show this help message\n"
      );
      process.exit(0);
    }
  }
  if (!(0, import_fs.existsSync)(SKILLS_SOURCE)) {
    console.error(
      "Error: Skills directory not found in the installed package. This may indicate a broken installation \u2014 try reinstalling rosey-cloudcannon-connector."
    );
    process.exit(1);
  }
  const files = collectFiles(SKILLS_SOURCE, "");
  let copied = 0;
  let skipped = 0;
  for (const relPath of files) {
    const src = (0, import_path.join)(SKILLS_SOURCE, relPath);
    const target = (0, import_path.join)(dest, relPath);
    if ((0, import_fs.existsSync)(target) && !force) {
      console.log(`  skip  ${relPath} (already exists, use --force to overwrite)`);
      skipped++;
      continue;
    }
    (0, import_fs.cpSync)(src, target, { recursive: true });
    console.log(`  copy  ${relPath}`);
    copied++;
  }
  console.log(
    `
Copied ${copied} file${copied !== 1 ? "s" : ""} to ${dest}/${skipped > 0 ? ` (${skipped} skipped)` : ""}`
  );
  if (copied > 0) {
    console.log(
      "\nSkills available:\n  translate-locale-files  \u2014 Translate untranslated/stale entries in locale files\n  make-site-multilingual  \u2014 Set up Rosey/RCC/CloudCannon from scratch\n  migrate-i18n-to-rosey   \u2014 Replace an existing i18n system with Rosey\n  migrate-rcc-v1-to-v2    \u2014 Upgrade from RCC v1 to v2\n"
    );
  }
}

// src/cli/init/actions.ts
var import_node_child_process = require("child_process");
var import_node_fs = __toESM(require("fs"));
var import_node_path = __toESM(require("path"));
function installDependencies(ctx) {
  if (!ctx.hasPackageJson) {
    console.log(
      "\n\u26A0  No package.json found \u2014 skipping dependency installation."
    );
    console.log(
      "   Install manually: npm install rosey rosey-cloudcannon-connector"
    );
    return;
  }
  const pkgs = [];
  if (!ctx.roseyInstalled) pkgs.push("rosey");
  if (!ctx.rccInstalled) pkgs.push("rosey-cloudcannon-connector");
  if (pkgs.length === 0) {
    console.log(
      "\n\u2713  rosey and rosey-cloudcannon-connector already installed."
    );
    return;
  }
  const installCmd = {
    npm: `npm install ${pkgs.join(" ")}`,
    yarn: `yarn add ${pkgs.join(" ")}`,
    pnpm: `pnpm add ${pkgs.join(" ")}`,
    bun: `bun add ${pkgs.join(" ")}`
  }[ctx.packageManager];
  console.log(`
Installing ${pkgs.join(", ")}...`);
  try {
    (0, import_node_child_process.execSync)(installCmd, { stdio: "inherit" });
    console.log("\u2713  Dependencies installed.");
  } catch {
    console.error(`
\u26A0  Install failed. Run manually: ${installCmd}`);
  }
}
function buildPostbuildBlock(answers) {
  const { buildDir, roseyDir, locales, useBuiltinWriteLocales, contentAtRoot, defaultLanguage } = answers;
  const langFlag = `--default-language ${defaultLanguage}`;
  const rootFlag = contentAtRoot ? "--default-language-at-root" : "";
  const lines = [];
  if (useBuiltinWriteLocales) {
    lines.push(`npx rosey generate --source ${buildDir}`);
    lines.push(
      `npx rosey-cloudcannon-connector write-locales --source ${roseyDir} --dest ${buildDir} --locales ${locales.join(",")}`
    );
  } else {
    lines.push(`npx rosey generate --source ${buildDir}`);
    lines.push("");
    lines.push("# TODO: Replace with your custom locale generation script.");
    lines.push("# Your script should:");
    lines.push(`#   1. Read ${roseyDir}/base.json for translation keys`);
    lines.push(
      `#   2. Create/update locale files at ${roseyDir}/locales/{code}.json`
    );
    lines.push(
      `#   3. Write a locale manifest array to ${buildDir}/_rcc/locales.json`
    );
    lines.push(
      `# npx rosey-cloudcannon-connector write-locales --source ${roseyDir} --dest ${buildDir}`
    );
  }
  lines.push("");
  lines.push(`mv ./${buildDir} ./_untranslated_site`);
  lines.push(
    `npx rosey build --source _untranslated_site --dest ${buildDir} ${langFlag}${rootFlag ? ` ${rootFlag}` : ""} --exclusions "\\.(html?)$"`
  );
  return lines.join("\n");
}
function writePostbuild(ctx, answers) {
  const dir = import_node_path.default.join(process.cwd(), ".cloudcannon");
  const filePath = import_node_path.default.join(dir, "postbuild");
  const block = buildPostbuildBlock(answers);
  if (ctx.postbuildExists && ctx.postbuildContent != null) {
    const appended = `${ctx.postbuildContent.trimEnd()}

# Rosey
${block}
`;
    import_node_fs.default.mkdirSync(dir, { recursive: true });
    import_node_fs.default.writeFileSync(filePath, appended);
    console.log("\u2713  Appended Rosey commands to .cloudcannon/postbuild");
  } else {
    const content = `#!/usr/bin/env bash

# Rosey
${block}
`;
    import_node_fs.default.mkdirSync(dir, { recursive: true });
    import_node_fs.default.writeFileSync(filePath, content, { mode: 493 });
    console.log("\u2713  Created .cloudcannon/postbuild");
  }
}
function rewriteYamlSourcePaths(content, source) {
  const lines = content.split("\n");
  const result = [];
  let currentTopBlock = null;
  let inSchemas = false;
  let schemasBaseIndent = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;
    if (/^source:\s/.test(line)) {
      if (i + 1 < lines.length && lines[i + 1].trim() === "") {
        i++;
      }
      continue;
    }
    if (indent === 0 && trimmed.includes(":")) {
      currentTopBlock = trimmed.split(":")[0];
      inSchemas = false;
      schemasBaseIndent = -1;
      result.push(line);
      continue;
    }
    if (currentTopBlock === "paths" && indent > 0) {
      const m = trimmed.match(/^(\S+):\s*(.*)$/);
      if (m) {
        const key = m[1];
        const rawValue = m[2].replace(/^['"]|['"]$/g, "").trim();
        const newValue = rawValue === "" ? source : `${source}/${rawValue}`;
        result.push(`${line.substring(0, indent)}${key}: ${newValue}`);
        continue;
      }
    }
    if (currentTopBlock === "collections_config" && indent > 0) {
      if (/^schemas:\s*$/.test(trimmed)) {
        inSchemas = true;
        schemasBaseIndent = indent;
        result.push(line);
        continue;
      }
      if (inSchemas && indent <= schemasBaseIndent) {
        inSchemas = false;
        schemasBaseIndent = -1;
      }
      if (!inSchemas) {
        const m = trimmed.match(/^path:\s*(.+)$/);
        if (m) {
          result.push(
            `${line.substring(0, indent)}path: ${source}/${m[1]}`
          );
          continue;
        }
      }
    }
    if (currentTopBlock === "data_config" && indent > 0) {
      const m = trimmed.match(/^path:\s*(.+)$/);
      if (m) {
        result.push(
          `${line.substring(0, indent)}path: ${source}/${m[1]}`
        );
        continue;
      }
    }
    if (currentTopBlock === "file_config" && indent > 0) {
      const globMatch = trimmed.match(/^(-\s+)?glob:\s*(.+)$/);
      if (globMatch) {
        const prefix = line.substring(0, indent);
        const arrayMarker = globMatch[1] ?? "";
        result.push(
          `${prefix}${arrayMarker}glob: ${source}/${globMatch[2]}`
        );
        continue;
      }
    }
    result.push(line);
  }
  return result.join("\n");
}
function removeSourceFromJson(content, source) {
  const config = JSON.parse(content);
  delete config.source;
  if (config.paths) {
    for (const key of Object.keys(config.paths)) {
      const val = config.paths[key];
      if (typeof val === "string") {
        config.paths[key] = val === "" ? source : `${source}/${val}`;
      }
    }
  }
  if (config.collections_config) {
    for (const coll of Object.values(
      config.collections_config
    )) {
      if (coll && typeof coll.path === "string") {
        coll.path = `${source}/${coll.path}`;
      }
    }
  }
  if (config.data_config) {
    for (const entry of Object.values(
      config.data_config
    )) {
      if (entry && typeof entry.path === "string") {
        entry.path = `${source}/${entry.path}`;
      }
    }
  }
  if (Array.isArray(config.file_config)) {
    for (const entry of config.file_config) {
      if (entry && typeof entry === "object" && typeof entry.glob === "string") {
        entry.glob = `${source}/${entry.glob}`;
      }
    }
  }
  return `${JSON.stringify(config, null, 2)}
`;
}
function removeSourceKey(ctx, _answers) {
  if (!ctx.ccSource || ctx.ccSource === "." || ctx.ccSource === "/") return;
  if (!ctx.ccConfigPath) return;
  const source = ctx.ccSource.replace(/\/+$/, "");
  const raw = import_node_fs.default.readFileSync(ctx.ccConfigPath, "utf-8");
  let updated;
  if (ctx.ccConfigFormat === "json") {
    updated = removeSourceFromJson(raw, source);
  } else if (ctx.ccConfigFormat === "yml" || ctx.ccConfigFormat === "yaml") {
    updated = rewriteYamlSourcePaths(raw, source);
  } else {
    console.log(
      `
\u26A0  Cannot automatically remove \`source\` from ${import_node_path.default.basename(ctx.ccConfigPath)}.`
    );
    console.log(
      `   Remove \`source: ${ctx.ccSource}\` manually and prepend "${source}/" to all collection, data, and file_config paths.`
    );
    return;
  }
  import_node_fs.default.writeFileSync(ctx.ccConfigPath, updated);
  console.log(
    `\u2713  Removed \`source: ${ctx.ccSource}\` and updated paths in ${import_node_path.default.basename(ctx.ccConfigPath)}`
  );
}
function buildDataConfigYaml(answers, indent) {
  return answers.locales.map(
    (locale) => `${indent}locales_${locale}:
${indent}  path: ${answers.roseyDir}/locales/${locale}.json`
  ).join("\n");
}
function buildCollectionsConfigYaml(answers, indent) {
  const lines = [
    `${indent}locales:`,
    `${indent}  path: ${answers.roseyDir}/locales`,
    `${indent}  name: Locales`,
    `${indent}  icon: translate`,
    `${indent}  disable_add: true`,
    `${indent}  disable_add_folder: true`,
    `${indent}  disable_file_actions: true`,
    `${indent}  _inputs:`,
    `${indent}    value:`,
    `${indent}      type: html`,
    `${indent}      label: Translation`,
    `${indent}      cascade: true`,
    `${indent}    original:`,
    `${indent}      hidden: true`,
    `${indent}      cascade: true`,
    `${indent}    _base_original:`,
    `${indent}      disabled: true`,
    `${indent}      hidden: false`,
    `${indent}      label: Original Text`,
    `${indent}      cascade: true`
  ];
  return lines.join("\n");
}
function buildDataConfigJson(answers) {
  const obj = {};
  for (const locale of answers.locales) {
    obj[`locales_${locale}`] = {
      path: `${answers.roseyDir}/locales/${locale}.json`
    };
  }
  return obj;
}
function buildCollectionsConfigJson(answers) {
  return {
    locales: {
      path: `${answers.roseyDir}/locales`,
      name: "Locales",
      icon: "translate",
      disable_add: true,
      disable_add_folder: true,
      disable_file_actions: true,
      _inputs: {
        value: { type: "html", label: "Translation", cascade: true },
        original: { hidden: true, cascade: true },
        _base_original: { disabled: true, cascade: true }
      }
    }
  };
}
function findYamlBlockEnd(content, key) {
  const regex = new RegExp(`^${key}:\\s*$`, "m");
  const match = regex.exec(content);
  if (!match) return -1;
  const startIdx = match.index + match[0].length;
  const lines = content.slice(startIdx).split("\n");
  let endIdx = startIdx;
  for (const line of lines) {
    if (line.trim() === "" || /^\s/.test(line)) {
      endIdx += line.length + 1;
    } else {
      break;
    }
  }
  return endIdx;
}
function detectIndent(content, key) {
  const regex = new RegExp(`^${key}:\\s*\\n([ \\t]+)`, "m");
  const match = regex.exec(content);
  return match ? match[1] : "  ";
}
function hasLocaleEntry(content, locale) {
  return new RegExp(`^\\s+locales_${locale}:`, "m").test(content);
}
function updateYamlConfig(content, answers) {
  let result = content;
  const missingDataLocales = answers.locales.filter(
    (l) => !hasLocaleEntry(result, l)
  );
  if (missingDataLocales.length > 0) {
    const blockEnd = findYamlBlockEnd(result, "data_config");
    const indent = detectIndent(result, "data_config") || "  ";
    const newEntries = missingDataLocales.map(
      (l) => `${indent}locales_${l}:
${indent}  path: ${answers.roseyDir}/locales/${l}.json`
    ).join("\n");
    if (blockEnd === -1) {
      result = `${result.trimEnd()}
data_config:
${newEntries}
`;
    } else {
      result = `${result.slice(0, blockEnd)}${newEntries}
${result.slice(blockEnd)}`;
    }
  }
  if (answers.exposeAsCollection) {
    const hasCollection = /^\s+locales:/m.test(result) && result.includes("collections_config");
    if (!hasCollection) {
      const collectionsEnd = findYamlBlockEnd(result, "collections_config");
      const indent = detectIndent(result, "collections_config") || "  ";
      const entry = buildCollectionsConfigYaml(answers, indent);
      if (collectionsEnd === -1) {
        result = `${result.trimEnd()}
collections_config:
${entry}
`;
      } else {
        result = `${result.slice(0, collectionsEnd)}${entry}
${result.slice(collectionsEnd)}`;
      }
    }
  }
  return result;
}
function updateJsonConfig(content, answers) {
  const config = JSON.parse(content);
  if (!config.data_config) config.data_config = {};
  const newDataEntries = buildDataConfigJson(answers);
  for (const [key, value] of Object.entries(newDataEntries)) {
    if (!(key in config.data_config)) {
      config.data_config[key] = value;
    }
  }
  if (answers.exposeAsCollection) {
    if (!config.collections_config) config.collections_config = {};
    if (!config.collections_config.locales) {
      Object.assign(
        config.collections_config,
        buildCollectionsConfigJson(answers)
      );
    }
  }
  return `${JSON.stringify(config, null, 2)}
`;
}
function buildFreshYamlConfig(answers) {
  const lines = [];
  lines.push("data_config:");
  lines.push(buildDataConfigYaml(answers, "  "));
  if (answers.exposeAsCollection) {
    lines.push("collections_config:");
    lines.push(buildCollectionsConfigYaml(answers, "  "));
  }
  return `${lines.join("\n")}
`;
}
function updateCloudCannonConfig(ctx, answers) {
  if (ctx.ccConfigFormat === "cjs") {
    console.log("\n\u26A0  Cannot automatically modify cloudcannon.config.cjs.");
    console.log("   Add the following to your config manually:\n");
    console.log("   data_config:");
    for (const locale of answers.locales) {
      console.log(`     locales_${locale}:`);
      console.log(`       path: ${answers.roseyDir}/locales/${locale}.json`);
    }
    if (answers.exposeAsCollection) {
      console.log("\n   collections_config:");
      console.log(buildCollectionsConfigYaml(answers, "     "));
    }
    return;
  }
  if (!ctx.ccConfigPath) {
    const newPath = import_node_path.default.join(process.cwd(), "cloudcannon.config.yml");
    import_node_fs.default.writeFileSync(newPath, buildFreshYamlConfig(answers));
    console.log("\u2713  Created cloudcannon.config.yml");
    return;
  }
  const raw = import_node_fs.default.readFileSync(ctx.ccConfigPath, "utf-8");
  let updated;
  if (ctx.ccConfigFormat === "json") {
    updated = updateJsonConfig(raw, answers);
  } else {
    updated = updateYamlConfig(raw, answers);
  }
  if (updated !== raw) {
    import_node_fs.default.writeFileSync(ctx.ccConfigPath, updated);
    console.log(`\u2713  Updated ${import_node_path.default.basename(ctx.ccConfigPath)}`);
  } else {
    console.log(
      `\u2713  ${import_node_path.default.basename(ctx.ccConfigPath)} already has the required entries.`
    );
  }
}
function printInstructions(answers) {
  const { buildDir, defaultLanguage, roseyDir } = answers;
  console.log("\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  console.log("  Next steps");
  console.log("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n");
  console.log("1. Sync paths");
  console.log("   Set the CLOUDCANNON_SYNC_PATHS environment variable in your");
  console.log("   CloudCannon site settings so that files generated during the");
  console.log("   build (base.json + locale files) are synced back to your repo:");
  console.log(`     CLOUDCANNON_SYNC_PATHS=/${roseyDir}/
`);
  console.log("2. HTML lang attribute");
  console.log(
    `   Ensure your root <html> tag has lang="${defaultLanguage}" set.`
  );
  console.log("   This tells Rosey the source language of your content.\n");
  console.log("3. Tag translatable content");
  console.log("   Add data-rosey attributes to translatable elements in");
  console.log("   your templates. See: https://rosey.app/docs/\n");
  console.log("4. Import the RCC");
  console.log("   Add this to your root layout to enable visual");
  console.log("   locale editing in CloudCannon:\n");
  console.log("     <script>");
  console.log("       if (window?.inEditorMode) {");
  console.log('         import("rosey-cloudcannon-connector");');
  console.log("       }");
  console.log("     </script>\n");
  console.log("5. First run");
  console.log("   Build your site, then run:");
  console.log(`     npx rosey generate --source ${buildDir}`);
  console.log("   to create the initial base.json. After that, the");
  console.log("   postbuild script handles everything automatically.\n");
}

// src/cli/init/detect.ts
var import_node_fs2 = __toESM(require("fs"));
var import_node_path2 = __toESM(require("path"));
var CC_CONFIG_CANDIDATES = [
  { file: "cloudcannon.config.yml", format: "yml" },
  { file: "cloudcannon.config.yaml", format: "yaml" },
  { file: "cloudcannon.config.json", format: "json" },
  { file: "cloudcannon.config.cjs", format: "cjs" }
];
var BUILD_DIR_CANDIDATES = ["dist", "_site", "build", "out"];
var LOCK_FILES = [
  { file: "pnpm-lock.yaml", pm: "pnpm" },
  { file: "yarn.lock", pm: "yarn" },
  { file: "bun.lock", pm: "bun" },
  { file: "bun.lockb", pm: "bun" },
  { file: "package-lock.json", pm: "npm" }
];
function fileExists(filePath) {
  try {
    return import_node_fs2.default.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
function dirExists(dirPath) {
  try {
    return import_node_fs2.default.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}
function detectProject(cwd = process.cwd()) {
  let ccConfigPath = null;
  let ccConfigFormat = null;
  let ccSource = null;
  for (const candidate of CC_CONFIG_CANDIDATES) {
    const full = import_node_path2.default.join(cwd, candidate.file);
    if (fileExists(full)) {
      ccConfigPath = full;
      ccConfigFormat = candidate.format;
      break;
    }
  }
  if (ccConfigPath) {
    try {
      const raw = import_node_fs2.default.readFileSync(ccConfigPath, "utf-8");
      if (ccConfigFormat === "json") {
        const parsed = JSON.parse(raw);
        if (typeof parsed.source === "string") ccSource = parsed.source;
      } else if (ccConfigFormat === "yml" || ccConfigFormat === "yaml") {
        const match = /^source:\s*['"]?([^'"#\n]+)['"]?\s*$/m.exec(raw);
        if (match) ccSource = match[1].trim();
      }
    } catch {
    }
  }
  let buildDir = null;
  for (const dir of BUILD_DIR_CANDIDATES) {
    if (dirExists(import_node_path2.default.join(cwd, dir))) {
      buildDir = dir;
      break;
    }
  }
  let packageManager = "npm";
  for (const lock of LOCK_FILES) {
    if (fileExists(import_node_path2.default.join(cwd, lock.file))) {
      packageManager = lock.pm;
      break;
    }
  }
  const pkgPath = import_node_path2.default.join(cwd, "package.json");
  const hasPackageJson = fileExists(pkgPath);
  let roseyInstalled = false;
  let rccInstalled = false;
  if (hasPackageJson) {
    try {
      const pkg = JSON.parse(import_node_fs2.default.readFileSync(pkgPath, "utf-8"));
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies
      };
      roseyInstalled = "rosey" in allDeps;
      rccInstalled = "rosey-cloudcannon-connector" in allDeps;
    } catch {
    }
  }
  const postbuildPath = import_node_path2.default.join(cwd, ".cloudcannon", "postbuild");
  const postbuildExists = fileExists(postbuildPath);
  let postbuildContent = null;
  if (postbuildExists) {
    try {
      postbuildContent = import_node_fs2.default.readFileSync(postbuildPath, "utf-8");
    } catch {
    }
  }
  return {
    ccConfigPath,
    ccConfigFormat,
    ccSource,
    buildDir,
    packageManager,
    hasPackageJson,
    roseyInstalled,
    rccInstalled,
    postbuildExists,
    postbuildContent
  };
}

// src/cli/init/prompts.ts
var import_node_readline = __toESM(require("readline"));
var rl = null;
function getRL() {
  if (!rl) {
    rl = import_node_readline.default.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.on("close", () => process.exit(0));
  }
  return rl;
}
function closePrompts() {
  if (rl) {
    rl.removeAllListeners("close");
    rl.close();
    rl = null;
  }
}
function question(prompt) {
  return new Promise((resolve2) => {
    getRL().question(prompt, (answer) => resolve2(answer));
  });
}
async function askText(prompt, defaultValue) {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  const answer = (await question(`${prompt}${suffix}: `)).trim();
  return answer || defaultValue || "";
}
async function askSelect(prompt, options) {
  console.log(`
${prompt}`);
  for (let i = 0; i < options.length; i++) {
    console.log(`  ${i + 1}) ${options[i].label}`);
  }
  while (true) {
    const answer = (await question(`Choose [1-${options.length}]: `)).trim();
    const idx = Number.parseInt(answer, 10) - 1;
    if (idx >= 0 && idx < options.length) {
      return options[idx].value;
    }
    console.log(`  Please enter a number between 1 and ${options.length}.`);
  }
}
async function askConfirm(prompt, defaultYes = true) {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = (await question(`${prompt} (${hint}): `)).trim().toLowerCase();
  if (answer === "") return defaultYes;
  return answer === "y" || answer === "yes";
}

// src/cli/init/index.ts
function parseFlags(argv) {
  const flags = {
    yes: false,
    locales: void 0,
    defaultLanguage: void 0,
    buildDir: void 0,
    roseyDir: void 0,
    useBuiltinWriteLocales: void 0,
    contentAtRoot: void 0,
    exposeAsCollection: void 0
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--yes" || arg === "-y") {
      flags.yes = true;
    } else if ((arg === "--locales" || arg === "-l") && argv[i + 1]) {
      flags.locales = argv[++i].split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    } else if (arg === "--default-language" && argv[i + 1]) {
      flags.defaultLanguage = argv[++i];
    } else if ((arg === "--build-dir" || arg === "-b") && argv[i + 1]) {
      flags.buildDir = argv[++i];
    } else if (arg === "--rosey-dir" && argv[i + 1]) {
      flags.roseyDir = argv[++i];
    } else if (arg === "--write-locales") {
      flags.useBuiltinWriteLocales = true;
    } else if (arg === "--no-write-locales") {
      flags.useBuiltinWriteLocales = false;
    } else if (arg === "--content-at-root") {
      flags.contentAtRoot = true;
    } else if (arg === "--no-content-at-root") {
      flags.contentAtRoot = false;
    } else if (arg === "--collection") {
      flags.exposeAsCollection = true;
    } else if (arg === "--no-collection") {
      flags.exposeAsCollection = false;
    }
  }
  return flags;
}
var HELP_TEXT = "Usage: rosey-cloudcannon-connector init [options]\n\nSetup wizard for Rosey + CloudCannon. Runs interactively by default;\npass --yes to run headless (useful for CI and agent automation).\n\nOptions:\n  -y, --yes                  Skip all prompts, use flags/defaults\n  -l, --locales <codes>      Comma-separated locale codes (e.g. fr,de,es)\n                             Required in --yes mode\n      --default-language <c> Default/source language (default: en)\n  -b, --build-dir <dir>      Build output directory (default: auto-detect or dist)\n      --rosey-dir <dir>      Rosey source directory (default: rosey)\n      --write-locales        Use built-in write-locales (default)\n      --no-write-locales     Use a custom locale generation script\n      --content-at-root      Serve default language at root URLs (default)\n      --no-content-at-root   Serve default language under a locale prefix\n      --collection           Expose locales as a CloudCannon collection (default)\n      --no-collection        Don't create a locales collection\n  -h, --help                 Show this help message\n";
async function run2(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP_TEXT);
    process.exit(0);
  }
  const flags = parseFlags(argv);
  console.log("\nRosey + CloudCannon setup wizard\n");
  const ctx = detectProject();
  if (ctx.buildDir) {
    console.log(`  Detected build directory: ${ctx.buildDir}`);
  }
  if (ctx.ccConfigPath) {
    console.log(`  Detected CloudCannon config: ${ctx.ccConfigPath}`);
  }
  if (ctx.roseyInstalled || ctx.rccInstalled) {
    const installed = [
      ctx.roseyInstalled && "rosey",
      ctx.rccInstalled && "rosey-cloudcannon-connector"
    ].filter(Boolean).join(", ");
    console.log(`  Already installed: ${installed}`);
  }
  console.log("");
  if (flags.yes) {
    if (!flags.locales || flags.locales.length === 0) {
      console.error(
        "Error: --locales is required in non-interactive mode (--yes)."
      );
      process.exit(1);
    }
    const answers2 = {
      locales: flags.locales,
      defaultLanguage: flags.defaultLanguage ?? "en",
      useBuiltinWriteLocales: flags.useBuiltinWriteLocales ?? true,
      contentAtRoot: flags.contentAtRoot ?? true,
      exposeAsCollection: flags.exposeAsCollection ?? true,
      buildDir: flags.buildDir ?? ctx.buildDir ?? "dist",
      roseyDir: flags.roseyDir ?? "rosey",
      ccSource: ctx.ccSource
    };
    console.log(`  Locales: ${answers2.locales.join(", ")}`);
    console.log(`  Default language: ${answers2.defaultLanguage}`);
    console.log(`  Build dir: ${answers2.buildDir}`);
    console.log(`  Rosey dir: ${answers2.roseyDir}`);
    if (ctx.ccSource) console.log(`  CC source: ${ctx.ccSource}`);
    console.log(`  Write-locales: ${answers2.useBuiltinWriteLocales ? "built-in" : "custom"}`);
    console.log(`  Content at root: ${answers2.contentAtRoot}`);
    console.log(`  Expose as collection: ${answers2.exposeAsCollection}`);
    console.log("");
    installDependencies(ctx);
    writePostbuild(ctx, answers2);
    removeSourceKey(ctx, answers2);
    updateCloudCannonConfig(ctx, answers2);
    printInstructions(answers2);
    return;
  }
  const localesRaw = await askText(
    "What locales do you want to support? (comma-separated, e.g. fr,de,es)",
    flags.locales?.join(",")
  );
  if (!localesRaw) {
    console.error("At least one locale is required.");
    closePrompts();
    process.exit(1);
  }
  const locales = localesRaw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const defaultLanguage = await askText(
    "What is the default/source language?",
    flags.defaultLanguage ?? "en"
  );
  let useBuiltinWriteLocales;
  if (flags.useBuiltinWriteLocales !== void 0) {
    useBuiltinWriteLocales = flags.useBuiltinWriteLocales;
  } else {
    useBuiltinWriteLocales = await askSelect(
      "How do you want to generate locale files from Rosey's base.json?",
      [
        {
          label: "Use the built-in write-locales command",
          value: "builtin"
        },
        {
          label: "Write my own script (e.g. for external translation services)",
          value: "custom"
        }
      ]
    ) === "builtin";
  }
  let contentAtRoot;
  if (flags.contentAtRoot !== void 0) {
    contentAtRoot = flags.contentAtRoot;
  } else {
    contentAtRoot = await askSelect(
      "How should the original (default language) content be served?",
      [
        {
          label: "At the root \u2014 original URLs stay as-is (e.g. /about/)",
          value: "root"
        },
        {
          label: `Under a locale prefix with a redirect at the root (e.g. /${defaultLanguage}/about/)`,
          value: "redirect"
        }
      ]
    ) === "root";
  }
  let exposeAsCollection;
  if (flags.exposeAsCollection !== void 0) {
    exposeAsCollection = flags.exposeAsCollection;
  } else {
    exposeAsCollection = await askConfirm(
      "Expose locale files as a browsable data collection in CloudCannon?",
      true
    );
  }
  const buildDir = await askText(
    "Build output directory?",
    flags.buildDir ?? ctx.buildDir ?? "dist"
  );
  const roseyDir = await askText(
    "Rosey source directory?",
    flags.roseyDir ?? "rosey"
  );
  const answers = {
    locales,
    defaultLanguage,
    useBuiltinWriteLocales,
    contentAtRoot,
    exposeAsCollection,
    buildDir,
    roseyDir,
    ccSource: ctx.ccSource
  };
  let writePostbuildFile = true;
  if (ctx.postbuildExists) {
    console.log("\n  Existing .cloudcannon/postbuild found.");
    console.log("  The following Rosey commands will be appended:\n");
    const preview = buildPostbuildPreview(answers);
    for (const line of preview.split("\n")) {
      console.log(`    ${line}`);
    }
    console.log("");
    writePostbuildFile = await askConfirm("Append these commands?", true);
  }
  let shouldRemoveSource = false;
  if (ctx.ccSource && ctx.ccSource !== "." && ctx.ccSource !== "/") {
    shouldRemoveSource = await askConfirm(
      `Your config has \`source: ${ctx.ccSource}\`. This must be removed for locale files to work. Remove it and update all affected paths?`,
      true
    );
  }
  closePrompts();
  console.log("");
  installDependencies(ctx);
  if (writePostbuildFile) {
    writePostbuild(ctx, answers);
  } else {
    console.log("  Skipped .cloudcannon/postbuild (user declined).");
  }
  if (shouldRemoveSource) {
    removeSourceKey(ctx, answers);
  } else if (ctx.ccSource && ctx.ccSource !== "." && ctx.ccSource !== "/") {
    console.log(
      "\n\u26A0  `source` key was not removed. Locale editing may not work until it is removed manually."
    );
  }
  updateCloudCannonConfig(ctx, answers);
  printInstructions(answers);
}
function buildPostbuildPreview(answers) {
  const { buildDir, roseyDir, locales, useBuiltinWriteLocales, contentAtRoot, defaultLanguage } = answers;
  const langFlag = ` --default-language ${defaultLanguage}`;
  const rootFlag = contentAtRoot ? " --default-language-at-root" : "";
  const lines = ["# Rosey"];
  if (useBuiltinWriteLocales) {
    lines.push(`npx rosey generate --source ${buildDir}`);
    lines.push(
      `npx rosey-cloudcannon-connector write-locales --source ${roseyDir} --dest ${buildDir} --locales ${locales.join(",")}`
    );
  } else {
    lines.push(`npx rosey generate --source ${buildDir}`);
    lines.push("# TODO: Add your custom locale generation script here");
  }
  lines.push(`mv ./${buildDir} ./_untranslated_site`);
  lines.push(
    `npx rosey build --source _untranslated_site --dest ${buildDir}${langFlag}${rootFlag} --exclusions "\\.(html?)$"`
  );
  return lines.join("\n");
}

// src/write-locales.ts
var import_node_fs3 = __toESM(require("fs"));
var import_node_path3 = __toESM(require("path"));
function sortKeys(obj) {
  return Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
  );
}
async function writeLocales(options) {
  const roseyDir = options.roseyDir ?? "rosey";
  const dest = options.dest;
  if (!dest) {
    console.error("RCC: dest is required. Pass the build output directory.");
    process.exit(1);
  }
  let locales = options.locales;
  const baseJsonPath = import_node_path3.default.join(roseyDir, "base.json");
  const baseJsonRaw = await import_node_fs3.default.promises.readFile(baseJsonPath, "utf-8").catch(() => {
    console.error(
      `RCC: Could not read ${baseJsonPath}. Run rosey generate first.`
    );
    process.exit(1);
  });
  const baseJson = JSON.parse(baseJsonRaw);
  const keys = baseJson.keys;
  const localesDir = import_node_path3.default.join(roseyDir, "locales");
  await import_node_fs3.default.promises.mkdir(localesDir, { recursive: true });
  if (!locales || locales.length === 0) {
    const files = await import_node_fs3.default.promises.readdir(localesDir);
    locales = files.filter((f) => f.endsWith(".json") && !f.endsWith(".urls.json")).map((f) => f.replace(/\.json$/, ""));
    if (locales.length === 0) {
      console.warn(
        "RCC: No locales specified and no existing locale files found. Use --locales to specify locale codes."
      );
      return;
    }
  }
  for (const locale of locales) {
    const localePath = import_node_path3.default.join(localesDir, `${locale}.json`);
    let existing = {};
    try {
      const raw = await import_node_fs3.default.promises.readFile(localePath, "utf-8");
      existing = JSON.parse(raw);
    } catch {
    }
    const unusedKeys = Object.keys(existing).filter((key) => !(key in keys));
    if (!options.keepUnused) {
      for (const key of unusedKeys) {
        delete existing[key];
      }
    }
    let addedCount = 0;
    for (const [key, entry] of Object.entries(keys)) {
      if (!existing[key]) {
        existing[key] = {
          original: entry.original,
          value: entry.original,
          _base_original: entry.original
        };
        addedCount++;
      } else {
        existing[key]._base_original = entry.original;
      }
    }
    await import_node_fs3.default.promises.writeFile(
      localePath,
      JSON.stringify(sortKeys(existing), null, 2)
    );
    const removedMsg = options.keepUnused ? `${unusedKeys.length} unused kept` : `${unusedKeys.length} removed`;
    console.log(
      `RCC: Wrote ${localePath} \u2014 ${Object.keys(existing).length} keys (${addedCount} added, ${removedMsg})`
    );
  }
  const manifest = { locales };
  const rccDir = import_node_path3.default.join(dest, "_rcc");
  await import_node_fs3.default.promises.mkdir(rccDir, { recursive: true });
  const manifestPath = import_node_path3.default.join(rccDir, "locales.json");
  await import_node_fs3.default.promises.writeFile(manifestPath, JSON.stringify(manifest));
  console.log(`RCC: Wrote locale manifest \u2192 ${manifestPath}`);
  await validateDataConfig(locales);
}
var CC_CONFIG_PATHS = [
  "cloudcannon.config.yml",
  "cloudcannon.config.yaml",
  "cloudcannon.config.json",
  "cloudcannon.config.cjs"
];
async function readCCConfig() {
  for (const p of CC_CONFIG_PATHS) {
    try {
      const raw = await import_node_fs3.default.promises.readFile(p, "utf-8");
      return { raw, path: p };
    } catch {
      continue;
    }
  }
  return null;
}
async function validateDataConfig(locales) {
  const config = await readCCConfig();
  if (!config) return;
  const missing = [];
  for (const locale of locales) {
    const key = `locales_${locale}`;
    if (!config.raw.includes(key)) {
      missing.push(locale);
    }
  }
  if (missing.length > 0) {
    console.warn(
      `RCC: Missing data_config entries in ${config.path}. Add:
` + missing.map(
        (l) => `  locales_${l}:
    path: rosey/locales/${l}.json`
      ).join("\n")
    );
  }
}

// src/cli/write-locales.ts
function run3(argv) {
  let source = "rosey";
  let locales;
  let dest;
  let keepUnused = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === "--source" || arg === "-s") && argv[i + 1]) {
      source = argv[++i];
    } else if ((arg === "--locales" || arg === "-l") && argv[i + 1]) {
      locales = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    } else if ((arg === "--dest" || arg === "-d") && argv[i + 1]) {
      dest = argv[++i];
    } else if (arg === "--keep-unused") {
      keepUnused = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: rcc-v2 write-locales [options]\n\nOptions:\n  -s, --source <dir>     Rosey directory (default: rosey)\n  -l, --locales <codes>  Comma-separated locale codes (auto-detects if omitted)\n  -d, --dest <dir>       (required) Build output dir; writes locale manifest to {dest}/_rcc/locales.json\n  --keep-unused          Preserve locale keys not in base.json (useful during migration)\n  -h, --help             Show this help message\n"
      );
      process.exit(0);
    }
  }
  if (!dest) {
    console.error(
      "Error: --dest <dir> is required. This is the build output directory where the locale manifest (_rcc/locales.json) is written."
    );
    process.exit(1);
  }
  writeLocales({ roseyDir: source, locales, dest, keepUnused });
}

// src/cli/index.ts
var COMMANDS = {
  "add-skills": run,
  "write-locales": run3,
  init: run2
};
function printUsage() {
  console.log(
    "Usage: rosey-cloudcannon-connector <command> [options]\n\nCommands:\n  init            Setup wizard for Rosey + CloudCannon (interactive or headless)\n  write-locales   Write/update locale files from Rosey base.json\n  add-skills      Copy agent skill files into your project\n\nRun rosey-cloudcannon-connector <command> --help for command-specific options.\n"
  );
}
var args = process.argv.slice(2);
var subcommand = args[0];
if (!subcommand || subcommand === "--help" || subcommand === "-h") {
  printUsage();
  process.exit(0);
}
var handler = COMMANDS[subcommand];
if (!handler) {
  console.error(`Unknown command: ${subcommand}
`);
  printUsage();
  process.exit(1);
}
handler(args.slice(1));
