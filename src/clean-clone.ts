import { log } from "./logger";

const CC_CUSTOM_ELEMENTS = [
	"EDITABLE-TEXT",
	"EDITABLE-SOURCE",
	"EDITABLE-IMAGE",
	"EDITABLE-COMPONENT",
	"EDITABLE-ARRAY-ITEM",
];

const BLOCK_LEVEL_SELECTOR =
	"address, article, aside, blockquote, details, dialog, dd, div, dl, dt, fieldset, figcaption, figure, footer, form, h1, h2, h3, h4, h5, h6, header, hgroup, hr, li, main, nav, ol, p, pre, section, table, ul";

// Only "block" is block-level. "text" is inline rich text; treating it as block
// wraps inline runs in stray <p> and breaks heading spacing.
function isBlockType(dataType: string | null | undefined): boolean {
	return dataType === "block";
}

function inferElementType(el: HTMLElement): "span" | "block" {
	return el.querySelector(BLOCK_LEVEL_SELECTOR) !== null ? "block" : "span";
}

/**
 * Block vs span for an element: an explicit `data-type` hint wins, otherwise
 * infer from whether it contains block-level children. Used to pick a valid
 * wrapper tag for the clone (div vs span).
 */
export function resolveElementType(el: HTMLElement): "span" | "block" {
	return isBlockType(el.dataset.type) ? "block" : inferElementType(el);
}

// elementType for createTextEditableRegion. Pass the raw data-type like native
// CC does — it drives which toolbar controls mount (a "span" editor has none).
// Infer span/block only when there's no data-type to mirror.
export function resolveEditorElementType(el: HTMLElement): string {
	return el.dataset.type ?? resolveElementType(el);
}

/**
 * Strip all CC editing infrastructure from a detached DOM tree. Detached, so
 * no MutationObserver, connectedCallback, or race conditions.
 */
export function cleanClone(root: HTMLElement): void {
	stripCCAttributes(root);
	root.querySelectorAll("*").forEach((el) => {
		if (el instanceof HTMLElement) stripCCAttributes(el);
	});

	replaceCustomElements(root);
	stripBookshopComments(root);

	const roseyEls = root.querySelectorAll("[data-rosey]").length;
	log(`cleanClone: ${roseyEls} [data-rosey] element(s)`);
}

/**
 * Remove Bookshop's <!--bookshop-live--> markers from the clone. Bookshop
 * XPath-scans for them and re-renders the HTML between them, which would
 * overwrite RCC's editors.
 */
function stripBookshopComments(root: HTMLElement): void {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
	const toRemove: Comment[] = [];
	while (walker.nextNode()) {
		const comment = walker.currentNode as Comment;
		if (comment.data.includes("bookshop-live")) {
			toRemove.push(comment);
		}
	}
	for (const node of toRemove) node.remove();
	if (toRemove.length > 0) {
		log(`Stripped ${toRemove.length} Bookshop comment(s) from clone`);
	}
}

function stripCCAttributes(el: HTMLElement): void {
	el.removeAttribute("data-editable");
	el.removeAttribute("data-prop");
	el.removeAttribute("data-cms-bind");
	for (const attr of Array.from(el.attributes)) {
		if (attr.name.startsWith("data-prop-")) {
			el.removeAttribute(attr.name);
		}
	}

	// cloneNode captures CC's live ProseMirror state; drop it so the clone
	// isn't natively editable (RCC re-adds it on [data-rosey] editors).
	el.removeAttribute("contenteditable");
	el.classList.remove("ProseMirror");
}

function replaceCustomElements(root: HTMLElement): void {
	for (const tag of CC_CUSTOM_ELEMENTS) {
		const els = root.querySelectorAll(tag);
		for (const el of els) {
			let replacementTag = "div";
			if (tag === "EDITABLE-TEXT" && el instanceof HTMLElement) {
				replacementTag = resolveElementType(el) === "block" ? "div" : "span";
			}
			const replacement = document.createElement(replacementTag);
			for (const attr of Array.from(el.attributes)) {
				if (attr.name === "data-prop" || attr.name.startsWith("data-prop-"))
					continue;
				if (attr.name === "data-editable") continue;
				replacement.setAttribute(attr.name, attr.value);
			}
			replacement.innerHTML = el.innerHTML;
			el.replaceWith(replacement);
		}
	}
}
