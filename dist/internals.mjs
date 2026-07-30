// src/cli/init/detect.ts
import fs from "fs";
import path from "path";

// src/cc-config-files.ts
var CC_CONFIG_FILES = [
  { file: "cloudcannon.config.yml", format: "yml" },
  { file: "cloudcannon.config.yaml", format: "yaml" },
  { file: "cloudcannon.config.json", format: "json" },
  { file: "cloudcannon.config.cjs", format: "cjs" }
];

// src/cli/init/detect.ts
var BUILD_DIR_CANDIDATES = ["dist", "_site", "build", "out"];
var BUNDLED_FRAMEWORKS = [
  "astro",
  "next",
  "nuxt",
  "@sveltejs/kit",
  "gatsby",
  "@remix-run/dev"
];
var LOCK_FILES = [
  { file: "pnpm-lock.yaml", pm: "pnpm" },
  { file: "yarn.lock", pm: "yarn" },
  { file: "bun.lock", pm: "bun" },
  { file: "bun.lockb", pm: "bun" },
  { file: "package-lock.json", pm: "npm" }
];
function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
function dirExists(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}
function detectProject(cwd = process.cwd()) {
  let ccConfigPath = null;
  let ccConfigFormat = null;
  let ccSource = null;
  for (const candidate of CC_CONFIG_FILES) {
    const full = path.join(cwd, candidate.file);
    if (fileExists(full)) {
      ccConfigPath = full;
      ccConfigFormat = candidate.format;
      break;
    }
  }
  if (ccConfigPath) {
    try {
      const raw = fs.readFileSync(ccConfigPath, "utf-8");
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
    if (dirExists(path.join(cwd, dir))) {
      buildDir = dir;
      break;
    }
  }
  let packageManager = "npm";
  for (const lock of LOCK_FILES) {
    if (fileExists(path.join(cwd, lock.file))) {
      packageManager = lock.pm;
      break;
    }
  }
  const pkgPath = path.join(cwd, "package.json");
  const hasPackageJson = fileExists(pkgPath);
  let roseyInstalled = false;
  let rccInstalled = false;
  let bundledFramework = null;
  if (hasPackageJson) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies
      };
      roseyInstalled = "rosey" in allDeps;
      rccInstalled = "rosey-cloudcannon-connector" in allDeps;
      bundledFramework = BUNDLED_FRAMEWORKS.find((name) => name in allDeps) ?? null;
    } catch {
    }
  }
  const postbuildPath = path.join(cwd, ".cloudcannon", "postbuild");
  const postbuildExists = fileExists(postbuildPath);
  let postbuildContent = null;
  if (postbuildExists) {
    try {
      postbuildContent = fs.readFileSync(postbuildPath, "utf-8");
    } catch {
    }
  }
  const bookshopDetected = fileExists(path.join(cwd, "bookshop.config.cjs")) || dirExists(path.join(cwd, "_bookshop")) || dirExists(path.join(cwd, "component-library", "bookshop"));
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
    postbuildContent,
    bookshopDetected,
    bundledFramework
  };
}

// src/install-client.ts
import fs2 from "fs";
import path2 from "path";
var CLIENT_FILENAME = "client.mjs";
async function installClient(options) {
  const { clientPath, dest } = options;
  if (!dest) {
    throw new Error("dest is required. Pass the build output directory.");
  }
  let destStat;
  try {
    destStat = await fs2.promises.stat(dest);
  } catch {
    throw new Error(
      `Build output directory "${dest}" does not exist. Run install-client after your site build, not before.`
    );
  }
  if (!destStat.isDirectory()) {
    throw new Error(`Build output directory "${dest}" is not a directory.`);
  }
  try {
    await fs2.promises.access(clientPath, fs2.constants.R_OK);
  } catch {
    throw new Error(
      `Could not read the client bundle at "${clientPath}". Reinstall rosey-cloudcannon-connector.`
    );
  }
  const rccDir = path2.join(dest, "_rcc");
  await fs2.promises.mkdir(rccDir, { recursive: true });
  const outPath = path2.join(rccDir, CLIENT_FILENAME);
  await fs2.promises.copyFile(clientPath, outPath);
  console.log(`RCC: Wrote client \u2192 ${outPath}`);
  return outPath;
}

// src/rosey-config.ts
import fs3 from "fs";
import path3 from "path";
var CONFIG_FILES = ["rosey.yaml", "rosey.yml", "rosey.json"];
function unquote(s) {
  return s.replace(/^(['"])([\s\S]*)\1$/, "$2");
}
function splitList(inner) {
  return inner.split(",").map((s) => unquote(s.trim())).filter(Boolean);
}
function yamlScalar(raw, key) {
  const m = new RegExp(`^${key}:[ \\t]+(.+?)[ \\t]*$`, "m").exec(raw);
  if (!m) return void 0;
  let v = m[1].trim();
  if (!/^['"]/.test(v)) v = v.replace(/\s+#.*$/, "").trim();
  v = unquote(v);
  return v || void 0;
}
function yamlList(raw, key) {
  const flow = new RegExp(`^${key}:[ \\t]*\\[([^\\]]*)\\]`, "m").exec(raw);
  if (flow) {
    const items2 = splitList(flow[1]);
    return items2.length ? items2 : void 0;
  }
  const block = new RegExp(`^${key}:[ \\t]*(?:#.*)?$`, "m").exec(raw);
  if (!block) return void 0;
  const rest = raw.slice(block.index + block[0].length).replace(/^\n/, "");
  const items = [];
  for (const line of rest.split("\n")) {
    if (/^[ \t]*$/.test(line)) continue;
    const item = /^[ \t]+-[ \t]*(.+?)[ \t]*$/.exec(line);
    if (item) {
      items.push(unquote(item[1]));
      continue;
    }
    if (/^[ \t]/.test(line)) continue;
    break;
  }
  return items.length ? items : void 0;
}
function fromYaml(raw) {
  return clean({
    source: yamlScalar(raw, "source"),
    dest: yamlScalar(raw, "dest"),
    tag: yamlScalar(raw, "tag"),
    separator: yamlScalar(raw, "separator"),
    defaultLanguage: yamlScalar(raw, "default_language"),
    languages: yamlList(raw, "languages"),
    localesDir: yamlScalar(raw, "locales")
  });
}
function fromJson(raw) {
  const c = JSON.parse(raw);
  return clean({
    source: c.source,
    dest: c.dest,
    tag: c.tag,
    separator: c.separator,
    defaultLanguage: c.default_language,
    languages: Array.isArray(c.languages) ? c.languages : void 0,
    localesDir: c.locales
  });
}
function clean(c) {
  return Object.fromEntries(
    Object.entries(c).filter(([, v]) => v != null)
  );
}
function readConfigFile(cwd) {
  for (const file of CONFIG_FILES) {
    const full = path3.join(cwd, file);
    let raw;
    try {
      raw = fs3.readFileSync(full, "utf-8");
    } catch {
      continue;
    }
    try {
      return file.endsWith(".json") ? fromJson(raw) : fromYaml(raw);
    } catch {
      return {};
    }
  }
  if (fs3.existsSync(path3.join(cwd, "rosey.toml"))) {
    console.warn(
      "RCC: found rosey.toml, which this tool doesn't read. Use rosey.yml/.yaml/.json, or pass values via flags."
    );
  }
  return {};
}
function readEnv(env) {
  const langs = env.ROSEY_LANGUAGES?.trim();
  return clean({
    source: env.ROSEY_SOURCE,
    dest: env.ROSEY_DEST,
    tag: env.ROSEY_TAG,
    separator: env.ROSEY_SEPARATOR,
    defaultLanguage: env.ROSEY_DEFAULT_LANGUAGE,
    // Rosey wants `[a, b]`; we also accept a bare comma list for convenience.
    languages: langs ? splitList(langs.replace(/^\[|\]$/g, "")) : void 0,
    localesDir: env.ROSEY_LOCALES
  });
}
function resolveRoseyConfig(cwd = process.cwd(), env = process.env) {
  return { ...readConfigFile(cwd), ...readEnv(env) };
}

// src/stale.ts
function unwrapLooseListItems(s) {
  if (!s.includes("<li")) return s;
  const tpl = document.createElement("template");
  tpl.innerHTML = s;
  for (const li of tpl.content.querySelectorAll("li")) {
    const paras = [...li.children].filter((c) => c.tagName === "P");
    if (paras.length === 1)
      paras[0].replaceWith(...Array.from(paras[0].childNodes));
  }
  return tpl.innerHTML;
}
function normalizeSource(s) {
  return unwrapLooseListItems(s.replace(/>\s+</g, "><")).replace(/<br\b[^>]*>/gi, " ").replace(/\s+/g, " ").trim();
}
export {
  CLIENT_FILENAME,
  detectProject,
  installClient,
  normalizeSource,
  resolveRoseyConfig
};
