/**
 * TEMPORARY diagnostics for the "clear pending translation" edge case.
 *
 * Question we're answering: when the user types a translation (pending save)
 * and then hits Clear/Discard in CloudCannon, does anything fire that RCC could
 * hook to revert the page — and does file.data.get() return reverted data?
 *
 * Kept deliberately quiet: event bursts are coalesced into one dump, and each
 * dump prints ONLY keys where the page and the model diverge (during typing
 * they match, so it's silent; after Clear the edited key should light up).
 * Always-on ("RCC-DIAG:" prefix). Delete this module + its wiring in
 * injector.ts once we've picked a route.
 */

import { tracked } from "./state";
import type { CCDataset, CCFile } from "./types";

const P = "RCC-DIAG:";

type Emitter = {
	addEventListener(event: string, listener: () => void): void;
	removeEventListener(event: string, listener: () => void): void;
};

let teardown: (() => void) | null = null;

function stamp(): string {
	return `+${Math.round(performance.now())}ms`;
}

function trunc(s: string, n = 80): string {
	return s.length > n ? `${s.slice(0, n)}…(${s.length})` : s;
}

// Whitespace-collapse so "diverged" doesn't trip on formatting noise.
function norm(s: string): string {
	return s.replace(/\s+/g, " ").trim();
}

/**
 * Print only the interesting keys: those where what's on the page differs from
 * what file.data.get() returns right now. Returns how many diverged so callers
 * can note "N diverged" even when the list is short.
 */
async function dumpDiverged(label: string, file: CCFile): Promise<void> {
	const rows: string[] = [];
	for (const t of tracked) {
		let persisted: unknown = null;
		try {
			persisted = await file.data.get({ slug: t.roseyKey });
		} catch (err) {
			rows.push(`  [${t.roseyKey}] get() threw: ${err}`);
			continue;
		}
		const onPage = t.element.innerHTML;
		const modelValue =
			(persisted as { value?: string; original?: string } | null)?.value ??
			(persisted as { original?: string } | null)?.original ??
			"";
		if (norm(onPage) === norm(modelValue)) continue; // in sync — skip

		rows.push(
			`  [${t.roseyKey}] focused=${t.focused} hasEntry=${t.hasLocaleEntry} ` +
				`stale=${t.stale}\n` +
				`      onPage    = ${JSON.stringify(trunc(onPage))}\n` +
				`      model.get = ${
					persisted == null
						? "<null / no entry>"
						: trunc(JSON.stringify(persisted), 200)
				}`,
		);
	}

	if (rows.length === 0) {
		console.log(
			`${P} ${label}: all ${tracked.length} keys in sync (page == model)`,
		);
		return;
	}
	console.log(
		`%c${P} ${label}: ${rows.length}/${tracked.length} DIVERGED (page != model)`,
		"color:#c0392b;font-weight:bold",
	);
	for (const row of rows) console.log(row);
}

export function installDiagnostics(dataset: CCDataset, file: CCFile): void {
	teardown?.();

	const targets: Array<[string, Emitter]> = [
		["dataset", dataset as unknown as Emitter],
		["file", file as unknown as Emitter],
	];
	const registered: Array<[Emitter, string, () => void]> = [];

	// Coalesce event bursts: many change events (own-write echo) collapse into
	// one dump per frame. Track which event names fired for the compact line.
	const seen = new Map<string, number>();
	let scheduled = false;
	const flush = () => {
		scheduled = false;
		const summary = [...seen.entries()].map(([k, n]) => `${k}×${n}`).join(", ");
		seen.clear();
		console.log(
			`%c${P} EVENTS @ ${stamp()}: ${summary}`,
			"color:#2980b9;font-weight:bold",
		);
		void dumpDiverged("after events", file);
	};
	const onEvent = (name: string) => {
		seen.set(name, (seen.get(name) ?? 0) + 1);
		if (scheduled) return;
		scheduled = true;
		requestAnimationFrame(flush);
	};

	for (const [name, target] of targets) {
		if (typeof target?.addEventListener !== "function") {
			console.log(`${P} ${name} has no addEventListener — cannot observe it`);
			continue;
		}
		for (const event of ["change", "delete"]) {
			const label = `${name}:${event}`;
			const listener = () => onEvent(label);
			target.addEventListener(event, listener);
			registered.push([target, event, listener]);
		}
	}

	// Manual probe: after clicking Clear, run window.__rccDiag() to force a dump
	// even if no event fired.
	(window as Window & { __rccDiag?: () => void }).__rccDiag = () => {
		console.log(`${P} manual probe @ ${stamp()}`);
		void dumpDiverged("manual __rccDiag()", file);
	};

	console.log(
		`${P} installed. Type a translation, hit Clear, watch for an EVENTS line. ` +
			`If nothing fires, run window.__rccDiag() to read the model directly.`,
	);
	void dumpDiverged("baseline", file);

	teardown = () => {
		for (const [target, event, listener] of registered) {
			target.removeEventListener(event, listener);
		}
		registered.length = 0;
	};
}

export function uninstallDiagnostics(): void {
	teardown?.();
	teardown = null;
}
