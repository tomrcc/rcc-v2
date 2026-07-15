import { log } from "./logger";
import { state, tracked } from "./state";
import type { CCFile, LocaleEntryData, TrackedElement } from "./types";

// ---------------------------------------------------------------------------
// Stale translation indicators
// ---------------------------------------------------------------------------

// Bright amber for graphical accents (on-page outline, panel border, badge
// fill). Too light for text — pairs with STALE_AMBER_TEXT for anything an
// editor has to read, which meets WCAG AA contrast on white.
export const STALE_AMBER = "#f59e0b";
export const STALE_AMBER_TEXT = "#b45309";
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
	announceStaleStatus();
}

// Announce the stale count to screen readers via the live region (built in the
// switcher). The textContent guard means it only speaks when the status
// actually changes, not on every recount.
function announceStaleStatus(): void {
	const region = document.getElementById("rcc-stale-status");
	if (!region) return;
	let msg = "";
	if (state.currentLocale) {
		msg =
			state.staleCount > 0
				? outOfDateLabel(state.staleCount)
				: "All translations up to date";
	}
	if (region.textContent !== msg) region.textContent = msg;
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
//
// <br> is folded to a SPACE (then whitespace collapses) so every way a line break
// serializes compares equal: Rosey's rendered `<br>`/`<br/>` in base.json, a
// plain-text editor emitting the break as a space, and a rich editor's `<br />`.
// Left as a tag it's a permanent false stale that flip-flops each build (base
// has `<br>`, the live editor a space). Trade-off: a break-only source change no
// longer flags — acceptable, since word changes still do (and matter more). The
// [^>]* also folds ProseMirror's `<br class="…trailingBreak">`.
export function normalizeSource(s: string): string {
	return unwrapLooseListItems(s.replace(/>\s+</g, "><"))
		.replace(/<br\b[^>]*>/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function truncateText(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

function outOfDateLabel(n: number): string {
	return `${n} translation${n === 1 ? "" : "s"} out of date`;
}

// Visible text of an HTML fragment, whitespace-collapsed — the diff compares
// words an editor sees, not markup.
function stripToText(html: string): string {
	const tmp = document.createElement("div");
	// Fold <br> to a space first: textContent would otherwise drop it entirely,
	// so a rendered line break wouldn't match the space a plain editor emits.
	tmp.innerHTML = html.replace(/<br\b[^>]*>/gi, " ");
	return (tmp.textContent ?? "").replace(/\s+/g, " ").trim();
}

type DiffOp = { type: "equal" | "removed" | "added"; word: string };

// Word-level LCS diff. Returns ops in order so changes stay in place, wherever
// they fall in the phrase. O(n·m) — fine for the short strings involved.
function diffWords(oldText: string, newText: string): DiffOp[] {
	const a = oldText ? oldText.split(" ") : [];
	const b = newText ? newText.split(" ") : [];
	const n = a.length;
	const m = b.length;
	const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			dp[i][j] =
				a[i] === b[j]
					? dp[i + 1][j + 1] + 1
					: Math.max(dp[i + 1][j], dp[i][j + 1]);
		}
	}
	const ops: DiffOp[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			ops.push({ type: "equal", word: a[i] });
			i++;
			j++;
		} else if (dp[i + 1][j] >= dp[i][j + 1]) {
			ops.push({ type: "removed", word: a[i++] });
		} else {
			ops.push({ type: "added", word: b[j++] });
		}
	}
	while (i < n) ops.push({ type: "removed", word: a[i++] });
	while (j < m) ops.push({ type: "added", word: b[j++] });
	return ops;
}

// Render the diff inline: added words green, removed words struck through.
// Consecutive same-type ops merge into one run so highlights read continuously.
function renderInlineDiff(
	container: HTMLElement,
	oldText: string,
	newText: string,
): void {
	const runs: { type: DiffOp["type"]; words: string[] }[] = [];
	for (const op of diffWords(oldText, newText)) {
		const last = runs[runs.length - 1];
		if (last && last.type === op.type) last.words.push(op.word);
		else runs.push({ type: op.type, words: [op.word] });
	}
	runs.forEach((run, idx) => {
		if (idx > 0) container.appendChild(document.createTextNode(" "));
		const span = document.createElement("span");
		span.textContent = run.words.join(" ");
		if (run.type === "added") {
			Object.assign(span.style, {
				color: "#15803d",
				background: "#dcfce7",
				borderRadius: "2px",
			});
		} else if (run.type === "removed") {
			Object.assign(span.style, {
				color: "#9ca3af",
				textDecoration: "line-through",
			});
		}
		container.appendChild(span);
	});
}

// The current source an out-of-date translation is measured against: the live
// page source if that's what drifted, otherwise the last build's source. The
// drift check is text-based to match computeStale's live signal — a pure
// serializer difference (ProseMirror vs Rosey) is not a real drift.
function currentSourceHtml(t: TrackedElement): string {
	if (stripToText(t.originalContent) !== stripToText(t.localeOriginal ?? ""))
		return t.originalContent;
	return t.baseOriginal ?? t.originalContent;
}

// Holds the panel's brief "all caught up" state after the last item clears.
let caughtUpTimer: ReturnType<typeof setTimeout> | null = null;

function showCaughtUp(panel: HTMLElement): void {
	const count = panel.querySelector<HTMLElement>("[data-rcc-panel-count]");
	if (count) count.textContent = "All caught up";

	const list = panel.querySelector<HTMLElement>("[data-rcc-stale-items]");
	if (list) {
		list.innerHTML = "";
		const done = document.createElement("div");
		done.textContent = "✓ Nothing needs review";
		Object.assign(done.style, {
			padding: "8px",
			fontSize: "12px",
			color: "#16a34a",
			textAlign: "left",
		});
		list.appendChild(done);
	}

	const resolveAll = panel.querySelector<HTMLElement>("[data-rcc-resolve-all]");
	if (resolveAll) resolveAll.style.display = "none";

	caughtUpTimer = setTimeout(() => {
		panel.style.display = "none";
		caughtUpTimer = null;
	}, 1600);
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
		// Celebrate briefly if the panel was open when the last item cleared;
		// otherwise just hide it.
		if (panel && !caughtUpTimer) {
			if (panel.style.display !== "none") showCaughtUp(panel);
			else panel.style.display = "none";
		}
		return;
	}

	if (caughtUpTimer) {
		clearTimeout(caughtUpTimer);
		caughtUpTimer = null;
	}

	if (submenu) {
		submenu.style.display = "flex";
		const countEl = submenu.querySelector<HTMLElement>(
			"[data-rcc-stale-count]",
		);
		if (countEl) countEl.textContent = outOfDateLabel(staleItems.length);
	}

	if (!panel) return;

	const panelCount = panel.querySelector<HTMLElement>("[data-rcc-panel-count]");
	if (panelCount) panelCount.textContent = outOfDateLabel(staleItems.length);

	const list = panel.querySelector<HTMLElement>("[data-rcc-stale-items]");
	if (!list) return;
	list.innerHTML = "";

	for (const t of staleItems) {
		// Key is only a fallback when the element has no visible text.
		const textPreview = truncateText(
			t.element.textContent?.trim() || t.roseyKey,
			48,
		);

		const itemWrap = document.createElement("div");
		Object.assign(itemWrap.style, {
			display: "flex",
			flexDirection: "column",
			borderRadius: "4px",
		});

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
		scrollBtn.type = "button";
		scrollBtn.setAttribute("aria-label", `Go to “${textPreview}”`);
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
			// Center first, THEN focus. CC's editor scrolls the caret into view on
			// focus (async), which otherwise overrides our centering and leaves the
			// element only just in view until a second click. Centering first means
			// the caret is already visible, so that focus-scroll is a no-op.
			t.element.scrollIntoView({ block: "center" });
			t.element.focus({ preventScroll: true });
		});

		const resolveBtn = document.createElement("button");
		resolveBtn.type = "button";
		resolveBtn.title = "Mark as reviewed";
		resolveBtn.setAttribute("aria-label", "Mark as reviewed");
		Object.assign(resolveBtn.style, {
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			padding: "0 8px",
			border: "none",
			borderRadius: "4px",
			cursor: "pointer",
			background: "transparent",
			// Darker than before so it reads as a control, not decoration.
			color: "#94a3b8",
			transition: "color 0.15s, background 0.15s",
			flexShrink: "0",
		});
		resolveBtn.innerHTML =
			'<svg aria-hidden="true" width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.5 L4.5 9 L10 3"/></svg>';
		const resolveHi = () => {
			resolveBtn.style.color = STALE_AMBER_TEXT;
			resolveBtn.style.background = "#fde68a";
		};
		const resolveLo = () => {
			resolveBtn.style.color = "#94a3b8";
			resolveBtn.style.background = "transparent";
		};
		resolveBtn.addEventListener("mouseenter", resolveHi);
		resolveBtn.addEventListener("mouseleave", resolveLo);
		resolveBtn.addEventListener("focus", resolveHi);
		resolveBtn.addEventListener("blur", resolveLo);
		resolveBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			if (state.activeFile) resolveStale(t, state.activeFile);
		});

		// Expandable "what changed" diff, built lazily on first open.
		const diff = document.createElement("div");
		Object.assign(diff.style, {
			display: "none",
			padding: "0 8px 8px",
			fontSize: "11px",
			lineHeight: "1.5",
			wordBreak: "break-word",
		});

		const expandBtn = document.createElement("button");
		expandBtn.type = "button";
		expandBtn.setAttribute("aria-label", "Show what changed");
		expandBtn.setAttribute("aria-expanded", "false");
		Object.assign(expandBtn.style, {
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			padding: "0 4px",
			border: "none",
			background: "transparent",
			color: "#94a3b8",
			cursor: "pointer",
			flexShrink: "0",
			transition: "transform 0.15s",
		});
		expandBtn.innerHTML =
			'<svg aria-hidden="true" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2 L8 6 L4 10"/></svg>';

		let diffBuilt = false;
		expandBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			const open = diff.style.display === "none";
			diff.style.display = open ? "block" : "none";
			expandBtn.style.transform = open ? "rotate(90deg)" : "rotate(0deg)";
			expandBtn.setAttribute("aria-expanded", String(open));
			if (open && !diffBuilt) {
				diffBuilt = true;
				const label = document.createElement("div");
				label.textContent = "Source change";
				Object.assign(label.style, {
					fontSize: "9px",
					textTransform: "uppercase",
					letterSpacing: "0.05em",
					color: "#9ca3af",
					marginBottom: "3px",
				});
				diff.appendChild(label);
				renderInlineDiff(
					diff,
					stripToText(t.localeOriginal ?? ""),
					stripToText(currentSourceHtml(t)),
				);
			}
		});

		row.appendChild(scrollBtn);
		row.appendChild(expandBtn);
		row.appendChild(resolveBtn);
		itemWrap.appendChild(row);
		itemWrap.appendChild(diff);
		list.appendChild(itemWrap);
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
 * entry out). Requires t.hasLocaleEntry to be current.
 *
 * base: last build's source (_base_original) ≠ original. Both come from
 * base.json, so ONE serializer (Rosey) produced both — a normalized-HTML compare
 * is exact and catches formatting-only source edits (e.g. a word bolded).
 *
 * live: the page's source right now ≠ original — fires on an in-session source
 * edit before a rebuild refreshes _base_original. Here the two sides come from
 * DIFFERENT serializers: t.originalContent is CloudCannon's ProseMirror
 * serialization of the live DOM; `original` is Rosey's rendered-HTML capture in
 * base.json. They never agree byte-for-byte (inter-tag whitespace, <br/> vs <br>,
 * attribute order, entity encoding, list tightness, and raw markdown for
 * plain-typed inputs), so an HTML compare here manufactures false stales. We
 * compare VISIBLE TEXT instead — the words an editor actually changed — which is
 * robust to every serializer divergence by construction. The narrow cost: a
 * source edit that only toggles inline formatting (same words) won't show as live
 * stale, but baseStale still catches it on the next build.
 */
export function computeStale(
	t: TrackedElement,
	data: LocaleEntryData | null | undefined,
): boolean {
	const staleEnabled =
		t.hasLocaleEntry && data?._base_original != null && data?.original != null;
	if (!staleEnabled) return false;
	const original = data?.original ?? "";
	const baseStale =
		normalizeSource(data?._base_original ?? "") !== normalizeSource(original);
	const liveStale = stripToText(t.originalContent) !== stripToText(original);
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
