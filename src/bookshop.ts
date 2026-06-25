import { log, warn } from "./logger";

// ---------------------------------------------------------------------------
// Bookshop live-editing pause/resume
// ---------------------------------------------------------------------------

let originalBookshopUpdate: ((...args: any[]) => Promise<boolean>) | null =
	null;

export function pauseBookshop(): void {
	const bsl = (window as any).bookshopLive;
	if (!bsl) {
		log(
			"pauseBookshop: window.bookshopLive not found (not a Bookshop site, or not loaded yet)",
		);
		return;
	}
	if (typeof bsl.update !== "function") {
		log("pauseBookshop: bookshopLive.update is not a function");
		return;
	}
	if (originalBookshopUpdate) {
		log("pauseBookshop: already paused");
		return;
	}
	originalBookshopUpdate = bsl.update.bind(bsl);
	bsl.update = async () => false;
	log("Paused Bookshop live editing");
}

export function resumeBookshop(): void {
	if (!originalBookshopUpdate) {
		log("resumeBookshop: nothing to resume (was not paused)");
		return;
	}
	const bsl = (window as any).bookshopLive;
	if (!bsl) {
		warn("resumeBookshop: window.bookshopLive disappeared — cannot restore");
		originalBookshopUpdate = null;
		return;
	}
	bsl.update = originalBookshopUpdate;
	originalBookshopUpdate = null;
	log("Resumed Bookshop live editing");
}

/**
 * Bookshop's graftTrees does fine-grained DOM diffing: it preserves element
 * nodes when only text content changed and replaces the minimal subtree.
 * Because data-cms-bind sits on component wrapper elements that graftTrees
 * keeps in place, the CC editor sees the *same* DOM references it already
 * tracked — but the overlay nodes were destroyed during the swap-out. CC
 * won't recreate overlays for elements it already "knows."
 *
 * Stripping data-cms-bind forces a shallow-clone mismatch in graftTrees on
 * the next Bookshop render: the virtual DOM has the attribute, the real DOM
 * doesn't → the element is replaced with a fresh node → CC sees a new
 * element → refreshInterface() creates overlays.
 */
export function stripCmsBindForRerender(container: HTMLElement): void {
	const bound = container.querySelectorAll("[data-cms-bind]");
	for (const el of bound) el.removeAttribute("data-cms-bind");
	if (bound.length) {
		log(
			`Stripped data-cms-bind from ${bound.length} element(s) to force fresh overlays`,
		);
	}
	forceBookshopRerender();
}

function forceBookshopRerender(): void {
	const cc = (window as any).CloudCannon;
	const bsl = (window as any).bookshopLive;

	if (!bsl || typeof bsl.update !== "function") {
		if (typeof cc?.refreshInterface === "function") {
			requestAnimationFrame(() => {
				cc.refreshInterface();
				log(
					"Called deferred CloudCannon.refreshInterface() (non-Bookshop site)",
				);
			});
		}
		return;
	}

	if (
		typeof cc?.value !== "function" ||
		typeof cc?.refreshInterface !== "function"
	) {
		log(
			"forceBookshopRerender: CloudCannon API incomplete, panels will restore on next update",
		);
		return;
	}

	setTimeout(async () => {
		try {
			const data = await cc.value({
				keepMarkdownAsHTML: false,
				preferBlobs: true,
			});
			const options = (window as any).bookshopLiveOptions || {};
			const rendered = await bsl.update(data, options);
			if (rendered) {
				cc.refreshInterface();
				log(
					"Forced Bookshop re-render + refreshInterface() to restore component panels",
				);
			} else {
				log(
					"Bookshop re-render was throttled, panels will restore on next update",
				);
			}
		} catch (e) {
			warn("Failed to force Bookshop re-render:", e);
		}
	}, 0);
}
