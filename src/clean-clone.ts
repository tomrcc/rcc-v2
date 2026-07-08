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

/** Rosey/CC `data-type` hints that force a block (vs span) editor. */
export function isBlockType(dataType: string | null | undefined): boolean {
	return dataType === "block" || dataType === "text";
}

export function inferElementType(el: HTMLElement): "span" | "block" {
	return el.querySelector(BLOCK_LEVEL_SELECTOR) !== null ? "block" : "span";
}

/**
 * Strip all CC editing infrastructure from a detached DOM tree.
 * Because the tree is not in the document, there is no MutationObserver,
 * no connectedCallback, and no race conditions.
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
 * Remove Bookshop live-editing comment markers from the clone.
 * Bookshop's runtime uses XPath to scan the document for
 * `<!--bookshop-live ...-->` comments and re-renders component HTML
 * between them. Stripping these prevents Bookshop from overwriting
 * RCC's translation editors.
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

	// cloneNode captures CC's live ProseMirror state; drop it so the clone isn't
	// natively editable. RCC re-adds it on [data-rosey] editors.
	el.removeAttribute("contenteditable");
	el.classList.remove("ProseMirror");
}

function replaceCustomElements(root: HTMLElement): void {
	for (const tag of CC_CUSTOM_ELEMENTS) {
		const els = root.querySelectorAll(tag);
		for (const el of els) {
			let replacementTag = "div";
			if (tag === "EDITABLE-TEXT") {
				const dataType = el.getAttribute("data-type");
				const hasBlockChildren =
					el.querySelector(BLOCK_LEVEL_SELECTOR) !== null;
				replacementTag =
					isBlockType(dataType) || hasBlockChildren ? "div" : "span";
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
