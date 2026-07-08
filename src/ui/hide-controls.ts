// ---------------------------------------------------------------------------
// Hide CloudCannon on-page editing chrome while a translation locale is active
// ---------------------------------------------------------------------------
//
// When RCC swaps in a clean translation clone, editing is only gone *inside*
// that container. Every CC editable region outside it (nav, footer, other
// components) stays live, so its control gizmos and highlight outlines keep
// showing in the Visual Editor — off-target while translating.
//
// We hide that chrome purely with CSS, toggled by a single attribute:
//   • `data-rcc-locale-active` on <html>       → set while a real locale is on
//   • `data-rcc-translation-root` on the clone → marks the translatable region
//
// Only the control gizmos get `display:none`. The editable region elements
// themselves wrap visible page content, so they only lose their outline — never
// `display:none`, which would blank that content out.

const STYLE_ID = "rcc-hide-controls";

const CSS = `
/* Hide all CloudCannon control gizmos while a locale is active. */
html[data-rcc-locale-active] editable-array-item-controls,
html[data-rcc-locale-active] editable-component-controls,
html[data-rcc-locale-active] editable-region-button,
html[data-rcc-locale-active] editable-region-error-card {
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

/* Add a visible outline to the actual translatable regions (they carry no CC
   outline of their own — cleanClone stripped the markup CC's CSS targets).
   Reuse CC's OWN highlight variables so it matches the editor's yellowish
   "highlighted" state; hex fallbacks cover the case where the host-injected
   --ccve-* vars don't resolve at this scope. */
html[data-rcc-locale-active] [data-rcc-translation-root] [data-rosey]:not([data-rcc-ignore]) {
	outline: var(--ccve-editable-outline-width, 2px) solid var(--ccve-color-sol, #f7c948) !important;
	outline-offset: calc(var(--ccve-editable-outline-width, 2px) * -1) !important;
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
