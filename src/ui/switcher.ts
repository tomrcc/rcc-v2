import { log } from "../logger";
import { resolveStale, STALE_AMBER } from "../stale";
import { state, tracked } from "../state";

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

function isActiveLocale(btn: HTMLButtonElement): boolean {
	return (btn.dataset.locale ?? null) === (state.currentLocale ?? "");
}

export function updateButtonStates(): void {
	const buttons = document.querySelectorAll<HTMLButtonElement>(
		"#rcc-locale-popover button[data-locale]",
	);
	for (const btn of buttons) {
		const isActive = isActiveLocale(btn);
		Object.assign(btn.style, {
			background: isActive ? CC_BLUE : "#f1f5f9",
			color: isActive ? "#ffffff" : "#1e293b",
			fontWeight: isActive ? "600" : "400",
		});
	}

	const badge = document.getElementById("rcc-fab-badge");
	if (badge) {
		if (state.currentLocale) {
			badge.textContent = state.currentLocale.toUpperCase();
			badge.style.display = "flex";
		} else {
			badge.style.display = "none";
		}
	}
}

/**
 * Build and mount the floating locale switcher (FAB + popover + stale panel).
 * `onSelect` is called with the chosen locale (or null for Original) — passed
 * in rather than imported to keep this module free of an injector import cycle.
 */
export function injectSwitcher(
	locales: string[],
	onSelect: (locale: string | null) => void,
): void {
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

	// Stale badge — shows count of out-of-date translations
	const staleBadge = document.createElement("div");
	staleBadge.id = "rcc-stale-badge";
	Object.assign(staleBadge.style, {
		position: "absolute",
		bottom: "-4px",
		right: "-4px",
		background: STALE_AMBER,
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
	fab.appendChild(staleBadge);

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

	function makeLocaleButton(
		label: string,
		locale: string | null,
	): HTMLButtonElement {
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
			if (!isActiveLocale(btn)) {
				btn.style.background = "#e2e8f0";
			}
		});
		btn.addEventListener("mouseleave", () => {
			if (!isActiveLocale(btn)) {
				btn.style.background = "#f1f5f9";
			}
		});
		btn.addEventListener("click", () => {
			log(`Locale button clicked: ${label} (locale=${locale})`);
			if (state.switchInProgress) {
				log("Ignoring click — locale switch already in progress");
				return;
			}
			onSelect(locale);
			closePopover();
		});
		return btn;
	}

	popover.appendChild(makeLocaleButton("Original", null));
	for (const locale of locales) {
		const wrapper = document.createElement("div");
		wrapper.appendChild(makeLocaleButton(locale.toUpperCase(), locale));

		const submenu = document.createElement("div");
		submenu.dataset.rccStaleSubmenu = locale;
		Object.assign(submenu.style, {
			display: "none",
			alignItems: "center",
			gap: "4px",
			cursor: "pointer",
			padding: "4px 12px 2px",
			userSelect: "none",
		});

		const chevron = document.createElement("span");
		chevron.dataset.rccStaleChevron = "";
		Object.assign(chevron.style, {
			display: "inline-flex",
			transition: "transform 0.2s",
			transform: "rotate(0deg)",
			color: STALE_AMBER,
			fontSize: "10px",
			lineHeight: "1",
		});
		chevron.innerHTML =
			'<svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2.5 1 L5.5 4 L2.5 7"/></svg>';

		const countLabel = document.createElement("span");
		countLabel.dataset.rccStaleCount = "";
		Object.assign(countLabel.style, {
			fontWeight: "600",
			fontSize: "10px",
			color: STALE_AMBER,
			letterSpacing: "0.03em",
		});

		submenu.appendChild(chevron);
		submenu.appendChild(countLabel);
		submenu.addEventListener("click", () => {
			toggleStalePanel();
		});

		wrapper.appendChild(submenu);
		popover.appendChild(wrapper);
	}

	// --- Stale translations panel (separate floating card) ----------------

	const stalePanel = document.createElement("div");
	stalePanel.id = "rcc-stale-panel";
	Object.assign(stalePanel.style, {
		position: "fixed",
		zIndex: "999997",
		background: "#ffffff",
		borderRadius: "10px",
		padding: "8px",
		boxShadow: "0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)",
		display: "none",
		flexDirection: "column",
		gap: "4px",
		fontFamily: "system-ui, sans-serif",
		fontSize: "13px",
		minWidth: "200px",
		maxWidth: "260px",
		borderTop: `3px solid ${STALE_AMBER}`,
	});

	const panelHeader = document.createElement("div");
	Object.assign(panelHeader.style, {
		fontWeight: "600",
		fontSize: "11px",
		color: STALE_AMBER,
		textTransform: "uppercase",
		letterSpacing: "0.05em",
		padding: "4px 8px 2px",
	});
	panelHeader.dataset.rccPanelCount = "";
	stalePanel.appendChild(panelHeader);

	const panelItems = document.createElement("div");
	panelItems.dataset.rccStaleItems = "";
	Object.assign(panelItems.style, {
		maxHeight: "240px",
		overflowY: "auto",
		display: "flex",
		flexDirection: "column",
		gap: "1px",
	});
	stalePanel.appendChild(panelItems);

	const resolveAllBtn = document.createElement("button");
	resolveAllBtn.type = "button";
	resolveAllBtn.setAttribute("aria-label", "Mark all as reviewed");
	resolveAllBtn.dataset.rccResolveAll = "";
	Object.assign(resolveAllBtn.style, {
		display: "none",
		width: "100%",
		marginTop: "4px",
		padding: "6px 10px",
		border: "none",
		borderRadius: "5px",
		background: STALE_AMBER,
		color: "#ffffff",
		fontSize: "11px",
		fontWeight: "600",
		cursor: "pointer",
		transition: "background 0.15s",
		fontFamily: "system-ui, sans-serif",
	});
	resolveAllBtn.textContent = "Mark all as reviewed";
	resolveAllBtn.addEventListener("mouseenter", () => {
		resolveAllBtn.style.background = "#d97706";
	});
	resolveAllBtn.addEventListener("mouseleave", () => {
		resolveAllBtn.style.background = STALE_AMBER;
	});
	resolveAllBtn.addEventListener("click", () => {
		const stale = tracked.filter((t) => t.stale);
		for (const t of stale) {
			if (state.activeFile) resolveStale(t, state.activeFile);
		}
	});
	stalePanel.appendChild(resolveAllBtn);

	function positionStalePanel() {
		stalePanel.style.visibility = "hidden";
		stalePanel.style.display = "flex";
		const popRect = popover.getBoundingClientRect();
		const panelRect = stalePanel.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const gap = 8;

		let left = popRect.left - panelRect.width - gap;
		if (left < 4) left = popRect.right + gap;
		if (left + panelRect.width > vw - 4) left = 4;

		let top = popRect.top;
		if (top + panelRect.height > vh - 4) top = vh - panelRect.height - 4;
		top = Math.max(4, top);

		stalePanel.style.top = `${top}px`;
		stalePanel.style.left = `${left}px`;
		stalePanel.style.visibility = "visible";
	}

	function openStalePanel() {
		positionStalePanel();
		const chevron = document.querySelector<HTMLElement>(
			`[data-rcc-stale-submenu="${state.currentLocale}"] [data-rcc-stale-chevron]`,
		);
		if (chevron) chevron.style.transform = "rotate(90deg)";
	}

	function closeStalePanel() {
		stalePanel.style.display = "none";
		const chevron = document.querySelector<HTMLElement>(
			`[data-rcc-stale-submenu="${state.currentLocale}"] [data-rcc-stale-chevron]`,
		);
		if (chevron) chevron.style.transform = "rotate(0deg)";
	}

	function toggleStalePanel() {
		if (stalePanel.style.display !== "none") closeStalePanel();
		else openStalePanel();
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
		localStorage.setItem(
			FAB_STORAGE_KEY,
			JSON.stringify({ top: r.top, left: r.left }),
		);
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
		fab.style.boxShadow =
			"0 4px 20px rgba(0,0,0,0.2), 0 2px 6px rgba(0,0,0,0.12)";
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

		if (popoverOpen) {
			positionPopover();
			if (stalePanel.style.display !== "none") positionStalePanel();
		}
	});

	fab.addEventListener("pointerup", () => {
		if (!isDragging) return;
		isDragging = false;
		fab.style.cursor = "grab";
		fab.style.boxShadow =
			"0 2px 12px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)";

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
		if (popoverOpen) {
			positionPopover();
			if (stalePanel.style.display !== "none") positionStalePanel();
		}
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

		let top =
			fabRect.top - gap - popRect.height > 0
				? fabRect.top - gap - popRect.height
				: fabRect.bottom + gap;

		let left =
			fabRect.right - popRect.width > 0
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
		closeStalePanel();
	}

	function togglePopover() {
		if (popoverOpen) closePopover();
		else openPopover();
	}

	// Close on outside click
	document.addEventListener("pointerdown", (e: PointerEvent) => {
		if (!popoverOpen) return;
		const target = e.target as Node;
		if (
			fab.contains(target) ||
			popover.contains(target) ||
			stalePanel.contains(target)
		)
			return;
		closePopover();
	});

	// Close on Escape
	document.addEventListener("keydown", (e: KeyboardEvent) => {
		if (popoverOpen && e.key === "Escape") closePopover();
	});

	// --- Mount ------------------------------------------------------------

	document.body.appendChild(fab);
	document.body.appendChild(popover);
	document.body.appendChild(stalePanel);
	updateButtonStates();
}
