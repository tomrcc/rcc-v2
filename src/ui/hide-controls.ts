// ---------------------------------------------------------------------------
// Hide CloudCannon on-page editing chrome while a translation locale is active
// ---------------------------------------------------------------------------
//
// The clean clone removes editing only *inside* the container; CC regions
// outside it (nav, footer, other components) stay live and keep showing their
// gizmos and outlines. This hides that chrome via CSS, toggled by two attrs:
// data-rcc-locale-active on <html> and data-rcc-translation-root on the clone.
// Only control gizmos get display:none — editable regions wrap visible
// content, so they only lose their outline.

const STYLE_ID = "rcc-hide-controls";

const CSS = `
/* Hide all CC control gizmos while a locale is active. The overlay family is
   the Bookshop/data-cms-bind layer; RCC strips data-cms-bind and pauses
   Bookshop, so none of it belongs to the translation root — hide page-wide. */
html[data-rcc-locale-active] editable-array-item-controls,
html[data-rcc-locale-active] editable-component-controls,
html[data-rcc-locale-active] editable-region-button,
html[data-rcc-locale-active] editable-region-error-card,
html[data-rcc-locale-active] [class*="c-cloudcannon-editor-overlay"] {
	display: none !important;
}

/* Remove CC outlines on editable regions OUTSIDE the translation root.
   Visual-only — the elements stay rendered so their text is not hidden. */
html[data-rcc-locale-active] :is(
	editable-text, editable-source, editable-image,
	editable-component, editable-array-item, editable-snippet,
	[data-editable="text"], [data-editable="source"], [data-editable="image"],
	[data-editable="component"], [data-editable="array-item"]
):not([data-rcc-translation-root] *) {
	outline: none !important;
}

/* Outline the translatable regions (cleanClone stripped the markup CC's own
   CSS targets). Reuse CC's --ccve-* highlight vars to match its yellow
   highlighted state; hex fallbacks cover when those vars don't resolve here. */
html[data-rcc-locale-active] [data-rcc-translation-root] [data-rosey]:not([data-rcc-ignore]):not([data-rcc-stale]) {
	outline: var(--ccve-editable-outline-width, 2px) solid var(--ccve-color-sol, #f7c948) !important;
	outline-offset: calc(var(--ccve-editable-outline-width, 2px) * -1) !important;
}

/* ProseMirror re-wraps tight list items (<li>text</li>) as <li><p>text</p></li>;
   the injected <p> picks up the default paragraph margin and the list goes
   loose — the obvious shift on locale switch. No !important, so a site that
   deliberately styles loose lists (higher specificity) keeps them. */
html[data-rcc-locale-active] [data-rcc-translation-root] :is(li, dd, dt) > p {
	margin-block: 0;
}
`;

/** Inject the control-hiding stylesheet once. Idempotent. */
export function injectHideControlsStyle(): void {
	if (document.getElementById(STYLE_ID)) return;
	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.textContent = CSS;
	document.head.appendChild(style);
}

/** Toggle the page-wide flag that activates the control-hiding CSS. */
export function setLocaleControlsHidden(active: boolean): void {
	document.documentElement.toggleAttribute("data-rcc-locale-active", active);
}
