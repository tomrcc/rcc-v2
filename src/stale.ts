import { log } from "./logger";
import { state, tracked } from "./state";
import type { CCFile, LocaleEntryData, TrackedElement } from "./types";

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

// Unwrap a loose list item (`<li><p>x</p></li>`) to its tight form (`<li>x</li>`)
// so Rosey and ProseMirror, which disagree on tight/loose, compare equal. Skip
// items with 2+ <p>s — those are real multi-paragraph items both serializers
// agree on. Must run after inter-tag whitespace is collapsed (see normalizeSource).
function unwrapLooseListItems(s: string): string {
	if (!s.includes("<li")) return s;
	const tpl = document.createElement("template");
	tpl.innerHTML = s;
	for (const li of tpl.content.querySelectorAll("li")) {
		const paras = [...li.children].filter((c) => c.tagName === "P");
		if (paras.length === 1)
			paras[0].replaceWith(...Array.from(paras[0].childNodes));
	}
	// Always re-serialize so both compared strings get the same DOM round-trip.
	return tpl.innerHTML;
}

// Canonicalize the two HTML serializers (Rosey's base.json vs CC's ProseMirror)
// so insignificant differences don't read as stale. Order matters: collapse
// inter-tag whitespace first, then unwrap loose lists. See docs/stale-translations.md.
export function normalizeSource(s: string): string {
	return unwrapLooseListItems(s.replace(/>\s+</g, "><"))
		.replace(/\s+/g, " ")
		.trim();
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
		// Key is only a fallback when the element has no visible text.
		const textPreview = truncateText(
			t.element.textContent?.trim() || t.roseyKey,
			48,
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
			alignItems: "center",
			flex: "1",
			minWidth: "0",
			padding: "7px 8px",
			border: "none",
			cursor: "pointer",
			fontSize: "12px",
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

		scrollBtn.appendChild(preview);
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
	// data-rcc-stale drops the normal yellow outline (see hide-controls) so
	// this amber one shows instead.
	t.element.dataset.rccStale = "";
	t.element.style.outline = `2px dashed ${STALE_AMBER}`;
	t.element.style.outlineOffset = "2px";
	t.element.style.backgroundColor = STALE_AMBER_BG;
}

/**
 * The two stale signals, gated on _base_original presence (its absence opts the
 * entry out). base: last build's source (_base_original) ≠ original. live: the
 * page's source text right now ≠ original — fires immediately on an in-session
 * edit, before a rebuild refreshes _base_original. Normalized compares avoid
 * whitespace-only false positives. Requires t.hasLocaleEntry to be current.
 */
export function computeStale(
	t: TrackedElement,
	data: LocaleEntryData | null | undefined,
): boolean {
	const staleEnabled =
		t.hasLocaleEntry && data?._base_original != null && data?.original != null;
	if (!staleEnabled) return false;
	const normalizedOriginal = normalizeSource(data?.original ?? "");
	const baseStale =
		normalizeSource(data?._base_original ?? "") !== normalizedOriginal;
	const liveStale = normalizeSource(t.originalContent) !== normalizedOriginal;
	return baseStale || liveStale;
}

/** Clear the stale flag and its on-page marking without recounting. */
export function clearStaleMarking(t: TrackedElement): void {
	t.stale = false;
	delete t.element.dataset.rccStale;
	t.element.style.outline = "";
	t.element.style.outlineOffset = "";
	t.element.style.backgroundColor = "";
}

/**
 * Re-evaluate one element's stale state from fresh data and update its marking.
 * Batch callers should recountStale() once after the loop.
 */
export function refreshStale(
	t: TrackedElement,
	data: LocaleEntryData | null | undefined,
): void {
	if (computeStale(t, data)) {
		t.stale = true;
		markStaleElement(t);
	} else {
		clearStaleMarking(t);
	}
}

function unmarkStaleElement(t: TrackedElement): void {
	clearStaleMarking(t);
	recountStale();
}

export function resolveStale(t: TrackedElement, file: CCFile): void {
	if (!t.stale) return;
	// Acknowledge the on-page source as reviewed. Write both original and
	// _base_original so the entry is self-consistent even when resolving a live
	// edit before a build; using the on-page source is what clears a live-only
	// stale (post-build the two are equal anyway).
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
