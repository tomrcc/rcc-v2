// src/logger.ts
var verbose = null;
function isVerbose() {
  if (verbose === null) {
    verbose = !!document.querySelector("main[data-rcc-verbose]");
  }
  return verbose;
}
function log(...args) {
  if (isVerbose()) {
    console.log("RCC:", ...args);
  }
}
function warn(...args) {
  console.warn("RCC:", ...args);
}

// src/injector.ts
var tracked = [];
var currentLocale = null;
var api = null;
var activeDataset = null;
var activeDatasetListener = null;
var switchGeneration = 0;
function resolveRoseyKey(el) {
  const localKey = el.getAttribute("data-rosey");
  if (!localKey) return null;
  const nsParts = [];
  let current = el.parentElement;
  while (current) {
    const root = current.getAttribute("data-rosey-root");
    if (root !== null) {
      if (root) nsParts.push(root);
      break;
    }
    const ns = current.getAttribute("data-rosey-ns");
    if (ns) nsParts.push(ns);
    current = current.parentElement;
  }
  nsParts.reverse();
  return [...nsParts, localKey].join(":");
}
function trackElements() {
  tracked.length = 0;
  const elements = document.querySelectorAll(
    "[data-rosey]:not([data-rcc-ignore])"
  );
  for (const el of elements) {
    const roseyKey = resolveRoseyKey(el);
    if (!roseyKey) continue;
    tracked.push({
      element: el,
      roseyKey,
      originalContent: el.innerHTML
    });
  }
  log(`Tracked ${tracked.length} translatable elements`);
}
function dehydrateCCEditors() {
  for (const t of tracked) {
    if (t.element.tagName.startsWith("EDITABLE-")) {
      const span = document.createElement("span");
      for (const attr of Array.from(t.element.attributes)) {
        span.setAttribute(attr.name, attr.value);
      }
      span.setAttribute("data-cloudcannon-ignore", "");
      span.innerHTML = t.element.innerHTML;
      t.element.replaceWith(span);
      t.originalElement = t.element;
      t.element = span;
      log(`[${t.roseyKey}] Replaced <${t.originalElement.tagName.toLowerCase()}> with <span>`);
    } else if (t.element.hasAttribute("data-editable")) {
      const parent = t.element.parentNode;
      const next = t.element.nextSibling;
      t.element.remove();
      t.element.setAttribute("data-cloudcannon-ignore", "");
      if (next) parent?.insertBefore(t.element, next);
      else parent?.appendChild(t.element);
      log(`[${t.roseyKey}] Dehydrated CC editor, added data-cloudcannon-ignore`);
    }
  }
}
function teardownEditors() {
  log(`Tearing down ${tracked.length} editors`);
  if (activeDataset && activeDatasetListener) {
    activeDataset.removeEventListener("change", activeDatasetListener);
  }
  activeDataset = null;
  activeDatasetListener = null;
  for (const t of tracked) {
    log(`[${t.roseyKey}] Teardown \u2014 restoring originalContent`);
    t.editor = void 0;
    if (t.originalElement) {
      t.originalElement.innerHTML = t.originalContent;
      const editable = t.originalElement.editable;
      if (editable) editable.editor = void 0;
      t.element.replaceWith(t.originalElement);
      t.element = t.originalElement;
      t.originalElement = void 0;
    } else {
      t.element.innerHTML = t.originalContent;
    }
    if (t.element.hasAttribute("data-cloudcannon-ignore")) {
      t.element.removeAttribute("data-cloudcannon-ignore");
      const editable = t.element.editable;
      if (editable) editable.editor = void 0;
      const parent = t.element.parentNode;
      const next = t.element.nextSibling;
      if (parent) {
        t.element.remove();
        if (next) parent.insertBefore(t.element, next);
        else parent.appendChild(t.element);
      }
    }
  }
}
async function resolveFile(dataset) {
  const result = await dataset.items();
  if (Array.isArray(result)) return result[0] ?? null;
  return result ?? null;
}
async function switchLocale(locale) {
  if (!api) return;
  switchGeneration++;
  const myGeneration = switchGeneration;
  log(`switchLocale("${locale}") \u2014 generation ${myGeneration}`);
  currentLocale = locale;
  updateButtonStates();
  teardownEditors();
  if (!locale) {
    log("Switched to Original");
    return;
  }
  dehydrateCCEditors();
  const dataset = api.dataset(`locales_${locale}`);
  const file = await resolveFile(dataset);
  if (!file) {
    warn(`No file found in dataset "locales_${locale}"`);
    return;
  }
  let setupComplete = false;
  for (const t of tracked) {
    if (myGeneration !== switchGeneration) {
      warn(`Generation changed during setup (${myGeneration} \u2192 ${switchGeneration}), aborting "${locale}" switch`);
      return;
    }
    try {
      const data = await file.data.get({ slug: t.roseyKey });
      log(`[${t.roseyKey}] data.get() returned:`, JSON.stringify(data));
      const value = data?.value ?? data?.original ?? t.originalContent;
      const source = data?.value != null ? "data.value" : data?.original != null ? "data.original" : "originalContent";
      log(`[${t.roseyKey}] Resolved value (via ${source}):`, JSON.stringify(value));
      log(`[${t.roseyKey}] Pre-set DOM: <${t.element.tagName.toLowerCase()}> innerHTML=`, JSON.stringify(t.element.innerHTML));
      t.element.innerHTML = value;
      log(`[${t.roseyKey}] Post-set DOM innerHTML=`, JSON.stringify(t.element.innerHTML));
      log(`[${t.roseyKey}] DIAGNOSTIC: innerHTML-only mode, skipping createTextEditableRegion`);
    } catch (err) {
      warn(`Failed to set up editor for "${t.roseyKey}":`, err);
    }
  }
  if (myGeneration !== switchGeneration) {
    warn(`Generation changed after setup (${myGeneration} \u2192 ${switchGeneration}), not activating "${locale}"`);
    return;
  }
  await Promise.resolve();
  setupComplete = true;
  log(`All editors created, setup complete for "${locale}" (generation ${myGeneration})`);
  activeDataset = dataset;
  activeDatasetListener = async () => {
    if (myGeneration !== switchGeneration) return;
    log(`Dataset change event fired for locale "${locale}"`);
    const freshFile = await resolveFile(dataset);
    if (!freshFile) return;
    for (const t of tracked) {
      if (!t.editor) continue;
      try {
        const data = await freshFile.data.get({ slug: t.roseyKey });
        const value = data?.value ?? data?.original ?? t.originalContent;
        log(`[${t.roseyKey}] Change listener setContent:`, JSON.stringify(value));
        t.editor.setContent(value);
      } catch {
      }
    }
  };
  dataset.addEventListener("change", activeDatasetListener);
  log(`Switched to ${locale}`);
}
function updateButtonStates() {
  const buttons = document.querySelectorAll(
    "#rcc-locale-switcher button[data-locale]"
  );
  for (const btn of buttons) {
    const btnLocale = btn.dataset.locale ?? null;
    const isActive = btnLocale === (currentLocale ?? "");
    btn.style.background = isActive ? "#3b82f6" : "#334155";
    btn.style.fontWeight = isActive ? "600" : "400";
  }
}
function injectSwitcher(locales) {
  const panel = document.createElement("div");
  panel.id = "rcc-locale-switcher";
  Object.assign(panel.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: "999999",
    background: "#1e293b",
    color: "#f1f5f9",
    padding: "12px 16px",
    borderRadius: "12px",
    fontFamily: "system-ui, sans-serif",
    fontSize: "13px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.3)"
  });
  const label = document.createElement("div");
  label.textContent = "Locale";
  Object.assign(label.style, {
    fontWeight: "600",
    fontSize: "12px",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.05em"
  });
  panel.appendChild(label);
  const row = document.createElement("div");
  Object.assign(row.style, { display: "flex", gap: "6px", flexWrap: "wrap" });
  const btnBase = "padding:6px 14px;border:none;border-radius:6px;cursor:pointer;font-size:13px;color:white;transition:background 0.15s;";
  const originalBtn = document.createElement("button");
  originalBtn.textContent = "Original";
  originalBtn.dataset.locale = "";
  originalBtn.setAttribute("style", btnBase);
  originalBtn.addEventListener("click", () => switchLocale(null));
  row.appendChild(originalBtn);
  for (const locale of locales) {
    const btn = document.createElement("button");
    btn.textContent = locale.toUpperCase();
    btn.dataset.locale = locale;
    btn.setAttribute("style", btnBase);
    btn.addEventListener("click", () => switchLocale(locale));
    row.appendChild(btn);
  }
  panel.appendChild(row);
  document.body.appendChild(panel);
  updateButtonStates();
}
function init() {
  const ccWindow = window;
  if (!ccWindow.CloudCannonAPI) {
    warn("CloudCannonAPI not available");
    return;
  }
  api = ccWindow.CloudCannonAPI.useVersion("v1", true);
  const main = document.querySelector("main[data-locales]");
  if (!main) return;
  const localesAttr = main.getAttribute("data-locales");
  if (!localesAttr) return;
  const locales = localesAttr.split(",").map((s) => s.trim()).filter(Boolean);
  if (locales.length === 0) return;
  trackElements();
  if (tracked.length === 0) {
    warn("No translatable elements found (missing data-rosey attributes)");
    return;
  }
  injectSwitcher(locales);
  log(`Ready \u2014 ${locales.length} locales, ${tracked.length} elements`);
}
if (window.inEditorMode && window.CloudCannonAPI) {
  init();
} else {
  document.addEventListener("cloudcannon:load", init);
}
