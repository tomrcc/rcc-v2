// src/rosey-config.ts
import fs from "fs";
import path from "path";
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
    const full = path.join(cwd, file);
    let raw;
    try {
      raw = fs.readFileSync(full, "utf-8");
    } catch {
      continue;
    }
    try {
      return file.endsWith(".json") ? fromJson(raw) : fromYaml(raw);
    } catch {
      return {};
    }
  }
  if (fs.existsSync(path.join(cwd, "rosey.toml"))) {
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
  normalizeSource,
  resolveRoseyConfig
};
