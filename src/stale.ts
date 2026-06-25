import { log } from "./logger";
import { state, tracked } from "./state";
import type { CCFile, TrackedElement } from "./types";

// ---------------------------------------------------------------------------
// Stale translation indicators
// ---------------------------------------------------------------------------

export const STALE_AMBER = "#f59e0b";
const STALE_AMBER_BG = "rgba(245, 158, 11, 0.08)";

export function updateStaleBadge(): void {
	const badge = document.getElementById("rcc-stale-badge");
	if (!badge) return;
	if (state.staleCount > 0) {
		badge.textContent = String(state.staleCount);
		badge.style.display = "flex";
	} else {
		badge.style.display = "none";
	}
}

export function recountStale(): void {
	state.staleCount = tracked.filter((t) => t.stale).length;
	updateStaleBadge();
	updateStaleList();
}

/**
 * Normalize source text for stale comparison. The live DOM (`innerHTML`) and the
 * stored `original` / `_base_original` (from base.json or a prior client write)
 * can differ in insignificant whitespace, so collapse whitespace runs and trim
 * before comparing. This errs toward false-negatives, which is intentional: the
 * build-time `_base_original` signal stays the authoritative backstop.
 */
export function normalizeSource(s: string): string {
	return s.replace(/\s+/g, " ").trim();
}

function truncateText(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function updateStaleList(): void {
	const panel = document.getElementById("rcc-stale-panel");

	const allSubmenus = document.querySelectorAll<HTMLElement>(
		"[data-rcc-stale-submenu]",
	);
	for (const sub of allSubmenus) {
		if (sub.dataset.rccStaleSubmenu !== state.currentLocale) {
			sub.style.display = "none";
			const ch = sub.querySelector<HTMLElement>("[data-rcc-stale-chevron]");
			if (ch) ch.style.transform = "rotate(0deg)";
		}
	}

	if (!state.currentLocale) {
		if (panel) panel.style.display = "none";
		return;
	}

	const submenu = document.querySelector<HTMLElement>(
		`[data-rcc-stale-submenu="${state.currentLocale}"]`,
	);

	const staleItems = tracked.filter((t) => t.stale);
	if (staleItems.length === 0) {
		if (submenu) {
			submenu.style.display = "none";
			const ch = submenu.querySelector<HTMLElement>("[data-rcc-stale-chevron]");
			if (ch) ch.style.transform = "rotate(0deg)";
		}
		if (panel) panel.style.display = "none";
		return;
	}

	if (submenu) {
		submenu.style.display = "flex";
		const countEl = submenu.querySelector<HTMLElement>(
			"[data-rcc-stale-count]",
		);
		if (countEl) countEl.textContent = `${staleItems.length} out of date`;
	}

	if (!panel) return;

	const panelCount = panel.querySelector<HTMLElement>("[data-rcc-panel-count]");
	if (panelCount) panelCount.textContent = `${staleItems.length} out of date`;

	const list = panel.querySelector<HTMLElement>("[data-rcc-stale-items]");
	if (!list) return;
	list.innerHTML = "";

	for (const t of staleItems) {
		const textPreview = truncateText(
			t.element.textContent?.trim() || t.roseyKey,
			40,
		);

		const row = document.createElement("div");
		Object.assign(row.style, {
			display: "flex",
			alignItems: "stretch",
			borderRadius: "4px",
			transition: "background 0.15s",
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
			fontFamily: "system-ui, sans-serif",
		});

		const preview = document.createElement("span");
		Object.assign(preview.style, {
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap",
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
			flexShrink: "0",
		});
		resolveBtn.innerHTML =
			'<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.5 L4.5 9 L10 3"/></svg>';
		resolveBtn.title = "Mark as reviewed";
		resolveBtn.addEventListener("mouseenter", () => {
			resolveBtn.style.color = STALE_AMBER;
		});
		resolveBtn.addEventListener("mouseleave", () => {
			resolveBtn.style.color = "#d1d5db";
		});
		resolveBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			if (state.activeFile) resolveStale(t, state.activeFile);
		});

		row.appendChild(scrollBtn);
		row.appendChild(resolveBtn);
		list.appendChild(row);
	}

	const resolveAllBtn = panel.querySelector<HTMLElement>(
		"[data-rcc-resolve-all]",
	);
	if (resolveAllBtn)
		resolveAllBtn.style.display = staleItems.length > 0 ? "block" : "none";
}

export function markStaleElement(t: TrackedElement): void {
	t.element.style.outline = `2px dashed ${STALE_AMBER}`;
	t.element.style.outlineOffset = "2px";
	t.element.style.backgroundColor = STALE_AMBER_BG;
}

function unmarkStaleElement(t: TrackedElement): void {
	t.stale = false;
	t.element.style.outline = "";
	t.element.style.outlineOffset = "";
	t.element.style.backgroundColor = "";
	recountStale();
}

export function resolveStale(t: TrackedElement, file: CCFile): void {
	if (!t.stale) return;
	// Acknowledge the source text currently on the page as the reviewed source.
	// Write both `original` and `_base_original` so the entry is self-consistent
	// even when resolving a live edit before a build has refreshed _base_original
	// from base.json — the next build reconciles _base_original harmlessly. Using
	// the on-page source (not the stale t.baseOriginal) is what lets a live-only
	// stale clear; post-build the two are equal anyway.
	const current = t.originalContent;
	log(
		`[${t.roseyKey}] Resolving stale — original/_base_original ← page source`,
	);
	file.data.set({ slug: `${t.roseyKey}.original`, value: current });
	file.data.set({ slug: `${t.roseyKey}._base_original`, value: current });
	t.localeOriginal = current;
	t.baseOriginal = current;
	unmarkStaleElement(t);
}
