/**
 * Locale injector for CloudCannon Visual Editor.
 *
 * Finds all [data-rcc] elements, injects a floating locale switcher,
 * and uses clone+replace to swap data-prop between the original value
 * and @data[locales_{locale}].{roseyKey}.value paths.
 *
 * setAttribute alone does NOT trigger CC re-binding — only removing
 * the element and inserting a fresh clone works.
 */

import { log, warn } from "./logger";

interface ElementSnapshot {
	outerHTML: string;
	parentSelector: string;
	index: number;
}

type Snapshots = Map<string, ElementSnapshot>;

const snapshots: Snapshots = new Map();
let currentLocale: string | null = null;

function buildParentSelector(el: Element): string {
	const parent = el.parentElement;
	if (!parent) return "body";
	if (parent.id) return `#${parent.id}`;
	if (parent.tagName === "BODY") return "body";

	const tag = parent.tagName.toLowerCase();
	const siblings = Array.from(parent.parentElement?.children ?? []);
	const idx = siblings.indexOf(parent);
	const parentParent = buildParentSelector(parent);
	return `${parentParent} > ${tag}:nth-child(${idx + 1})`;
}

function snapshotElements(): void {
	snapshots.clear();
	const elements = document.querySelectorAll("[data-rcc]");
	elements.forEach((el) => {
		const roseyKey = el.getAttribute("data-rosey");
		if (!roseyKey) return;

		const parent = el.parentElement;
		if (!parent) return;
		const children = Array.from(parent.children);
		const index = children.indexOf(el);

		snapshots.set(roseyKey, {
			outerHTML: el.outerHTML,
			parentSelector: buildParentSelector(el),
			index,
		});
	});
	log(`Snapshotted ${snapshots.size} translatable elements`);
}

function cloneFromHTML(html: string): Element {
	const template = document.createElement("template");
	template.innerHTML = html.trim();
	return template.content.firstElementChild!;
}

function switchLocale(locale: string | null): void {
	currentLocale = locale;

	snapshots.forEach((snap, roseyKey) => {
		const currentEl = document.querySelector(
			`[data-rcc][data-rosey="${roseyKey}"]`,
		);
		if (!currentEl) {
			warn(`Could not find element for key "${roseyKey}"`);
			return;
		}

		const clone = cloneFromHTML(snap.outerHTML);

		if (locale) {
			clone.setAttribute(
				"data-prop",
				`@data[locales_${locale}].${roseyKey}.value`,
			);
		}

		currentEl.parentNode?.replaceChild(clone, currentEl);
	});

	log(`Switched to ${locale ?? "Original"}`);
	updateButtonStates();
}

function updateButtonStates(): void {
	const buttons = document.querySelectorAll<HTMLButtonElement>(
		"#rcc-locale-switcher button[data-locale]",
	);
	buttons.forEach((btn) => {
		const btnLocale = btn.dataset.locale ?? null;
		const isActive = btnLocale === (currentLocale ?? "");
		btn.style.background = isActive ? "#3b82f6" : "#334155";
		btn.style.fontWeight = isActive ? "600" : "400";
	});
}

function injectSwitcher(locales: string[]): void {
	const panel = document.createElement("div");
	panel.id = "rcc-locale-switcher";
	Object.assign(panel.style, {
		position: "fixed",
		bottom: "20px",
		right: "20px",
		zIndex: "999999",
		background: "#1e293b",
		color: "#f1f5f9",
		padding: "12px 16px",
		borderRadius: "12px",
		fontFamily: "system-ui, sans-serif",
		fontSize: "13px",
		display: "flex",
		flexDirection: "column",
		gap: "6px",
		boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
	});

	const label = document.createElement("div");
	label.textContent = "Locale";
	Object.assign(label.style, {
		fontWeight: "600",
		fontSize: "12px",
		color: "#94a3b8",
		textTransform: "uppercase",
		letterSpacing: "0.05em",
	});
	panel.appendChild(label);

	const row = document.createElement("div");
	Object.assign(row.style, { display: "flex", gap: "6px", flexWrap: "wrap" });

	const btnBase =
		"padding:6px 14px;border:none;border-radius:6px;cursor:pointer;font-size:13px;color:white;transition:background 0.15s;";

	const originalBtn = document.createElement("button");
	originalBtn.textContent = "Original";
	originalBtn.dataset.locale = "";
	originalBtn.setAttribute("style", btnBase);
	originalBtn.addEventListener("click", () => switchLocale(null));
	row.appendChild(originalBtn);

	locales.forEach((locale) => {
		const btn = document.createElement("button");
		btn.textContent = locale.toUpperCase();
		btn.dataset.locale = locale;
		btn.setAttribute("style", btnBase);
		btn.addEventListener("click", () => switchLocale(locale));
		row.appendChild(btn);
	});

	panel.appendChild(row);
	document.body.appendChild(panel);

	updateButtonStates();
}

function init(): void {
	const main = document.querySelector("main[data-locales]");
	if (!main) return;

	const localesAttr = main.getAttribute("data-locales");
	if (!localesAttr) return;
	const locales = localesAttr
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	if (locales.length === 0) return;

	snapshotElements();

	if (snapshots.size === 0) {
		warn("No translatable elements found (missing data-rcc attributes)");
		return;
	}

	injectSwitcher(locales);
	log(`Ready — ${locales.length} locales, ${snapshots.size} elements`);
}

if ((window as any).inEditorMode) {
	init();
} else {
	document.addEventListener("cloudcannon:load", init);
}
