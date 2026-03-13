/**
 * Locale injector for CloudCannon Visual Editor.
 *
 * Finds all [data-rosey] elements, injects a floating locale switcher,
 * and uses the CloudCannon live editing JS API to create inline editors
 * and read/write locale data directly — no DOM clone-and-replace needed.
 *
 * Add data-rcc-ignore to any [data-rosey] element to opt it out of
 * visual editing.
 */

import { log, warn } from "./logger";

interface TrackedElement {
	element: HTMLElement;
	originalElement?: HTMLElement;
	roseyKey: string;
	originalContent: string;
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

const tracked: TrackedElement[] = [];
let currentLocale: string | null = null;
let api: CCApi | null = null;
let activeDataset: CCDataset | null = null;
let activeDatasetListener: (() => void) | null = null;
const activeMutationSpies: MutationObserver[] = [];

/**
 * Incremented every time switchLocale is called. Each onChange closure
 * captures the generation it was created in; if it doesn't match the
 * current value, the editor is stale (from a previous locale) and the
 * write is silently dropped. This is necessary because
 * createTextEditableRegion has no destroy() — old ProseMirror instances
 * stay alive and fire onChange when the DOM changes underneath them.
 */
let switchGeneration = 0;

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

function trackElements(): void {
	tracked.length = 0;
	const elements = document.querySelectorAll<HTMLElement>(
		"[data-rosey]:not([data-rcc-ignore])",
	);
	for (const el of elements) {
		const roseyKey = resolveRoseyKey(el);
		if (!roseyKey) continue;
		tracked.push({
			element: el,
			roseyKey,
			originalContent: el.innerHTML,
		});
	}
	log(`Tracked ${tracked.length} translatable elements`);
}

/**
 * Disconnect CC's editable-regions editors so rcc-v2 can be the sole
 * editor on each element during locale switching.
 *
 * For <editable-text> custom elements: replace with a plain <span> so
 * the custom element's connectedCallback can't re-mount a CC editor.
 *
 * For regular [data-editable] elements: DOM-cycle (remove → mark
 * data-cloudcannon-ignore → re-insert) so CC's MutationObserver fires
 * disconnect and then skips re-hydration.
 */
function dehydrateCCEditors(): void {
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

function teardownEditors(): void {
	log(`Tearing down ${tracked.length} editors`);

	for (const spy of activeMutationSpies) spy.disconnect();
	activeMutationSpies.length = 0;

	if (activeDataset && activeDatasetListener) {
		activeDataset.removeEventListener("change", activeDatasetListener);
	}
	activeDataset = null;
	activeDatasetListener = null;

	for (const t of tracked) {
		log(`[${t.roseyKey}] Teardown — restoring originalContent`);
		t.editor = undefined;

		if (t.originalElement) {
			t.originalElement.innerHTML = t.originalContent;
			const editable = (t.originalElement as any).editable;
			if (editable) editable.editor = undefined;
			t.element.replaceWith(t.originalElement);
			t.element = t.originalElement;
			t.originalElement = undefined;
		} else {
			t.element.innerHTML = t.originalContent;
		}

		if (t.element.hasAttribute("data-cloudcannon-ignore")) {
			t.element.removeAttribute("data-cloudcannon-ignore");
			const editable = (t.element as any).editable;
			if (editable) editable.editor = undefined;
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
			warn(`Generation changed during setup (${myGeneration} → ${switchGeneration}), aborting "${locale}" switch`);
			return;
		}

		try {
			const data = await file.data.get({ slug: t.roseyKey });
			log(`[${t.roseyKey}] data.get() returned:`, JSON.stringify(data));

			const value = data?.value ?? data?.original ?? t.originalContent;
			const source = data?.value != null
				? "data.value"
				: data?.original != null
					? "data.original"
					: "originalContent";
			log(`[${t.roseyKey}] Resolved value (via ${source}):`, JSON.stringify(value));

			log(`[${t.roseyKey}] Pre-set DOM: <${t.element.tagName.toLowerCase()}> innerHTML=`, JSON.stringify(t.element.innerHTML));
			t.element.innerHTML = value;
			log(`[${t.roseyKey}] Post-set DOM innerHTML=`, JSON.stringify(t.element.innerHTML));
			log(`[${t.roseyKey}] DIAGNOSTIC: innerHTML-only mode, skipping createTextEditableRegion`);

			// DIAGNOSTIC: mutation spy — catch anything that overwrites our innerHTML
			const spyKey = t.roseyKey;
			const spyEl = t.element;
			const spy = new MutationObserver((muts) => {
				for (const m of muts) {
					warn(
						`[${spyKey}] MUTATION DETECTED type=${m.type} innerHTML now=`,
						JSON.stringify(spyEl.innerHTML),
					);
					console.trace(`[${spyKey}] Mutation source`);
				}
			});
			spy.observe(t.element, {
				childList: true,
				subtree: true,
				characterData: true,
			});
			activeMutationSpies.push(spy);
		} catch (err) {
			warn(`Failed to set up editor for "${t.roseyKey}":`, err);
		}
	}

	if (myGeneration !== switchGeneration) {
		warn(`Generation changed after setup (${myGeneration} → ${switchGeneration}), not activating "${locale}"`);
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
				/* key may not exist in this locale yet */
			}
		}
	};
	dataset.addEventListener("change", activeDatasetListener);

	log(`Switched to ${locale}`);
}

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

function init(): void {
	// DIAGNOSTIC: canary — is the live DOM visible in the Visual Editor?
	const canary = document.createElement("div");
	canary.textContent = "RCC CANARY — IF YOU SEE THIS, DOM IS LIVE";
	Object.assign(canary.style, {
		position: "fixed",
		top: "0",
		left: "0",
		right: "0",
		background: "red",
		color: "white",
		fontSize: "24px",
		zIndex: "9999999",
		padding: "20px",
		textAlign: "center",
	});
	document.body.appendChild(canary);

	// DIAGNOSTIC: iframe context
	log("IFRAME CONTEXT — window.location.href:", window.location.href);
	log("IFRAME CONTEXT — window === window.top:", String(window === window.top));
	log(
		"IFRAME CONTEXT — window.parent === window.top:",
		String(window.parent === window.top),
	);
	const h1 = document.querySelector("h1");
	if (h1)
		log(
			"IFRAME CONTEXT — h1 rect:",
			JSON.stringify(h1.getBoundingClientRect()),
		);

	const ccWindow = window as any;
	if (!ccWindow.CloudCannonAPI) {
		warn("CloudCannonAPI not available");
		return;
	}
	api = ccWindow.CloudCannonAPI.useVersion("v1", true) as CCApi;

	const main = document.querySelector("main[data-locales]");
	if (!main) return;

	const localesAttr = main.getAttribute("data-locales");
	if (!localesAttr) return;
	const locales = localesAttr
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	if (locales.length === 0) return;

	trackElements();

	if (tracked.length === 0) {
		warn("No translatable elements found (missing data-rosey attributes)");
		return;
	}

	injectSwitcher(locales);
	log(`Ready — ${locales.length} locales, ${tracked.length} elements`);
}

if ((window as any).inEditorMode && (window as any).CloudCannonAPI) {
	init();
} else {
	document.addEventListener("cloudcannon:load", init);
}
