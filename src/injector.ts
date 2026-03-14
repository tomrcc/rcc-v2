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

/**
 * Input configs captured from CC's editable infrastructure at init time.
 * Keyed by resolved Rosey key. Used to pass the exact same inputConfig
 * to createTextEditableRegion that CC uses for the original editors.
 */
const originalInputConfigs = new Map<string, Record<string, unknown>>();

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

const BLOCK_LEVEL_SELECTOR =
	"address, article, aside, blockquote, details, dialog, dd, div, dl, dt, fieldset, figcaption, figure, footer, form, h1, h2, h3, h4, h5, h6, header, hgroup, hr, li, main, nav, ol, p, pre, section, table, ul";

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
					el.querySelector(BLOCK_LEVEL_SELECTOR) !== null;
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
// Input config prescan
// ---------------------------------------------------------------------------

const CONFIG_TIMEOUT_MS = 200;

async function fetchInputConfig(el: HTMLElement): Promise<Record<string, unknown> | null> {
	const prop = el.dataset.prop;
	const isEditable = el.dataset.editable === "text" || el.tagName === "EDITABLE-TEXT";
	if (!prop || !isEditable) return null;

	const configPromise = new Promise<any>((resolve) => {
		el.dispatchEvent(
			new CustomEvent("cloudcannon-api", {
				bubbles: true,
				detail: { action: "get-input-config", source: prop, callback: resolve },
			}),
		);
	});
	const timeout = new Promise<null>((resolve) =>
		setTimeout(() => resolve(null), CONFIG_TIMEOUT_MS),
	);

	return Promise.race([configPromise, timeout]);
}

async function prescanOriginals(container: HTMLElement): Promise<void> {
	const elements = container.querySelectorAll<HTMLElement>(
		"[data-rosey]:not([data-rcc-ignore])",
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

	let editorsCreated = 0;
	for (const t of tracked) {
		if (myGeneration !== switchGeneration) {
			log(`Generation changed, aborting "${locale}" setup`);
			return;
		}

		try {
			const data = await file.data.get({ slug: t.roseyKey });
			const value = data?.value ?? data?.original ?? t.originalContent;

			t.element.innerHTML = value;

			const inputConfig = originalInputConfigs.get(t.roseyKey);

			const editor = await api!.createTextEditableRegion(
				t.element,
				(content) => {
					if (myGeneration !== switchGeneration) return;
					if (!setupComplete) return;
					if (content == null) return;
					log(`[${t.roseyKey}] onChange → set(".value")`);
					file.data.set({ slug: `${t.roseyKey}.value`, value: content });
				},
				{
					elementType: t.element.dataset.type,
					...(inputConfig != null && { inputConfig }),
				},
			);
			t.editor = editor;
			editor.setContent(value);

			t.element.addEventListener("focus", () => { t.focused = true; });
			t.element.addEventListener("blur", () => { t.focused = false; });

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

	// --- Listen for external data changes -----------------------------------

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
				/* key may not exist in this locale yet */
			}
		}
		log(`Change event: updated ${updated} editors${skipped ? `, skipped ${skipped} (focused)` : ""}`);
	};
	dataset.addEventListener("change", activeDatasetListener);

	log(`Switched to ${locale}`);
}

// ---------------------------------------------------------------------------
// UI — Collapsible / movable locale FAB + popover
// ---------------------------------------------------------------------------

const FAB_SIZE = 48;
const FAB_STORAGE_KEY = "rcc-fab-position";
const CC_BLUE = "#034ad8";

const TRANSLATE_ICON = [
	'<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"',
	` fill="none" stroke="${CC_BLUE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,
	'<path d="M4 5h8"/><path d="M8 5V3"/>',
	'<path d="M4.5 5c1 4 4 8 7.5 10"/><path d="M12 5c-1 3-3 6-7.5 10"/>',
	'<path d="M14.5 19l2.5-6 2.5 6"/><path d="M15.5 17h3"/>',
	"</svg>",
].join("");

function updateButtonStates(): void {
	const buttons = document.querySelectorAll<HTMLButtonElement>(
		"#rcc-locale-popover button[data-locale]",
	);
	for (const btn of buttons) {
		const isActive = (btn.dataset.locale ?? null) === (currentLocale ?? "");
		Object.assign(btn.style, {
			background: isActive ? CC_BLUE : "#f1f5f9",
			color: isActive ? "#ffffff" : "#1e293b",
			fontWeight: isActive ? "600" : "400",
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

function injectSwitcher(locales: string[]): void {
	// --- FAB (floating action button) ------------------------------------

	const fab = document.createElement("div");
	fab.id = "rcc-locale-switcher";

	const savedPos = (() => {
		try {
			const raw = localStorage.getItem(FAB_STORAGE_KEY);
			return raw ? (JSON.parse(raw) as { top: number; left: number }) : null;
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
		fontFamily: "system-ui, sans-serif",
	});

	if (savedPos) {
		fab.style.top = `${savedPos.top}px`;
		fab.style.left = `${savedPos.left}px`;
	} else {
		fab.style.bottom = "20px";
		fab.style.right = "20px";
	}

	fab.innerHTML = TRANSLATE_ICON;

	// Badge — shows active locale code on the FAB corner
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
		pointerEvents: "none",
	});
	fab.appendChild(badge);

	// --- Popover ----------------------------------------------------------

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
		minWidth: "120px",
	});

	const header = document.createElement("div");
	Object.assign(header.style, {
		fontWeight: "600",
		fontSize: "11px",
		color: "#6b7280",
		textTransform: "uppercase",
		letterSpacing: "0.05em",
		padding: "4px 8px 2px",
	});
	header.textContent = "Locale";
	popover.appendChild(header);

	function makeLocaleButton(label: string, locale: string | null): HTMLButtonElement {
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
			fontWeight: "400",
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

	// --- Drag logic -------------------------------------------------------

	let isDragging = false;
	let hasDragged = false;
	let dragStartX = 0;
	let dragStartY = 0;
	let fabStartX = 0;
	let fabStartY = 0;

	function clampToViewport(x: number, y: number) {
		return {
			x: Math.max(0, Math.min(x, window.innerWidth - FAB_SIZE)),
			y: Math.max(0, Math.min(y, window.innerHeight - FAB_SIZE)),
		};
	}

	function saveFabPosition() {
		const r = fab.getBoundingClientRect();
		localStorage.setItem(FAB_STORAGE_KEY, JSON.stringify({ top: r.top, left: r.left }));
	}

	fab.addEventListener("pointerdown", (e: PointerEvent) => {
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

	fab.addEventListener("pointermove", (e: PointerEvent) => {
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

	// Re-clamp on viewport resize
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

	// --- Popover positioning & toggling -----------------------------------

	let popoverOpen = false;

	function positionPopover() {
		popover.style.visibility = "hidden";
		popover.style.display = "flex";
		const fabRect = fab.getBoundingClientRect();
		const popRect = popover.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const gap = 8;

		let top = fabRect.top - gap - popRect.height > 0
			? fabRect.top - gap - popRect.height
			: fabRect.bottom + gap;

		let left = fabRect.right - popRect.width > 0
			? fabRect.right - popRect.width
			: fabRect.left;

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

	// Close on outside click
	document.addEventListener("pointerdown", (e: PointerEvent) => {
		if (!popoverOpen) return;
		if (fab.contains(e.target as Node) || popover.contains(e.target as Node)) return;
		closePopover();
	});

	// Close on Escape
	document.addEventListener("keydown", (e: KeyboardEvent) => {
		if (popoverOpen && e.key === "Escape") closePopover();
	});

	// --- Mount ------------------------------------------------------------

	document.body.appendChild(fab);
	document.body.appendChild(popover);
	updateButtonStates();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
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

	await prescanOriginals(main);

	injectSwitcher(locales);
	log(`Ready — ${locales.length} locales, ${elementCount} elements`);
}

if ((window as any).inEditorMode && (window as any).CloudCannonAPI) {
	init();
} else {
	document.addEventListener("cloudcannon:load", init);
}
