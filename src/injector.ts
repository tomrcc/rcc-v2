/**
 * Locale injector for CloudCannon Visual Editor.
 *
 * Finds all [data-rosey] elements, injects a floating locale switcher,
 * and uses the CloudCannon live editing JS API to create inline editors
 * that read/write locale data directly.
 *
 * When a locale is selected the entire locale container is swapped out
 * of the DOM and replaced with a clean clone stripped of all CC editing
 * infrastructure. CC's MutationObserver auto-dehydrates the original
 * and ignores the inert clone. On teardown the original is swapped back
 * in and CC auto-restores all editing.
 *
 * Add data-rcc-ignore to any [data-rosey] element to opt it out.
 */

import { log, warn } from "./logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrackedElement {
	element: HTMLElement;
	roseyKey: string;
	originalContent: string;
	focused: boolean;
	editor?: { setContent: (content?: string | null) => void };
}

interface CCFile {
	data: {
		get(opts?: { slug?: string }): Promise<any>;
		set(opts: { slug: string; value: any }): Promise<any>;
	};
}

interface CCDataset {
	items(): Promise<CCFile | CCFile[]>;
	addEventListener(event: string, listener: () => void): void;
	removeEventListener(event: string, listener: () => void): void;
}

interface CCApi {
	dataset(key: string): CCDataset;
	createTextEditableRegion(
		element: HTMLElement,
		onChange: (content?: string | null) => void,
		options?: { elementType?: string; inputConfig?: Record<string, unknown> },
	): Promise<{ setContent: (content?: string | null) => void }>;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

const tracked: TrackedElement[] = [];
let currentLocale: string | null = null;
let api: CCApi | null = null;

let originalContainer: HTMLElement | null = null;
let translationContainer: HTMLElement | null = null;

let activeDataset: CCDataset | null = null;
let activeDatasetListener: (() => void) | null = null;

/**
 * Guards against stale ProseMirror onChange fires. createTextEditableRegion
 * has no destroy() so old editors stay alive and fire when the DOM changes.
 * Each onChange closure captures its generation; mismatches are no-ops.
 */
let switchGeneration = 0;

// ---------------------------------------------------------------------------
// Rosey key resolution
// ---------------------------------------------------------------------------

function resolveRoseyKey(el: Element): string | null {
	const localKey = el.getAttribute("data-rosey");
	if (!localKey) return null;

	const nsParts: string[] = [];
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

// ---------------------------------------------------------------------------
// DOM clone cleaning
// ---------------------------------------------------------------------------

const CC_CUSTOM_ELEMENTS = [
	"EDITABLE-TEXT",
	"EDITABLE-SOURCE",
	"EDITABLE-IMAGE",
	"EDITABLE-COMPONENT",
	"EDITABLE-ARRAY-ITEM",
];

/**
 * Strip all CC editing infrastructure from a detached DOM tree.
 * Because the tree is not in the document, there is no MutationObserver,
 * no connectedCallback, and no race conditions.
 */
function cleanClone(root: HTMLElement): void {
	stripCCAttributes(root);
	root.querySelectorAll("*").forEach((el) => {
		if (el instanceof HTMLElement) stripCCAttributes(el);
	});

	replaceCustomElements(root);
}

function stripCCAttributes(el: HTMLElement): void {
	el.removeAttribute("data-editable");
	el.removeAttribute("data-prop");
	for (const attr of Array.from(el.attributes)) {
		if (attr.name.startsWith("data-prop-")) {
			el.removeAttribute(attr.name);
		}
	}
}

function replaceCustomElements(root: HTMLElement): void {
	for (const tag of CC_CUSTOM_ELEMENTS) {
		const els = root.querySelectorAll(tag);
		for (const el of els) {
			let replacementTag = "div";
			if (tag === "EDITABLE-TEXT") {
				const dataType = el.getAttribute("data-type");
				const isBlockType = dataType === "block" || dataType === "text";
				const hasBlockChildren =
					el.querySelector(
						"address, article, aside, blockquote, details, dialog, dd, div, dl, dt, fieldset, figcaption, figure, footer, form, h1, h2, h3, h4, h5, h6, header, hgroup, hr, li, main, nav, ol, p, pre, section, table, ul",
					) !== null;
				replacementTag =
					isBlockType || hasBlockChildren ? "div" : "span";
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

// ---------------------------------------------------------------------------
// Element tracking
// ---------------------------------------------------------------------------

function trackElements(scope: Element): void {
	tracked.length = 0;
	const elements = scope.querySelectorAll<HTMLElement>(
		"[data-rosey]:not([data-rcc-ignore])",
	);
	for (const el of elements) {
		const roseyKey = resolveRoseyKey(el);
		if (!roseyKey) continue;
		tracked.push({ element: el, roseyKey, originalContent: el.innerHTML, focused: false });
	}
	log(`Tracked ${tracked.length} translatable elements`);
}

// ---------------------------------------------------------------------------
// Teardown / restore
// ---------------------------------------------------------------------------

function teardownEditors(): void {
	if (activeDataset && activeDatasetListener) {
		activeDataset.removeEventListener("change", activeDatasetListener);
	}
	activeDataset = null;
	activeDatasetListener = null;

	for (const t of tracked) t.editor = undefined;
	tracked.length = 0;

	if (translationContainer && originalContainer) {
		translationContainer.replaceWith(originalContainer);
		log("Restored original container");
	}
	translationContainer = null;
	originalContainer = null;
}

// ---------------------------------------------------------------------------
// Locale switching
// ---------------------------------------------------------------------------

async function resolveFile(dataset: CCDataset): Promise<CCFile | null> {
	const result = await dataset.items();
	if (Array.isArray(result)) return result[0] ?? null;
	return result ?? null;
}

async function switchLocale(locale: string | null): Promise<void> {
	if (!api) return;

	switchGeneration++;
	const myGeneration = switchGeneration;
	log(`switchLocale("${locale}") — generation ${myGeneration}`);

	currentLocale = locale;
	updateButtonStates();

	teardownEditors();

	if (!locale) {
		log("Switched to Original");
		return;
	}

	// --- Swap the locale container with a clean clone -----------------------

	const container = document.querySelector<HTMLElement>("main[data-locales]");
	if (!container) {
		warn("No locale container found");
		return;
	}

	originalContainer = container;
	const clone = container.cloneNode(true) as HTMLElement;
	cleanClone(clone);
	container.replaceWith(clone);
	translationContainer = clone;
	log("Swapped in clean translation container");

	// --- Track elements in the clone and set up editors ---------------------

	trackElements(clone);

	const dataset = api.dataset(`locales_${locale}`);
	const file = await resolveFile(dataset);

	if (!file) {
		warn(`No file found in dataset "locales_${locale}"`);
		return;
	}

	let setupComplete = false;

	for (const t of tracked) {
		if (myGeneration !== switchGeneration) {
			log(`Generation changed, aborting "${locale}" setup`);
			return;
		}

		try {
			const data = await file.data.get({ slug: t.roseyKey });
			const value = data?.value ?? data?.original ?? t.originalContent;

			t.element.innerHTML = value;

			const editor = await api!.createTextEditableRegion(
				t.element,
				(content) => {
					if (myGeneration !== switchGeneration) return;
					if (!setupComplete) return;
					if (content == null) return;
					log(`[${t.roseyKey}] onChange → set(".value", ${JSON.stringify(content).slice(0, 80)})`);
					file.data.set({ slug: `${t.roseyKey}.value`, value: content });
				},
			);
			t.editor = editor;
			editor.setContent(value);

			t.element.addEventListener("focus", () => {
				t.focused = true;
				log(`[${t.roseyKey}] Focused`);
			});
			t.element.addEventListener("blur", () => {
				t.focused = false;
				log(`[${t.roseyKey}] Blurred`);
			});

			log(`[${t.roseyKey}] Editor created`);
		} catch (err) {
			warn(`Failed to set up editor for "${t.roseyKey}":`, err);
		}
	}

	if (myGeneration !== switchGeneration) return;

	await Promise.resolve();
	setupComplete = true;
	log(`Setup complete for "${locale}" (generation ${myGeneration})`);

	// --- Listen for external data changes -----------------------------------

	activeDataset = dataset;
	activeDatasetListener = async () => {
		if (myGeneration !== switchGeneration) return;
		log("Dataset change event received");
		const freshFile = await resolveFile(dataset);
		if (!freshFile) return;

		for (const t of tracked) {
			if (!t.editor) continue;
			if (t.focused) {
				log(`[${t.roseyKey}] Skipping setContent (focused)`);
				continue;
			}
			try {
				const data = await freshFile.data.get({ slug: t.roseyKey });
				const value = data?.value ?? data?.original ?? t.originalContent;
				log(`[${t.roseyKey}] setContent from change event`);
				t.editor.setContent(value);
			} catch {
				/* key may not exist in this locale yet */
			}
		}
	};
	dataset.addEventListener("change", activeDatasetListener);

	log(`Switched to ${locale}`);
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function updateButtonStates(): void {
	const buttons = document.querySelectorAll<HTMLButtonElement>(
		"#rcc-locale-switcher button[data-locale]",
	);
	for (const btn of buttons) {
		const btnLocale = btn.dataset.locale ?? null;
		const isActive = btnLocale === (currentLocale ?? "");
		btn.style.background = isActive ? "#3b82f6" : "#334155";
		btn.style.fontWeight = isActive ? "600" : "400";
	}
}

function injectSwitcher(locales: string[]): void {
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
		boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
	});

	const label = document.createElement("div");
	label.textContent = "Locale";
	Object.assign(label.style, {
		fontWeight: "600",
		fontSize: "12px",
		color: "#94a3b8",
		textTransform: "uppercase",
		letterSpacing: "0.05em",
	});
	panel.appendChild(label);

	const row = document.createElement("div");
	Object.assign(row.style, { display: "flex", gap: "6px", flexWrap: "wrap" });

	const btnBase =
		"padding:6px 14px;border:none;border-radius:6px;cursor:pointer;font-size:13px;color:white;transition:background 0.15s;";

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

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function init(): void {
	const ccWindow = window as any;
	if (!ccWindow.CloudCannonAPI) {
		warn("CloudCannonAPI not available");
		return;
	}
	api = ccWindow.CloudCannonAPI.useVersion("v1", true) as CCApi;

	const main = document.querySelector<HTMLElement>("main[data-locales]");
	if (!main) return;

	const localesAttr = main.getAttribute("data-locales");
	if (!localesAttr) return;
	const locales = localesAttr
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	if (locales.length === 0) return;

	const elementCount = main.querySelectorAll<HTMLElement>(
		"[data-rosey]:not([data-rcc-ignore])",
	).length;

	if (elementCount === 0) {
		warn("No translatable elements found (missing data-rosey attributes)");
		return;
	}

	injectSwitcher(locales);
	log(`Ready — ${locales.length} locales, ${elementCount} elements`);
}

if ((window as any).inEditorMode && (window as any).CloudCannonAPI) {
	init();
} else {
	document.addEventListener("cloudcannon:load", init);
}
