import type { CCApi, CCDataset, CCFile, TrackedElement } from "./types";

/** Elements currently wired for translation editing (rebuilt on each switch). */
export const tracked: TrackedElement[] = [];

/**
 * Mutable cross-module state for the active editing session.
 *
 * Kept in a single object because ES module imports are read-only live
 * bindings — one module can't reassign another module's `let`, but every module
 * can mutate fields on a shared object. `tracked` is exported separately because
 * it's an array reference that's only ever mutated in place, never reassigned.
 */
export const state = {
	currentLocale: null as string | null,
	api: null as CCApi | null,

	originalContainer: null as HTMLElement | null,
	translationContainer: null as HTMLElement | null,

	activeDataset: null as CCDataset | null,
	activeDatasetListener: null as (() => void) | null,
	activeFile: null as CCFile | null,

	/**
	 * Watches the active translation container for [data-rosey] elements that CC
	 * adds or re-keys after the initial switch pass (e.g. a newly inserted array
	 * item, or an element whose data-rosey-ns is stamped from instance_value:UUID
	 * a tick after insertion). Without this, editor setup would only ever run once
	 * during switchLocaleInner and miss those elements.
	 */
	reconcileObserver: null as MutationObserver | null,
	reconcileScheduled: false,

	/**
	 * Guards against stale ProseMirror onChange fires. createTextEditableRegion
	 * has no destroy() so old editors stay alive and fire when the DOM changes.
	 * Each onChange closure captures its generation; mismatches are no-ops.
	 */
	switchGeneration: 0,

	/** True while an async locale switch is running. Blocks re-entrant clicks. */
	switchInProgress: false,

	/** Cached count of stale tracked entries; drives the FAB stale badge. */
	staleCount: 0,
};
