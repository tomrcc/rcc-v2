import type { CCApi, CCDataset, CCFile, TrackedElement } from "./types";

/** Elements currently wired for translation editing (rebuilt on each switch). */
export const tracked: TrackedElement[] = [];

/**
 * Mutable cross-module state for the active editing session. A single object
 * because ES module bindings are read-only — a module can't reassign another
 * module's `let`, but can mutate a shared object's fields. `tracked` is a
 * separate array reference, only ever mutated in place.
 */
export const state = {
	currentLocale: null as string | null,
	api: null as CCApi | null,

	originalContainer: null as HTMLElement | null,
	translationContainer: null as HTMLElement | null,

	activeDataset: null as CCDataset | null,
	// CC fires change/delete on the File, not the Dataset, so the listeners live
	// on activeFile. change = external edit / own-write echo (debounced); delete
	// = Clear/Discard of pending changes, which must revert even a focused editor.
	activeFile: null as CCFile | null,
	activeFileChangeListener: null as (() => void) | null,
	activeFileDeleteListener: null as (() => void) | null,

	// Watches the translation container for [data-rosey] elements CC adds or
	// re-keys after the initial switch pass (new array items, late-stamped ns).
	reconcileObserver: null as MutationObserver | null,
	reconcileScheduled: false,

	// Guards against stale onChange fires: createTextEditableRegion has no
	// destroy(), so old editors stay alive. Each onChange captures its
	// generation; mismatches are no-ops.
	switchGeneration: 0,

	/** True while an async locale switch is running. Blocks re-entrant clicks. */
	switchInProgress: false,

	/** Cached count of stale tracked entries; drives the FAB stale badge. */
	staleCount: 0,
};
