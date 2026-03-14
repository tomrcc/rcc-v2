"use strict";

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
var originalContainer = null;
var translationContainer = null;
var activeDataset = null;
var activeDatasetListener = null;
var switchGeneration = 0;
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
function cleanClone(root) {
  stripCCAttributes(root);
  root.querySelectorAll("*").forEach((el) => {
    if (el instanceof HTMLElement) stripCCAttributes(el);
  });
  replaceCustomElements(root);
}
function stripCCAttributes(el) {
  el.removeAttribute("data-editable");
  el.removeAttribute("data-prop");
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
      focused: false,
      stale: false,
      baseOriginal: null,
      localeOriginal: null
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
var WARNING_ICON = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"',
  ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>',
  '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  "</svg>"
].join("");
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
}
function positionIndicator(indicator, element) {
  const rect = element.getBoundingClientRect();
  indicator.style.top = `${rect.top - 6}px`;
  indicator.style.left = `${rect.right - 6}px`;
}
function repositionAllIndicators() {
  for (const t of tracked) {
    if (t.staleIndicator) positionIndicator(t.staleIndicator, t.element);
  }
}
var staleRepositionBound = false;
function ensureRepositionListeners() {
  if (staleRepositionBound) return;
  staleRepositionBound = true;
  window.addEventListener("scroll", repositionAllIndicators, true);
  window.addEventListener("resize", repositionAllIndicators);
}
function removeRepositionListeners() {
  if (!staleRepositionBound) return;
  staleRepositionBound = false;
  window.removeEventListener("scroll", repositionAllIndicators, true);
  window.removeEventListener("resize", repositionAllIndicators);
}
function attachStaleIndicator(t, file) {
  t.element.style.outline = `2px dashed ${STALE_AMBER}`;
  t.element.style.outlineOffset = "2px";
  t.element.style.backgroundColor = STALE_AMBER_BG;
  const indicator = document.createElement("div");
  indicator.className = "rcc-stale-indicator";
  Object.assign(indicator.style, {
    position: "fixed",
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    background: STALE_AMBER,
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    zIndex: "999990",
    boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
    fontFamily: "system-ui, sans-serif"
  });
  indicator.innerHTML = WARNING_ICON;
  positionIndicator(indicator, t.element);
  const tooltip = document.createElement("div");
  tooltip.className = "rcc-stale-tooltip";
  Object.assign(tooltip.style, {
    position: "absolute",
    bottom: "calc(100% + 8px)",
    right: "0",
    background: "#ffffff",
    border: `1px solid ${STALE_AMBER}`,
    borderRadius: "8px",
    padding: "10px 12px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
    fontFamily: "system-ui, sans-serif",
    fontSize: "12px",
    lineHeight: "1.5",
    color: "#1e293b",
    minWidth: "240px",
    maxWidth: "360px",
    display: "none",
    zIndex: "999991",
    whiteSpace: "normal"
  });
  const heading = document.createElement("div");
  Object.assign(heading.style, {
    fontWeight: "600",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: STALE_AMBER,
    marginBottom: "6px"
  });
  heading.textContent = "Source text changed";
  tooltip.appendChild(heading);
  const oldLabel = document.createElement("div");
  Object.assign(oldLabel.style, { fontSize: "10px", color: "#9ca3af", marginBottom: "2px" });
  oldLabel.textContent = "Previous:";
  tooltip.appendChild(oldLabel);
  const oldText = document.createElement("div");
  Object.assign(oldText.style, {
    textDecoration: "line-through",
    color: "#9ca3af",
    marginBottom: "8px",
    wordBreak: "break-word"
  });
  tooltip.appendChild(oldText);
  const newLabel = document.createElement("div");
  Object.assign(newLabel.style, { fontSize: "10px", color: "#9ca3af", marginBottom: "2px" });
  newLabel.textContent = "Current:";
  tooltip.appendChild(newLabel);
  const newText = document.createElement("div");
  Object.assign(newText.style, { color: "#1e293b", marginBottom: "10px", wordBreak: "break-word" });
  tooltip.appendChild(newText);
  const reviewBtn = document.createElement("button");
  Object.assign(reviewBtn.style, {
    display: "block",
    width: "100%",
    padding: "6px 10px",
    border: "none",
    borderRadius: "5px",
    background: STALE_AMBER,
    color: "#ffffff",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "background 0.15s"
  });
  reviewBtn.textContent = "Mark as reviewed";
  reviewBtn.addEventListener("mouseenter", () => {
    reviewBtn.style.background = "#d97706";
  });
  reviewBtn.addEventListener("mouseleave", () => {
    reviewBtn.style.background = STALE_AMBER;
  });
  reviewBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    resolveStale(t, file);
  });
  tooltip.appendChild(reviewBtn);
  indicator.appendChild(tooltip);
  indicator.addEventListener("click", (e) => {
    e.stopPropagation();
    const isVisible = tooltip.style.display === "block";
    closeAllStaleTooltips();
    if (!isVisible) {
      const stripHtml = (html) => {
        const div = document.createElement("div");
        div.innerHTML = html;
        return div.textContent ?? html;
      };
      oldText.textContent = stripHtml(t.localeOriginal ?? "");
      newText.textContent = stripHtml(t.baseOriginal ?? "");
      tooltip.style.display = "block";
    }
  });
  document.body.appendChild(indicator);
  t.staleIndicator = indicator;
  ensureRepositionListeners();
}
function closeAllStaleTooltips() {
  for (const el of document.querySelectorAll(".rcc-stale-tooltip")) {
    el.style.display = "none";
  }
}
function removeStaleIndicator(t) {
  t.stale = false;
  t.element.style.outline = "";
  t.element.style.outlineOffset = "";
  t.element.style.backgroundColor = "";
  if (t.staleIndicator) {
    t.staleIndicator.remove();
    t.staleIndicator = void 0;
  }
  recountStale();
}
function resolveStale(t, file) {
  if (!t.stale || !t.baseOriginal) return;
  log(`[${t.roseyKey}] Resolving stale \u2014 updating .original`);
  file.data.set({ slug: `${t.roseyKey}.original`, value: t.baseOriginal });
  removeStaleIndicator(t);
}
function teardownEditors() {
  if (activeDataset && activeDatasetListener) {
    activeDataset.removeEventListener("change", activeDatasetListener);
  }
  activeDataset = null;
  activeDatasetListener = null;
  for (const t of tracked) {
    t.editor = void 0;
    if (t.staleIndicator) {
      t.staleIndicator.remove();
      t.staleIndicator = void 0;
    }
  }
  tracked.length = 0;
  staleCount = 0;
  updateStaleBadge();
  removeRepositionListeners();
  if (translationContainer && originalContainer) {
    translationContainer.replaceWith(originalContainer);
    log("Restored original container");
  }
  translationContainer = null;
  originalContainer = null;
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
  const container = document.querySelector("main[data-locales]");
  if (!container) {
    warn("No locale container found");
    return;
  }
  originalContainer = container;
  const clone = container.cloneNode(true);
  cleanClone(clone);
  container.replaceWith(clone);
  translationContainer = clone;
  log("Swapped in clean translation container");
  trackElements(clone);
  const dataset = api.dataset(`locales_${locale}`);
  const file = await resolveFile(dataset);
  if (!file) {
    warn(`No file found in dataset "locales_${locale}"`);
    return;
  }
  let setupComplete = false;
  staleCount = 0;
  let editorsCreated = 0;
  for (const t of tracked) {
    if (myGeneration !== switchGeneration) {
      log(`Generation changed, aborting "${locale}" setup`);
      return;
    }
    try {
      const data = await file.data.get({ slug: t.roseyKey });
      const value = data?.value ?? data?.original ?? t.originalContent;
      const isStale = data?._base_original != null && data?.original != null && data._base_original !== data.original;
      t.stale = isStale;
      t.baseOriginal = data?._base_original ?? null;
      t.localeOriginal = data?.original ?? null;
      t.element.innerHTML = value;
      if (isStale) {
        attachStaleIndicator(t, file);
        staleCount++;
      }
      const inputConfig = originalInputConfigs.get(t.roseyKey);
      const rccInputConfig = inputConfig ? { ...inputConfig, type: "html" } : void 0;
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
          elementType: t.element.dataset.type,
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
  updateStaleBadge();
  log(`Created ${editorsCreated} editors (${staleCount} stale)`);
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
    btn.addEventListener("click", () => {
      switchLocale(locale);
      closePopover();
    });
    return btn;
  }
  popover.appendChild(makeLocaleButton("Original", null));
  for (const locale of locales) {
    popover.appendChild(makeLocaleButton(locale.toUpperCase(), locale));
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
    if (popoverOpen) positionPopover();
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
    if (popoverOpen) positionPopover();
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
  }
  function togglePopover() {
    if (popoverOpen) closePopover();
    else openPopover();
  }
  document.addEventListener("pointerdown", (e) => {
    if (!popoverOpen) return;
    if (fab.contains(e.target) || popover.contains(e.target)) return;
    closePopover();
  });
  document.addEventListener("pointerdown", (e) => {
    const target = e.target;
    if (target.closest(".rcc-stale-indicator")) return;
    closeAllStaleTooltips();
  });
  document.addEventListener("keydown", (e) => {
    if (popoverOpen && e.key === "Escape") closePopover();
  });
  document.body.appendChild(fab);
  document.body.appendChild(popover);
  updateButtonStates();
}
async function init() {
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
  const elementCount = main.querySelectorAll(
    "[data-rosey]:not([data-rcc-ignore])"
  ).length;
  if (elementCount === 0) {
    warn("No translatable elements found (missing data-rosey attributes)");
    return;
  }
  injectSwitcher(locales);
  await prescanOriginals(main);
  log(`Ready \u2014 ${locales.length} locales, ${elementCount} elements`);
}
if (window.inEditorMode && window.CloudCannonAPI) {
  init();
} else {
  document.addEventListener("cloudcannon:load", init);
}
