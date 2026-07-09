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

/**
 * Collapse a markdown "loose" list item to its "tight" equivalent by unwrapping
 * a single <p> wrapping the item's text. Markdown renders a list tight
 * (`<li>x</li>`) or loose (`<li><p>x</p></li>`) depending on blank lines, and
 * Rosey's base.json extract and CC's ProseMirror serializer disagree on which —
 * so without this every list entry reads as stale.
 *
 * Only unwrap when the <li> has exactly one direct-child <p>: that's the
 * ambiguous case (could have come from either form). Two or more <p>s are a
 * genuine multi-paragraph item with no tight equivalent — both serializers
 * produce it identically, so leave it untouched. Counting <p> children (rather
 * than requiring the <p> be an only child) still unwraps items that also hold a
 * nested sublist, e.g. `<li><p>x</p><ul>…</ul></li>`. DOM-based so it survives
 * nesting and attributes; runs client-side only (all callers are injected).
 */
function unwrapLooseListItems(s: string): string {
	if (!s.includes("<li")) return s;
	const tpl = document.createElement("template");
	tpl.innerHTML = s;
	let changed = false;
	for (const li of tpl.content.querySelectorAll("li")) {
		const paras = [...li.children].filter((c) => c.tagName === "P");
		if (paras.length === 1) {
			paras[0].replaceWith(...Array.from(paras[0].childNodes));
			changed = true;
		}
	}
	return changed ? tpl.innerHTML : s;
}

/**
 * Normalize source for stale comparison: the live innerHTML and the stored
 * original/_base_original can differ in insignificant ways. Errs toward
 * false-negatives on purpose — the build-time _base_original is the backstop.
 *
 * Two HTML serializers meet here: Rosey extracts block-level source with
 * newlines between tags (`</p>\n<ul>`) and tight lists, while CC's ProseMirror
 * re-serializes with none (`</p><ul>`) and loose lists (`<li><p>…</p></li>`).
 * Unwrapping loose list items and collapsing inter-tag whitespace canonicalizes
 * both to the same string; otherwise every block-level entry reads as stale
 * (and re-stales on each rebuild as write-locales resets _base_original to the
 * Rosey form).
 */
export function normalizeSource(s: string): string {
	return unwrapLooseListItems(s)
		.replace(/>\s+</g, "><")
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
