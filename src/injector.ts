/**
 * Locale injector for CloudCannon Visual Editor. Orchestration layer; the
 * pieces live in sibling modules (clean-clone, bookshop, stale, ui/switcher,
 * locales, state).
 *
 * On locale select, the container is swapped for a clean clone stripped of CC
 * editing infra: CC's MutationObserver auto-dehydrates the detached original
 * and ignores the inert clone; teardown swaps the original back and CC
 * auto-restores editing. Add data-rcc-ignore to opt an element out.
 */

import {
	pauseBookshop,
	resumeBookshop,
	stripCmsBindForRerender,
} from "./bookshop";
import { cleanClone, resolveEditorElementType } from "./clean-clone";
import { discoverLocales, isRtlLocale } from "./locales";
import { log, warn } from "./logger";
import { resolveRoseyKey } from "./rosey-key";
import {
	normalizeSource,
	recountStale,
	refreshStale,
	resolveStale,
	updateStaleBadge,
	updateStaleList,
} from "./stale";
import { state, tracked } from "./state";
import type {
	CCApi,
	CCDataset,
	CCFile,
	LocaleEntryData,
	TrackedElement,
} from "./types";
import {
	injectHideControlsStyle,
	setLocaleControlsHidden,
} from "./ui/hide-controls";
import { injectSwitcher, updateButtonStates } from "./ui/switcher";

// Injected by tsup at build time (see tsup.config.ts) for the build banner.
declare const __RCC_VERSION__: string;

// Translatable elements: tagged with data-rosey, not opted out via data-rcc-ignore.
const TRANSLATABLE_SELECTOR = "[data-rosey]:not([data-rcc-ignore])";

// inputConfig captured from CC's editors at init, keyed by Rosey key, so RCC's
// editors reuse the same config CC used for the originals.
const originalInputConfigs = new Map<string, Record<string, unknown>>();

// Rosey keys whose originals were source editables (data-editable="source" /
// EDITABLE-SOURCE); passed as editableType: "content" for the right toolbar.
const originalIsSource = new Set<string>();

// ---------------------------------------------------------------------------
// Element tracking
// ---------------------------------------------------------------------------

function newTrackedEntry(
	element: HTMLElement,
	roseyKey: string,
): TrackedElement {
	return {
		element,
		roseyKey,
		originalContent: element.innerHTML,
		elementType: resolveEditorElementType(element),
		focused: false,
		stale: false,
		baseOriginal: null,
		localeOriginal: null,
		hasLocaleEntry: false,
	};
}

function trackElements(scope: Element): void {
	tracked.length = 0;
	const elements = scope.querySelectorAll<HTMLElement>(TRANSLATABLE_SELECTOR);
	for (const el of elements) {
		const roseyKey = resolveRoseyKey(el);
		if (!roseyKey) continue;
		tracked.push(newTrackedEntry(el, roseyKey));
	}
	log(`Tracked ${tracked.length} translatable elements`);
}

/**
 * Pick the text to display in an editor: the saved translation, else the
 * source recorded in the locale file, else the source text on the page.
 *
 * Trimmed so legacy entries whose value/original still carry base.json's
 * leading/trailing whitespace (written before write-locales normalized) don't
 * render with a stray gap in the editor. ProseMirror re-saves it clean on the
 * next edit; the trim never touches stale detection, which reads the raw fields.
 */
function resolveDisplayValue(
	data: LocaleEntryData | null | undefined,
	t: TrackedElement,
): string {
	return (data?.value ?? data?.original ?? t.originalContent).trim();
}

// Empty/whitespace-only source has nothing to translate: no editor, no locale
// entry. It becomes translatable once it gains content (rebuild or live edit).
function isEmptySource(text: string): boolean {
	return normalizeSource(text) === "";
}

// ---------------------------------------------------------------------------
// Input config prescan
// ---------------------------------------------------------------------------

const CONFIG_TIMEOUT_MS = 200;

async function fetchInputConfig(
	el: HTMLElement,
): Promise<Record<string, unknown> | null> {
	const prop = el.dataset.prop;
	const isEditable =
		el.dataset.editable === "text" || el.tagName === "EDITABLE-TEXT";
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
		TRANSLATABLE_SELECTOR,
	);

	for (const el of elements) {
		const roseyKey = resolveRoseyKey(el);
		if (!roseyKey) continue;

		if (el.dataset.editable === "source" || el.tagName === "EDITABLE-SOURCE") {
			originalIsSource.add(roseyKey);
		}

		const config = await fetchInputConfig(el);
		if (config != null) {
			originalInputConfigs.set(roseyKey, config);
		}
	}

	log(
		`Prescan: captured input configs for ${originalInputConfigs.size} of ${elements.length} elements`,
	);
}

// ---------------------------------------------------------------------------
// Teardown / restore
// ---------------------------------------------------------------------------

function teardownEditors(): void {
	log(
		`teardownEditors: translationContainer=${!!state.translationContainer}, ` +
			`originalContainer=${!!state.originalContainer}, tracked=${tracked.length}`,
	);

	// Runs at the start of every switch: restores CC's editing chrome. A
	// real-locale switch re-hides it after the clone swap.
	setLocaleControlsHidden(false);

	if (state.reconcileObserver) {
		state.reconcileObserver.disconnect();
		state.reconcileObserver = null;
	}
	state.reconcileScheduled = false;

	if (state.activeDataset) {
		if (state.activeDatasetListener) {
			state.activeDataset.removeEventListener(
				"change",
				state.activeDatasetListener,
			);
		}
		if (state.activeDatasetDeleteListener) {
			state.activeDataset.removeEventListener(
				"delete",
				state.activeDatasetDeleteListener,
			);
		}
	}
	state.activeDataset = null;
	state.activeDatasetListener = null;
	state.activeDatasetDeleteListener = null;
	state.activeFile = null;

	for (const t of tracked) t.editor = undefined;
	tracked.length = 0;

	state.staleCount = 0;
	updateStaleBadge();
	updateStaleList();

	resumeBookshop();

	if (state.translationContainer && state.originalContainer) {
		const cloneInDOM = state.translationContainer.isConnected;
		const originalInDOM = state.originalContainer.isConnected;
		log(
			`teardownEditors: clone connected=${cloneInDOM}, ` +
				`original connected=${originalInDOM} — swapping`,
		);
		state.translationContainer.replaceWith(state.originalContainer);
		log("Restored original container");

		stripCmsBindForRerender(state.originalContainer);
	} else {
		log("teardownEditors: no containers to swap");
	}
	state.translationContainer = null;
	state.originalContainer = null;
}

// ---------------------------------------------------------------------------
// Locale switching
// ---------------------------------------------------------------------------

const DATASET_TIMEOUT_MS = 5000;

async function resolveFile(dataset: CCDataset): Promise<CCFile | null> {
	const timeout = new Promise<null>((resolve) =>
		setTimeout(() => resolve(null), DATASET_TIMEOUT_MS),
	);
	const result = await Promise.race([dataset.items(), timeout]);
	if (result === null) {
		warn(
			`dataset.items() did not resolve within ${DATASET_TIMEOUT_MS / 1000}s. ` +
				`This usually means CloudCannon cannot find the file configured in data_config. ` +
				`Check that the path in data_config is correct relative to your source directory.`,
		);
		return null;
	}
	if (Array.isArray(result)) return result[0] ?? null;
	return result ?? null;
}

async function switchLocale(locale: string | null): Promise<void> {
	if (!state.api) return;

	state.switchGeneration++;
	const myGeneration = state.switchGeneration;
	log(`switchLocale("${locale}") — generation ${myGeneration}`);

	state.switchInProgress = true;
	try {
		await switchLocaleInner(locale, myGeneration);
	} finally {
		state.switchInProgress = false;
	}
}

async function switchLocaleInner(
	locale: string | null,
	myGeneration: number,
): Promise<void> {
	const cc = state.api;
	if (!cc) return;

	state.currentLocale = locale;
	updateButtonStates();

	teardownEditors();

	if (!locale) {
		log("Switched to Original");
		return;
	}

	// --- Swap the locale container with a clean clone -----------------------

	pauseBookshop();

	const container =
		document.querySelector<HTMLElement>("[data-rcc]") ??
		document.querySelector<HTMLElement>("main");
	if (!container) {
		warn("No locale container found");
		return;
	}

	state.originalContainer = container;
	log(
		`switchLocale: snapshot boundary is <${container.tagName.toLowerCase()}>, ` +
			`${container.children.length} child element(s)`,
	);

	const clone = container.cloneNode(true) as HTMLElement;
	cleanClone(clone);

	const rtl = isRtlLocale(locale);
	if (rtl) clone.dir = "rtl";

	container.replaceWith(clone);
	state.translationContainer = clone;
	// Marks the translatable region so the control-hiding CSS can scope outlines
	// to it (works for [data-rcc] or the `main` fallback).
	clone.setAttribute("data-rcc-translation-root", "");
	setLocaleControlsHidden(true);
	log(`Swapped in clean translation container${rtl ? " (dir=rtl)" : ""}`);

	// --- Track elements in the clone and set up editors ---------------------

	trackElements(clone);

	if (tracked.length === 0) {
		warn(
			`No [data-rosey] elements found in the snapshot boundary. ` +
				`Make sure your translatable elements have data-rosey attributes.`,
		);
	}

	const datasetKey = `locales_${locale}`;
	log(`switchLocale: requesting dataset "${datasetKey}"`);
	const dataset = cc.dataset(datasetKey);
	const file = await resolveFile(dataset);

	if (!file) {
		warn(
			`No file found in dataset "${datasetKey}". ` +
				`Check that data_config.${datasetKey} exists in cloudcannon.config.yml ` +
				`and points to a valid locale file.`,
		);
		return;
	}
	log(`switchLocale: resolved file from dataset "${datasetKey}"`);

	state.activeFile = file;
	let setupComplete = false;

	// --- Phase 1: Parallel data fetch + stale detection --------------------
	// Batch-load all locale data so the stale list populates at once, not
	// trickling in during sequential editor creation.

	const dataResults = await Promise.all(
		tracked.map((t) => file.data.get({ slug: t.roseyKey }).catch(() => null)),
	);

	if (myGeneration !== state.switchGeneration) {
		log(`Generation changed after data fetch, aborting "${locale}" setup`);
		return;
	}

	const resolvedValues: string[] = [];
	for (let i = 0; i < tracked.length; i++) {
		const t = tracked[i];
		const data = dataResults[i];
		t.hasLocaleEntry = data != null;
		t.baseOriginal = data?._base_original ?? null;
		t.localeOriginal = data?.original ?? null;

		const value = resolveDisplayValue(data, t);
		resolvedValues[i] = value;
		t.element.innerHTML = value;

		refreshStale(t, data);
	}
	recountStale();
	const missingKeys = tracked
		.filter((t) => !t.hasLocaleEntry)
		.map((t) => t.roseyKey);
	log(
		`Data loaded — ${state.staleCount} stale, ${missingKeys.length} missing of ${tracked.length} elements`,
	);
	if (missingKeys.length > 0) {
		log(
			`Missing-entry keys (editable, new entry written on first edit): ${missingKeys.join(", ")}`,
		);
	}

	// --- Phase 2: Sequential editor creation --------------------------------
	// setupEditor is reused by the reconcile pass, so elements CC adds or
	// re-keys later get wired the same way.

	const setupEditor = async (
		t: TrackedElement,
		value: string,
	): Promise<boolean> => {
		try {
			const inputConfig = originalInputConfigs.get(t.roseyKey);
			const rccInputConfig = inputConfig
				? { ...inputConfig, type: "html" }
				: { type: "html" };

			const isSource = originalIsSource.has(t.roseyKey);

			// Suppress the onChange setContent fires on creation, so a
			// reconcile-created editor doesn't write its initial value back.
			let applying = true;
			const editor = await cc.createTextEditableRegion(
				t.element,
				async (content) => {
					if (myGeneration !== state.switchGeneration) return;
					if (!setupComplete || applying) return;
					if (content == null) return;

					// No entry yet — create a full one. Seeding _base_original with
					// the source makes stale detection work from this first save,
					// before write-locales has ever run for this key.
					if (!t.hasLocaleEntry) {
						// Enforce "no empty originals" at the write site too.
						if (isEmptySource(t.originalContent)) return;
						log(`[${t.roseyKey}] onChange → creating new locale entry`);
						// Flip before the await so a rapid follow-up keystroke takes
						// the ".value" path instead of double-creating.
						t.hasLocaleEntry = true;
						t.baseOriginal = t.originalContent;
						t.localeOriginal = t.originalContent;
						try {
							await file.data.set({
								slug: t.roseyKey,
								value: {
									original: t.originalContent,
									value: content,
									_base_original: t.originalContent,
								},
							});
						} catch (err) {
							warn(`[${t.roseyKey}] failed to create locale entry:`, err);
						}
						return;
					}

					log(`[${t.roseyKey}] onChange → set(".value")`);
					await file.data.set({ slug: `${t.roseyKey}.value`, value: content });
					if (t.stale) {
						resolveStale(t, file);
					}
				},
				{
					elementType: t.elementType,
					...(isSource && { editableType: "content" }),
					...(rccInputConfig != null && { inputConfig: rccInputConfig }),
				},
			);
			t.editor = editor;
			editor.setContent(value);
			applying = false;

			t.element.addEventListener("focus", () => {
				t.focused = true;
			});
			t.element.addEventListener("blur", () => {
				t.focused = false;
			});
			return true;
		} catch (err) {
			warn(`Failed to set up editor for "${t.roseyKey}":`, err);
			return false;
		}
	};

	let editorsCreated = 0;
	for (let i = 0; i < tracked.length; i++) {
		const t = tracked[i];
		if (myGeneration !== state.switchGeneration) {
			log(`Generation changed, aborting "${locale}" editor setup`);
			return;
		}
		// Empty source ⇒ nothing to translate; leave it tracked (a later live
		// source edit can still reconcile it) but don't make it editable.
		if (isEmptySource(t.originalContent)) continue;
		if (await setupEditor(t, resolvedValues[i])) editorsCreated++;
	}
	log(`Created ${editorsCreated} editors`);

	if (myGeneration !== state.switchGeneration) return;

	// Yield a microtask so any onChange queued by the setContent calls
	// above drains while the gate is still closed, then open the gate.
	await Promise.resolve();
	setupComplete = true;
	log(`Setup complete for "${locale}" (generation ${myGeneration})`);

	// --- Listen for external data changes -----------------------------------

	// Re-pull every editor's value from the file and apply it. Shared by the
	// dataset "change" listener (external edits, own-write echo) and the
	// "delete" listener (Clear/Discard of pending changes). On a delete we force
	// focused editors too and re-evaluate stale: a discard must win over what's
	// in the editor, and can roll an entry back to a stale — or absent — state.
	const resyncEditors = async (opts: { force: boolean }): Promise<void> => {
		if (myGeneration !== state.switchGeneration) return;
		const freshFile = await resolveFile(dataset);
		if (!freshFile) return;

		let updated = 0;
		let skipped = 0;
		for (const t of tracked) {
			if (!t.editor) continue;
			if (!opts.force && t.focused) {
				skipped++;
				continue;
			}
			try {
				const data = await freshFile.data.get({ slug: t.roseyKey });
				t.hasLocaleEntry = data != null;
				t.editor.setContent(resolveDisplayValue(data, t));
				if (opts.force) {
					t.baseOriginal = data?._base_original ?? null;
					t.localeOriginal = data?.original ?? null;
					refreshStale(t, data);
				}
				updated++;
			} catch {
				/* key may not exist in this locale yet */
			}
		}
		if (opts.force) recountStale();
		log(
			`${opts.force ? "Delete" : "Change"} event: updated ${updated} editors` +
				(skipped ? `, skipped ${skipped} (focused)` : ""),
		);
	};

	state.activeDataset = dataset;
	state.activeDatasetListener = () => void resyncEditors({ force: false });
	state.activeDatasetDeleteListener = () => void resyncEditors({ force: true });
	dataset.addEventListener("change", state.activeDatasetListener);
	dataset.addEventListener("delete", state.activeDatasetDeleteListener);

	// --- Reconcile elements CC adds or re-keys after this pass ----------------
	// CC can insert a [data-rosey] element (new array item) or stamp its
	// data-rosey-ns a tick after the switch pass. The initial pass runs once,
	// so re-run it on DOM changes to wire any element that lacks an editor.

	const reconcileElement = async (el: HTMLElement): Promise<void> => {
		if (myGeneration !== state.switchGeneration) return;
		const key = resolveRoseyKey(el);
		if (!key) return;

		let t = tracked.find((x) => x.element === el);

		// Already wired and unchanged — nothing to do (an element with an editor
		// is fully set up whether or not its key has a locale entry yet).
		if (t && t.roseyKey === key && t.editor) return;

		if (!t) {
			t = newTrackedEntry(el, key);
			tracked.push(t);
		} else {
			if (t.roseyKey !== key) {
				// The element's resolved key changed under us (e.g. CC re-rendered a
				// cloned array item with its real _uuid). If an editor already exists
				// it is NOT torn down/rebound below (createTextEditableRegion has no
				// destroy()), so it stays bound to the old key.
				log(
					`reconcile: RE-KEY "${t.roseyKey}" → "${key}"` +
						(t.editor ? ` — editor ALREADY EXISTS, will NOT re-wire` : ""),
				);
			}
			t.roseyKey = key;
		}

		const data = await file.data.get({ slug: key }).catch(() => null);
		if (myGeneration !== state.switchGeneration) return;

		t.hasLocaleEntry = data != null;
		if (!t.editor && !isEmptySource(t.originalContent)) {
			log(
				`reconcile: wiring editor for "${key}"${data == null ? " (no entry yet — created on first edit)" : ""}`,
			);
			await setupEditor(t, resolveDisplayValue(data, t));
		} else if (t.editor) {
			log(
				`reconcile: editor already present for "${key}" — skipped re-wire (onChange writes to current key; initial content not refreshed)`,
			);
		}
	};

	const scheduleReconcile = (): void => {
		if (state.reconcileScheduled) return;
		state.reconcileScheduled = true;
		requestAnimationFrame(() => {
			state.reconcileScheduled = false;
			if (
				myGeneration !== state.switchGeneration ||
				!state.translationContainer
			)
				return;
			const els = state.translationContainer.querySelectorAll<HTMLElement>(
				TRANSLATABLE_SELECTOR,
			);
			for (const el of els) void reconcileElement(el);
		});
	};

	if (state.translationContainer) {
		state.reconcileObserver = new MutationObserver(scheduleReconcile);
		state.reconcileObserver.observe(state.translationContainer, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["data-rosey", "data-rosey-ns", "data-rosey-root"],
		});
	}

	log(`Switched to ${locale}`);
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
	state.api = ccWindow.CloudCannonAPI.useVersion("v1", true) as CCApi;

	// Always-on (not verbose-gated) so you can confirm the connector loaded and
	// which version CC served.
	console.log(`RCC: v${__RCC_VERSION__} loaded`);
	// TEMP prototype marker — remove before real commit. Confirms the
	// text-based-liveStale build is what's actually running in the editor.
	console.log("RCC[proto]: liveStale=visible-text");

	const container =
		document.querySelector<HTMLElement>("[data-rcc]") ??
		document.querySelector<HTMLElement>("main");
	if (!container) return;

	const allLocales = await discoverLocales();
	if (!allLocales || allLocales.length === 0) return;

	const excludeAttr = container.getAttribute("data-rcc-exclude");
	const excluded = excludeAttr
		? new Set(
				excludeAttr
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean),
			)
		: null;
	const locales = excluded
		? allLocales.filter((l) => !excluded.has(l))
		: allLocales;
	if (locales.length === 0) return;

	const elementCount = container.querySelectorAll<HTMLElement>(
		TRANSLATABLE_SELECTOR,
	).length;

	if (elementCount === 0) {
		warn("No translatable elements found (missing data-rosey attributes)");
		return;
	}

	injectHideControlsStyle();
	injectSwitcher(locales, switchLocale);

	await prescanOriginals(container);
	log(`Ready — ${locales.length} locales, ${elementCount} elements`);
}

if ((window as any).inEditorMode && (window as any).CloudCannonAPI) {
	init();
} else {
	document.addEventListener("cloudcannon:load", init);
}
