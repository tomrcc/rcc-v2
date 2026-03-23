"use strict";

// src/logger.ts
var verbose = null;
function isVerbose() {
  if (verbose === null) {
    verbose = !!document.querySelector("[data-rcc-verbose]");
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
var originalContainer = null;
var translationContainer = null;
var activeDataset = null;
var activeDatasetListener = null;
var activeFile = null;
var switchGeneration = 0;
var switchInProgress = false;
var originalInputConfigs = /* @__PURE__ */ new Map();
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
var CC_CUSTOM_ELEMENTS = [
  "EDITABLE-TEXT",
  "EDITABLE-SOURCE",
  "EDITABLE-IMAGE",
  "EDITABLE-COMPONENT",
  "EDITABLE-ARRAY-ITEM"
];
var BLOCK_LEVEL_SELECTOR = "address, article, aside, blockquote, details, dialog, dd, div, dl, dt, fieldset, figcaption, figure, footer, form, h1, h2, h3, h4, h5, h6, header, hgroup, hr, li, main, nav, ol, p, pre, section, table, ul";
function inferElementType(el) {
  return el.querySelector(BLOCK_LEVEL_SELECTOR) !== null ? "block" : "span";
}
function cleanClone(root) {
  stripCCAttributes(root);
  root.querySelectorAll("*").forEach((el) => {
    if (el instanceof HTMLElement) stripCCAttributes(el);
  });
  replaceCustomElements(root);
  stripBookshopComments(root);
  const roseyEls = root.querySelectorAll("[data-rosey]").length;
  const remainingComments = countComments(root, "bookshop");
  log(
    `cleanClone: ${roseyEls} [data-rosey] element(s), ${remainingComments} remaining bookshop comment(s)`
  );
}
function countComments(root, needle) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  let count = 0;
  while (walker.nextNode()) {
    if (walker.currentNode.data.includes(needle)) count++;
  }
  return count;
}
function stripBookshopComments(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const toRemove = [];
  while (walker.nextNode()) {
    const comment = walker.currentNode;
    if (comment.data.includes("bookshop-live")) {
      toRemove.push(comment);
    }
  }
  for (const node of toRemove) node.remove();
  if (toRemove.length > 0) {
    log(`Stripped ${toRemove.length} Bookshop comment(s) from clone`);
  }
}
function stripCCAttributes(el) {
  el.removeAttribute("data-editable");
  el.removeAttribute("data-prop");
  el.removeAttribute("data-cms-bind");
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith("data-prop-")) {
      el.removeAttribute(attr.name);
    }
  }
}
function replaceCustomElements(root) {
  for (const tag of CC_CUSTOM_ELEMENTS) {
    const els = root.querySelectorAll(tag);
    for (const el of els) {
      let replacementTag = "div";
      if (tag === "EDITABLE-TEXT") {
        const dataType = el.getAttribute("data-type");
        const isBlockType = dataType === "block" || dataType === "text";
        const hasBlockChildren = el.querySelector(BLOCK_LEVEL_SELECTOR) !== null;
        replacementTag = isBlockType || hasBlockChildren ? "div" : "span";
      }
      const replacement = document.createElement(replacementTag);
      for (const attr of Array.from(el.attributes)) {
        if (attr.name === "data-prop" || attr.name.startsWith("data-prop-")) continue;
        if (attr.name === "data-editable") continue;
        replacement.setAttribute(attr.name, attr.value);
      }
      replacement.innerHTML = el.innerHTML;
      el.replaceWith(replacement);
    }
  }
}
function trackElements(scope) {
  tracked.length = 0;
  const elements = scope.querySelectorAll(
    "[data-rosey]:not([data-rcc-ignore])"
  );
  for (const el of elements) {
    const roseyKey = resolveRoseyKey(el);
    if (!roseyKey) continue;
    tracked.push({
      element: el,
      roseyKey,
      originalContent: el.innerHTML,
      inferredType: el.dataset.type === "block" || el.dataset.type === "text" ? "block" : inferElementType(el),
      focused: false,
      stale: false,
      baseOriginal: null,
      localeOriginal: null,
      hasLocaleEntry: false
    });
  }
  log(`Tracked ${tracked.length} translatable elements`);
}
var CONFIG_TIMEOUT_MS = 200;
async function fetchInputConfig(el) {
  const prop = el.dataset.prop;
  const isEditable = el.dataset.editable === "text" || el.tagName === "EDITABLE-TEXT";
  if (!prop || !isEditable) return null;
  const configPromise = new Promise((resolve) => {
    el.dispatchEvent(
      new CustomEvent("cloudcannon-api", {
        bubbles: true,
        detail: { action: "get-input-config", source: prop, callback: resolve }
      })
    );
  });
  const timeout = new Promise(
    (resolve) => setTimeout(() => resolve(null), CONFIG_TIMEOUT_MS)
  );
  return Promise.race([configPromise, timeout]);
}
async function prescanOriginals(container) {
  const elements = container.querySelectorAll(
    "[data-rosey]:not([data-rcc-ignore])"
  );
  for (const el of elements) {
    const roseyKey = resolveRoseyKey(el);
    if (!roseyKey) continue;
    const config = await fetchInputConfig(el);
    if (config != null) {
      originalInputConfigs.set(roseyKey, config);
    }
  }
  log(`Prescan: captured input configs for ${originalInputConfigs.size} of ${elements.length} elements`);
}
var STALE_AMBER = "#f59e0b";
var STALE_AMBER_BG = "rgba(245, 158, 11, 0.08)";
var staleCount = 0;
function updateStaleBadge() {
  const badge = document.getElementById("rcc-stale-badge");
  if (!badge) return;
  if (staleCount > 0) {
    badge.textContent = String(staleCount);
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }
}
function recountStale() {
  staleCount = tracked.filter((t) => t.stale).length;
  updateStaleBadge();
  updateStaleList();
}
function truncateText(text, max) {
  return text.length > max ? text.slice(0, max) + "\u2026" : text;
}
function updateStaleList() {
  const panel = document.getElementById("rcc-stale-panel");
  const allSubmenus = document.querySelectorAll("[data-rcc-stale-submenu]");
  for (const sub of allSubmenus) {
    if (sub.dataset.rccStaleSubmenu !== currentLocale) {
      sub.style.display = "none";
      const ch = sub.querySelector("[data-rcc-stale-chevron]");
      if (ch) ch.style.transform = "rotate(0deg)";
    }
  }
  if (!currentLocale) {
    if (panel) panel.style.display = "none";
    return;
  }
  const submenu = document.querySelector(
    `[data-rcc-stale-submenu="${currentLocale}"]`
  );
  const staleItems = tracked.filter((t) => t.stale);
  if (staleItems.length === 0) {
    if (submenu) {
      submenu.style.display = "none";
      const ch = submenu.querySelector("[data-rcc-stale-chevron]");
      if (ch) ch.style.transform = "rotate(0deg)";
    }
    if (panel) panel.style.display = "none";
    return;
  }
  if (submenu) {
    submenu.style.display = "flex";
    const countEl = submenu.querySelector("[data-rcc-stale-count]");
    if (countEl) countEl.textContent = `${staleItems.length} out of date`;
  }
  if (!panel) return;
  const panelCount = panel.querySelector("[data-rcc-panel-count]");
  if (panelCount) panelCount.textContent = `${staleItems.length} out of date`;
  const list = panel.querySelector("[data-rcc-stale-items]");
  if (!list) return;
  list.innerHTML = "";
  for (const t of staleItems) {
    const textPreview = truncateText(
      t.element.textContent?.trim() || t.roseyKey,
      40
    );
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      alignItems: "stretch",
      borderRadius: "4px",
      transition: "background 0.15s"
    });
    row.addEventListener("mouseenter", () => {
      row.style.background = "#fef3c7";
    });
    row.addEventListener("mouseleave", () => {
      row.style.background = "transparent";
    });
    const scrollBtn = document.createElement("button");
    Object.assign(scrollBtn.style, {
      display: "flex",
      flexDirection: "column",
      gap: "1px",
      flex: "1",
      minWidth: "0",
      padding: "5px 6px",
      border: "none",
      cursor: "pointer",
      fontSize: "11px",
      textAlign: "left",
      background: "transparent",
      color: "#1e293b",
      fontFamily: "system-ui, sans-serif"
    });
    const preview = document.createElement("span");
    Object.assign(preview.style, {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    });
    preview.textContent = textPreview;
    const keyEl = document.createElement("span");
    Object.assign(keyEl.style, { fontSize: "9px", color: "#9ca3af" });
    keyEl.textContent = t.roseyKey;
    scrollBtn.appendChild(preview);
    scrollBtn.appendChild(keyEl);
    scrollBtn.addEventListener("click", () => {
      t.element.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const resolveBtn = document.createElement("button");
    Object.assign(resolveBtn.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 6px",
      border: "none",
      cursor: "pointer",
      background: "transparent",
      color: "#d1d5db",
      transition: "color 0.15s",
      flexShrink: "0"
    });
    resolveBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.5 L4.5 9 L10 3"/></svg>';
    resolveBtn.title = "Mark as reviewed";
    resolveBtn.addEventListener("mouseenter", () => {
      resolveBtn.style.color = STALE_AMBER;
    });
    resolveBtn.addEventListener("mouseleave", () => {
      resolveBtn.style.color = "#d1d5db";
    });
    resolveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (activeFile) resolveStale(t, activeFile);
    });
    row.appendChild(scrollBtn);
    row.appendChild(resolveBtn);
    list.appendChild(row);
  }
  const resolveAllBtn = panel.querySelector("[data-rcc-resolve-all]");
  if (resolveAllBtn) resolveAllBtn.style.display = staleItems.length > 0 ? "block" : "none";
}
function markStaleElement(t) {
  t.element.style.outline = `2px dashed ${STALE_AMBER}`;
  t.element.style.outlineOffset = "2px";
  t.element.style.backgroundColor = STALE_AMBER_BG;
}
function unmarkStaleElement(t) {
  t.stale = false;
  t.element.style.outline = "";
  t.element.style.outlineOffset = "";
  t.element.style.backgroundColor = "";
  recountStale();
}
function resolveStale(t, file) {
  if (!t.stale || !t.baseOriginal) return;
  log(`[${t.roseyKey}] Resolving stale \u2014 updating .original`);
  file.data.set({ slug: `${t.roseyKey}.original`, value: t.baseOriginal });
  unmarkStaleElement(t);
}
var originalBookshopUpdate = null;
function pauseBookshop() {
  const bsl = window.bookshopLive;
  if (!bsl) {
    log("pauseBookshop: window.bookshopLive not found (not a Bookshop site, or not loaded yet)");
    return;
  }
  if (typeof bsl.update !== "function") {
    log("pauseBookshop: bookshopLive.update is not a function");
    return;
  }
  if (originalBookshopUpdate) {
    log("pauseBookshop: already paused");
    return;
  }
  originalBookshopUpdate = bsl.update.bind(bsl);
  bsl.update = async () => false;
  log("Paused Bookshop live editing");
}
function resumeBookshop() {
  if (!originalBookshopUpdate) {
    log("resumeBookshop: nothing to resume (was not paused)");
    return;
  }
  const bsl = window.bookshopLive;
  if (!bsl) {
    warn("resumeBookshop: window.bookshopLive disappeared \u2014 cannot restore");
    originalBookshopUpdate = null;
    return;
  }
  bsl.update = originalBookshopUpdate;
  originalBookshopUpdate = null;
  log("Resumed Bookshop live editing");
}
function teardownEditors() {
  log(
    `teardownEditors: translationContainer=${!!translationContainer}, originalContainer=${!!originalContainer}, tracked=${tracked.length}`
  );
  if (activeDataset && activeDatasetListener) {
    activeDataset.removeEventListener("change", activeDatasetListener);
  }
  activeDataset = null;
  activeDatasetListener = null;
  activeFile = null;
  for (const t of tracked) t.editor = void 0;
  tracked.length = 0;
  staleCount = 0;
  updateStaleBadge();
  updateStaleList();
  resumeBookshop();
  if (translationContainer && originalContainer) {
    const cloneInDOM = translationContainer.isConnected;
    const originalInDOM = originalContainer.isConnected;
    log(
      `teardownEditors: clone connected=${cloneInDOM}, original connected=${originalInDOM} \u2014 swapping`
    );
    translationContainer.replaceWith(originalContainer);
    log("Restored original container");
    stripCmsBindForRerender(originalContainer);
  } else {
    log("teardownEditors: no containers to swap");
  }
  translationContainer = null;
  originalContainer = null;
}
function stripCmsBindForRerender(container) {
  const bound = container.querySelectorAll("[data-cms-bind]");
  for (const el of bound) el.removeAttribute("data-cms-bind");
  if (bound.length) {
    log(`Stripped data-cms-bind from ${bound.length} element(s) to force fresh overlays`);
  }
  forceBookshopRerender();
}
function forceBookshopRerender() {
  const cc = window.CloudCannon;
  const bsl = window.bookshopLive;
  if (!bsl || typeof bsl.update !== "function") {
    if (typeof cc?.refreshInterface === "function") {
      requestAnimationFrame(() => {
        cc.refreshInterface();
        log("Called deferred CloudCannon.refreshInterface() (non-Bookshop site)");
      });
    }
    return;
  }
  if (typeof cc?.value !== "function" || typeof cc?.refreshInterface !== "function") {
    log("forceBookshopRerender: CloudCannon API incomplete, panels will restore on next update");
    return;
  }
  setTimeout(async () => {
    try {
      const data = await cc.value({ keepMarkdownAsHTML: false, preferBlobs: true });
      const options = window.bookshopLiveOptions || {};
      const rendered = await bsl.update(data, options);
      if (rendered) {
        cc.refreshInterface();
        log("Forced Bookshop re-render + refreshInterface() to restore component panels");
      } else {
        log("Bookshop re-render was throttled, panels will restore on next update");
      }
    } catch (e) {
      warn("Failed to force Bookshop re-render:", e);
    }
  }, 0);
}
var DATASET_TIMEOUT_MS = 5e3;
async function resolveFile(dataset) {
  const timeout = new Promise(
    (resolve) => setTimeout(() => resolve(null), DATASET_TIMEOUT_MS)
  );
  const result = await Promise.race([dataset.items(), timeout]);
  if (result === null) {
    warn(
      `dataset.items() did not resolve within ${DATASET_TIMEOUT_MS / 1e3}s. This usually means CloudCannon cannot find the file configured in data_config. Check that the path in data_config is correct relative to your source directory.`
    );
    return null;
  }
  if (Array.isArray(result)) return result[0] ?? null;
  return result ?? null;
}
async function switchLocale(locale) {
  if (!api) return;
  switchGeneration++;
  const myGeneration = switchGeneration;
  log(`switchLocale("${locale}") \u2014 generation ${myGeneration}`);
  switchInProgress = true;
  try {
    await switchLocaleInner(locale, myGeneration);
  } finally {
    switchInProgress = false;
  }
}
async function switchLocaleInner(locale, myGeneration) {
  currentLocale = locale;
  updateButtonStates();
  teardownEditors();
  if (!locale) {
    log("Switched to Original");
    return;
  }
  pauseBookshop();
  const container = document.querySelector("[data-rcc]") ?? document.querySelector("main");
  if (!container) {
    warn("No locale container found");
    return;
  }
  originalContainer = container;
  log(`switchLocale: snapshot boundary is <${container.tagName.toLowerCase()}>, ${container.children.length} child element(s)`);
  const clone = container.cloneNode(true);
  cleanClone(clone);
  container.replaceWith(clone);
  translationContainer = clone;
  log("Swapped in clean translation container");
  trackElements(clone);
  if (tracked.length === 0) {
    warn(
      `No [data-rosey] elements found in the snapshot boundary. Make sure your translatable elements have data-rosey attributes.`
    );
  }
  const datasetKey = `locales_${locale}`;
  log(`switchLocale: requesting dataset "${datasetKey}"`);
  const dataset = api.dataset(datasetKey);
  const file = await resolveFile(dataset);
  if (!file) {
    warn(
      `No file found in dataset "${datasetKey}". Check that data_config.${datasetKey} exists in cloudcannon.config.yml and points to a valid locale file.`
    );
    return;
  }
  log(`switchLocale: resolved file from dataset "${datasetKey}"`);
  activeFile = file;
  let setupComplete = false;
  staleCount = 0;
  const dataResults = await Promise.all(
    tracked.map(
      (t) => file.data.get({ slug: t.roseyKey }).catch(() => null)
    )
  );
  if (myGeneration !== switchGeneration) {
    log(`Generation changed after data fetch, aborting "${locale}" setup`);
    return;
  }
  const resolvedValues = [];
  for (let i = 0; i < tracked.length; i++) {
    const t = tracked[i];
    const data = dataResults[i];
    t.hasLocaleEntry = data != null;
    const value = data?.value ?? data?.original ?? t.originalContent;
    resolvedValues[i] = value;
    const isStale = t.hasLocaleEntry && data?._base_original != null && data?.original != null && data._base_original !== data.original;
    t.stale = isStale;
    t.baseOriginal = data?._base_original ?? null;
    t.localeOriginal = data?.original ?? null;
    t.element.innerHTML = value;
    if (!t.hasLocaleEntry) {
      t.element.style.opacity = "0.45";
      t.element.style.pointerEvents = "none";
    }
    if (isStale) {
      markStaleElement(t);
      staleCount++;
    }
  }
  updateStaleBadge();
  updateStaleList();
  log(`Data loaded \u2014 ${staleCount} stale of ${tracked.length} elements`);
  let editorsCreated = 0;
  for (let i = 0; i < tracked.length; i++) {
    const t = tracked[i];
    if (myGeneration !== switchGeneration) {
      log(`Generation changed, aborting "${locale}" editor setup`);
      return;
    }
    if (!t.hasLocaleEntry) continue;
    try {
      const value = resolvedValues[i];
      const inputConfig = originalInputConfigs.get(t.roseyKey);
      const rccInputConfig = inputConfig ? { ...inputConfig, type: "html" } : { type: "html" };
      const editor = await api.createTextEditableRegion(
        t.element,
        (content) => {
          if (myGeneration !== switchGeneration) return;
          if (!setupComplete) return;
          if (content == null) return;
          log(`[${t.roseyKey}] onChange \u2192 set(".value")`);
          file.data.set({ slug: `${t.roseyKey}.value`, value: content });
          if (t.stale && t.baseOriginal) {
            resolveStale(t, file);
          }
        },
        {
          elementType: t.inferredType,
          ...rccInputConfig != null && { inputConfig: rccInputConfig }
        }
      );
      t.editor = editor;
      editor.setContent(value);
      t.element.addEventListener("focus", () => {
        t.focused = true;
      });
      t.element.addEventListener("blur", () => {
        t.focused = false;
      });
      editorsCreated++;
    } catch (err) {
      warn(`Failed to set up editor for "${t.roseyKey}":`, err);
    }
  }
  log(`Created ${editorsCreated} editors`);
  if (myGeneration !== switchGeneration) return;
  await Promise.resolve();
  setupComplete = true;
  log(`Setup complete for "${locale}" (generation ${myGeneration})`);
  activeDataset = dataset;
  activeDatasetListener = async () => {
    if (myGeneration !== switchGeneration) return;
    const freshFile = await resolveFile(dataset);
    if (!freshFile) return;
    let updated = 0;
    let skipped = 0;
    for (const t of tracked) {
      if (!t.hasLocaleEntry) continue;
      if (!t.editor) continue;
      if (t.focused) {
        skipped++;
        continue;
      }
      try {
        const data = await freshFile.data.get({ slug: t.roseyKey });
        const value = data?.value ?? data?.original ?? t.originalContent;
        t.editor.setContent(value);
        updated++;
      } catch {
      }
    }
    log(`Change event: updated ${updated} editors${skipped ? `, skipped ${skipped} (focused)` : ""}`);
  };
  dataset.addEventListener("change", activeDatasetListener);
  log(`Switched to ${locale}`);
}
var FAB_SIZE = 48;
var FAB_STORAGE_KEY = "rcc-fab-position";
var CC_BLUE = "#034ad8";
var TRANSLATE_ICON = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"',
  ` fill="none" stroke="${CC_BLUE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,
  '<path d="M4 5h8"/><path d="M8 5V3"/>',
  '<path d="M4.5 5c1 4 4 8 7.5 10"/><path d="M12 5c-1 3-3 6-7.5 10"/>',
  '<path d="M14.5 19l2.5-6 2.5 6"/><path d="M15.5 17h3"/>',
  "</svg>"
].join("");
function updateButtonStates() {
  const buttons = document.querySelectorAll(
    "#rcc-locale-popover button[data-locale]"
  );
  for (const btn of buttons) {
    const isActive = (btn.dataset.locale ?? null) === (currentLocale ?? "");
    Object.assign(btn.style, {
      background: isActive ? CC_BLUE : "#f1f5f9",
      color: isActive ? "#ffffff" : "#1e293b",
      fontWeight: isActive ? "600" : "400"
    });
  }
  const badge = document.getElementById("rcc-fab-badge");
  if (badge) {
    if (currentLocale) {
      badge.textContent = currentLocale.toUpperCase();
      badge.style.display = "flex";
    } else {
      badge.style.display = "none";
    }
  }
}
function injectSwitcher(locales) {
  const fab = document.createElement("div");
  fab.id = "rcc-locale-switcher";
  const savedPos = (() => {
    try {
      const raw = localStorage.getItem(FAB_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();
  Object.assign(fab.style, {
    position: "fixed",
    zIndex: "999999",
    width: `${FAB_SIZE}px`,
    height: `${FAB_SIZE}px`,
    borderRadius: "50%",
    background: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 12px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)",
    cursor: "grab",
    userSelect: "none",
    touchAction: "none",
    transition: "box-shadow 0.2s",
    fontFamily: "system-ui, sans-serif"
  });
  if (savedPos) {
    fab.style.top = `${savedPos.top}px`;
    fab.style.left = `${savedPos.left}px`;
  } else {
    fab.style.bottom = "20px";
    fab.style.right = "20px";
  }
  fab.innerHTML = TRANSLATE_ICON;
  const badge = document.createElement("div");
  badge.id = "rcc-fab-badge";
  Object.assign(badge.style, {
    position: "absolute",
    top: "-4px",
    right: "-4px",
    background: CC_BLUE,
    color: "#ffffff",
    fontSize: "9px",
    fontWeight: "700",
    lineHeight: "1",
    padding: "3px 5px",
    borderRadius: "8px",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "16px",
    textAlign: "center",
    pointerEvents: "none"
  });
  fab.appendChild(badge);
  const staleBadge = document.createElement("div");
  staleBadge.id = "rcc-stale-badge";
  Object.assign(staleBadge.style, {
    position: "absolute",
    bottom: "-4px",
    right: "-4px",
    background: STALE_AMBER,
    color: "#ffffff",
    fontSize: "9px",
    fontWeight: "700",
    lineHeight: "1",
    padding: "3px 5px",
    borderRadius: "8px",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "16px",
    textAlign: "center",
    pointerEvents: "none"
  });
  fab.appendChild(staleBadge);
  const popover = document.createElement("div");
  popover.id = "rcc-locale-popover";
  Object.assign(popover.style, {
    position: "fixed",
    zIndex: "999998",
    background: "#ffffff",
    borderRadius: "10px",
    padding: "8px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)",
    display: "none",
    flexDirection: "column",
    gap: "4px",
    fontFamily: "system-ui, sans-serif",
    fontSize: "13px",
    minWidth: "120px"
  });
  const header = document.createElement("div");
  Object.assign(header.style, {
    fontWeight: "600",
    fontSize: "11px",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    padding: "4px 8px 2px"
  });
  header.textContent = "Locale";
  popover.appendChild(header);
  function makeLocaleButton(label, locale) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.dataset.locale = locale ?? "";
    Object.assign(btn.style, {
      display: "block",
      width: "100%",
      padding: "8px 12px",
      border: "none",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "13px",
      textAlign: "left",
      transition: "background 0.15s, color 0.15s",
      background: "#f1f5f9",
      color: "#1e293b",
      fontWeight: "400"
    });
    btn.addEventListener("mouseenter", () => {
      if ((btn.dataset.locale ?? null) !== (currentLocale ?? "")) {
        btn.style.background = "#e2e8f0";
      }
    });
    btn.addEventListener("mouseleave", () => {
      if ((btn.dataset.locale ?? null) !== (currentLocale ?? "")) {
        btn.style.background = "#f1f5f9";
      }
    });
    btn.addEventListener("click", (e) => {
      log(
        `Button clicked: "${label}" (locale=${locale}) isTrusted=${e.isTrusted}, currentLocale=${currentLocale}`
      );
      if (switchInProgress) {
        log("Ignoring click \u2014 locale switch already in progress");
        return;
      }
      switchLocale(locale);
      closePopover();
    });
    return btn;
  }
  popover.appendChild(makeLocaleButton("Original", null));
  for (const locale of locales) {
    const wrapper = document.createElement("div");
    wrapper.appendChild(makeLocaleButton(locale.toUpperCase(), locale));
    const submenu = document.createElement("div");
    submenu.dataset.rccStaleSubmenu = locale;
    Object.assign(submenu.style, {
      display: "none",
      alignItems: "center",
      gap: "4px",
      cursor: "pointer",
      padding: "4px 12px 2px",
      userSelect: "none"
    });
    const chevron = document.createElement("span");
    chevron.dataset.rccStaleChevron = "";
    Object.assign(chevron.style, {
      display: "inline-flex",
      transition: "transform 0.2s",
      transform: "rotate(0deg)",
      color: STALE_AMBER,
      fontSize: "10px",
      lineHeight: "1"
    });
    chevron.innerHTML = '<svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2.5 1 L5.5 4 L2.5 7"/></svg>';
    const countLabel = document.createElement("span");
    countLabel.dataset.rccStaleCount = "";
    Object.assign(countLabel.style, {
      fontWeight: "600",
      fontSize: "10px",
      color: STALE_AMBER,
      letterSpacing: "0.03em"
    });
    submenu.appendChild(chevron);
    submenu.appendChild(countLabel);
    submenu.addEventListener("click", () => {
      toggleStalePanel();
    });
    wrapper.appendChild(submenu);
    popover.appendChild(wrapper);
  }
  const stalePanel = document.createElement("div");
  stalePanel.id = "rcc-stale-panel";
  Object.assign(stalePanel.style, {
    position: "fixed",
    zIndex: "999997",
    background: "#ffffff",
    borderRadius: "10px",
    padding: "8px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)",
    display: "none",
    flexDirection: "column",
    gap: "4px",
    fontFamily: "system-ui, sans-serif",
    fontSize: "13px",
    minWidth: "200px",
    maxWidth: "260px",
    borderTop: `3px solid ${STALE_AMBER}`
  });
  const panelHeader = document.createElement("div");
  Object.assign(panelHeader.style, {
    fontWeight: "600",
    fontSize: "11px",
    color: STALE_AMBER,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    padding: "4px 8px 2px"
  });
  panelHeader.dataset.rccPanelCount = "";
  stalePanel.appendChild(panelHeader);
  const panelItems = document.createElement("div");
  panelItems.dataset.rccStaleItems = "";
  Object.assign(panelItems.style, {
    maxHeight: "240px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "1px"
  });
  stalePanel.appendChild(panelItems);
  const resolveAllBtn = document.createElement("button");
  resolveAllBtn.dataset.rccResolveAll = "";
  Object.assign(resolveAllBtn.style, {
    display: "none",
    width: "100%",
    marginTop: "4px",
    padding: "6px 10px",
    border: "none",
    borderRadius: "5px",
    background: STALE_AMBER,
    color: "#ffffff",
    fontSize: "11px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "background 0.15s",
    fontFamily: "system-ui, sans-serif"
  });
  resolveAllBtn.textContent = "Resolve all";
  resolveAllBtn.addEventListener("mouseenter", () => {
    resolveAllBtn.style.background = "#d97706";
  });
  resolveAllBtn.addEventListener("mouseleave", () => {
    resolveAllBtn.style.background = STALE_AMBER;
  });
  resolveAllBtn.addEventListener("click", () => {
    const stale = tracked.filter((t) => t.stale);
    for (const t of stale) {
      if (activeFile && t.baseOriginal) resolveStale(t, activeFile);
    }
  });
  stalePanel.appendChild(resolveAllBtn);
  function positionStalePanel() {
    stalePanel.style.visibility = "hidden";
    stalePanel.style.display = "flex";
    const popRect = popover.getBoundingClientRect();
    const panelRect = stalePanel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 8;
    let left = popRect.left - panelRect.width - gap;
    if (left < 4) left = popRect.right + gap;
    if (left + panelRect.width > vw - 4) left = 4;
    let top = popRect.top;
    if (top + panelRect.height > vh - 4) top = vh - panelRect.height - 4;
    top = Math.max(4, top);
    stalePanel.style.top = `${top}px`;
    stalePanel.style.left = `${left}px`;
    stalePanel.style.visibility = "visible";
  }
  function openStalePanel() {
    positionStalePanel();
    const chevron = document.querySelector(
      `[data-rcc-stale-submenu="${currentLocale}"] [data-rcc-stale-chevron]`
    );
    if (chevron) chevron.style.transform = "rotate(90deg)";
  }
  function closeStalePanel() {
    stalePanel.style.display = "none";
    const chevron = document.querySelector(
      `[data-rcc-stale-submenu="${currentLocale}"] [data-rcc-stale-chevron]`
    );
    if (chevron) chevron.style.transform = "rotate(0deg)";
  }
  function toggleStalePanel() {
    if (stalePanel.style.display !== "none") closeStalePanel();
    else openStalePanel();
  }
  let isDragging = false;
  let hasDragged = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let fabStartX = 0;
  let fabStartY = 0;
  function clampToViewport(x, y) {
    return {
      x: Math.max(0, Math.min(x, window.innerWidth - FAB_SIZE)),
      y: Math.max(0, Math.min(y, window.innerHeight - FAB_SIZE))
    };
  }
  function saveFabPosition() {
    const r = fab.getBoundingClientRect();
    localStorage.setItem(FAB_STORAGE_KEY, JSON.stringify({ top: r.top, left: r.left }));
  }
  fab.addEventListener("pointerdown", (e) => {
    isDragging = true;
    hasDragged = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const r = fab.getBoundingClientRect();
    fabStartX = r.left;
    fabStartY = r.top;
    fab.setPointerCapture(e.pointerId);
    fab.style.cursor = "grabbing";
    fab.style.boxShadow = "0 4px 20px rgba(0,0,0,0.2), 0 2px 6px rgba(0,0,0,0.12)";
  });
  fab.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (!hasDragged && Math.sqrt(dx * dx + dy * dy) < 5) return;
    hasDragged = true;
    const { x, y } = clampToViewport(fabStartX + dx, fabStartY + dy);
    fab.style.bottom = "auto";
    fab.style.right = "auto";
    fab.style.top = `${y}px`;
    fab.style.left = `${x}px`;
    if (popoverOpen) {
      positionPopover();
      if (stalePanel.style.display !== "none") positionStalePanel();
    }
  });
  fab.addEventListener("pointerup", () => {
    if (!isDragging) return;
    isDragging = false;
    fab.style.cursor = "grab";
    fab.style.boxShadow = "0 2px 12px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)";
    if (hasDragged) {
      saveFabPosition();
    } else {
      togglePopover();
    }
  });
  window.addEventListener("resize", () => {
    const r = fab.getBoundingClientRect();
    const { x, y } = clampToViewport(r.left, r.top);
    if (x !== r.left || y !== r.top) {
      fab.style.bottom = "auto";
      fab.style.right = "auto";
      fab.style.top = `${y}px`;
      fab.style.left = `${x}px`;
      saveFabPosition();
    }
    if (popoverOpen) {
      positionPopover();
      if (stalePanel.style.display !== "none") positionStalePanel();
    }
  });
  let popoverOpen = false;
  function positionPopover() {
    popover.style.visibility = "hidden";
    popover.style.display = "flex";
    const fabRect = fab.getBoundingClientRect();
    const popRect = popover.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 8;
    let top = fabRect.top - gap - popRect.height > 0 ? fabRect.top - gap - popRect.height : fabRect.bottom + gap;
    let left = fabRect.right - popRect.width > 0 ? fabRect.right - popRect.width : fabRect.left;
    top = Math.max(4, Math.min(top, vh - popRect.height - 4));
    left = Math.max(4, Math.min(left, vw - popRect.width - 4));
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    popover.style.visibility = "visible";
  }
  function openPopover() {
    positionPopover();
    popoverOpen = true;
  }
  function closePopover() {
    popover.style.display = "none";
    popoverOpen = false;
    closeStalePanel();
  }
  function togglePopover() {
    if (popoverOpen) closePopover();
    else openPopover();
  }
  document.addEventListener("pointerdown", (e) => {
    if (!popoverOpen) return;
    const target = e.target;
    if (fab.contains(target) || popover.contains(target) || stalePanel.contains(target)) return;
    closePopover();
  });
  document.addEventListener("keydown", (e) => {
    if (popoverOpen && e.key === "Escape") closePopover();
  });
  document.body.appendChild(fab);
  document.body.appendChild(popover);
  document.body.appendChild(stalePanel);
  updateButtonStates();
}
async function discoverLocales() {
  try {
    const res = await fetch("/_rcc/locales.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const locales = data?.locales;
    if (!Array.isArray(locales) || locales.length === 0) {
      throw new Error("manifest missing locales array");
    }
    log("Discovered locales from manifest:", locales);
    return locales;
  } catch {
  }
  warn(
    "Could not load /_rcc/locales.json. Ensure write-locales ran with --dest pointing to your build output directory."
  );
  return null;
}
async function init() {
  const ccWindow = window;
  if (!ccWindow.CloudCannonAPI) {
    warn("CloudCannonAPI not available");
    return;
  }
  api = ccWindow.CloudCannonAPI.useVersion("v1", true);
  const container = document.querySelector("[data-rcc]") ?? document.querySelector("main");
  if (!container) return;
  const allLocales = await discoverLocales();
  if (!allLocales || allLocales.length === 0) return;
  const excludeAttr = container.getAttribute("data-rcc-exclude");
  const excluded = excludeAttr ? new Set(
    excludeAttr.split(",").map((s) => s.trim()).filter(Boolean)
  ) : null;
  const locales = excluded ? allLocales.filter((l) => !excluded.has(l)) : allLocales;
  if (locales.length === 0) return;
  const elementCount = container.querySelectorAll(
    "[data-rosey]:not([data-rcc-ignore])"
  ).length;
  if (elementCount === 0) {
    warn("No translatable elements found (missing data-rosey attributes)");
    return;
  }
  injectSwitcher(locales);
  await prescanOriginals(container);
  log(`Ready \u2014 ${locales.length} locales, ${elementCount} elements`);
}
if (window.inEditorMode && window.CloudCannonAPI) {
  init();
} else {
  document.addEventListener("cloudcannon:load", init);
}
