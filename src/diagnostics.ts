/**
 * TEMPORARY diagnostics for the "clear pending translation" edge case.
 *
 * Question we're answering: when the user types a translation (pending save)
 * and then hits Clear/Discard in CloudCannon, does anything fire that RCC could
 * hook to revert the page — and does file.data.get() return reverted data?
 *
 * Always-on (own "RCC-DIAG:" prefix, not gated behind data-rcc-verbose) so it's
 * visible while testing. Delete this module and its wiring in injector.ts once
 * we've picked a route.
 */

import { state, tracked } from "./state";
import type { CCDataset, CCFile } from "./types";

const P = "RCC-DIAG:";

// Anything with addEventListener; the CC file/dataset both expose change/delete.
type Emitter = {
	addEventListener(event: string, listener: () => void): void;
	removeEventListener(event: string, listener: () => void): void;
};

// Cleanup for the previous install, so re-switching locales doesn't stack
// duplicate listeners (createTextEditableRegion has no destroy, but ours does).
let teardown: (() => void) | null = null;

function stamp(): string {
	return `+${Math.round(performance.now())}ms`;
}

function trunc(s: string, n = 100): string {
	return s.length > n ? `${s.slice(0, n)}…(${s.length})` : s;
}

// Light whitespace-collapse so "diverged" doesn't trip on formatting noise.
function norm(s: string): string {
	return s.replace(/\s+/g, " ").trim();
}

/**
 * Dump every tracked key: what's on the page (what the user sees) vs what
 * file.data.get() returns right now (the model's current value). If the model
 * reverted on Clear but the page didn't, diverged=true tells us a re-read fix
 * would work. If the model DIDN'T revert, we need a different signal.
 */
async function dumpState(label: string, file: CCFile): Promise<void> {
	console.log(
		`%c${P} ${label} @ ${stamp()} — locale=${state.currentLocale}, tracked=${tracked.length}`,
		"color:#c0392b;font-weight:bold",
	);
	for (const t of tracked) {
		let persisted: unknown = "<not-read>";
		try {
			persisted = await file.data.get({ slug: t.roseyKey });
		} catch (err) {
			persisted = `<get threw: ${err}>`;
		}
		const onPage = t.element.innerHTML;
		const modelValue =
			(persisted as { value?: string; original?: string } | null)?.value ??
			(persisted as { original?: string } | null)?.original ??
			"";
		const diverged = norm(onPage) !== norm(modelValue);
		console.log(
			`${P}   [${t.roseyKey}] focused=${t.focused} hasEntry=${t.hasLocaleEntry} ` +
				`stale=${t.stale} diverged=${diverged}`,
		);
		console.log(`${P}       onPage    = ${JSON.stringify(trunc(onPage))}`);
		console.log(
			`${P}       model.get = ${
				persisted == null
					? "<null / no entry>"
					: trunc(JSON.stringify(persisted), 240)
			}`,
		);
	}
}

/**
 * Install change/delete listeners on BOTH the dataset and the resolved file,
 * plus a manual window.__rccDiag() dump. Call after editor setup completes.
 */
export function installDiagnostics(dataset: CCDataset, file: CCFile): void {
	teardown?.();

	const targets: Array<[string, Emitter]> = [
		["dataset", dataset as unknown as Emitter],
		["file", file as unknown as Emitter],
	];
	const events = ["change", "delete"];
	const registered: Array<[Emitter, string, () => void]> = [];

	for (const [name, target] of targets) {
		if (typeof target?.addEventListener !== "function") {
			console.log(`${P} ${name} has no addEventListener — cannot observe it`);
			continue;
		}
		for (const event of events) {
			const listener = () => {
				console.log(
					`%c${P} EVENT "${event}" on ${name} @ ${stamp()}`,
					"color:#2980b9;font-weight:bold",
				);
				void dumpState(`after ${name}:${event}`, file);
			};
			target.addEventListener(event, listener);
			registered.push([target, event, listener]);
		}
	}

	// Manual probe: after clicking Clear, run window.__rccDiag() in the console
	// to see the model's current values even if no event fired.
	(window as Window & { __rccDiag?: () => void }).__rccDiag = () => {
		void dumpState("manual __rccDiag()", file);
	};

	console.log(
		`${P} installed — listening for change/delete on dataset+file. ` +
			`Type a translation, hit Clear, then watch for EVENT lines (and run ` +
			`window.__rccDiag() to read the model directly).`,
	);
	void dumpState("baseline (setup complete)", file);

	teardown = () => {
		for (const [target, event, listener] of registered) {
			target.removeEventListener(event, listener);
		}
		registered.length = 0;
	};
}

/** Detach listeners (call from teardownEditors). */
export function uninstallDiagnostics(): void {
	teardown?.();
	teardown = null;
}
